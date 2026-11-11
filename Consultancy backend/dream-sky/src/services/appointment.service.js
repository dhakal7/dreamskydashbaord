const prisma = require("../prisma");
const AppError = require("../utils/apiError");
const { sendNotificationEmail } = require("./email.service");
const { queueFollowUpNotification } = require("./notification.service");

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

// ─── REMINDER SCHEDULING & OFFSETS ───────────────────────────────────────────
const APPOINTMENT_REMINDER_OFFSETS = [
    { offset: "24H", ms: 24 * 60 * 60 * 1000 },
    { offset: "1H", ms: 1 * 60 * 60 * 1000 },
];

const createAppointmentReminders = async (appointmentId, datetime, txPrisma = null) => {
    const db = txPrisma || prisma;
    const now = new Date();
    const apptDate = new Date(datetime);
    const createdReminders = [];

    for (const { offset, ms } of APPOINTMENT_REMINDER_OFFSETS) {
        const scheduledFor = new Date(apptDate.getTime() - ms);
        if (scheduledFor > now) {
            try {
                const existing = await db.appointmentReminder.findFirst({
                    where: {
                        appointmentId,
                        offset,
                        scheduledFor,
                        status: { in: ["PENDING", "SENT"] },
                    },
                });
                if (existing) {
                    createdReminders.push(existing);
                    continue;
                }
                const reminder = await db.appointmentReminder.create({
                    data: {
                        appointmentId,
                        offset,
                        scheduledFor,
                        status: "PENDING",
                    },
                });
                createdReminders.push(reminder);
            } catch (err) {
                console.error(`[Appointment] Failed to create ${offset} reminder for appointment ${appointmentId}:`, err.message);
            }
        }
    }
    return createdReminders;
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

// ─── NOTIFICATION RECIPIENT RESOLUTION ───────────────────────────────────────
const resolveFollowUpRecipient = async (targetCounselorId, student, currentUser = null, fallbackBranchId = null, txPrisma = null) => {
    const db = txPrisma || prisma;
    if (targetCounselorId) return targetCounselorId;

    // Resolve branch identity strictly from known student/scheduling branch contexts
    const branchId =
        fallbackBranchId ||
        resolveStudentBranchId(student) ||
        currentUser?.branchId ||
        null;

    if (!branchId) {
        console.warn(`[Appointment] Follow-up scheduled for unassigned student ${student?.id || "unknown"} without determinable branch. Notification safely skipped.`);
        return null;
    }

    // Query active staff belonging strictly to this branch
    const branchStaff = await db.user.findMany({
        where: {
            branchId,
            status: "ACTIVE",
            role: { in: ["BRANCH_ADMIN", "FRONT_DESK"] },
        },
        select: { id: true, role: true, createdAt: true },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });

    if (!branchStaff || branchStaff.length === 0) {
        console.warn(`[Appointment] No active BRANCH_ADMIN or FRONT_DESK found in branch ${branchId}. Safe fail.`);
        return null;
    }

    // Designate a single recipient (prefer BRANCH_ADMIN, else FRONT_DESK) to avoid duplicate spam
    const designated =
        branchStaff.find((s) => s.role === "BRANCH_ADMIN") ||
        branchStaff.find((s) => s.role === "FRONT_DESK") ||
        branchStaff[0];

    return designated?.id || null;
};

// ─── CREATE ───────────────────────────────────────────────────────────────────
const createAppointment = async (data, currentUser = null) => {
    const student = await prisma.student.findUnique({
        where: { id: data.studentId },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isActive: true,
            assignedCounselorId: true,
            academicBackground: true,
            assignedCounselor: { select: { id: true, branchId: true } },
        },
    });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");
    if (student.isActive === false) throw AppError.badRequest("Cannot schedule an appointment for a student in Trash. Please restore the student first.", "STUDENT_IN_TRASH");

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

    // Queue in-app notification for the counselor or designated branch staff if scheduled as follow-up
    if (appointment.type === "FOLLOW_UP") {
        const studentName = [student?.firstName, student?.lastName].filter(Boolean).join(" ");
        const recipientUserId = await resolveFollowUpRecipient(
            appointment.counselorId,
            student,
            currentUser,
            data.branchId
        );
        if (recipientUserId) {
            await queueFollowUpNotification({
                recipientUserId,
                action: "SCHEDULED",
                appointment,
                studentName,
                datetime: appointment.datetime,
            }).catch(() => {});
        }
    }

    // Persist durable appointment reminders (24H and 1H offsets if scheduledFor is in the future)
    await createAppointmentReminders(appointment.id, appointment.datetime).catch((err) => {
        console.error("[Appointment] Failed to initialize appointment reminders:", err.message);
    });

    return appointment;
};

// ─── AUTHORIZATION & BRANCH VISIBILITY ───────────────────────────────────────
const assertAppointmentAuthorization = (appt, currentUser, action = "view") => {
    if (!currentUser) return; // internal/system calls without actor
    const actorRole = currentUser.role;
    const actorId = currentUser.userId || currentUser.id;

    if (actorRole === "SUPER_ADMIN") return;

    if (actorRole === "COUNSELOR") {
        if (appt.counselorId !== actorId) {
            throw AppError.forbidden(`You are not authorized to ${action} this appointment.`, "FORBIDDEN");
        }
        return;
    }

    if (actorRole === "FRONT_DESK" || actorRole === "BRANCH_ADMIN") {
        if (!isValidBranchId(currentUser.branchId)) {
            throw AppError.forbidden("Staff lacks assigned branch context.", "NO_BRANCH_CONTEXT");
        }
        const authorizedBranchId = currentUser.branchId.trim();
        const counselorBranch = isValidBranchId(appt.counselor?.branchId) ? appt.counselor.branchId.trim() : null;
        const studentBranch = resolveStudentBranchId(appt.student);
        if (counselorBranch !== authorizedBranchId && studentBranch !== authorizedBranchId) {
            throw AppError.forbidden(`You are not authorized to ${action} cross-branch appointments.`, "FORBIDDEN");
        }
        return;
    }

    if (actorRole === "STUDENT") {
        const studentId = currentUser.studentId || actorId;
        if (appt.studentId !== studentId) {
            throw AppError.forbidden(`You are not authorized to ${action} this appointment.`, "FORBIDDEN");
        }
        return;
    }

    throw AppError.forbidden(`You are not authorized to ${action} this appointment.`, "FORBIDDEN");
};

// ─── GET ONE ──────────────────────────────────────────────────────────────────
const getAppointmentById = async (id, currentUser = null) => {
    const appt = await prisma.appointment.findUnique({
        where: { id },
        include: {
            student: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true,
                    assignedCounselorId: true,
                    academicBackground: true,
                    assignedCounselor: { select: { id: true, branchId: true } },
                },
            },
            counselor: { select: { id: true, firstName: true, lastName: true, email: true, branchId: true } },
        },
    });
    if (!appt) throw AppError.notFound("Appointment not found.", "APPOINTMENT_NOT_FOUND");
    if (currentUser) {
        assertAppointmentAuthorization(appt, currentUser, "view");
    }
    return appt;
};

// ─── LIST / FILTER ────────────────────────────────────────────────────────────
const listAppointments = async (query = {}, currentUser = null) => {
    const { studentId, counselorId, status, statusNotIn, type, from, to, page, limit } = query;
    const where = {};

    if (studentId) where.studentId = studentId;
    if (counselorId) where.counselorId = counselorId;
    if (status) {
        if (status.includes(",")) {
            where.status = { in: status.split(",").map((s) => s.trim().toUpperCase()) };
        } else {
            where.status = status.toUpperCase();
        }
    } else if (statusNotIn) {
        where.status = { notIn: String(statusNotIn).split(",").map((s) => s.trim().toUpperCase()) };
    }
    if (type) where.type = type;

    if (from || to) {
        where.datetime = {};
        if (from) where.datetime.gte = new Date(from);
        if (to) where.datetime.lte = new Date(to);
    }

    // Role-based visibility and branch boundaries
    if (currentUser) {
        const actorRole = currentUser.role;
        const actorId = currentUser.userId || currentUser.id;

        if (actorRole === "COUNSELOR") {
            // Counselor can ONLY see their own appointments
            where.counselorId = actorId;
        } else if (actorRole === "FRONT_DESK" || actorRole === "BRANCH_ADMIN") {
            // Reception and Branch Admin are strictly scoped to their branch
            if (!isValidBranchId(currentUser.branchId)) {
                throw AppError.forbidden("Staff lacks assigned branch context.", "NO_BRANCH_CONTEXT");
            }
            const authorizedBranchId = currentUser.branchId.trim();
            where.OR = [
                { counselor: { branchId: authorizedBranchId } },
                { student: { assignedCounselor: { branchId: authorizedBranchId } } },
                {
                    student: {
                        assignedCounselorId: null,
                        academicBackground: { path: ["branchId"], equals: authorizedBranchId },
                    },
                },
            ];
        } else if (actorRole === "STUDENT") {
            const currentStudentId = currentUser.studentId || actorId;
            where.studentId = currentStudentId;
        }
        // SUPER_ADMIN has global access
    }

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit) || 20, 1), 500);
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
const updateAppointment = async (id, data, currentUser = null) => {
    const existing = await prisma.appointment.findUnique({
        where: { id },
        include: {
            student: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    assignedCounselorId: true,
                    academicBackground: true,
                    assignedCounselor: { select: { id: true, branchId: true } },
                },
            },
            counselor: { select: { id: true, branchId: true } },
        },
    });
    if (!existing) throw AppError.notFound("Appointment not found.", "APPOINTMENT_NOT_FOUND");
    if (currentUser) {
        assertAppointmentAuthorization(existing, currentUser, "update");
    }

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

    const updated = await prisma.appointment.update({ where: { id }, data: update });

    // If datetime was updated (rescheduled), purge obsolete pending reminders and reschedule for new datetime
    if (data.datetime && new Date(data.datetime).getTime() !== new Date(existing.datetime).getTime()) {
        await prisma.appointmentReminder.deleteMany({
            where: {
                appointmentId: id,
                status: "PENDING",
            },
        }).catch((err) => {
            console.error("[Appointment] Failed to purge obsolete reminders on reschedule:", err.message);
        });

        await createAppointmentReminders(id, newDatetime).catch((err) => {
            console.error("[Appointment] Failed to recreate appointment reminders on reschedule:", err.message);
        });
    }

    // If a follow-up appointment's timing changed, notify the assigned counselor or designated branch staff
    if (existing.type === "FOLLOW_UP") {
        const targetCounselorId = updated.counselorId || existing.counselorId;
        const studentName = [existing.student?.firstName, existing.student?.lastName].filter(Boolean).join(" ");
        if (data.datetime && new Date(data.datetime).getTime() !== new Date(existing.datetime).getTime()) {
            const recipientUserId = await resolveFollowUpRecipient(
                targetCounselorId,
                existing.student,
                currentUser
            );
            if (recipientUserId) {
                await queueFollowUpNotification({
                    recipientUserId,
                    action: "RESCHEDULED",
                    appointment: updated,
                    studentName,
                    datetime: updated.datetime,
                    previousDatetime: existing.datetime,
                }).catch(() => {});
            }
        }
    }

    return updated;
};

// ─── CHANGE STATUS ────────────────────────────────────────────────────────────
const changeStatus = async (id, { status, outcome }, currentUser = null) => {
    const existing = await prisma.appointment.findUnique({
        where: { id },
        include: {
            student: {
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    assignedCounselorId: true,
                    academicBackground: true,
                    assignedCounselor: { select: { id: true, branchId: true } },
                },
            },
            counselor: { select: { id: true, branchId: true } },
        },
    });
    if (!existing) throw AppError.notFound("Appointment not found.", "APPOINTMENT_NOT_FOUND");
    if (currentUser) {
        assertAppointmentAuthorization(existing, currentUser, "change status of");
    }

    const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(status))
        throw AppError.badRequest(
            `Cannot move from ${existing.status} to ${status}. Allowed: ${allowed.join(", ") || "none (terminal)"}`,
            "INVALID_STATUS_TRANSITION"
        );

    const update = { status };
    if (status === "COMPLETED" && outcome) update.outcome = outcome.trim();

    const updated = await prisma.appointment.update({ where: { id }, data: update });

    // Handle reminder lifecycle on status transitions: purge obsolete pending reminders on completion, cancellation, or no-show
    if (["CANCELLED", "COMPLETED", "NO_SHOW"].includes(status)) {
        await prisma.appointmentReminder.deleteMany({
            where: {
                appointmentId: id,
                status: "PENDING",
            },
        }).catch((err) => {
            console.error("[Appointment] Failed to purge pending reminders on status change:", err.message);
        });
    } else if (status === "SCHEDULED" && existing.status === "NO_SHOW") {
        await createAppointmentReminders(id, existing.datetime).catch((err) => {
            console.error("[Appointment] Failed to recreate reminders on return to SCHEDULED:", err.message);
        });
    }

    // Email the student when an appointment's status changes
    if (existing?.student?.email) {
        const recipientName = [existing.student.firstName, existing.student.lastName].filter(Boolean).join(" ");
        sendNotificationEmail({
            to: existing.student.email,
            subject: `Appointment ${status.replace(/_/g, " ").toLowerCase()} — DreamSky Education Consultancy`,
            body: `${recipientName ? `Hi ${recipientName},\n\n` : ""}Your appointment on ${existing.datetime.toISOString()} has been marked ${status.replace(/_/g, " ").toLowerCase()}.\n\nDreamSky Education Consultancy`,
        }).catch(() => {});
    }

    // Queue in-app notification for the counselor or designated branch staff if follow-up is cancelled
    if (existing.type === "FOLLOW_UP" && status === "CANCELLED") {
        const studentName = [existing.student?.firstName, existing.student?.lastName].filter(Boolean).join(" ");
        const recipientUserId = await resolveFollowUpRecipient(
            existing.counselorId,
            existing.student,
            currentUser
        );
        if (recipientUserId) {
            await queueFollowUpNotification({
                recipientUserId,
                action: "CANCELLED",
                appointment: updated,
                studentName,
                datetime: existing.datetime,
            }).catch(() => {});
        }
    }

    return updated;
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
const deleteAppointment = async (id, currentUser = null) => {
    const existing = await prisma.appointment.findUnique({
        where: { id },
        include: {
            student: {
                select: {
                    id: true,
                    assignedCounselorId: true,
                    academicBackground: true,
                    assignedCounselor: { select: { id: true, branchId: true } },
                },
            },
            counselor: { select: { id: true, branchId: true } },
        },
    });
    if (!existing) throw AppError.notFound("Appointment not found.", "APPOINTMENT_NOT_FOUND");
    if (currentUser) {
        assertAppointmentAuthorization(existing, currentUser, "delete");
    }
    await prisma.appointmentReminder.deleteMany({ where: { appointmentId: id } }).catch(() => {});
    await prisma.appointment.delete({ where: { id } });
};

// ─── UPCOMING FOLLOW-UP REMINDERS ─────────────────────────────────────────────
const getUpcomingFollowUpReminders = async ({ hoursAhead = 24, counselorId, currentUser = null } = {}) => {
    const now = new Date();
    const parsedHours = Math.max(parseInt(hoursAhead, 10) || 24, 1);
    const windowEnd = new Date(now.getTime() + parsedHours * 60 * 60 * 1000);

    const where = {
        type: "FOLLOW_UP",
        status: "SCHEDULED",
        datetime: {
            gte: now,
            lte: windowEnd,
        },
        student: {
            isActive: true, // Suppress stale reminders for students in Trash
        },
    };

    if (counselorId) {
        where.counselorId = counselorId;
    }

    // Role-based visibility and branch boundaries
    if (currentUser) {
        const actorRole = currentUser.role;
        const actorId = currentUser.userId || currentUser.id;

        if (actorRole === "COUNSELOR") {
            // Counselor can ONLY see their own upcoming follow-ups (overrides query parameter)
            where.counselorId = actorId;
        } else if (actorRole === "FRONT_DESK" || actorRole === "BRANCH_ADMIN") {
            if (!isValidBranchId(currentUser.branchId)) {
                throw AppError.forbidden("Staff lacks assigned branch context.", "NO_BRANCH_CONTEXT");
            }
            const authorizedBranchId = currentUser.branchId.trim();
            where.OR = [
                { counselor: { branchId: authorizedBranchId } },
                { student: { assignedCounselor: { branchId: authorizedBranchId } } },
                {
                    student: {
                        assignedCounselorId: null,
                        academicBackground: { path: ["branchId"], equals: authorizedBranchId },
                    },
                },
            ];
        } else if (actorRole === "STUDENT") {
            const currentStudentId = currentUser.studentId || actorId;
            where.studentId = currentStudentId;
        }
        // SUPER_ADMIN has global access
    }

    const appointments = await prisma.appointment.findMany({
        where,
        include: {
            student: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true,
                    isActive: true,
                    assignedCounselor: { select: { id: true, branchId: true } },
                },
            },
            counselor: {
                select: { id: true, firstName: true, lastName: true, email: true, branchId: true },
            },
        },
        orderBy: { datetime: "asc" },
    });

    return appointments.map((appt) => {
        const studentName = [appt.student?.firstName, appt.student?.lastName].filter(Boolean).join(" ");
        const counselorName = [appt.counselor?.firstName, appt.counselor?.lastName].filter(Boolean).join(" ");
        const diffMs = new Date(appt.datetime).getTime() - now.getTime();
        const minutesUntil = Math.max(0, Math.round(diffMs / 60000));

        return {
            appointmentId: appt.id,
            studentId: appt.studentId,
            studentName: studentName || "Unknown Student",
            counselorId: appt.counselorId,
            counselorName: counselorName || "Unassigned",
            datetime: appt.datetime,
            durationMin: appt.durationMin,
            meetingMode: appt.meetingMode,
            meetingLink: appt.meetingLink,
            status: appt.status,
            type: appt.type,
            notes: appt.notes,
            minutesUntil,
            isApproaching: minutesUntil <= 60 && minutesUntil >= 0,
        };
    });
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
    getUpcomingFollowUpReminders,
    getDashboardStats,
    assertAppointmentAuthorization,
    resolveFollowUpRecipient,
    createAppointmentReminders,
    APPOINTMENT_REMINDER_OFFSETS,
};
