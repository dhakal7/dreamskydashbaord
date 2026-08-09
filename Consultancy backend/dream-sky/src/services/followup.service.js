const prisma = require("../prisma");
const AppError = require("../utils/apiError");
const { sendNotificationEmail } = require("./email.service");

// ─── CREATE ───────────────────────────────────────────────────────────────────
const createFollowUp = async (data, authorId) => {
    // Verify student exists
    const student = await prisma.student.findUnique({
        where: { id: data.studentId },
        select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");

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
const listFollowUps = async (query) => {
    const { studentId, channel, direction, authorId, status, from, to, page, limit } = query;
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
const updateFollowUp = async (id, data) => {
    const existing = await prisma.communicationLog.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Follow-up not found.", "FOLLOWUP_NOT_FOUND");

    const update = {};
    if (data.channel !== undefined) update.channel = data.channel;
    if (data.direction !== undefined) update.direction = data.direction;
    if (data.content !== undefined) update.content = data.content.trim();
    if (data.nextFollowUpAt !== undefined) update.nextFollowUpAt = data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null;

    return prisma.communicationLog.update({ where: { id }, data: update });
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
const deleteFollowUp = async (id) => {
    const existing = await prisma.communicationLog.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Follow-up not found.", "FOLLOWUP_NOT_FOUND");
    await prisma.communicationLog.delete({ where: { id } });
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
    createFollowUp,
    getFollowUpById,
    listFollowUps,
    getStudentTimeline,
    updateFollowUp,
    deleteFollowUp,
    getDashboardStats,
};
