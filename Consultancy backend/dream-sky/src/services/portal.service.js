const prisma = require("../prisma");
const AppError = require("../utils/apiError");

// ─── Pipeline stages in order (for timeline) ─────────────────────────────────
const PIPELINE_ORDER = [
    "LEAD",
    "PROSPECT",
    "ENROLLED",
    "APPLIED",
    "OFFER_RECEIVED",
    "VISA_APPLIED",
    "VISA_APPROVED",
    "DEPARTED",
];

const buildTimeline = (currentStage) => {
    const currentIndex = PIPELINE_ORDER.indexOf(currentStage);
    return PIPELINE_ORDER.map((stage, i) => ({
        stage,
        completed: i < currentIndex,
        current: i === currentIndex,
    }));
};

// ─── PROFILE ──────────────────────────────────────────────────────────────────
const getProfile = async (studentId) => {
    const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            dateOfBirth: true,
            nationality: true,
            currentStage: true,
            source: true,
            createdAt: true,
        },
    });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");
    return student;
};

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
const getDashboard = async (studentId) => {
    const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { id: true, firstName: true, lastName: true, currentStage: true },
    });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");

    const now = new Date();
    const [applications, visaCases, documents, verifiedDocs, upcomingAppointments, followUps] = await Promise.all([
        prisma.application.count({ where: { studentId } }),
        prisma.visaCase.count({ where: { application: { studentId } } }),
        prisma.document.count({ where: { studentId } }),
        prisma.document.count({ where: { studentId, status: "VERIFIED" } }),
        prisma.appointment.count({ where: { studentId, datetime: { gte: now }, status: "SCHEDULED" } }),
        prisma.communicationLog.count({ where: { studentId } }),
    ]);

    return {
        student,
        counts: {
            applications,
            activeVisaCases: visaCases,
            documents,
            verifiedDocuments: verifiedDocs,
            upcomingAppointments,
            followUps,
        },
        timeline: buildTimeline(student.currentStage),
    };
};

// ─── APPLICATIONS ─────────────────────────────────────────────────────────────
const getApplications = async (studentId) => {
    return prisma.application.findMany({
        where: { studentId },
        include: {
            university: { select: { id: true, name: true } },
            course: { select: { id: true, name: true, level: true } },
            offers: { select: { id: true, type: true, details: true, receivedAt: true } },
        },
        orderBy: { createdAt: "desc" },
    });
};

// ─── VISA CASES ───────────────────────────────────────────────────────────────
const getVisaCases = async (studentId) => {
    return prisma.visaCase.findMany({
        where: { application: { studentId } },
        include: {
            application: {
                select: {
                    id: true,
                    university: { select: { id: true, name: true } },
                    course: { select: { id: true, name: true } },
                },
            },
        },
        orderBy: { createdAt: "desc" },
    });
};

// ─── DOCUMENTS ────────────────────────────────────────────────────────────────
const getDocuments = async (studentId) => {
    return prisma.document.findMany({
        where: { studentId },
        select: {
            id: true,
            type: true,
            status: true,
            originalName: true,
            mimeType: true,
            expiryDate: true,
            notes: true,
            createdAt: true,
        },
        orderBy: { createdAt: "desc" },
    });
};

// ─── APPOINTMENTS ─────────────────────────────────────────────────────────────
const getAppointments = async (studentId) => {
    return prisma.appointment.findMany({
        where: { studentId },
        select: {
            id: true,
            type: true,
            notes: true,
            datetime: true,
            durationMin: true,
            meetingMode: true,
            meetingLink: true,
            status: true,
            outcome: true,
            createdAt: true,
            counselor: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { datetime: "desc" },
    });
};

// ─── FOLLOW-UPS (communication history) ───────────────────────────────────────
const getFollowUps = async (studentId) => {
    return prisma.communicationLog.findMany({
        where: { studentId },
        select: {
            id: true,
            channel: true,
            direction: true,
            content: true,
            nextFollowUpAt: true,
            createdAt: true,
            author: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
    });
};

module.exports = {
    getProfile,
    getDashboard,
    getApplications,
    getVisaCases,
    getDocuments,
    getAppointments,
    getFollowUps,
};
