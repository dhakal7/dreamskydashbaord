const prisma = require("../prisma");
const AppError = require("../utils/apiError");
const { sendNotificationEmail } = require("./email.service");

// ─── Status transition rules ─────────────────────────────────────────────────
const ALLOWED_TRANSITIONS = {
    NOT_APPLIED: ["PREPARING"],
    PREPARING: ["SUBMITTED"],
    SUBMITTED: ["APPROVED", "REFUSED"],
    REFUSED: ["RESUBMITTING"],
    RESUBMITTING: ["SUBMITTED"],
    APPROVED: [],
};

function isValidBranchId(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function resolveStudentBranchId(student) {
    if (!student || typeof student !== "object") return null;

    const hasAssignedCounselor =
        (student.assignedCounselorId !== undefined &&
            student.assignedCounselorId !== null &&
            String(student.assignedCounselorId).trim().length > 0) ||
        (student.assignedCounselor !== undefined &&
            student.assignedCounselor !== null &&
            typeof student.assignedCounselor === "object");

    if (hasAssignedCounselor) {
        const counselorBranchId = student.assignedCounselor?.branchId;
        return isValidBranchId(counselorBranchId) ? counselorBranchId.trim() : null;
    }

    const bg = student.academicBackground;
    if (bg && typeof bg === "object" && isValidBranchId(bg.branchId)) {
        return bg.branchId.trim();
    }

    return null;
}

const includeRelations = {
    application: {
        select: {
            id: true,
            status: true,
            intake: true,
            student: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    assignedCounselorId: true,
                    academicBackground: true,
                    assignedCounselor: {
                        select: { id: true, branchId: true },
                    },
                },
            },
            university: { select: { id: true, name: true } },
            course: { select: { id: true, name: true, level: true } },
        },
    },
};

/**
 * Asserts that the authenticated actor has authorization to access or mutate a visa case.
 * @param {object} visaCase - Loaded visa case with application.student relation
 * @param {object} currentUser - Authenticated user context
 * @param {string} action - Action description ("delete", "view", "update", "modify")
 */
const assertVisaCaseAuthorization = (visaCase, currentUser, action = "modify") => {
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }

    const actorRole = currentUser.role;
    const actorId = currentUser.userId || currentUser.id;

    if (actorRole === "SUPER_ADMIN") {
        return; // Full global access
    }

    if (actorRole === "COUNSELOR") {
        const assignedCounselorId = visaCase.application?.student?.assignedCounselorId;
        if (!assignedCounselorId || assignedCounselorId !== actorId) {
            throw AppError.forbidden(`You are not authorized to ${action} this visa case.`, "FORBIDDEN");
        }
        return;
    }

    if (actorRole === "BRANCH_ADMIN") {
        if (!isValidBranchId(currentUser.branchId)) {
            throw AppError.forbidden("Branch Admin lacks assigned branch context.", "NO_BRANCH_CONTEXT");
        }
        const authorizedBranchId = currentUser.branchId.trim();
        const studentBranchId = resolveStudentBranchId(visaCase.application?.student);
        if (!studentBranchId || studentBranchId !== authorizedBranchId) {
            throw AppError.forbidden(`You are not authorized to ${action} this visa case.`, "FORBIDDEN");
        }
        return;
    }

    throw AppError.forbidden(`You are not authorized to ${action} this visa case.`, "FORBIDDEN");
};

// ─── CREATE ───────────────────────────────────────────────────────────────────
const createVisaCase = async (data, currentUser = null) => {
    return prisma.$transaction(async (tx) => {
        let applicationId = data.applicationId;
        let targetStudent = null;

        if (applicationId) {
            const [lockedApp] = await tx.$queryRaw`
                SELECT id FROM "Application" WHERE id = ${applicationId} FOR UPDATE
            `;
            if (!lockedApp) {
                throw AppError.notFound("Application not found.", "APPLICATION_NOT_FOUND");
            }

            const app = await tx.application.findUnique({
                where: { id: applicationId },
                select: {
                    id: true,
                    status: true,
                    studentId: true,
                    student: {
                        select: {
                            id: true,
                            assignedCounselorId: true,
                            academicBackground: true,
                            isActive: true,
                            assignedCounselor: {
                                select: { id: true, branchId: true },
                            },
                        },
                    },
                },
            });
            if (!app) throw AppError.notFound("Application not found.", "APPLICATION_NOT_FOUND");

            // Guard against client passing mismatched studentId and applicationId
            if (data.studentId && app.studentId !== data.studentId) {
                throw AppError.badRequest("Application does not belong to the specified student.", "APPLICATION_STUDENT_MISMATCH");
            }

            if (!currentUser) {
                throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
            }
            assertVisaCaseAuthorization({ application: app }, currentUser, "create");
            targetStudent = app.student;
            if (targetStudent && targetStudent.isActive === false) {
                throw AppError.badRequest("Cannot create a visa case for a student in Trash. Please restore the student first.", "STUDENT_IN_TRASH");
            }
        } else if (data.studentId) {
            targetStudent = await tx.student.findUnique({
                where: { id: data.studentId },
                select: {
                    id: true,
                    assignedCounselorId: true,
                    academicBackground: true,
                    isActive: true,
                    assignedCounselor: {
                        select: { id: true, branchId: true },
                    },
                },
            });
            if (!targetStudent) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");

            if (!currentUser) {
                throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
            }
            assertVisaCaseAuthorization({ application: { student: targetStudent } }, currentUser, "create");

            if (targetStudent.isActive === false) {
                throw AppError.badRequest("Cannot create a visa case for a student in Trash. Please restore the student first.", "STUDENT_IN_TRASH");
            }

            // Find existing application for this student
            let app = await tx.application.findFirst({
                where: { studentId: data.studentId },
                orderBy: { createdAt: "desc" },
            });

            if (app) {
                const [lockedApp] = await tx.$queryRaw`
                    SELECT id FROM "Application" WHERE id = ${app.id} FOR UPDATE
                `;
                if (!lockedApp) {
                    app = await tx.application.findFirst({
                        where: { studentId: data.studentId },
                        orderBy: { createdAt: "desc" },
                    });
                    if (app) {
                        const [reLocked] = await tx.$queryRaw`
                            SELECT id FROM "Application" WHERE id = ${app.id} FOR UPDATE
                        `;
                        if (!reLocked) {
                            app = null;
                        }
                    }
                }
            }

            if (!app) {
                let university = null;
                if (data.country) {
                    const country = await tx.country.findFirst({
                        where: { name: { contains: data.country, mode: "insensitive" } },
                        include: { universities: true },
                    });
                    if (country && country.universities.length > 0) {
                        university = country.universities[0];
                    }
                }
                if (!university) {
                    university = await tx.university.findFirst();
                }
                const course = university
                    ? await tx.course.findFirst({ where: { universityId: university.id } })
                    : await tx.course.findFirst();

                app = await tx.application.create({
                    data: {
                        studentId: data.studentId,
                        universityId: university?.id || null,
                        courseId: course?.id || null,
                        status: "ACCEPTED",
                        intake: "Upcoming",
                        notes: "Created for Visa processing",
                    },
                });
            } else if (app.status !== "ACCEPTED") {
                app = await tx.application.update({
                    where: { id: app.id },
                    data: { status: "ACCEPTED" },
                });
            }

            applicationId = app.id;
        }

        if (!applicationId) {
            throw AppError.badRequest("Unable to link or create an application for this visa case.", "APPLICATION_REQUIRED");
        }

        // Check for existing visa case (unique constraint will also catch this)
        const existing = await tx.visaCase.findUnique({ where: { applicationId } });
        if (existing) throw AppError.conflict("A visa case already exists for this application.", "VISA_CASE_EXISTS");

        return tx.visaCase.create({
            data: {
                applicationId,
                visaType: data.visaType?.trim() || null,
                embassy: data.embassy?.trim() || data.country?.trim() || null,
                notes: data.notes?.trim() || null,
            },
            include: includeRelations,
        });
    });
};

// ─── GET ONE ──────────────────────────────────────────────────────────────────
const getVisaCaseById = async (id, currentUser = null) => {
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }
    const vc = await prisma.visaCase.findUnique({
        where: { id },
        include: includeRelations,
    });
    if (!vc) throw AppError.notFound("Visa case not found.", "VISA_CASE_NOT_FOUND");

    try {
        assertVisaCaseAuthorization(vc, currentUser, "view");
    } catch {
        throw AppError.notFound("Visa case not found.", "VISA_CASE_NOT_FOUND");
    }
    return vc;
};

const buildVisaScopeWhere = (currentUser = null, existingApplicationFilter = undefined) => {
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }

    const actorRole = currentUser.role;
    const actorId = currentUser.userId || currentUser.id;

    if (actorRole === "SUPER_ADMIN") {
        return existingApplicationFilter ? { application: existingApplicationFilter } : {};
    }

    if (actorRole === "COUNSELOR") {
        return {
            application: {
                ...(existingApplicationFilter || {}),
                student: {
                    ...(existingApplicationFilter?.student || {}),
                    assignedCounselorId: actorId,
                },
            },
        };
    }

    if (actorRole === "BRANCH_ADMIN") {
        if (!isValidBranchId(currentUser.branchId)) {
            throw AppError.forbidden("Branch Admin lacks assigned branch context.", "NO_BRANCH_CONTEXT");
        }
        const authorizedBranchId = currentUser.branchId.trim();
        return {
            application: {
                ...(existingApplicationFilter || {}),
                student: {
                    ...(existingApplicationFilter?.student || {}),
                    OR: [
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
                    ],
                },
            },
        };
    }

    throw AppError.forbidden("You are not authorized to view visa cases.", "FORBIDDEN");
};

// ─── LIST / FILTER ────────────────────────────────────────────────────────────
const listVisaCases = async (query = {}, currentUser = null) => {
    const { status, applicationId, studentId, page, limit } = query;
    const baseApplicationFilter = studentId ? { studentId } : undefined;
    const scopeWhere = buildVisaScopeWhere(currentUser, baseApplicationFilter);
    const where = { ...scopeWhere };

    if (status) where.status = status;
    if (applicationId) where.applicationId = applicationId;

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const skip = (pageNum - 1) * pageSize;

    const [visaCases, total] = await Promise.all([
        prisma.visaCase.findMany({
            where,
            include: includeRelations,
            orderBy: { createdAt: "desc" },
            skip,
            take: pageSize,
        }),
        prisma.visaCase.count({ where }),
    ]);

    return {
        visaCases,
        pagination: { page: pageNum, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
const updateVisaCase = async (id, data, currentUser = null) => {
    const existing = await prisma.visaCase.findUnique({
        where: { id },
        include: includeRelations,
    });
    if (!existing) throw AppError.notFound("Visa case not found.", "VISA_CASE_NOT_FOUND");

    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }
    assertVisaCaseAuthorization(existing, currentUser, "update");

    const update = {};
    if (data.visaType !== undefined) update.visaType = data.visaType?.trim() || null;
    if (data.embassy !== undefined) update.embassy = data.embassy?.trim() || null;
    if (data.notes !== undefined) update.notes = data.notes?.trim() || null;
    if (data.resubmissionLink !== undefined) update.resubmissionLink = data.resubmissionLink?.trim() || null;

    return prisma.visaCase.update({ where: { id }, data: update, include: includeRelations });
};

// ─── CHANGE STATUS ────────────────────────────────────────────────────────────
const changeStatus = async (id, { status, refusalReason }, currentUser = null) => {
    const existing = await prisma.visaCase.findUnique({
        where: { id },
        include: includeRelations,
    });
    if (!existing) throw AppError.notFound("Visa case not found.", "VISA_CASE_NOT_FOUND");

    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }
    assertVisaCaseAuthorization(existing, currentUser, "change status of");

    const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(status))
        throw AppError.badRequest(
            `Cannot move from ${existing.status} to ${status}. Allowed: ${allowed.join(", ") || "none (terminal)"}`,
            "INVALID_STATUS_TRANSITION"
        );

    const update = { status };

    // Auto-set timestamps
    if (status === "SUBMITTED" && !existing.submittedAt) update.submittedAt = new Date();
    if (status === "APPROVED" || status === "REFUSED") update.decisionAt = new Date();
    if (status === "REFUSED" && refusalReason) update.refusalReason = refusalReason.trim();
    // Clear refusal on resubmit
    if (status === "RESUBMITTING") {
        update.refusalReason = null;
        update.decisionAt = null;
    }

    const updated = await prisma.visaCase.update({ where: { id }, data: update, include: includeRelations });

    // ── AUTOMATED VISA APPROVAL EVENT HOOKS ──────────────────────────────────
    // When a visa is approved:
    // 1. Advance student to VISA_APPROVED stage and initialize departure tracking
    // 2. Automatically evaluate and generate Counselor & Referral Agent commissions
    if (status === "APPROVED") {
        const student = updated.application?.student;
        if (student?.id) {
            try {
                const currentBg = (student.academicBackground && typeof student.academicBackground === "object")
                    ? { ...student.academicBackground }
                    : {};
                const existingDeparture = currentBg.departureDetails || {};
                currentBg.departureDetails = {
                    status: existingDeparture.status || "VISA_GRANTED",
                    expectedDepartureDate: existingDeparture.expectedDepartureDate || null,
                    actualDepartureDate: existingDeparture.actualDepartureDate || null,
                    updatedAt: new Date().toISOString(),
                };

                await prisma.student.update({
                    where: { id: student.id },
                    data: {
                        currentStage: "VISA_APPROVED",
                        academicBackground: currentBg,
                    },
                });

                // Automated Commission Generation
                const { evaluateVisaApprovalCommissions } = require("./commission.service");
                if (typeof evaluateVisaApprovalCommissions === "function") {
                    await evaluateVisaApprovalCommissions(student.id, updated.id);
                }
            } catch (autoErr) {
                console.error(`[Visa Service] Post-approval automation error for student ${student.id}:`, autoErr);
            }
        }
    }

    // Email the student whenever their visa case status changes
    const student = updated.application?.student;
    if (student?.email) {
        const recipientName = [student.firstName, student.lastName].filter(Boolean).join(" ");
        sendNotificationEmail({
            to: student.email,
            subject: "Visa Status Update — DreamSky Education Consultancy",
            body: `${recipientName ? `Hi ${recipientName},\n\n` : ""}Your visa case status is now ${status.replace(/_/g, " ").toLowerCase()}.\n\nDreamSky Education Consultancy`,
        }).catch(() => {});
    }

    return updated;
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
const deleteVisaCase = async (id, currentUser = null) => {
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }
    const existing = await prisma.visaCase.findUnique({
        where: { id },
        include: includeRelations,
    });
    if (!existing) throw AppError.notFound("Visa case not found.", "VISA_CASE_NOT_FOUND");

    assertVisaCaseAuthorization(existing, currentUser, "delete");

    await prisma.visaCase.delete({ where: { id } });
};

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────
const getDashboardStats = async (currentUser = null) => {
    const scopeWhere = buildVisaScopeWhere(currentUser);
    const statuses = ["NOT_APPLIED", "PREPARING", "SUBMITTED", "APPROVED", "REFUSED", "RESUBMITTING"];

    const counts = await Promise.all(
        statuses.map((s) => prisma.visaCase.count({ where: { ...scopeWhere, status: s } }))
    );

    const result = {};
    statuses.forEach((s, i) => {
        const key = s.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        result[key] = counts[i];
    });
    return result;
};

// ─── VISA GRANTED & SUCCESS STUDENTS ──────────────────────────────────────────

/**
 * List all Visa Granted / Success Students with role-based scoping and filters.
 */
const listVisaGrantedStudents = async (query = {}, currentUser = null) => {
    if (!currentUser) throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");

    const actorRole = currentUser.role;
    const actorId = currentUser.userId || currentUser.id;
    const { counselorId, referralAgentId, country, university, departureStatus, search } = query;

    const where = {
        isActive: true,
        OR: [
            { currentStage: { in: ["VISA_APPROVED", "DEPARTED"] } },
            { applications: { some: { visaCase: { status: "APPROVED" } } } },
        ],
    };

    // Role-based scoping
    if (actorRole === "COUNSELOR") {
        where.assignedCounselorId = actorId;
    } else if (actorRole === "REFERRAL_AGENT") {
        where.referredByAgent = { userId: actorId };
    } else if (actorRole === "BRANCH_ADMIN") {
        if (!isValidBranchId(currentUser.branchId)) {
            throw AppError.forbidden("Branch Admin lacks assigned branch context.", "NO_BRANCH_CONTEXT");
        }
        where.OR = [
            { assignedCounselor: { branchId: currentUser.branchId.trim() } },
            { assignedCounselorId: null, academicBackground: { path: ["branchId"], equals: currentUser.branchId.trim() } },
        ];
    } else if (actorRole === "FRONT_DESK" || actorRole === "SUPER_ADMIN") {
        if (counselorId && counselorId !== "all") {
            where.assignedCounselorId = counselorId.trim();
        }
        if (referralAgentId && referralAgentId !== "all") {
            where.referredByAgentId = referralAgentId.trim();
        }
    } else {
        throw AppError.forbidden("You do not have permission to view Visa Granted students.", "FORBIDDEN");
    }

    if (search && search.trim()) {
        const q = search.trim();
        where.AND = where.AND || [];
        where.AND.push({
            OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { phone: { contains: q, mode: "insensitive" } },
                { id: { contains: q, mode: "insensitive" } },
            ],
        });
    }

    const students = await prisma.student.findMany({
        where,
        include: {
            assignedCounselor: {
                select: { id: true, firstName: true, lastName: true, email: true },
            },
            referredByAgent: {
                include: {
                    user: { select: { id: true, firstName: true, lastName: true, email: true } },
                },
            },
            applications: {
                where: { status: { notIn: ["WITHDRAWN", "REJECTED"] } },
                include: {
                    university: { select: { id: true, name: true, country: { select: { id: true, name: true, code: true } } } },
                    course: { select: { id: true, name: true } },
                    visaCase: {
                        select: {
                            id: true,
                            status: true,
                            visaType: true,
                            embassy: true,
                            submittedAt: true,
                            decisionAt: true,
                            updatedAt: true,
                        },
                    },
                },
                take: 1,
                orderBy: { updatedAt: "desc" },
            },
            commissions: {
                select: {
                    id: true,
                    amount: true,
                    currency: true,
                    status: true,
                    paidAt: true,
                    recipientId: true,
                    recipient: { select: { id: true, firstName: true, lastName: true, role: true } },
                },
            },
        },
        orderBy: { updatedAt: "desc" },
    });

    let formatted = students.map((s) => {
        const app = s.applications[0];
        const vc = app?.visaCase;
        const bg = s.academicBackground && typeof s.academicBackground === "object" ? s.academicBackground : {};
        const departure = bg.departureDetails || {};

        const counselorCommission = s.commissions.find((c) => c.recipientId === s.assignedCounselorId);
        const agentCommission = s.referredByAgent?.userId
            ? s.commissions.find((c) => c.recipientId === s.referredByAgent.userId)
            : null;

        const depStatus = departure.status || (s.currentStage === "DEPARTED" ? "DEPARTED" : "VISA_GRANTED");

        return {
            id: s.id,
            studentId: s.id,
            studentCode: s.id.length > 8 ? `EP-${s.id.slice(-6).toUpperCase()}` : s.id,
            firstName: s.firstName,
            lastName: s.lastName,
            studentName: `${s.firstName} ${s.lastName}`.trim(),
            email: s.email,
            phone: s.phone,
            photoUrl: bg.profilePhoto || null,
            assignedCounselorId: s.assignedCounselorId,
            assignedCounselorName: s.assignedCounselor
                ? `${s.assignedCounselor.firstName} ${s.assignedCounselor.lastName}`.trim()
                : "Unassigned",
            referredByAgentId: s.referredByAgentId,
            referralAgentName: s.referredByAgent?.user
                ? `${s.referredByAgent.user.firstName} ${s.referredByAgent.user.lastName}`.trim()
                : null,
            referralCode: s.referredByAgent?.referralCode || null,
            countryName: app?.university?.country?.name || app?.university?.countryName || "General",
            countryFlag: app?.university?.country?.code || "🎓",
            universityName: app?.university?.name || "University",
            courseName: app?.course?.name || "Course",
            intake: app?.intake || "Upcoming",
            visaGrantDate: vc?.decisionAt || vc?.updatedAt || s.updatedAt,
            visaApplicationDate: vc?.submittedAt || null,
            visaCaseId: vc?.id || null,
            departureStatus: depStatus,
            departureDetails: {
                status: depStatus,
                expectedDepartureDate: departure.expectedDepartureDate || null,
                actualDepartureDate: departure.actualDepartureDate || null,
                destinationAirport: departure.destinationAirport || null,
                flightNumber: departure.flightNumber || null,
                notes: departure.notes || null,
                updatedAt: departure.updatedAt || null,
                updatedByName: departure.updatedByName || null,
            },
            counselorCommission: counselorCommission
                ? {
                      id: counselorCommission.id,
                      amount: counselorCommission.amount,
                      currency: counselorCommission.currency,
                      status: counselorCommission.status,
                      paidAt: counselorCommission.paidAt,
                  }
                : null,
            agentCommission: agentCommission
                ? {
                      id: agentCommission.id,
                      amount: agentCommission.amount,
                      currency: agentCommission.currency,
                      status: agentCommission.status,
                      paidAt: agentCommission.paidAt,
                  }
                : null,
        };
    });

    if (country && country !== "all") {
        formatted = formatted.filter((item) => item.countryName.toLowerCase() === country.toLowerCase());
    }
    if (university && university !== "all") {
        formatted = formatted.filter((item) => item.universityName.toLowerCase().includes(university.toLowerCase()));
    }
    if (departureStatus && departureStatus !== "all") {
        formatted = formatted.filter((item) => item.departureStatus.toUpperCase() === departureStatus.toUpperCase());
    }

    return formatted;
};

/**
 * Get aggregate analytics for Visa Granted students
 */
const getVisaGrantedAnalytics = async (currentUser) => {
    const list = await listVisaGrantedStudents({}, currentUser);

    const totalApproved = list.length;
    const preparingDeparture = list.filter((s) => s.departureStatus === "PREPARING_DEPARTURE").length;
    const ticketBooked = list.filter((s) => s.departureStatus === "TICKET_BOOKED").length;
    const departed = list.filter((s) => s.departureStatus === "DEPARTED").length;
    const visaGrantedOnly = list.filter((s) => s.departureStatus === "VISA_GRANTED").length;

    // Counselor Breakdown
    const counselorMap = new Map();
    for (const s of list) {
        const id = s.assignedCounselorId || "unassigned";
        const name = s.assignedCounselorName || "Unassigned";
        const existing = counselorMap.get(id) || { id, name, approvedCount: 0, departedCount: 0 };
        existing.approvedCount += 1;
        if (s.departureStatus === "DEPARTED") existing.departedCount += 1;
        counselorMap.set(id, existing);
    }

    // Referral Agent Breakdown
    const agentMap = new Map();
    for (const s of list) {
        if (!s.referredByAgentId) continue;
        const id = s.referredByAgentId;
        const name = s.referralAgentName || "Referral Agent";
        const existing = agentMap.get(id) || { id, name, approvedCount: 0, departedCount: 0 };
        existing.approvedCount += 1;
        if (s.departureStatus === "DEPARTED") existing.departedCount += 1;
        agentMap.set(id, existing);
    }

    // Country Breakdown
    const countryMap = new Map();
    for (const s of list) {
        const c = s.countryName || "General";
        countryMap.set(c, (countryMap.get(c) || 0) + 1);
    }

    return {
        summary: {
            totalApproved,
            visaGrantedOnly,
            preparingDeparture,
            ticketBooked,
            departed,
            departureRate: totalApproved > 0 ? Math.round((departed / totalApproved) * 100) : 0,
        },
        counselors: Array.from(counselorMap.values()).sort((a, b) => b.approvedCount - a.approvedCount),
        referralAgents: Array.from(agentMap.values()).sort((a, b) => b.approvedCount - a.approvedCount),
        countries: Array.from(countryMap.entries()).map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count),
    };
};

/**
 * Update departure details for a student.
 * Counselors are explicitly permitted to update their own assigned students.
 */
const updateStudentDepartureStatus = async (studentId, payload, currentUser) => {
    if (!currentUser) throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");

    const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: {
            id: true,
            assignedCounselorId: true,
            academicBackground: true,
            currentStage: true,
        },
    });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");

    const actorRole = currentUser.role;
    const actorId = currentUser.userId || currentUser.id;

    // Check permissions:
    // SUPER_ADMIN, FRONT_DESK, BRANCH_ADMIN: authorized
    // COUNSELOR: authorized ONLY for their own assigned students!
    if (actorRole === "COUNSELOR") {
        if (!student.assignedCounselorId || student.assignedCounselorId !== actorId) {
            throw AppError.forbidden("Counselors can only update departure status for their own assigned students.", "FORBIDDEN");
        }
    } else if (!["SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK"].includes(actorRole)) {
        throw AppError.forbidden("You do not have permission to update departure status.", "FORBIDDEN");
    }

    const { status, expectedDepartureDate, actualDepartureDate, destinationAirport, flightNumber, notes } = payload || {};

    const validDepartureStatuses = ["VISA_GRANTED", "PREPARING_DEPARTURE", "TICKET_BOOKED", "DEPARTURE_DELAYED", "DEPARTED"];
    if (status && !validDepartureStatuses.includes(status)) {
        throw AppError.badRequest(`Invalid departure status. Must be one of: ${validDepartureStatuses.join(", ")}.`, "VALIDATION_ERROR");
    }

    const bg = student.academicBackground && typeof student.academicBackground === "object" ? { ...student.academicBackground } : {};
    const existing = bg.departureDetails || {};

    const newDepStatus = status || existing.status || "VISA_GRANTED";
    const actorName = `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim() || actorRole;

    bg.departureDetails = {
        ...existing,
        status: newDepStatus,
        expectedDepartureDate: expectedDepartureDate !== undefined ? expectedDepartureDate : (existing.expectedDepartureDate || null),
        actualDepartureDate: actualDepartureDate !== undefined ? actualDepartureDate : (existing.actualDepartureDate || null),
        destinationAirport: destinationAirport !== undefined ? (destinationAirport?.trim() || null) : (existing.destinationAirport || null),
        flightNumber: flightNumber !== undefined ? (flightNumber?.trim() || null) : (existing.flightNumber || null),
        notes: notes !== undefined ? (notes?.trim() || null) : (existing.notes || null),
        updatedAt: new Date().toISOString(),
        updatedById: actorId,
        updatedByName: actorName,
    };

    const updateData = { academicBackground: bg };
    if (newDepStatus === "DEPARTED") {
        updateData.currentStage = "DEPARTED";
    }

    const updatedStudent = await prisma.student.update({
        where: { id: studentId },
        data: updateData,
        select: { id: true, currentStage: true, academicBackground: true },
    });

    return updatedStudent.academicBackground?.departureDetails;
};

module.exports = {
    createVisaCase,
    getVisaCaseById,
    listVisaCases,
    updateVisaCase,
    changeStatus,
    deleteVisaCase,
    getDashboardStats,
    listVisaGrantedStudents,
    getVisaGrantedAnalytics,
    updateStudentDepartureStatus,
    assertVisaCaseAuthorization,
    buildVisaScopeWhere,
};
