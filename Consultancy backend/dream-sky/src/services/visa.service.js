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

module.exports = {
    createVisaCase,
    getVisaCaseById,
    listVisaCases,
    updateVisaCase,
    changeStatus,
    deleteVisaCase,
    getDashboardStats,
    assertVisaCaseAuthorization,
    buildVisaScopeWhere,
};
