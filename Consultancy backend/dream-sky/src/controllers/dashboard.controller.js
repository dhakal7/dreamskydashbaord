const prisma = require("../prisma");
const { sendSuccess } = require("../utils/response.util");
const AppError = require("../utils/apiError");

function isValidBranchId(value) {
    return typeof value === "string" && value.trim().length > 0;
}

/**
 * GET /dashboard/summary
 *
 * Returns all super-admin / branch-admin dashboard stats in a single request.
 * Previously the frontend made 7 parallel requests — this consolidates them
 * server-side so only one HTTP round-trip is needed from the browser.
 *
 * For BRANCH_ADMIN, all counts are strictly scoped to the authenticated user's
 * branch (`req.user.branchId`) via verified Prisma relationships:
 * - Student: `assignedCounselor: { branchId }`
 * - CommunicationLog: `student: { isActive: true, assignedCounselor: { branchId } }`
 * - Application (and Offer Letters): `student: { isActive: true, assignedCounselor: { branchId } }`
 * - VisaCase: `application: { student: { isActive: true, assignedCounselor: { branchId } } }`
 *
 * Response shape:
 * {
 *   totalStudents:  number,   // ENROLLED + all downstream stages
 *   newLeads:       number,   // LEAD or PROSPECT created in last 30 days
 *   pendingFollowUps: number, // follow-ups with nextFollowUpAt today (NPT)
 *   applications:   number,   // active Application records
 *   offerLetters:   number,   // active Application records with >= 1 Offer
 *   visaCases:      number,   // active VisaCase records (non-terminal)
 *   enrolledOnly:   number,   // ENROLLED only
 *   totalLeads:     number,   // all LEAD + PROSPECT
 * }
 */
const getSummary = async (req, res, next) => {
    try {
        const currentUser = req.user;
        if (!currentUser) {
            throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
        }

        let studentBranchFilter = {};
        let relatedStudentFilter = {};
        let visaApplicationFilter = {};

        if (currentUser.role === "BRANCH_ADMIN") {
            if (!isValidBranchId(currentUser.branchId)) {
                throw AppError.forbidden("Branch Admin lacks assigned branch context.", "NO_BRANCH_CONTEXT");
            }
            const authorizedBranchId = currentUser.branchId.trim();
            const ownershipOr = [
                {
                    assignedCounselor: {
                        branchId: authorizedBranchId,
                    },
                },
                {
                    assignedCounselorId: null,
                    academicBackground: {
                        path: ["branchId"],
                        equals: authorizedBranchId,
                    },
                },
            ];
            studentBranchFilter = {
                OR: ownershipOr,
            };
            relatedStudentFilter = {
                student: {
                    isActive: true,
                    OR: ownershipOr,
                },
            };
            visaApplicationFilter = {
                application: {
                    student: {
                        isActive: true,
                        OR: ownershipOr,
                    },
                },
            };
        }

        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Calculate Nepal Standard Time (UTC+05:45) calendar-day boundaries for Today's Follow-ups
        const NPT_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;
        const nptNow = new Date(now.getTime() + NPT_OFFSET_MS);
        const startOfTodayNPT = new Date(
            Date.UTC(nptNow.getUTCFullYear(), nptNow.getUTCMonth(), nptNow.getUTCDate()) - NPT_OFFSET_MS
        );
        const startOfTomorrowNPT = new Date(
            Date.UTC(nptNow.getUTCFullYear(), nptNow.getUTCMonth(), nptNow.getUTCDate() + 1) - NPT_OFFSET_MS
        );

        // Run all counts in parallel server-side — single DB connection burst
        const [
            totalStudents,
            newLeads,
            pendingFollowUps,
            applications,
            offerLetters,
            visaCases,
            enrolledOnly,
            totalLeads,
        ] = await Promise.all([
            // Total students (enrolled + processing stages)
            prisma.student.count({
                where: {
                    isActive: true,
                    currentStage: {
                        in: ["ENROLLED", "APPLIED", "OFFER_RECEIVED", "VISA_APPLIED", "VISA_APPROVED", "DEPARTED"],
                    },
                    ...studentBranchFilter,
                },
            }),

            // New leads in last 30 days
            prisma.student.count({
                where: {
                    isActive: true,
                    currentStage: { in: ["LEAD", "PROSPECT"] },
                    createdAt: { gte: thirtyDaysAgo },
                    ...studentBranchFilter,
                },
            }),

            // Today's follow-ups: startOfTodayNPT <= nextFollowUpAt < startOfTomorrowNPT
            prisma.communicationLog.count({
                where: {
                    nextFollowUpAt: {
                        gte: startOfTodayNPT,
                        lt: startOfTomorrowNPT,
                    },
                    ...relatedStudentFilter,
                },
            }),

            // Active applications — count directly from the Application table
            // (same data source as the Applications page, so numbers always match)
            prisma.application.count({
                where: {
                    status: { notIn: ["WITHDRAWN", "REJECTED"] },
                    ...relatedStudentFilter,
                },
            }),

            // Offer letters — distinct active applications with at least one qualifying Offer
            prisma.application.count({
                where: {
                    status: { notIn: ["WITHDRAWN", "REJECTED"] },
                    offers: { some: {} },
                    ...relatedStudentFilter,
                },
            }),

            // Visa processing — all active visa cases (any non-terminal status)
            // Default initial state is NOT_APPLIED, then PREPARING → SUBMITTED → APPROVED/REFUSED
            prisma.visaCase.count({
                where: {
                    status: { notIn: ["APPROVED", "REFUSED"] },
                    ...visaApplicationFilter,
                },
            }),

            // Enrolled students only
            prisma.student.count({
                where: {
                    isActive: true,
                    currentStage: "ENROLLED",
                    ...studentBranchFilter,
                },
            }),

            // Total all leads (pipeline)
            prisma.student.count({
                where: {
                    isActive: true,
                    currentStage: { in: ["LEAD", "PROSPECT"] },
                    ...studentBranchFilter,
                },
            }),
        ]);

        sendSuccess(res, {
            data: {
                totalStudents,
                newLeads,
                pendingFollowUps,
                applications,
                offerLetters,
                visaCases,
                enrolledOnly,
                totalLeads,
            },
        });
    } catch (err) {
        if (typeof next === "function") return next(err);
        throw err;
    }
};

/**
 * GET /dashboard/counselor-summary?counselorId=...
 *
 * Returns stats for a specific counselor's dashboard.
 */
const getCounselorSummary = async (req, res) => {
    const counselorId = req.query.counselorId || req.user.userId;
    const now = new Date();
    const STUDENT_STAGES = [
        "LEAD", "PROSPECT", "ENROLLED", "APPLIED",
        "OFFER_RECEIVED", "VISA_APPLIED", "VISA_APPROVED", "DEPARTED",
    ];

    const [stageCounts, inactiveCount, followUps, commissions] = await Promise.all([
        // Count per stage for this counselor
        Promise.all(
            STUDENT_STAGES.map((stage) =>
                prisma.student.count({
                    where: { assignedCounselorId: counselorId, currentStage: stage, isActive: true },
                }).then((count) => ({ stage, count }))
            )
        ),

        // Inactive/dropped
        prisma.student.count({
            where: { assignedCounselorId: counselorId, isActive: false },
        }),

        // Upcoming follow-ups for this counselor
        prisma.communicationLog.findMany({
            where: {
                authorId: counselorId,
                nextFollowUpAt: { gt: now },
            },
            take: 6,
            orderBy: { nextFollowUpAt: "asc" },
            include: {
                student: { select: { id: true, firstName: true, lastName: true } },
            },
        }),

        // Commissions
        prisma.commission.findMany({
            where: { recipientId: counselorId },
            select: { amount: true, status: true },
        }),
    ]);

    const stageMap = Object.fromEntries(stageCounts.map(({ stage, count }) => [stage, count]));
    const activeTotal = STUDENT_STAGES.reduce((sum, s) => sum + (stageMap[s] ?? 0), 0);

    sendSuccess(res, {
        data: {
            stageBreakdown: stageCounts.filter((s) => s.count > 0),
            totalStudents: activeTotal + inactiveCount,
            activeStudents: activeTotal,
            upcomingFollowUps: followUps.map((f) => ({
                id: f.id,
                studentName: f.student
                    ? `${f.student.firstName} ${f.student.lastName}`.trim()
                    : "Student",
                reminder: f.content || "Follow-up reminder",
                date: f.nextFollowUpAt,
            })),
            commission: {
                earned: commissions.reduce((s, c) => s + (c.amount ?? 0), 0),
                paid: commissions.filter((c) => c.status === "PAID").reduce((s, c) => s + (c.amount ?? 0), 0),
                pending: commissions.filter((c) => c.status !== "PAID").reduce((s, c) => s + (c.amount ?? 0), 0),
                count: commissions.length,
            },
        },
    });
};

/**
 * GET /dashboard/admin-monitoring
 * Admin Monitoring: Comprehensive stage breakdown across all lead phases and Overdue Task Detection Engine.
 */
const getAdminMonitoring = async (req, res, next) => {
    try {
        const currentUser = req.user;
        if (!currentUser) throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
        if (currentUser.role !== "SUPER_ADMIN" && currentUser.role !== "BRANCH_ADMIN") {
            throw AppError.forbidden("Only administrators can view admin monitoring.", "FORBIDDEN");
        }

        let studentBranchFilter = {};
        if (currentUser.role === "BRANCH_ADMIN") {
            if (!isValidBranchId(currentUser.branchId)) {
                throw AppError.forbidden("Branch Admin lacks assigned branch context.", "NO_BRANCH_CONTEXT");
            }
            const branchId = currentUser.branchId.trim();
            studentBranchFilter = {
                OR: [
                    { assignedCounselor: { branchId } },
                    { assignedCounselorId: null, academicBackground: { path: ["branchId"], equals: branchId } },
                ],
            };
        }

        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

        // Fetch leads for stage counts and overdue detection
        const leads = await prisma.student.findMany({
            where: {
                ...studentBranchFilter,
                isActive: true,
                currentStage: { in: ["LEAD", "PROSPECT"] },
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                currentStage: true,
                assignedCounselorId: true,
                assignedCounselor: { select: { id: true, firstName: true, lastName: true, email: true } },
                academicBackground: true,
                createdAt: true,
                updatedAt: true,
                communicationLogs: {
                    select: { id: true, createdAt: true, nextFollowUpAt: true },
                    orderBy: { createdAt: "desc" },
                    take: 5,
                },
                appointments: {
                    where: { status: "SCHEDULED" },
                    select: { id: true, datetime: true, counselorId: true, type: true, notes: true },
                    orderBy: { datetime: "asc" },
                },
            },
        });

        // Trashed records count
        const trashCount = await prisma.student.count({
            where: {
                ...studentBranchFilter,
                isActive: false,
            },
        });

        let newLeadsCount = 0;
        let frontDeskFollowUpsCount = 0;
        let assignedLeadsCount = 0;
        let counselorFollowUpsCount = 0;
        let notContractedCount = 0;
        let interestedCount = 0;
        let upcomingAppointmentsCount = 0;
        let overdueFollowUpsCount = 0;

        const overdueTasks = [];

        for (const lead of leads) {
            const bg = lead.academicBackground && typeof lead.academicBackground === "object" ? lead.academicBackground : {};
            const leadStage = bg.leadStage || (lead.assignedCounselorId ? "ASSIGNED" : "NEW");

            // Count by stage
            if (leadStage === "NEW") newLeadsCount++;
            else if (leadStage === "FOLLOW_UP") {
                if (lead.assignedCounselorId) counselorFollowUpsCount++;
                else frontDeskFollowUpsCount++;
            } else if (leadStage === "ASSIGNED" || leadStage === "COUNSELLING") assignedLeadsCount++;
            else if (leadStage === "NOT_CONTRACTED") notContractedCount++;
            else if (leadStage === "INTERESTED") interestedCount++;

            // Count upcoming appointments
            for (const appt of lead.appointments) {
                if (new Date(appt.datetime) > now) upcomingAppointmentsCount++;
            }

            // Overdue Follow-ups: check communicationLogs where nextFollowUpAt is in the past
            const latestFollowUp = lead.communicationLogs.find((l) => l.nextFollowUpAt);
            if (latestFollowUp && new Date(latestFollowUp.nextFollowUpAt) < now) {
                overdueFollowUpsCount++;
                const hoursOverdue = Math.round((now.getTime() - new Date(latestFollowUp.nextFollowUpAt).getTime()) / (1000 * 60 * 60));
                overdueTasks.push({
                    id: `overdue-followup-${lead.id}`,
                    type: "OVERDUE_FOLLOW_UP",
                    studentId: lead.id,
                    studentName: `${lead.firstName} ${lead.lastName}`.trim(),
                    responsibleEmployee: lead.assignedCounselor
                        ? `${lead.assignedCounselor.firstName} ${lead.assignedCounselor.lastName}`.trim()
                        : "Front Desk",
                    responsibleEmployeeId: lead.assignedCounselorId || null,
                    scheduledAt: latestFollowUp.nextFollowUpAt,
                    hoursOverdue,
                    description: `Follow-up scheduled for ${new Date(latestFollowUp.nextFollowUpAt).toLocaleDateString()} was missed (${hoursOverdue}h overdue).`,
                });
            }

            // Unprocessed New Leads: created > 24 hours ago, still NEW, with 0 communication logs
            if (leadStage === "NEW" && new Date(lead.createdAt) < twentyFourHoursAgo && lead.communicationLogs.length === 0) {
                const hoursOverdue = Math.round((now.getTime() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60));
                overdueTasks.push({
                    id: `unprocessed-lead-${lead.id}`,
                    type: "UNPROCESSED_NEW_LEAD",
                    studentId: lead.id,
                    studentName: `${lead.firstName} ${lead.lastName}`.trim(),
                    responsibleEmployee: "Front Desk",
                    responsibleEmployeeId: null,
                    scheduledAt: lead.createdAt,
                    hoursOverdue,
                    description: `New lead created ${hoursOverdue}h ago with no contact logged.`,
                });
            }

            // Assigned Leads without counselor activity for > 48h
            if ((leadStage === "ASSIGNED" || leadStage === "COUNSELLING") && lead.assignedCounselorId) {
                const assignmentTime = bg.assignedAt ? new Date(bg.assignedAt) : new Date(lead.updatedAt);
                const lastActivityTime = lead.communicationLogs[0] ? new Date(lead.communicationLogs[0].createdAt) : assignmentTime;
                if (lastActivityTime < fortyEightHoursAgo) {
                    const hoursOverdue = Math.round((now.getTime() - lastActivityTime.getTime()) / (1000 * 60 * 60));
                    overdueTasks.push({
                        id: `inactive-assigned-${lead.id}`,
                        type: "INACTIVE_ASSIGNED_LEAD",
                        studentId: lead.id,
                        studentName: `${lead.firstName} ${lead.lastName}`.trim(),
                        responsibleEmployee: lead.assignedCounselor
                            ? `${lead.assignedCounselor.firstName} ${lead.assignedCounselor.lastName}`.trim()
                            : "Counselor",
                        responsibleEmployeeId: lead.assignedCounselorId,
                        scheduledAt: lastActivityTime,
                        hoursOverdue,
                        description: `Assigned lead has no activity logged for ${hoursOverdue}h.`,
                    });
                }
            }

            // Missed appointments (datetime < now and status SCHEDULED)
            for (const appt of lead.appointments) {
                if (new Date(appt.datetime) < now) {
                    const hoursOverdue = Math.round((now.getTime() - new Date(appt.datetime).getTime()) / (1000 * 60 * 60));
                    overdueTasks.push({
                        id: `missed-appt-${appt.id}`,
                        type: "MISSED_APPOINTMENT",
                        studentId: lead.id,
                        studentName: `${lead.firstName} ${lead.lastName}`.trim(),
                        responsibleEmployee: lead.assignedCounselor
                            ? `${lead.assignedCounselor.firstName} ${lead.assignedCounselor.lastName}`.trim()
                            : "Counselor",
                        responsibleEmployeeId: appt.counselorId || lead.assignedCounselorId,
                        scheduledAt: appt.datetime,
                        hoursOverdue,
                        description: `Scheduled appointment (${appt.type}) on ${new Date(appt.datetime).toLocaleDateString()} was not marked completed or cancelled.`,
                    });
                }
            }
        }

        overdueTasks.sort((a, b) => b.hoursOverdue - a.hoursOverdue);

        const summary = {
            counts: {
                totalActiveLeads: leads.length,
                newLeads: newLeadsCount,
                frontDeskFollowUps: frontDeskFollowUpsCount,
                assignedLeads: assignedLeadsCount,
                counselorFollowUps: counselorFollowUpsCount,
                notContracted: notContractedCount,
                interestedLeads: interestedCount,
                trash: trashCount,
                upcomingAppointments: upcomingAppointmentsCount,
                overdueFollowUps: overdueFollowUpsCount,
            },
            overdueTasks,
            totalOverdueTasks: overdueTasks.length,
        };

        sendSuccess(res, { data: summary });
    } catch (err) {
        next(err);
    }
};

module.exports = { getSummary, getCounselorSummary, getAdminMonitoring };
