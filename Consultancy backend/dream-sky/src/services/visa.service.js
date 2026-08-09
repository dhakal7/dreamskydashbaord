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

const includeRelations = {
    application: {
        select: {
            id: true,
            status: true,
            intake: true,
            student: { select: { id: true, firstName: true, lastName: true, email: true } },
            university: { select: { id: true, name: true } },
            course: { select: { id: true, name: true, level: true } },
        },
    },
};

// ─── CREATE ───────────────────────────────────────────────────────────────────
const createVisaCase = async (data) => {
    // Verify application exists and is ACCEPTED
    const app = await prisma.application.findUnique({
        where: { id: data.applicationId },
        select: { id: true, status: true },
    });
    if (!app) throw AppError.notFound("Application not found.", "APPLICATION_NOT_FOUND");
    if (app.status !== "ACCEPTED")
        throw AppError.badRequest("Application must be in ACCEPTED status to create a visa case.", "APPLICATION_NOT_ACCEPTED");

    // Check for existing visa case (unique constraint will also catch this)
    const existing = await prisma.visaCase.findUnique({ where: { applicationId: data.applicationId } });
    if (existing) throw AppError.conflict("A visa case already exists for this application.", "VISA_CASE_EXISTS");

    return prisma.visaCase.create({
        data: {
            applicationId: data.applicationId,
            visaType: data.visaType?.trim() || null,
            embassy: data.embassy?.trim() || null,
            notes: data.notes?.trim() || null,
        },
        include: includeRelations,
    });
};

// ─── GET ONE ──────────────────────────────────────────────────────────────────
const getVisaCaseById = async (id) => {
    const vc = await prisma.visaCase.findUnique({
        where: { id },
        include: includeRelations,
    });
    if (!vc) throw AppError.notFound("Visa case not found.", "VISA_CASE_NOT_FOUND");
    return vc;
};

// ─── LIST / FILTER ────────────────────────────────────────────────────────────
const listVisaCases = async (query) => {
    const { status, applicationId, studentId, page, limit } = query;
    const where = {};

    if (status) where.status = status;
    if (applicationId) where.applicationId = applicationId;
    if (studentId) where.application = { studentId };

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
const updateVisaCase = async (id, data) => {
    const existing = await prisma.visaCase.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Visa case not found.", "VISA_CASE_NOT_FOUND");

    const update = {};
    if (data.visaType !== undefined) update.visaType = data.visaType?.trim() || null;
    if (data.embassy !== undefined) update.embassy = data.embassy?.trim() || null;
    if (data.notes !== undefined) update.notes = data.notes?.trim() || null;
    if (data.resubmissionLink !== undefined) update.resubmissionLink = data.resubmissionLink?.trim() || null;

    return prisma.visaCase.update({ where: { id }, data: update, include: includeRelations });
};

// ─── CHANGE STATUS ────────────────────────────────────────────────────────────
const changeStatus = async (id, { status, refusalReason }) => {
    const existing = await prisma.visaCase.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Visa case not found.", "VISA_CASE_NOT_FOUND");

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
const deleteVisaCase = async (id) => {
    const existing = await prisma.visaCase.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Visa case not found.", "VISA_CASE_NOT_FOUND");
    await prisma.visaCase.delete({ where: { id } });
};

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────
const getDashboardStats = async () => {
    const statuses = ["NOT_APPLIED", "PREPARING", "SUBMITTED", "APPROVED", "REFUSED", "RESUBMITTING"];

    const counts = await Promise.all(
        statuses.map((s) => prisma.visaCase.count({ where: { status: s } }))
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
};
