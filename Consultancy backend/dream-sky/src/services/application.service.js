const prisma = require("../prisma");
const AppError = require("../utils/apiError");

// ─── Status transition rules ─────────────────────────────────────────────────
const ALLOWED_TRANSITIONS = {
    DRAFT: ["SUBMITTED", "UNDER_REVIEW", "WITHDRAWN"],
    SUBMITTED: ["UNDER_REVIEW", "WITHDRAWN"],
    UNDER_REVIEW: ["ACCEPTED", "REJECTED", "DEFERRED", "WITHDRAWN"],
    DEFERRED: ["SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "WITHDRAWN"],
    ACCEPTED: ["WITHDRAWN"],
    REJECTED: [],
    WITHDRAWN: [],
};

const STUDENT_AUTHZ_SELECT = {
    id: true,
    isActive: true,
    assignedCounselorId: true,
    academicBackground: true,
    assignedCounselor: { select: { id: true, branchId: true } },
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

const buildApplicationScopeWhere = (currentUser) => {
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }

    const actorRole = currentUser.role;
    const actorId = currentUser.userId || currentUser.id;

    if (actorRole === "SUPER_ADMIN") {
        return {};
    }

    if (actorRole === "COUNSELOR") {
        return {
            student: {
                assignedCounselorId: actorId,
            },
        };
    }

    if (actorRole === "BRANCH_ADMIN" || actorRole === "FRONT_DESK") {
        if (!isValidBranchId(currentUser.branchId)) {
            throw AppError.forbidden(`${actorRole} lacks assigned branch context.`, "NO_BRANCH_CONTEXT");
        }
        const authorizedBranchId = currentUser.branchId.trim();
        return {
            student: {
                OR: [
                    { assignedCounselor: { branchId: authorizedBranchId } },
                    {
                        assignedCounselorId: null,
                        academicBackground: { path: ["branchId"], equals: authorizedBranchId },
                    },
                ],
            },
        };
    }

    throw AppError.forbidden("You are not authorized to access applications.", "INSUFFICIENT_ROLE");
};

const assertStudentApplicationAccess = (student, currentUser, action = "access") => {
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }

    const actorRole = currentUser.role;
    const actorId = currentUser.userId || currentUser.id;

    if (actorRole === "SUPER_ADMIN") {
        return;
    }

    if (actorRole === "COUNSELOR") {
        if (!student || !student.assignedCounselorId || student.assignedCounselorId !== actorId) {
            throw AppError.forbidden(`You are not authorized to ${action} this application.`, "FORBIDDEN");
        }
        return;
    }

    if (actorRole === "BRANCH_ADMIN") {
        if (!isValidBranchId(currentUser.branchId)) {
            throw AppError.forbidden("Branch Admin lacks assigned branch context.", "NO_BRANCH_CONTEXT");
        }
        const authorizedBranchId = currentUser.branchId.trim();
        const studentBranchId = resolveStudentBranchId(student);
        if (!studentBranchId || studentBranchId !== authorizedBranchId) {
            throw AppError.forbidden(`You are not authorized to ${action} this application.`, "FORBIDDEN");
        }
        return;
    }

    if (actorRole === "FRONT_DESK" && action === "view") {
        if (!isValidBranchId(currentUser.branchId)) {
            throw AppError.forbidden("Front Desk lacks assigned branch context.", "NO_BRANCH_CONTEXT");
        }
        const authorizedBranchId = currentUser.branchId.trim();
        const studentBranchId = resolveStudentBranchId(student);
        if (!studentBranchId || studentBranchId !== authorizedBranchId) {
            throw AppError.forbidden(`You are not authorized to ${action} this application.`, "FORBIDDEN");
        }
        return;
    }

    throw AppError.forbidden(`You are not authorized to ${action} this application.`, "FORBIDDEN");
};

const includeRelations = {
    student: { select: { id: true, firstName: true, lastName: true, email: true } },
    university: { select: { id: true, name: true } },
    course: { select: { id: true, name: true, level: true } },
    offers: true,
    visaCase: { select: { id: true, status: true } },
};

// ─── CREATE ───────────────────────────────────────────────────────────────────
const createApplication = async (data, currentUser = null) => {
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }

    const student = await prisma.student.findUnique({
        where: { id: data.studentId },
        select: STUDENT_AUTHZ_SELECT,
    });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");
    assertStudentApplicationAccess(student, currentUser, "create an application for");

    if (student.isActive === false) throw AppError.badRequest("Cannot create an application for a student in Trash. Please restore the student first.", "STUDENT_IN_TRASH");

    const university = await prisma.university.findUnique({ where: { id: data.universityId }, select: { id: true } });
    if (!university) throw AppError.notFound("University not found.", "UNIVERSITY_NOT_FOUND");

    const course = await prisma.course.findUnique({ where: { id: data.courseId }, select: { id: true } });
    if (!course) throw AppError.notFound("Course not found.", "COURSE_NOT_FOUND");

    return prisma.application.create({
        data: {
            studentId: data.studentId,
            universityId: data.universityId,
            courseId: data.courseId,
            status: "SUBMITTED",
            submittedAt: new Date(),
            intake: data.intake?.trim() || null,
            priority: data.priority || null,
            notes: data.notes?.trim() || null,
        },
        include: includeRelations,
    });
};

// ─── GET ONE ──────────────────────────────────────────────────────────────────
const getApplicationById = async (id, currentUser = null) => {
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }

    const app = await prisma.application.findUnique({
        where: { id },
        include: {
            ...includeRelations,
            student: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    assignedCounselorId: true,
                    academicBackground: true,
                    assignedCounselor: { select: { id: true, branchId: true } },
                },
            },
        },
    });
    if (!app) throw AppError.notFound("Application not found.", "APPLICATION_NOT_FOUND");

    assertStudentApplicationAccess(app.student, currentUser, "view");
    return app;
};

// ─── LIST / FILTER ────────────────────────────────────────────────────────────
const listApplications = async (query, currentUser = null) => {
    const scopeWhere = buildApplicationScopeWhere(currentUser);
    const { studentId, universityId, status, priority, page, limit } = query;
    const where = { ...scopeWhere };

    if (studentId) where.studentId = studentId;
    if (universityId) where.universityId = universityId;
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const skip = (pageNum - 1) * pageSize;

    const [applications, total] = await Promise.all([
        prisma.application.findMany({
            where,
            include: {
                student: { select: { id: true, firstName: true, lastName: true } },
                university: { select: { id: true, name: true } },
                course: { select: { id: true, name: true, level: true } },
                offers: { select: { id: true, type: true, details: true, receivedAt: true } },
                visaCase: { select: { id: true, status: true } },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: pageSize,
        }),
        prisma.application.count({ where }),
    ]);

    return {
        applications,
        pagination: { page: pageNum, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
const updateApplication = async (id, data, currentUser = null) => {
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }

    const existing = await prisma.application.findUnique({
        where: { id },
        include: { student: { select: STUDENT_AUTHZ_SELECT } },
    });
    if (!existing) throw AppError.notFound("Application not found.", "APPLICATION_NOT_FOUND");

    assertStudentApplicationAccess(existing.student, currentUser, "update");

    const update = {};
    if (data.intake !== undefined) update.intake = data.intake?.trim() || null;
    if (data.priority !== undefined) update.priority = data.priority || null;
    if (data.notes !== undefined) update.notes = data.notes?.trim() || null;
    if (data.courseId !== undefined) {
        const course = await prisma.course.findUnique({ where: { id: data.courseId }, select: { id: true } });
        if (!course) throw AppError.notFound("Course not found.", "COURSE_NOT_FOUND");
        update.courseId = data.courseId;
    }

    return prisma.application.update({ where: { id }, data: update, include: includeRelations });
};

// ─── CHANGE STATUS ────────────────────────────────────────────────────────────
const changeStatus = async (id, { status }, currentUser = null) => {
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }

    const existing = await prisma.application.findUnique({
        where: { id },
        include: { student: { select: STUDENT_AUTHZ_SELECT } },
    });
    if (!existing) throw AppError.notFound("Application not found.", "APPLICATION_NOT_FOUND");

    assertStudentApplicationAccess(existing.student, currentUser, "update");

    if (existing.status === status) {
        return existing;
    }

    const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(status))
        throw AppError.badRequest(
            `Cannot move from ${existing.status} to ${status}. Allowed: ${allowed.join(", ") || "none (terminal)"}`,
            "INVALID_STATUS_TRANSITION"
        );

    const update = { status };
    if ((status === "SUBMITTED" || status === "UNDER_REVIEW") && !existing.submittedAt) {
        update.submittedAt = new Date();
    }

    return prisma.application.update({ where: { id }, data: update, include: includeRelations });
};

// ─── RECORD OFFER ─────────────────────────────────────────────────────────────
const recordOffer = async (applicationId, data, currentUser = null) => {
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }

    return prisma.$transaction(async (tx) => {
        const [lockedApp] = await tx.$queryRaw`
            SELECT id FROM "Application" WHERE id = ${applicationId} FOR UPDATE
        `;
        if (!lockedApp) {
            throw AppError.notFound("Application not found.", "APPLICATION_NOT_FOUND");
        }

        const appWithStudent = await tx.application.findUnique({
            where: { id: applicationId },
            select: { id: true, student: { select: STUDENT_AUTHZ_SELECT } },
        });
        assertStudentApplicationAccess(appWithStudent?.student, currentUser, "record an offer for");

        const offer = await tx.offer.create({
            data: {
                applicationId,
                type: data.type,
                details: data.details || null,
            },
        });

        return offer;
    });
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
const deleteApplication = async (id, currentUser = null) => {
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }

    return prisma.$transaction(async (tx) => {
        const [locked] = await tx.$queryRaw`
            SELECT id FROM "Application" WHERE id = ${id} FOR UPDATE
        `;
        if (!locked) {
            throw AppError.notFound("Application not found.", "APPLICATION_NOT_FOUND");
        }

        const appWithStudent = await tx.application.findUnique({
            where: { id },
            select: { id: true, student: { select: STUDENT_AUTHZ_SELECT } },
        });
        assertStudentApplicationAccess(appWithStudent?.student, currentUser, "delete");

        const [offersCount, visaCase] = await Promise.all([
            tx.offer.count({ where: { applicationId: id } }),
            tx.visaCase.findUnique({ where: { applicationId: id }, select: { id: true } }),
        ]);

        if (offersCount > 0 || visaCase) {
            throw AppError.conflict(
                "Cannot delete an application with associated offer letters or visa cases. Please mark the application status as WITHDRAWN instead.",
                "CANNOT_DELETE_APPLICATION_WITH_DEPENDENCIES"
            );
        }

        try {
            await tx.application.delete({ where: { id } });
        } catch (err) {
            if (err.code === "P2025") {
                throw AppError.notFound("Application not found.", "APPLICATION_NOT_FOUND");
            }
            throw err;
        }

        return { message: "Application deleted successfully" };
    });
};

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────
const getDashboardStats = async (currentUser = null) => {
    const scopeWhere = buildApplicationScopeWhere(currentUser);
    const statuses = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "REJECTED", "DEFERRED", "WITHDRAWN"];

    const counts = await Promise.all(
        statuses.map((s) => prisma.application.count({ where: { ...scopeWhere, status: s } }))
    );

    const result = {};
    statuses.forEach((s, i) => {
        // camelCase keys
        const key = s.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        result[key] = counts[i];
    });
    return result;
};

module.exports = {
    createApplication,
    getApplicationById,
    listApplications,
    updateApplication,
    changeStatus,
    recordOffer,
    deleteApplication,
    getDashboardStats,
    assertStudentApplicationAccess,
    buildApplicationScopeWhere,
    resolveStudentBranchId,
};
