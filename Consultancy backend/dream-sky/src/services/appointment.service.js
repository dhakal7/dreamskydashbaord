const prisma = require("../prisma");
const AppError = require("../utils/apiError");
const { sendNotificationEmail } = require("./email.service");

// ─── Status transition rules ─────────────────────────────────────────────────
const ALLOWED_TRANSITIONS = {
    SCHEDULED: ["COMPLETED", "CANCELLED", "NO_SHOW"],
    NO_SHOW: ["SCHEDULED"], // reschedule
    COMPLETED: [],
    CANCELLED: [],
};

// ─── Conflict detection ──────────────────────────────────────────────────────
// Checks if a proposed time window overlaps with existing SCHEDULED appointments
// for the same counselor OR the same student.
const checkConflicts = async (datetime, durationMin, counselorId, studentId, excludeId) => {
    const start = new Date(datetime);
    const end = new Date(start.getTime() + durationMin * 60 * 1000);

    const conflictWhere = {
        status: "SCHEDULED",
        ...(excludeId && { id: { not: excludeId } }),
        // Overlap condition: existing.start < new.end AND existing.end > new.start
        // Since we store datetime (start) and durationMin, we use raw date math.
        datetime: { lt: end },
    };

    // Check counselor conflicts
    if (counselorId) {
        const counselorConflicts = await prisma.appointment.findMany({
            where: { ...conflictWhere, counselorId },
            select: { id: true, datetime: true, durationMin: true },
        });

        for (const appt of counselorConflicts) {
            const apptEnd = new Date(appt.datetime.getTime() + appt.durationMin * 60 * 1000);
            if (apptEnd > start) {
                throw AppError.conflict(
                    `Counselor has a conflicting appointment at ${appt.datetime.toISOString()}.`,
                    "COUNSELOR_CONFLICT"
                );
            }
        }
    }

    // Check student conflicts
    const studentConflicts = await prisma.appointment.findMany({
        where: { ...conflictWhere, studentId },
        select: { id: true, datetime: true, durationMin: true },
    });

    for (const appt of studentConflicts) {
        const apptEnd = new Date(appt.datetime.getTime() + appt.durationMin * 60 * 1000);
        if (apptEnd > start) {
            throw AppError.conflict(
                `Student has a conflicting appointment at ${appt.datetime.toISOString()}.`,
                "STUDENT_CONFLICT"
            );
        }
    }
};

// ─── CREATE ───────────────────────────────────────────────────────────────────
const createAppointment = async (data) => {
    const student = await prisma.student.findUnique({
        where: { id: data.studentId },
        select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");

    if (data.counselorId) {
        const counselor = await prisma.user.findUnique({ where: { id: data.counselorId }, select: { id: true } });
        if (!counselor) throw AppError.notFound("Counselor not found.", "COUNSELOR_NOT_FOUND");
    }

    const durationMin = data.durationMin || 30;
    await checkConflicts(data.datetime, durationMin, data.counselorId, data.studentId);

    const appointment = await prisma.appointment.create({
        data: {
            studentId: data.studentId,
            counselorId: data.counselorId || null,
            datetime: new Date(data.datetime),
            durationMin,
            type: data.type,
            meetingMode: data.meetingMode || "OFFICE",
            meetingLink: data.meetingLink?.trim() || null,
            notes: data.notes?.trim() || null,
        },
        include: {
            student: { select: { id: true, firstName: true, lastName: true } },
            counselor: { select: { id: true, firstName: true, lastName: true } },
        },
    });

    // Email the student a confirmation of the newly scheduled appointment
    if (student?.email) {
        const recipientName = [student.firstName, student.lastName].filter(Boolean).join(" ");
        const meetingLine = data.meetingLink
            ? `\nJoin link: ${data.meetingLink.trim()}`
            : "";
        sendNotificationEmail({
            to: student.email,
            subject: "Appointment Scheduled — DreamSky Education Consultancy",
            body: `${recipientName ? `Hi ${recipientName},\n\n` : ""}Your ${data.type.replace(/_/g, " ").toLowerCase()} appointment has been scheduled for ${new Date(data.datetime).toISOString()} (${durationMin} min, ${(data.meetingMode || "OFFICE").replace(/_/g, " ").toLowerCase()}).${meetingLine}\n\nDreamSky Education Consultancy`,
        }).catch(() => {});
    }

    return appointment;
};

// ─── GET ONE ──────────────────────────────────────────────────────────────────
const getAppointmentById = async (id) => {
    const appt = await prisma.appointment.findUnique({
        where: { id },
        include: {
            student: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
            counselor: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
    });
    if (!appt) throw AppError.notFound("Appointment not found.", "APPOINTMENT_NOT_FOUND");
    return appt;
};

// ─── LIST / FILTER ────────────────────────────────────────────────────────────
const listAppointments = async (query) => {
    const { studentId, counselorId, status, type, from, to, page, limit } = query;
    const where = {};

    if (studentId) where.studentId = studentId;
    if (counselorId) where.counselorId = counselorId;
    if (status) where.status = status;
    if (type) where.type = type;

    if (from || to) {
        where.datetime = {};
        if (from) where.datetime.gte = new Date(from);
        if (to) where.datetime.lte = new Date(to);
    }

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const skip = (pageNum - 1) * pageSize;

    const [appointments, total] = await Promise.all([
        prisma.appointment.findMany({
            where,
            include: {
                student: { select: { id: true, firstName: true, lastName: true } },
                counselor: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { datetime: "asc" },
            skip,
            take: pageSize,
        }),
        prisma.appointment.count({ where }),
    ]);

    return {
        appointments,
        pagination: { page: pageNum, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
const updateAppointment = async (id, data) => {
    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Appointment not found.", "APPOINTMENT_NOT_FOUND");

    if (existing.status !== "SCHEDULED")
        throw AppError.badRequest("Only SCHEDULED appointments can be edited.", "NOT_EDITABLE");

    // If time or counselor changed, re-check conflicts
    const newDatetime = data.datetime ? new Date(data.datetime) : existing.datetime;
    const newDuration = data.durationMin || existing.durationMin;
    const newCounselorId = data.counselorId !== undefined ? data.counselorId : existing.counselorId;

    if (data.datetime || data.durationMin || data.counselorId !== undefined) {
        await checkConflicts(newDatetime, newDuration, newCounselorId, existing.studentId, id);
    }

    const update = {};
    if (data.datetime !== undefined) update.datetime = newDatetime;
    if (data.durationMin !== undefined) update.durationMin = data.durationMin;
    if (data.counselorId !== undefined) update.counselorId = data.counselorId || null;
    if (data.type !== undefined) update.type = data.type;
    if (data.meetingMode !== undefined) update.meetingMode = data.meetingMode;
    if (data.meetingLink !== undefined) update.meetingLink = data.meetingLink?.trim() || null;
    if (data.notes !== undefined) update.notes = data.notes?.trim() || null;

    return prisma.appointment.update({ where: { id }, data: update });
};

// ─── CHANGE STATUS ────────────────────────────────────────────────────────────
const changeStatus = async (id, { status, outcome }) => {
    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Appointment not found.", "APPOINTMENT_NOT_FOUND");

    const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(status))
        throw AppError.badRequest(
            `Cannot move from ${existing.status} to ${status}. Allowed: ${allowed.join(", ") || "none (terminal)"}`,
            "INVALID_STATUS_TRANSITION"
        );

    const update = { status };
    if (status === "COMPLETED" && outcome) update.outcome = outcome.trim();

    const updated = await prisma.appointment.update({ where: { id }, data: update });

    // Email the student when an appointment's status changes
    const detail = await prisma.appointment.findUnique({
        where: { id },
        include: {
            student: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
    });
    if (detail?.student?.email) {
        const recipientName = [detail.student.firstName, detail.student.lastName].filter(Boolean).join(" ");
        sendNotificationEmail({
            to: detail.student.email,
            subject: `Appointment ${status.replace(/_/g, " ").toLowerCase()} — DreamSky Education Consultancy`,
            body: `${recipientName ? `Hi ${recipientName},\n\n` : ""}Your appointment on ${detail.datetime.toISOString()} has been marked ${status.replace(/_/g, " ").toLowerCase()}.\n\nDreamSky Education Consultancy`,
        }).catch(() => {});
    }

    return updated;
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
const deleteAppointment = async (id) => {
    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Appointment not found.", "APPOINTMENT_NOT_FOUND");
    await prisma.appointment.delete({ where: { id } });
};

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────
const getDashboardStats = async (userId, role) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    // Counselors see their own; admins see all
    const scope = ["SUPER_ADMIN", "BRANCH_ADMIN"].includes(role) ? {} : { counselorId: userId };

    const [today, upcoming, completed, noShow, cancelled] = await Promise.all([
        prisma.appointment.count({ where: { ...scope, datetime: { gte: startOfDay, lt: endOfDay }, status: "SCHEDULED" } }),
        prisma.appointment.count({ where: { ...scope, datetime: { gt: now }, status: "SCHEDULED" } }),
        prisma.appointment.count({ where: { ...scope, status: "COMPLETED" } }),
        prisma.appointment.count({ where: { ...scope, status: "NO_SHOW" } }),
        prisma.appointment.count({ where: { ...scope, status: "CANCELLED" } }),
    ]);

    return { today, upcoming, completed, noShow, cancelled };
};

module.exports = {
    createAppointment,
    getAppointmentById,
    listAppointments,
    updateAppointment,
    changeStatus,
    deleteAppointment,
    getDashboardStats,
};
