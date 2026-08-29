const prisma = require("../prisma");
const AppError = require("../utils/apiError");
const { hashPassword, generateTempPassword } = require("../utils/password.util");
const { sendWelcomeStudentEmail } = require("./email.service");

// ─── Valid forward transitions ────────────────────────────────────────────────
const STAGE_ORDER = [
    "LEAD", "PROSPECT", "ENROLLED", "APPLIED",
    "OFFER_RECEIVED", "VISA_APPLIED", "VISA_APPROVED", "DEPARTED",
];

const isValidTransition = (from, to) => {
    if (to === "LOST") return true; // any stage → LOST
    const fromIdx = STAGE_ORDER.indexOf(from);
    const toIdx = STAGE_ORDER.indexOf(to);
    return toIdx > fromIdx; // forward only
};

// ─── Shared select for list queries (avoids repeating fields) ─────────────────
const LIST_SELECT = {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    phone: true,
    currentStage: true,
    source: true,
    processingType: true,
    partnerConsultancyId: true,
    partnerConsultancy: { select: { id: true, name: true } },
    assignedCounselorId: true,
    assignedCounselor: { select: { id: true, firstName: true, lastName: true } },
    isActive: true,
    createdAt: true,
    // notes & academicBackground are needed by the frontend to parse
    // interestedLevel / preferredLevel / interestedCountries from the notes string.
    // Without these, every lead shows as 'bachelor' regardless of what was saved.
    notes: true,
    academicBackground: true,
};

// ─── PORTAL PROVISIONING + WELCOME EMAIL ───────────────────────────────────────
// Creates a STUDENT portal account (if none exists) and emails the temporary
// credentials. Fire-and-forget: never blocks or fails the surrounding request.
const provisionPortalAndSendWelcome = async (student) => {
    if (!student?.email) return;

    try {
        const existing = await prisma.user.findFirst({ where: { studentId: student.id } });
        if (existing) return;

        const tempPassword = generateTempPassword();
        const passwordHash = await hashPassword(tempPassword);

        await prisma.user.create({
            data: {
                email: student.email,
                passwordHash,
                firstName: student.firstName,
                lastName: student.lastName,
                role: "STUDENT",
                status: "ACTIVE",
                mustChangePassword: true,
                studentId: student.id,
            },
        });

        await sendWelcomeStudentEmail({
            to: student.email,
            studentName: `${student.firstName} ${student.lastName}`.trim(),
            tempPassword,
        });
    } catch (err) {
        console.error("[student] portal provisioning / welcome email failed:", err.message);
    }
};

// ─── CREATE ───────────────────────────────────────────────────────────────────
const createStudent = async (data) => {
    const studentEmail = data.email && data.email.trim() ? data.email.toLowerCase().trim() : null;
    if (studentEmail) {
        const existing = await prisma.student.findFirst({ where: { email: studentEmail } });
        if (existing) throw AppError.conflict("A student with this email already exists.", "DUPLICATE_EMAIL");
    }

    let partnerConsultancyId = data.partnerConsultancyId || null;
    const processingType = data.processingType === "PARTNER_CONSULTANCY" ? "PARTNER_CONSULTANCY" : "SELF";

    if (processingType === "PARTNER_CONSULTANCY" && !partnerConsultancyId && data.partnerConsultancyName) {
        const partner = await prisma.partnerConsultancy.upsert({
            where: { name: data.partnerConsultancyName.trim() },
            update: {},
            create: { name: data.partnerConsultancyName.trim() },
        });
        partnerConsultancyId = partner.id;
    }

    const student = await prisma.student.create({
        data: {
            firstName: data.firstName.trim(),
            lastName: data.lastName.trim(),
            email: studentEmail,
            phone: data.phone?.trim() || null,
            dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
            nationality: data.nationality?.trim() || null,
            source: data.source || null,
            processingType,
            partnerConsultancyId: processingType === "PARTNER_CONSULTANCY" ? partnerConsultancyId : null,
            assignedCounselorId: data.assignedCounselorId || null,
            referredByAgentId: data.referredByAgentId || null,
            notes: data.notes?.trim() || null,
        },
        include: {
            partnerConsultancy: { select: { id: true, name: true } },
        },
    });

    // Record the initial stage in history
    await prisma.pipelineStageHistory.create({
        data: { studentId: student.id, stage: "LEAD" },
    });

    return student;
};

// ─── GET ONE (360° profile) ───────────────────────────────────────────────────
const getStudentById = async (id) => {
    const student = await prisma.student.findUnique({
        where: { id },
        include: {
            partnerConsultancy: { select: { id: true, name: true } },
            assignedCounselor: { select: { id: true, firstName: true, lastName: true, email: true } },
            stageHistory: { orderBy: { changedAt: "desc" }, take: 10 },
            testScores: true,
            documents: { orderBy: { createdAt: "desc" } },
            payments: { include: { transactions: true } },
            applications: { include: { university: { select: { id: true, name: true } }, course: { select: { id: true, name: true } } } },
            appointments: { orderBy: { datetime: "desc" }, take: 5 },
            communicationLogs: { orderBy: { createdAt: "desc" }, take: 10 },
        },
    });

    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");
    return student;
};

// ─── LIST / SEARCH / FILTER ──────────────────────────────────────────────────
const listStudents = async ({ search, stage, stageIn, type, counselorId, source, isActive, createdFrom, createdTo, page, limit, sortBy, order }) => {
    const where = {};

    // Active filter (default: true)
    where.isActive = isActive !== undefined ? isActive === "true" : true;

    if (stage) {
        where.currentStage = stage;
    } else if (stageIn) {
        where.currentStage = { in: String(stageIn).split(",").map((s) => s.trim()) };
    } else if (type === "leads") {
        where.currentStage = { in: ["LEAD", "PROSPECT"] };
    } else {
        // Backend Safety Guard: By default, GET /api/students returns enrolled/processing students, excluding un-enrolled leads ("LEAD", "PROSPECT")
        where.currentStage = { notIn: ["LEAD", "PROSPECT"] };
    }

    if (counselorId) where.assignedCounselorId = counselorId;
    if (source) where.source = source;

    // Date range filter on createdAt
    if (createdFrom || createdTo) {
        where.createdAt = {};
        if (createdFrom) where.createdAt.gte = new Date(createdFrom);
        if (createdTo) where.createdAt.lte = new Date(createdTo);
    }

    if (search) {
        where.OR = [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
        ];
    }

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const skip = (pageNum - 1) * pageSize;

    const allowedSorts = ["createdAt", "firstName", "lastName", "currentStage"];
    const orderField = allowedSorts.includes(sortBy) ? sortBy : "createdAt";
    const orderDir = order === "asc" ? "asc" : "desc";

    const [students, total] = await Promise.all([
        prisma.student.findMany({
            where,
            select: LIST_SELECT,
            orderBy: { [orderField]: orderDir },
            skip,
            take: pageSize,
        }),
        prisma.student.count({ where }),
    ]);

    return {
        students,
        pagination: {
            page: pageNum,
            limit: pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
        },
    };
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
const updateStudent = async (id, data) => {
    const student = await prisma.student.findUnique({ where: { id } });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");

    // If email is being changed, check for duplicates
    if (data.email && data.email.toLowerCase().trim() !== student.email) {
        const dup = await prisma.student.findUnique({ where: { email: data.email.toLowerCase().trim() } });
        if (dup) throw AppError.conflict("A student with this email already exists.", "DUPLICATE_EMAIL");
    }

    // Build update object — only include provided fields
    const update = {};
    if (data.firstName !== undefined) update.firstName = data.firstName.trim();
    if (data.lastName !== undefined) update.lastName = data.lastName.trim();
    if (data.email !== undefined) update.email = data.email.toLowerCase().trim();
    if (data.phone !== undefined) update.phone = data.phone?.trim() || null;
    if (data.dateOfBirth !== undefined) update.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    if (data.nationality !== undefined) update.nationality = data.nationality?.trim() || null;
    if (data.source !== undefined) update.source = data.source;
    if (data.assignedCounselorId !== undefined) update.assignedCounselorId = data.assignedCounselorId || null;
    if (data.notes !== undefined) update.notes = data.notes;
    if (data.academicBackground !== undefined) update.academicBackground = data.academicBackground;
    // Handle processingType & partner consultancy updates
    if (data.processingType !== undefined) {
        update.processingType = data.processingType === "PARTNER_CONSULTANCY" ? "PARTNER_CONSULTANCY" : "SELF";
        if (update.processingType === "SELF") {
            update.partnerConsultancyId = null;
        }
    }

    if (data.partnerConsultancyId !== undefined) {
        update.partnerConsultancyId = data.partnerConsultancyId || null;
    } else if (data.partnerConsultancyName && (data.processingType === "PARTNER_CONSULTANCY" || student.processingType === "PARTNER_CONSULTANCY")) {
        const partner = await prisma.partnerConsultancy.upsert({
            where: { name: data.partnerConsultancyName.trim() },
            update: {},
            create: { name: data.partnerConsultancyName.trim() },
        });
        update.partnerConsultancyId = partner.id;
    }

    return prisma.student.update({
        where: { id },
        data: update,
        include: {
            partnerConsultancy: { select: { id: true, name: true } },
            assignedCounselor: { select: { id: true, firstName: true, lastName: true } },
        },
    });
};

// ─── CHANGE PIPELINE STAGE ───────────────────────────────────────────────────
const changePipelineStage = async (id, { stage, reasonCode }, changedById) => {
    const student = await prisma.student.findUnique({ where: { id } });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");

    if (student.currentStage === stage) return student;

    if (!isValidTransition(student.currentStage, stage))
        throw AppError.badRequest(
            `Cannot move from ${student.currentStage} to ${stage}. Only forward transitions or LOST are allowed.`,
            "INVALID_TRANSITION"
        );

    // Update stage and record history in a single transaction
    const [updated] = await prisma.$transaction([
        prisma.student.update({ where: { id }, data: { currentStage: stage } }),
        prisma.pipelineStageHistory.create({
            data: {
                studentId: id,
                stage,
                changedById,
                reasonCode: stage === "LOST" ? reasonCode : null,
            },
        }),
    ]);

    // When a lead becomes an enrolled student, provision the portal account and
    // email the welcome message with temporary credentials.
    if (stage === "ENROLLED") {
        provisionPortalAndSendWelcome(updated);
    }

    return updated;
};

// ─── SOFT DELETE ──────────────────────────────────────────────────────────────
const softDeleteStudent = async (id) => {
    const student = await prisma.student.findUnique({ where: { id } });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");
    if (!student.isActive) throw AppError.badRequest("Student is already deactivated.", "ALREADY_INACTIVE");

    return prisma.student.update({ where: { id }, data: { isActive: false } });
};

// ─── TIMELINE ─────────────────────────────────────────────────────────────────
const getTimeline = async (id) => {
    const student = await prisma.student.findUnique({ where: { id }, select: { id: true } });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");

    return prisma.pipelineStageHistory.findMany({
        where: { studentId: id },
        include: { changedBy: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { changedAt: "desc" },
    });
};

module.exports = {
    createStudent,
    getStudentById,
    listStudents,
    updateStudent,
    changePipelineStage,
    softDeleteStudent,
    getTimeline,
};
