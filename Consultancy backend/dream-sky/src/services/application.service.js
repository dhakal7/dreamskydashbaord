const prisma = require("../prisma");
const AppError = require("../utils/apiError");

// ─── Status transition rules ─────────────────────────────────────────────────
const ALLOWED_TRANSITIONS = {
    DRAFT: ["SUBMITTED", "WITHDRAWN"],
    SUBMITTED: ["UNDER_REVIEW", "WITHDRAWN"],
    UNDER_REVIEW: ["ACCEPTED", "REJECTED", "DEFERRED", "WITHDRAWN"],
    DEFERRED: ["SUBMITTED", "WITHDRAWN"],
    ACCEPTED: ["WITHDRAWN"],
    REJECTED: [],
    WITHDRAWN: [],
};

const includeRelations = {
    student: { select: { id: true, firstName: true, lastName: true, email: true } },
    university: { select: { id: true, name: true } },
    course: { select: { id: true, name: true, level: true } },
    offers: true,
};

// ─── CREATE ───────────────────────────────────────────────────────────────────
const createApplication = async (data) => {
    const student = await prisma.student.findUnique({ where: { id: data.studentId }, select: { id: true } });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");

    const university = await prisma.university.findUnique({ where: { id: data.universityId }, select: { id: true } });
    if (!university) throw AppError.notFound("University not found.", "UNIVERSITY_NOT_FOUND");

    const course = await prisma.course.findUnique({ where: { id: data.courseId }, select: { id: true } });
    if (!course) throw AppError.notFound("Course not found.", "COURSE_NOT_FOUND");

    return prisma.application.create({
        data: {
            studentId: data.studentId,
            universityId: data.universityId,
            courseId: data.courseId,
            intake: data.intake?.trim() || null,
            priority: data.priority || null,
            notes: data.notes?.trim() || null,
        },
        include: includeRelations,
    });
};

// ─── GET ONE ──────────────────────────────────────────────────────────────────
const getApplicationById = async (id) => {
    const app = await prisma.application.findUnique({
        where: { id },
        include: includeRelations,
    });
    if (!app) throw AppError.notFound("Application not found.", "APPLICATION_NOT_FOUND");
    return app;
};

// ─── LIST / FILTER ────────────────────────────────────────────────────────────
const listApplications = async (query) => {
    const { studentId, universityId, status, priority, page, limit } = query;
    const where = {};

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
                offers: { select: { id: true, type: true, receivedAt: true } },
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
const updateApplication = async (id, data) => {
    const existing = await prisma.application.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Application not found.", "APPLICATION_NOT_FOUND");

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
const changeStatus = async (id, { status }) => {
    const existing = await prisma.application.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Application not found.", "APPLICATION_NOT_FOUND");

    const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(status))
        throw AppError.badRequest(
            `Cannot move from ${existing.status} to ${status}. Allowed: ${allowed.join(", ") || "none (terminal)"}`,
            "INVALID_STATUS_TRANSITION"
        );

    const update = { status };
    if (status === "SUBMITTED" && !existing.submittedAt) update.submittedAt = new Date();

    return prisma.application.update({ where: { id }, data: update, include: includeRelations });
};

// ─── RECORD OFFER ─────────────────────────────────────────────────────────────
const recordOffer = async (applicationId, data) => {
    const app = await prisma.application.findUnique({ where: { id: applicationId } });
    if (!app) throw AppError.notFound("Application not found.", "APPLICATION_NOT_FOUND");

    const offer = await prisma.offer.create({
        data: {
            applicationId,
            type: data.type,
            details: data.details || null,
        },
    });

    // Auto-transition to ACCEPTED when offer is recorded
    if (app.status !== "ACCEPTED") {
        await prisma.application.update({ where: { id: applicationId }, data: { status: "ACCEPTED" } });
    }

    return offer;
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
const deleteApplication = async (id) => {
    const existing = await prisma.application.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Application not found.", "APPLICATION_NOT_FOUND");
    await prisma.application.delete({ where: { id } });
};

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────
const getDashboardStats = async () => {
    const statuses = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "REJECTED", "DEFERRED", "WITHDRAWN"];

    const counts = await Promise.all(
        statuses.map((s) => prisma.application.count({ where: { status: s } }))
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
};
