const prisma = require("../prisma");
const AppError = require("../utils/apiError");
const { sendNotificationEmail } = require("./email.service");

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

// ─── CREATE ───────────────────────────────────────────────────────────────────
const createFollowUp = async (data, authorId) => {
    // Verify student exists
    const student = await prisma.student.findUnique({
        where: { id: data.studentId },
        select: { id: true, email: true, firstName: true, lastName: true, isActive: true },
    });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");
    if (student.isActive === false) {
        throw AppError.badRequest("Cannot log follow-ups for a student in Trash. Please restore the student first.", "STUDENT_IN_TRASH");
    }

    const log = await prisma.communicationLog.create({
        data: {
            studentId: data.studentId,
            authorId,
            channel: data.channel,
            direction: data.direction,
            content: data.content.trim(),
            nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null,
        },
        include: {
            student: { select: { id: true, firstName: true, lastName: true } },
            author: { select: { id: true, firstName: true, lastName: true } },
        },
    });

    // Email follow-ups are actually delivered as real emails from the consultancy
    if (data.channel === "EMAIL" && student.email) {
        const recipientName = [student.firstName, student.lastName].filter(Boolean).join(" ");
        sendNotificationEmail({
            to: student.email,
            subject: "Follow-up from DreamSky Education Consultancy",
            body: `${recipientName ? `Hi ${recipientName},\n\n` : ""}${data.content.trim()}\n\nDreamSky Education Consultancy`,
        }).catch(() => {});
    }

    return log;
};

// ─── GET ONE ──────────────────────────────────────────────────────────────────
const getFollowUpById = async (id) => {
    const log = await prisma.communicationLog.findUnique({
        where: { id },
        include: {
            student: { select: { id: true, firstName: true, lastName: true, email: true } },
            author: { select: { id: true, firstName: true, lastName: true } },
        },
    });
    if (!log) throw AppError.notFound("Follow-up not found.", "FOLLOWUP_NOT_FOUND");
    return log;
};

// ─── LIST (cross-student with filters) ────────────────────────────────────────
const listFollowUps = async (query, currentUser = null) => {
    const { studentId, channel, direction, authorId, status, from, to, page, limit, scope, counselorId } = query;
    const where = {};

    if (studentId) where.studentId = studentId;
    if (channel) where.channel = channel;
    if (direction) where.direction = direction;
    if (authorId) where.authorId = authorId;

    // Date range filter on createdAt
    if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = new Date(from);
        if (to) where.createdAt.lte = new Date(to);
    }

    // Derived status filter on nextFollowUpAt
    const now = new Date();
    if (status === "upcoming") {
        where.nextFollowUpAt = { gt: now };
    } else if (status === "overdue") {
        where.nextFollowUpAt = { lt: now, not: null };
    } else if (status === "pending" || status === "all_pending") {
        where.nextFollowUpAt = { not: null };
    }

    // Role-based scoping & scope filters
    if (currentUser) {
        const actorRole = currentUser.role;
        const actorId = currentUser.userId || currentUser.id;
        if (actorRole === "COUNSELOR") {
            where.student = { assignedCounselorId: actorId };
        } else if (actorRole === "FRONT_DESK" || actorRole === "BRANCH_ADMIN") {
            if (!isValidBranchId(currentUser.branchId)) {
                throw AppError.forbidden("Access denied. No branch assigned to user.", "NO_BRANCH_ASSIGNED");
            }
            const authorizedBranchId = currentUser.branchId.trim();
            where.student = {
                OR: [
                    { assignedCounselor: { branchId: authorizedBranchId } },
                    {
                        assignedCounselorId: null,
                        academicBackground: { path: ["branchId"], equals: authorizedBranchId },
                    },
                ],
            };
            if (scope === "frontdesk") {
                where.student.assignedCounselorId = null;
            } else if (counselorId) {
                where.student.assignedCounselorId = counselorId;
            }
        } else if (actorRole === "SUPER_ADMIN") {
            if (scope === "frontdesk") {
                where.student = { assignedCounselorId: null };
            } else if (counselorId) {
                where.student = { assignedCounselorId };
            }
        }
    }

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const skip = (pageNum - 1) * pageSize;

    const [followUps, total] = await Promise.all([
        prisma.communicationLog.findMany({
            where,
            include: {
                student: { select: { id: true, firstName: true, lastName: true } },
                author: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: pageSize,
        }),
        prisma.communicationLog.count({ where }),
    ]);

    return {
        followUps,
        pagination: { page: pageNum, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
};

// ─── AUTHORIZATION HELPER ─────────────────────────────────────────────
const assertFollowUpAuthorization = (log, currentUser, action = "manage") => {
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }

    const actorRole = currentUser.role;
    const actorId = currentUser.userId || currentUser.id;

    if (actorRole === "SUPER_ADMIN") {
        return; // Super admin has global access
    }

    if (actorRole === "COUNSELOR") {
        const isAuthor = Boolean(log.authorId && log.authorId === actorId);
        const isAssigned = Boolean(log.student && log.student.assignedCounselorId === actorId);
        if (!isAuthor && !isAssigned) {
            throw AppError.forbidden(
                `Access denied. Counselors can only ${action} follow-ups for their assigned students or created by themselves.`,
                "FORBIDDEN"
            );
        }
        return;
    }

    if (actorRole === "BRANCH_ADMIN" || actorRole === "FRONT_DESK") {
        if (!isValidBranchId(currentUser.branchId)) {
            throw AppError.forbidden("Access denied. No branch assigned to user.", "NO_BRANCH_ASSIGNED");
        }
        const authorizedBranchId = currentUser.branchId.trim();
        const studentBranchId = resolveStudentBranchId(log.student);

        if (!studentBranchId || studentBranchId !== authorizedBranchId) {
            throw AppError.forbidden(
                `Access denied. You can only ${action} follow-ups for students within your branch.`,
                "BRANCH_MISMATCH"
            );
        }
        return;
    }

    throw AppError.forbidden(`Access denied. Role ${actorRole} cannot ${action} follow-ups.`, "INSUFFICIENT_ROLE");
};

// ─── STUDENT TIMELINE ─────────────────────────────────────────────────────────
const getStudentTimeline = async (studentId) => {
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");

    return prisma.communicationLog.findMany({
        where: { studentId },
        include: { author: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
    });
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
const updateFollowUp = async (id, data, currentUser) => {
    const existing = await prisma.communicationLog.findUnique({
        where: { id },
        include: {
            student: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    assignedCounselorId: true,
                    academicBackground: true,
                    assignedCounselor: {
                        select: { id: true, branchId: true },
                    },
                },
            },
        },
    });
    if (!existing) throw AppError.notFound("Follow-up not found.", "FOLLOWUP_NOT_FOUND");

    // Defense-in-depth: Unconditionally enforce authorization at service layer
    assertFollowUpAuthorization(existing, currentUser, "update");

    const update = {};
    if (data.channel !== undefined) update.channel = data.channel;
    if (data.direction !== undefined) update.direction = data.direction;
    if (data.content !== undefined) update.content = data.content.trim();
    if (data.nextFollowUpAt !== undefined) update.nextFollowUpAt = data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null;

    return prisma.communicationLog.update({ where: { id }, data: update });
};

// ─── CANCEL FOLLOW-UP (PRESERVES COMMUNICATION HISTORY) ───────────────────────
const deleteFollowUp = async (id, currentUser) => {
    const existing = await prisma.communicationLog.findUnique({
        where: { id },
        include: {
            student: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    assignedCounselorId: true,
                    academicBackground: true,
                    assignedCounselor: {
                        select: { id: true, branchId: true },
                    },
                },
            },
        },
    });
    if (!existing) throw AppError.notFound("Follow-up not found.", "FOLLOWUP_NOT_FOUND");

    // Defense-in-depth: Unconditionally enforce authorization at service layer
    assertFollowUpAuthorization(existing, currentUser, "cancel");

    // Safe idempotent handling: if reminder is already cleared, return safely without mutation
    if (existing.nextFollowUpAt === null) {
        return {
            id: existing.id,
            cancelled: true,
            alreadyCancelled: true,
            message: "Follow-up reminder is already cancelled.",
            log: existing,
        };
    }

    // Preservation: Clear only nextFollowUpAt without physically deleting the CommunicationLog record
    const updated = await prisma.communicationLog.update({
        where: { id },
        data: { nextFollowUpAt: null },
    });

    return {
        id: updated.id,
        cancelled: true,
        alreadyCancelled: false,
        message: "Follow-up reminder cancelled. Communication history preserved.",
        log: updated,
    };
};

const cancelFollowUp = deleteFollowUp;

// ─── ATOMIC CONCURRENCY TRANSITION ────────────────────────────────────────────
const atomicTransitionFollowUp = async (tx, reminderId, expectedScheduledAt, newScheduledAt) => {
    if (!reminderId) {
        throw AppError.badRequest("Reminder ID is required.", "MISSING_REMINDER_ID");
    }

    const expectedDate = new Date(expectedScheduledAt);
    if (isNaN(expectedDate.getTime())) {
        throw AppError.badRequest("Valid expected follow-up timestamp is required.", "INVALID_TIMESTAMP");
    }

    const result = await tx.communicationLog.updateMany({
        where: {
            id: reminderId,
            nextFollowUpAt: expectedDate,
        },
        data: {
            nextFollowUpAt: newScheduledAt ? new Date(newScheduledAt) : null,
        },
    });

    if (result.count !== 1) {
        throw AppError.conflict(
            "This follow-up schedule has already been updated, rescheduled, or completed by another user.",
            "STALE_REMINDER_CONFLICT"
        );
    }
};

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────
const getDashboardStats = async (userId, role) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const endOfWeek = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Counselors see only their own students' follow-ups; admins see all
    const scopeFilter = ["SUPER_ADMIN", "BRANCH_ADMIN"].includes(role)
        ? {}
        : { student: { assignedCounselorId: userId } };

    const baseWhere = { nextFollowUpAt: { not: null }, ...scopeFilter };

    const [today, upcoming, overdue, totalThisWeek] = await Promise.all([
        prisma.communicationLog.count({
            where: { ...baseWhere, nextFollowUpAt: { gte: startOfDay, lt: endOfDay } },
        }),
        prisma.communicationLog.count({
            where: { ...baseWhere, nextFollowUpAt: { gt: now } },
        }),
        prisma.communicationLog.count({
            where: { ...baseWhere, nextFollowUpAt: { lt: now } },
        }),
        prisma.communicationLog.count({
            where: { ...baseWhere, nextFollowUpAt: { gte: startOfDay, lt: endOfWeek } },
        }),
    ]);

    return { today, upcoming, overdue, totalThisWeek };
};

module.exports = {
    assertFollowUpAuthorization,
    createFollowUp,
    getFollowUpById,
    listFollowUps,
    getStudentTimeline,
    updateFollowUp,
    deleteFollowUp,
    cancelFollowUp,
    atomicTransitionFollowUp,
    getDashboardStats,
};
