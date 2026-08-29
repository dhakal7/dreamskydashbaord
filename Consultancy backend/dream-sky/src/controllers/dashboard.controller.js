const prisma = require("../prisma");
const { sendSuccess } = require("../utils/response.util");

/**
 * GET /dashboard/summary
 *
 * Returns all super-admin dashboard stats in a single request.
 * Previously the frontend made 7 parallel requests — this consolidates them
 * server-side so only one HTTP round-trip is needed from the browser.
 *
 * Response shape:
 * {
 *   totalStudents:  number,   // ENROLLED + all downstream stages
 *   newLeads:       number,   // LEAD or PROSPECT created in last 30 days
 *   pendingFollowUps: number, // follow-ups with nextFollowUpAt in the future
 *   applications:   number,   // APPLIED + OFFER_RECEIVED + VISA_*
 *   offerLetters:   number,   // OFFER_RECEIVED
 *   visaCases:      number,   // VISA_APPLIED + VISA_APPROVED
 *   enrolledOnly:   number,   // ENROLLED only
 *   totalLeads:     number,   // all LEAD + PROSPECT
 * }
 */
const getSummary = async (req, res) => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

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
            },
        }),

        // New leads in last 30 days
        prisma.student.count({
            where: {
                isActive: true,
                currentStage: { in: ["LEAD", "PROSPECT"] },
                createdAt: { gte: thirtyDaysAgo },
            },
        }),

        // Pending follow-ups (nextFollowUpAt in the future)
        prisma.communicationLog.count({
            where: {
                nextFollowUpAt: { gt: now },
            },
        }),

        // Active applications
        prisma.student.count({
            where: {
                isActive: true,
                currentStage: {
                    in: ["APPLIED", "OFFER_RECEIVED", "VISA_APPLIED", "VISA_APPROVED"],
                },
            },
        }),

        // Offer letters received
        prisma.student.count({
            where: {
                isActive: true,
                currentStage: "OFFER_RECEIVED",
            },
        }),

        // Visa processing
        prisma.student.count({
            where: {
                isActive: true,
                currentStage: { in: ["VISA_APPLIED", "VISA_APPROVED"] },
            },
        }),

        // Enrolled students only
        prisma.student.count({
            where: {
                isActive: true,
                currentStage: "ENROLLED",
            },
        }),

        // Total all leads (pipeline)
        prisma.student.count({
            where: {
                isActive: true,
                currentStage: { in: ["LEAD", "PROSPECT"] },
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

module.exports = { getSummary, getCounselorSummary };
