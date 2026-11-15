const prisma = require("../prisma");
const AppError = require("../utils/apiError");
const { hashPassword, generateTempPassword } = require("../utils/password.util");
const { sendWelcomeStudentEmail, sendNotificationEmail, isValidEmail } = require("./email.service");
const { queueFollowUpNotification } = require("./notification.service");

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

// ─── Lead Stage Resolution ────────────────────────────────────────────────────
const resolveLeadStage = (student) => {
    if (!student) return null;
    // Post-enrollment students (ENROLLED, APPLIED, VISA_APPROVED, DEPARTED, LOST) are not leads
    if (student.currentStage && !["LEAD", "PROSPECT"].includes(student.currentStage)) {
        return null;
    }
    const bg = student.academicBackground;
    if (bg && typeof bg === "object" && bg.leadStage) {
        return String(bg.leadStage).toUpperCase().replace(/-/g, "_");
    }
    if (student.leadStage) {
        return String(student.leadStage).toUpperCase().replace(/-/g, "_");
    }
    if (student.currentStage === "PROSPECT") return "COUNSELLING";
    if (student.currentStage === "LEAD") return "NEW";
    return null;
};

// ─── Safe Student Select (Physical schema projection) ────────────────────────
// Explicit scalar projection containing only columns physically present in PostgreSQL table.
// Excludes virtual / unmigrated columns (leadStage, trashReason, trashedAt, trashedById)
// to prevent "column Student.leadStage does not exist" SQL crashes.
const SAFE_STUDENT_SCALARS = {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    phone: true,
    dateOfBirth: true,
    nationality: true,
    currentStage: true,
    source: true,
    processingType: true,
    partnerConsultancyId: true,
    assignedCounselorId: true,
    referredByAgentId: true,
    academicBackground: true,
    financialBackground: true,
    familyBackground: true,
    notes: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
};

const SAFE_STUDENT_SELECT = {
    ...SAFE_STUDENT_SCALARS,
    partnerConsultancy: { select: { id: true, name: true } },
    assignedCounselor: { select: { id: true, firstName: true, lastName: true, email: true, branchId: true } },
    referredByAgent: {
        select: {
            id: true,
            referralCode: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
    },
};

const formatStudentRecord = (student) => {
    if (!student) return null;
    const bg = (student.academicBackground && typeof student.academicBackground === "object")
        ? student.academicBackground
        : {};
    const isTrashed = student.isActive === false;
    const isClassOnly = Boolean(
        bg.isClassOnly ||
        bg.serviceType === "CLASS_ONLY" ||
        bg.enrollmentType === "CLASS_ONLY" ||
        bg.type === "CLASS_ONLY"
    );
    return {
        ...student,
        isClassOnly,
        leadStage: resolveLeadStage(student),
        trashReason: isTrashed ? (bg.trashReason || student.trashReason || null) : null,
        trashedAt: isTrashed ? (bg.trashedAt || student.trashedAt || student.updatedAt || null) : null,
        trashedById: isTrashed ? (bg.trashedById || student.trashedById || null) : null,
    };
};

// Minimal projection used for authorization + trash/restore decisions
const AUTHZ_STUDENT_SELECT = {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    currentStage: true,
    isActive: true,
    academicBackground: true,
    assignedCounselorId: true,
    updatedAt: true,
    assignedCounselor: { select: { id: true, branchId: true } },
};

// ─── Follow-up synchronization helpers ─────────────────────────────────────────────────────────
// Maps Appointment.meetingMode (free string) to the CommunicationChannel enum.
const mapMeetingModeToChannel = (mode) => {
    const m = String(mode || "").toUpperCase();
    if (m === "PHONE" || m === "CALL") return "PHONE";
    if (m === "WHATSAPP") return "WHATSAPP";
    if (m === "EMAIL") return "EMAIL";
    if (m === "ONLINE" || m === "VIDEO" || m === "ZOOM" || m === "MEETING") return "MEETING";
    return "IN_PERSON"; // OFFICE / IN_PERSON / unknown
};

// Stable marker linking a CommunicationLog row to its pipeline follow-up appointment.
const buildFollowUpRefMarker = (appointmentId) => `[followup-appt:${appointmentId}]`;

// Content describes a *planned* follow-up, not a completed contact, to avoid misleading history.
const buildFollowUpLogContent = (datetime, notes, refMarker) => {
    const when = new Date(datetime).toISOString();
    const trimmed = typeof notes === "string" ? notes.trim() : "";
    return `Follow-up scheduled for ${when} (pipeline stage: Follow Up).${trimmed ? ` Notes: ${trimmed}` : ""} ${refMarker}`;
};

// Replace pending reminders for a (re)scheduled follow-up. Best-effort; never throws to caller.
const refreshFollowUpReminders = async (appointment) => {
    try {
        if (prisma.appointmentReminder?.deleteMany) {
            await prisma.appointmentReminder.deleteMany({
                where: { appointmentId: appointment.id, status: "PENDING" },
            });
        }
        // Lazy require avoids load-order coupling between services
        const { createAppointmentReminders } = require("./appointment.service");
        if (typeof createAppointmentReminders === "function") {
            await createAppointmentReminders(appointment.id, appointment.datetime);
        }
    } catch (err) {
        console.warn(`[StudentService] Reminder refresh skipped for appointment ${appointment?.id}: ${err.message}`);
    }
};

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
    assignedCounselor: { select: { id: true, firstName: true, lastName: true, branchId: true } },
    referredByAgentId: true,
    referredByAgent: {
        select: {
            id: true,
            referralCode: true,
            user: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                },
            },
        },
    },
    isActive: true,
    createdAt: true,
    updatedAt: true,
    // notes & academicBackground are needed by the frontend to parse
    // interestedLevel / preferredLevel / interestedCountries from the notes string.
    // Without these, every lead shows as 'bachelor' regardless of what was saved.
    notes: true,
    academicBackground: true,
};


// ─── EMAIL SAFETY & ACCOUNT COLLISION GUARDS ─────────────────────────────────
/**
 * Asserts that the provided email is not registered to a staff account or linked
 * to another student's portal account. Throws AppError.conflict (409) if a conflict exists.
 *
 * @param {string} email - Normalized email to check
 * @param {string|null} [currentStudentId=null] - The student ID performing the operation (if existing)
 * @param {string} [context="provision student portal access"] - Action description for error message
 */
const assertEmailNotConflictingWithStaffOrOtherStudent = async (
    email,
    currentStudentId = null,
    context = "provision student portal access"
) => {
    if (!email) return;
    const normalized = email.toLowerCase().trim();
    const existingUser = await prisma.user.findUnique({ where: { email: normalized } });
    if (existingUser) {
        if (existingUser.role !== "STUDENT") {
            throw AppError.conflict(
                `Email '${normalized}' is already registered to a staff account (${existingUser.role}). Cannot ${context}.`,
                "STAFF_ACCOUNT_CONFLICT"
            );
        }
        if (existingUser.studentId && currentStudentId && existingUser.studentId !== currentStudentId) {
            throw AppError.conflict(
                `Email '${normalized}' is already linked to another student portal account.`,
                "STUDENT_ACCOUNT_CONFLICT"
            );
        }
    }
};

// ─── PORTAL PROVISIONING + WELCOME EMAIL ───────────────────────────────────────
// Creates a STUDENT portal account (or updates existing) and emails the temporary
// credentials. Strictly rejects operations against staff or conflicting accounts.
const provisionPortalAndSendWelcome = async (student) => {
    if (!student?.email || !isValidEmail(student.email)) {
        console.warn(`[student] No valid email for student ${student?.id} ("${student?.email}") — skipping portal provisioning`);
        return { success: false, reason: "INVALID_OR_MISSING_EMAIL" };
    }

    const normalizedEmail = student.email.toLowerCase().trim();

    // 1. Guard against staff account takeover or student account collision
    await assertEmailNotConflictingWithStaffOrOtherStudent(
        normalizedEmail,
        student.id,
        "provision student portal access"
    );

    // 2. Check if a user account is already linked to this student by studentId
    const userByStudentId = await prisma.user.findFirst({ where: { studentId: student.id } });
    if (userByStudentId && userByStudentId.role !== "STUDENT") {
        throw AppError.conflict(
            `User account linked to student is not a student account (${userByStudentId.role}).`,
            "INVALID_ACCOUNT_ROLE"
        );
    }

    const userByEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    const user = userByStudentId || userByEmail;

    try {
        const tempPassword = generateTempPassword();
        const passwordHash = await hashPassword(tempPassword);

        if (user) {
            // Update credentials and ensure studentId and email are linked
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    email: normalizedEmail,
                    studentId: student.id,
                    passwordHash,
                    mustChangePassword: true,
                    status: "ACTIVE",
                },
            });
            console.log(`[student] Updated portal account credentials for ${normalizedEmail}`);
        } else {
            // Create new portal user account
            await prisma.user.create({
                data: {
                    email: normalizedEmail,
                    passwordHash,
                    firstName: student.firstName,
                    lastName: student.lastName,
                    role: "STUDENT",
                    status: "ACTIVE",
                    mustChangePassword: true,
                    studentId: student.id,
                },
            });
            console.log(`[student] Created new portal account for ${normalizedEmail}`);
        }

        const mailResult = await sendWelcomeStudentEmail({
            to: normalizedEmail,
            studentName: `${student.firstName} ${student.lastName}`.trim(),
            tempPassword,
        });

        return { success: true, mailResult };
    } catch (err) {
        if (err instanceof AppError) throw err;
        console.error("[student] portal provisioning / welcome email failed:", err.message);
        return { success: false, error: err.message };
    }
};

// ─── COUNSELOR ASSIGNMENT VALIDATION ──────────────────────────────────────────
const validateCounselorAssignment = async (assignedCounselorId, currentUser) => {
    if (!assignedCounselorId) {
        if (currentUser?.role === "COUNSELOR") {
            // Counselors creating students default to themselves
            return currentUser.userId || currentUser.id;
        }
        return null;
    }

    const actorId = currentUser ? (currentUser.userId || currentUser.id) : null;
    const actorRole = currentUser ? currentUser.role : null;

    if (actorRole === "COUNSELOR") {
        if (assignedCounselorId !== actorId) {
            throw AppError.forbidden("Counselors cannot assign students to other counselors.", "FORBIDDEN");
        }
        return actorId;
    }

    // Look up target counselor
    const targetCounselor = await prisma.user.findUnique({
        where: { id: assignedCounselorId },
        select: { id: true, role: true, branchId: true },
    });

    if (!targetCounselor) {
        throw AppError.notFound(`Counselor with id '${assignedCounselorId}' not found.`, "COUNSELOR_NOT_FOUND");
    }

    if (targetCounselor.role !== "COUNSELOR") {
        throw AppError.badRequest(`User '${assignedCounselorId}' is not a counselor (${targetCounselor.role}).`, "INVALID_COUNSELOR_ROLE");
    }

    if (actorRole === "BRANCH_ADMIN") {
        if (!currentUser.branchId) {
            throw AppError.forbidden("Branch Admin lacks assigned branch context.", "NO_BRANCH_CONTEXT");
        }
        if (!targetCounselor.branchId || targetCounselor.branchId !== currentUser.branchId) {
            throw AppError.forbidden("Branch admins can only assign counselors within their own branch.", "FORBIDDEN");
        }
    } else if (actorRole === "FRONT_DESK") {
        if (!currentUser.branchId) {
            throw AppError.forbidden("Front Desk lacks assigned branch context.", "NO_BRANCH_CONTEXT");
        }
        if (!targetCounselor.branchId || targetCounselor.branchId !== currentUser.branchId) {
            throw AppError.forbidden("Front desk staff can only assign counselors within their own branch.", "FORBIDDEN");
        }
    }

    return targetCounselor.id;
};

// ─── CREATE ───────────────────────────────────────────────────────────────────
const createStudent = async (data, currentUser = null) => {
    const studentEmail = data.email && data.email.trim() ? data.email.toLowerCase().trim() : null;
    if (studentEmail) {
        const existing = await prisma.student.findFirst({ where: { email: studentEmail }, select: { id: true } });
        if (existing) throw AppError.conflict("A student with this email already exists.", "DUPLICATE_EMAIL");

        // Guard against staff account takeover BEFORE creating student
        await assertEmailNotConflictingWithStaffOrOtherStudent(
            studentEmail,
            null,
            "register student with this email"
        );
    }

    const effectiveCounselorId = await validateCounselorAssignment(data.assignedCounselorId, currentUser);

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

    const initialStage = (data.currentStage || data.stage || "LEAD").toUpperCase();

    if (data.referredByAgentId) {
        const agentProfile = await prisma.referralAgentProfile.findUnique({
            where: { id: data.referredByAgentId },
            select: { id: true },
        });
        if (!agentProfile) {
            throw AppError.badRequest("Invalid referral agent profile ID.", "INVALID_REFERRAL_AGENT");
        }
    }

    const isPreEnrollmentStage = ["LEAD", "PROSPECT"].includes(initialStage);
    const initialLeadStage = isPreEnrollmentStage
        ? (data.leadStage
            ? String(data.leadStage).toUpperCase().replace(/-/g, "_")
            : (initialStage === "PROSPECT" ? "COUNSELLING" : "NEW"))
        : null;
    const existingBg = (typeof data.academicBackground === "object" && data.academicBackground !== null)
        ? { ...data.academicBackground }
        : {};
    if (initialLeadStage) {
        existingBg.leadStage = initialLeadStage;
    } else {
        delete existingBg.leadStage;
    }

    if (currentUser?.role === "SUPER_ADMIN") {
        const destBranch = (data.destinationBranchId || data.branchId || "").trim();
        if (!destBranch) {
            throw AppError.badRequest("Super Admin must specify a destination branch for new leads.", "MISSING_DESTINATION_BRANCH");
        }
        const targetBranch = await prisma.branch.findUnique({
            where: { id: destBranch },
            select: { id: true, name: true, isActive: true },
        });
        if (!targetBranch) {
            throw AppError.notFound(`Destination branch '${destBranch}' not found.`, "BRANCH_NOT_FOUND");
        }
        if (!targetBranch.isActive) {
            throw AppError.badRequest(`Destination branch '${targetBranch.name}' is inactive. Lead creation rejected.`, "INACTIVE_DESTINATION_BRANCH");
        }
        existingBg.branchId = destBranch;
    } else if (currentUser?.role === "FRONT_DESK" || currentUser?.role === "BRANCH_ADMIN") {
        const authorizedBranchId = (currentUser.branchId || "").trim();
        if (!authorizedBranchId) {
            throw AppError.forbidden("Your staff account lacks an assigned branch context. Lead creation is rejected.", "NO_BRANCH_CONTEXT");
        }
        existingBg.branchId = authorizedBranchId;
    } else if (currentUser) {
        throw AppError.forbidden("Your role is not authorized to create prospective leads.", "FORBIDDEN");
    }
    const academicBackground = existingBg;

    const student = await prisma.student.create({
        data: {
            firstName: data.firstName.trim(),
            lastName: data.lastName?.trim() || data.firstName.trim(),
            email: studentEmail,
            phone: data.phone?.trim() || null,
            dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
            nationality: data.nationality?.trim() || null,
            source: data.source || null,
            currentStage: initialStage,
            academicBackground,
            processingType,
            partnerConsultancyId: processingType === "PARTNER_CONSULTANCY" ? partnerConsultancyId : null,
            assignedCounselorId: effectiveCounselorId,
            referredByAgentId: data.referredByAgentId || null,
            notes: data.notes?.trim() || null,
        },
        select: SAFE_STUDENT_SELECT,
    });

    // Record the initial stage in history
    await prisma.pipelineStageHistory.create({
        data: { studentId: student.id, stage: initialStage },
    });

    if (initialStage === "ENROLLED") {
        const provisionResult = await provisionPortalAndSendWelcome(student);
        student._portalProvision = provisionResult;
    }

    return formatStudentRecord(student);
};

function isValidBranchId(value) {
    return typeof value === "string" && value.trim().length > 0;
}

/**
 * Resolves the authoritative branch ownership of a student record (Option 1):
 * - Rule 1: If assignedCounselorId (or assignedCounselor) exists, branch ownership comes strictly from assignedCounselor.branchId.
 * - Rule 2: Only when assignedCounselorId is null/absent, fall back to academicBackground.branchId.
 * - Rule 3: If neither provides a valid branchId, returns null (unassigned).
 */
function resolveStudentBranchId(student) {
    if (!student || typeof student !== "object") return null;

    const bg = student.academicBackground;
    if (bg && typeof bg === "object" && isValidBranchId(bg.branchId)) {
        return bg.branchId.trim();
    }

    const counselorBranchId = student.assignedCounselor?.branchId;
    if (isValidBranchId(counselorBranchId)) {
        return counselorBranchId.trim();
    }

    return null;
}

/**
 * Asserts that the authenticated actor has authorization to access or mutate a student.
 * @param {object} student - Loaded student record with assignedCounselor relation
 * @param {object} currentUser - Authenticated user context
 * @param {string} action - Action description ("view", "update", "modify")
 */
const assertStudentAuthorization = (student, currentUser, action = "modify") => {
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }

    const actorRole = currentUser.role;
    const actorId = currentUser.userId || currentUser.id;

    if (actorRole === "SUPER_ADMIN") {
        return; // Full global access
    }

    if (actorRole === "COUNSELOR") {
        if (!student.assignedCounselorId || student.assignedCounselorId !== actorId) {
            throw AppError.forbidden(`You are not authorized to ${action} this student.`, "FORBIDDEN");
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
            throw AppError.forbidden(`You are not authorized to ${action} this student.`, "FORBIDDEN");
        }
        return;
    }

    // Front desk: permitted only for students belonging to their authorized branch
    if (actorRole === "FRONT_DESK") {
        if (!isValidBranchId(currentUser.branchId)) {
            throw AppError.forbidden("Front Desk lacks assigned branch context.", "NO_BRANCH_CONTEXT");
        }
        const authorizedBranchId = currentUser.branchId.trim();
        const studentBranchId = resolveStudentBranchId(student);
        if (!studentBranchId || studentBranchId !== authorizedBranchId) {
            throw AppError.forbidden(`You are not authorized to ${action} this student.`, "FORBIDDEN");
        }
        return;
    }

    if (actorRole === "STUDENT") {
        const actorStudentId = currentUser.studentId || currentUser.id;
        if (actorStudentId && actorStudentId === student.id) {
            return;
        }
        throw AppError.forbidden(`You are not authorized to ${action} this student.`, "FORBIDDEN");
    }

    // Any other role (e.g. TEACHER, REFERRAL_AGENT)
    throw AppError.forbidden(`You are not authorized to ${action} this student.`, "FORBIDDEN");
};

// ─── GET ONE (360° profile) ───────────────────────────────────────────────────
const getStudentById = async (id, currentUser = null) => {
    const student = await prisma.student.findUnique({
        where: { id },
        select: {
            ...SAFE_STUDENT_SELECT,
            stageHistory: { orderBy: { changedAt: "desc" }, take: 10 },
            testScores: true,
            documents: {
                select: {
                    id: true,
                    studentId: true,
                    type: true,
                    status: true,
                    fileUrl: true,
                    originalName: true,
                    mimeType: true,
                    fileSize: true,
                    uploadedById: true,
                    verifiedById: true,
                    expiryDate: true,
                    acknowledged: true,
                    acknowledgedAt: true,
                    notes: true,
                    createdAt: true,
                    updatedAt: true,
                },
                orderBy: { createdAt: "desc" },
            },
            payments: { include: { transactions: true } },
            applications: { include: { university: { select: { id: true, name: true } }, course: { select: { id: true, name: true } } } },
            appointments: { orderBy: { datetime: "desc" }, take: 5 },
            communicationLogs: { orderBy: { createdAt: "desc" }, take: 10 },
        },
    });

    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");

    // Trashed students fail closed for non-administrators
    if (student.isActive === false) {
        if (!currentUser || (currentUser.role !== "SUPER_ADMIN" && currentUser.role !== "BRANCH_ADMIN")) {
            throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");
        }
    }

    if (currentUser) {
        try {
            assertStudentAuthorization(student, currentUser, "view");
        } catch {
            throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");
        }
    }

    return formatStudentRecord(student);
};


// ─── LIST / SEARCH / FILTER ──────────────────────────────────────────────────
/**
 * Detects whether a Prisma error was caused by unsupported JSON path filtering
 * on academicBackground, ensuring operational errors, connection failures, timeouts,
 * constraint violations, filesystem errors, and unrelated schema errors are never masked
 * and are immediately re-thrown.
 */
const isJsonFilterCompatibilityError = (err) => {
    // 1. Immediately reject nullish, non-object, or operational/application errors (AppError)
    if (!err || typeof err !== "object" || err.isOperational) return false;

    // 2. Reject Node.js system and filesystem errors explicitly (e.g. ENOENT with file paths)
    if (err.syscall || err.code === "ENOENT" || err.code === "EISDIR" || err.code === "ENOTDIR" || err.code === "EACCES") {
        return false;
    }

    // 3. Confirm Prisma origin: must exhibit Prisma Client structural markers
    const isPrismaOrigin = Boolean(
        (typeof err.name === "string" && err.name.startsWith("PrismaClient")) ||
        (typeof err.constructor?.name === "string" && err.constructor.name.startsWith("PrismaClient")) ||
        typeof err.clientVersion === "string"
    );
    if (!isPrismaOrigin) return false;

    const code = typeof err.code === "string" ? err.code : "";
    const msg = typeof err.message === "string" ? err.message : "";
    const metaTarget = JSON.stringify(err.meta || "");
    const combined = `${msg} ${metaTarget}`;

    // 4. Explicitly reject data constraint errors (unique violations P2002, foreign key failures P2003)
    if (code === "P2002" || code === "P2003") {
        return false;
    }

    // 5. Explicitly reject database connection failures, server shutdowns, and query timeouts
    if (
        code === "P1000" ||
        code === "P1001" ||
        code === "P1002" ||
        code === "P1008" ||
        code === "P1017" ||
        /connection|timeout|timed out|econnrefused|etimedout|econnreset|ehostunreach|closed the connection/i.test(combined)
    ) {
        return false;
    }

    // 6. Prisma table or column missing errors (P2021 / P2022):
    // Must specifically identify academicBackground in target/meta (or student table missing academicBackground column)
    if (code === "P2021" || code === "P2022") {
        return /academicBackground/i.test(metaTarget) || (/student/i.test(metaTarget) && /academicBackground/i.test(msg));
    }

    // 7. Prisma query validation errors (P2009 / P2019 / PrismaClientValidationError):
    // Must specifically identify academicBackground AND json/path operators
    if (code === "P2009" || code === "P2019" || (typeof err.name === "string" && err.name === "PrismaClientValidationError")) {
        return /academicBackground/i.test(combined) && /path|json/i.test(combined);
    }

    // 8. Driver-level / unknown query engine errors (PrismaClientUnknownRequestError):
    // Must contain both the academicBackground/json extraction target and a recognized operator incompatibility phrase
    if ((typeof err.name === "string" && err.name === "PrismaClientUnknownRequestError") || !code) {
        const hasJsonTarget = /academicBackground|jsonb?_extract_path|#>>?|@>/i.test(combined);
        const hasIncompatibilityPhrase = /operator does not exist|syntax error at or near|cannot extract element from scalar/i.test(msg);
        return hasJsonTarget && hasIncompatibilityPhrase;
    }

    // 9. Default to false for all uncertain, unknown, or unrelated errors (safe re-throw)
    return false;
};

const listStudents = async (
    { search, stage, stageIn, type, counselorId, source, isActive, createdFrom, createdTo, page, limit, sortBy, order, isClassOnly } = {},
    currentUser = null
) => {
    const where = {};

    // Active filter (default: true)
    where.isActive = isActive !== undefined ? (isActive === "true" || isActive === true) : true;

    const classOnlyRequested = isClassOnly === "true" || isClassOnly === true || type === "class_only";

    if (stage) {
        where.currentStage = stage;
    } else if (stageIn) {
        // Special value "ALL" means no stage filter — include every student
        const stages = String(stageIn).split(",").map((s) => s.trim());
        if (stages.length === 1 && stages[0].toUpperCase() === "ALL") {
            // no currentStage filter
        } else {
            where.currentStage = { in: stages };
        }
    } else if (type === "leads") {
        where.currentStage = { in: ["LEAD", "PROSPECT"] };
    } else if (type === "all" || classOnlyRequested) {
        // no currentStage filter — class-only records can be at pre-enrollment LEAD or any stage
    } else {
        // Backend Safety Guard: By default, GET /api/students returns enrolled/processing students, excluding un-enrolled leads ("LEAD", "PROSPECT")
        where.currentStage = { notIn: ["LEAD", "PROSPECT"] };
    }

    if (classOnlyRequested) {
        const classOnlyConditions = [
            { academicBackground: { path: ["isClassOnly"], equals: true } },
            { academicBackground: { path: ["serviceType"], equals: "CLASS_ONLY" } },
            { academicBackground: { path: ["enrollmentType"], equals: "CLASS_ONLY" } },
            { academicBackground: { path: ["type"], equals: "CLASS_ONLY" } },
        ];
        where.AND = where.AND || [];
        where.AND.push({ OR: classOnlyConditions });
    }

    if (currentUser) {
        const actorRole = currentUser.role;
        const actorId = currentUser.userId || currentUser.id;

        if (actorRole === "COUNSELOR") {
            // Server-side enforcement overrides client-supplied counselorId
            where.assignedCounselorId = actorId;
        } else if (actorRole === "BRANCH_ADMIN" || actorRole === "FRONT_DESK") {
            if (!isValidBranchId(currentUser.branchId)) {
                throw AppError.forbidden(`${actorRole} lacks assigned branch context.`, "NO_BRANCH_CONTEXT");
            }
            const authorizedBranchId = currentUser.branchId.trim();
            where.OR = [
                { assignedCounselor: { branchId: authorizedBranchId } },
                {
                    assignedCounselorId: null,
                    academicBackground: { path: ["branchId"], equals: authorizedBranchId },
                },
            ];
            if (counselorId) where.assignedCounselorId = counselorId;
        } else if (actorRole === "SUPER_ADMIN") {
            if (counselorId) where.assignedCounselorId = counselorId;
        } else {
            throw AppError.forbidden("You are not authorized to list students.", "FORBIDDEN");
        }
    } else {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }

    if (source) where.source = source;

    // Date range filter on createdAt
    if (createdFrom || createdTo) {
        where.createdAt = {};
        if (createdFrom) where.createdAt.gte = new Date(createdFrom);
        if (createdTo) where.createdAt.lte = new Date(createdTo);
    }

    if (search) {
        const searchConditions = [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
        ];
        if (where.AND) {
            if (where.OR) {
                where.AND.push({ OR: where.OR });
                delete where.OR;
            }
            where.AND.push({ OR: searchConditions });
        } else if (where.OR) {
            where.AND = [{ OR: where.OR }, { OR: searchConditions }];
            delete where.OR;
        } else {
            where.OR = searchConditions;
        }
    }

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit) || 20, 1), 500);
    const skip = (pageNum - 1) * pageSize;

    const allowedSorts = ["createdAt", "firstName", "lastName", "currentStage"];
    const orderField = allowedSorts.includes(sortBy) ? sortBy : "createdAt";
    const orderDir = order === "asc" ? "asc" : "desc";

    let students;
    let total;
    let isFallback = false;
    let isTruncated = false;
    let candidatesEvaluated = undefined;

    try {
        [students, total] = await Promise.all([
            prisma.student.findMany({
                where,
                select: LIST_SELECT,
                orderBy: { [orderField]: orderDir },
                skip,
                take: pageSize,
            }),
            prisma.student.count({ where }),
        ]);
    } catch (err) {
        if (classOnlyRequested && isJsonFilterCompatibilityError(err)) {
            // Safe fallback if JSON path filtering is unsupported on the live database engine.
            // Strip ONLY the academicBackground JSON-path filter from where, preserving all
            // role/branch authorization scopes, search conditions, dates, and active flags.
            const fallbackWhere = { ...where };
            if (Array.isArray(fallbackWhere.AND)) {
                const nonJsonFilters = fallbackWhere.AND.filter(
                    (item) => !item.OR || !item.OR.some((c) => c && c.academicBackground)
                );
                if (nonJsonFilters.length > 0) {
                    fallbackWhere.AND = nonJsonFilters;
                } else {
                    delete fallbackWhere.AND;
                }
            }

            const CANDIDATE_LIMIT = 500;
            let candidates;
            try {
                candidates = await prisma.student.findMany({
                    where: fallbackWhere,
                    select: LIST_SELECT,
                    orderBy: { [orderField]: orderDir },
                    take: CANDIDATE_LIMIT,
                });
            } catch (fallbackErr) {
                // Preserve original compatibility error context without overwriting cause
                if (fallbackErr && typeof fallbackErr === "object") {
                    if (!fallbackErr.cause) {
                        fallbackErr.cause = err;
                    } else if (!fallbackErr.originalError) {
                        fallbackErr.originalError = err;
                    }
                }
                throw fallbackErr;
            }

            const filtered = candidates.filter((s) => {
                const bg = (s.academicBackground && typeof s.academicBackground === "object") ? s.academicBackground : {};
                return Boolean(bg.isClassOnly || bg.serviceType === "CLASS_ONLY" || bg.enrollmentType === "CLASS_ONLY" || bg.type === "CLASS_ONLY");
            });

            students = filtered.slice(skip, skip + pageSize);
            total = filtered.length;
            isFallback = true;
            candidatesEvaluated = candidates.length;
            isTruncated = candidates.length >= CANDIDATE_LIMIT;

            if (isTruncated) {
                console.warn(JSON.stringify({
                    event: "CLASS_ONLY_CANDIDATE_CEILING_REACHED",
                    severity: "WARN",
                    timestamp: new Date().toISOString(),
                    candidateLimit: CANDIDATE_LIMIT,
                    candidatesEvaluated: candidates.length,
                    matchingCandidates: filtered.length,
                    isTruncated: true,
                }));
            }
        } else {
            throw err;
        }
    }

    let userMap = new Map();
    if (where.isActive === false && prisma.user && typeof prisma.user.findMany === "function") {
        const actorIds = students
            .map((s) => s.academicBackground?.trashedById || s.trashedById)
            .filter((val) => typeof val === "string" && Boolean(val.trim()));
        if (actorIds.length > 0) {
            try {
                const actors = await prisma.user.findMany({
                    where: { id: { in: actorIds } },
                    select: { id: true, firstName: true, lastName: true, email: true },
                });
                userMap = new Map(actors.map((u) => [u.id, u]));
            } catch {
                // In mock environments where prisma.user.findMany is unconfigured, proceed gracefully
            }
        }
    }

    const resolvedStudents = students.map((s) => {
        const formatted = formatStudentRecord(s);
        const actorId = formatted.trashedById;
        const actor = actorId ? userMap.get(actorId) : null;
        const deletingActor = formatted.isActive === false
            ? (actor
                ? {
                    id: actor.id,
                    name: `${actor.firstName || ""} ${actor.lastName || ""}`.trim() || actor.email,
                    email: actor.email,
                }
                : (actorId ? { id: actorId, name: actorId, email: null } : null))
            : null;

        return {
            ...formatted,
            trashedBy: deletingActor,
        };
    });

    const pagination = {
        page: pageNum,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        isFallback,
        isTruncated,
    };
    if (candidatesEvaluated !== undefined) {
        pagination.candidatesEvaluated = candidatesEvaluated;
    }

    return {
        students: resolvedStudents,
        pagination,
    };
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
const updateStudent = async (id, data, currentUser = null) => {
    const student = await prisma.student.findUnique({
        where: { id },
        select: {
            id: true,
            email: true,
            isActive: true,
            currentStage: true,
            processingType: true,
            academicBackground: true,
            assignedCounselorId: true,
            assignedCounselor: { select: { id: true, branchId: true } },
        },
    });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");

    if (currentUser) {
        assertStudentAuthorization(student, currentUser, "update");
    }

    if (student.isActive === false) {
        throw AppError.badRequest("Cannot modify a student record in Trash. Please restore the student first.", "STUDENT_IN_TRASH");
    }

    // Normalize optional email so empty strings never collide on the @unique email constraint
    const normalizedUpdateEmail =
        data.email !== undefined
            ? (typeof data.email === "string" && data.email.trim() ? data.email.toLowerCase().trim() : null)
            : undefined;

    // If email is being changed, check for duplicates and staff account conflicts
    if (normalizedUpdateEmail && normalizedUpdateEmail !== student.email) {
        const dup = await prisma.student.findUnique({ where: { email: normalizedUpdateEmail }, select: { id: true } });
        if (dup && dup.id !== id) throw AppError.conflict("A student with this email already exists.", "DUPLICATE_EMAIL");

        // Guard against staff account takeover BEFORE updating student
        await assertEmailNotConflictingWithStaffOrOtherStudent(
            normalizedUpdateEmail,
            id,
            "update student to this email"
        );
    }

    // Build update object — only include provided fields
    const update = {};
    if (data.firstName !== undefined) update.firstName = data.firstName.trim();
    if (data.lastName !== undefined) update.lastName = data.lastName.trim();
    if (normalizedUpdateEmail !== undefined) update.email = normalizedUpdateEmail;
    if (data.phone !== undefined) update.phone = data.phone?.trim() || null;
    if (data.dateOfBirth !== undefined) update.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    if (data.nationality !== undefined) update.nationality = data.nationality?.trim() || null;
    if (data.source !== undefined) update.source = data.source;
    if (data.assignedCounselorId !== undefined) {
        if (data.assignedCounselorId === null) {
            if (currentUser?.role === "COUNSELOR") {
                throw AppError.forbidden("Counselors cannot unassign their students.", "FORBIDDEN");
            }
            if (currentUser?.role === "BRANCH_ADMIN") {
                throw AppError.forbidden("Branch admins cannot unassign students from their branch.", "FORBIDDEN");
            }
            if (currentUser?.role === "FRONT_DESK") {
                throw AppError.forbidden("Front desk staff cannot unassign students from their branch.", "FORBIDDEN");
            }
            update.assignedCounselorId = null;
        } else {
            const validCounselorId = await validateCounselorAssignment(data.assignedCounselorId, currentUser);
            update.assignedCounselorId = validCounselorId;
        }
    }
    if (data.notes !== undefined) update.notes = data.notes;
    if (data.academicBackground !== undefined) {
        const bg = (student.academicBackground && typeof student.academicBackground === "object")
            ? student.academicBackground
            : {};
        const incomingBg = (data.academicBackground && typeof data.academicBackground === "object")
            ? data.academicBackground
            : {};
        const isPreEnrollment = ["LEAD", "PROSPECT"].includes(student.currentStage);
        const existingLeadStage = bg.leadStage || undefined;
        update.academicBackground = {
            ...bg,
            ...incomingBg,
        };
        if (isPreEnrollment) {
            const requestedLeadStage = incomingBg.leadStage
                ? String(incomingBg.leadStage).toUpperCase().replace(/-/g, "_")
                : null;
            if (currentUser?.role === "COUNSELOR" && requestedLeadStage === "ASSIGNED" && existingLeadStage !== "ASSIGNED") {
                throw AppError.forbidden("Counselors cannot move leads into the Assigned stage.", "FORBIDDEN");
            }
            update.academicBackground.leadStage = incomingBg.leadStage || existingLeadStage;
            if (!update.academicBackground.leadStage) delete update.academicBackground.leadStage;
        } else {
            delete update.academicBackground.leadStage;
        }
    }
    if (data.financialBackground !== undefined) update.financialBackground = data.financialBackground;
    if (data.familyBackground !== undefined) update.familyBackground = data.familyBackground;
    // Handle processingType & partner consultancy updates
    if (data.processingType !== undefined) {
        update.processingType = data.processingType === "PARTNER_CONSULTANCY" ? "PARTNER_CONSULTANCY" : "SELF";
        if (update.processingType === "SELF") {
            update.partnerConsultancyId = null;
        }
    }

    if (data.referredByAgentId !== undefined) {
        if (data.referredByAgentId) {
            const agentProfile = await prisma.referralAgentProfile.findUnique({
                where: { id: data.referredByAgentId },
                select: { id: true },
            });
            if (!agentProfile) {
                throw AppError.badRequest("Invalid referral agent profile ID.", "INVALID_REFERRAL_AGENT");
            }
            update.referredByAgentId = data.referredByAgentId;
        } else {
            update.referredByAgentId = null;
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

    const updated = await prisma.student.update({
        where: { id },
        data: update,
        select: SAFE_STUDENT_SELECT,
    });
    return formatStudentRecord(updated);
};


// ─── CHANGE PIPELINE STAGE ───────────────────────────────────────────────────
const changePipelineStage = async (id, payload, changedByOrUser) => {
    const actor = typeof changedByOrUser === "object" && changedByOrUser !== null ? changedByOrUser : null;
    const changedById = actor ? (actor.userId || actor.id) : changedByOrUser;

    const {
        stage,
        leadStage,
        reasonCode,
        email,
        followUpDate,
        followUpTime,
        datetime: rawDatetime,
        durationMin = 30,
        meetingMode = "OFFICE",
        notes: followUpNotes,
    } = payload || {};

    const student = await prisma.student.findUnique({
        where: { id },
        select: {
            ...SAFE_STUDENT_SCALARS,
            assignedCounselor: { select: { id: true, branchId: true } },
        },
    });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");

    if (actor) {
        assertStudentAuthorization(student, actor, "change pipeline stage of");
    }

    if (student.isActive === false) {
        throw AppError.badRequest("Cannot modify pipeline stage of a student in Trash. Please restore the student first.", "STUDENT_IN_TRASH");
    }

    // Determine target lead stage and macro stage
    let targetLeadStage = leadStage ? String(leadStage).toUpperCase().replace(/-/g, "_") : null;
    let targetMacroStage = stage ? String(stage).toUpperCase().replace(/-/g, "_") : null;

    // Recognize lead stages passed via 'stage' field directly
    if (!targetLeadStage && targetMacroStage) {
        if (["NEW", "FOLLOW_UP", "FOLLOWUP", "CONTACTED"].includes(targetMacroStage)) {
            targetLeadStage = targetMacroStage === "NEW" ? "NEW" : "FOLLOW_UP";
            targetMacroStage = "LEAD";
        } else if (["COUNSELLING", "COUNSELING"].includes(targetMacroStage)) {
            targetLeadStage = "COUNSELLING";
            targetMacroStage = "PROSPECT";
        } else if (targetMacroStage === "ASSIGNED") {
            targetLeadStage = "ASSIGNED";
            targetMacroStage = "PROSPECT";
        } else if (targetMacroStage === "NOT_CONTRACTED") {
            targetLeadStage = "NOT_CONTRACTED";
            targetMacroStage = "LEAD";
        } else if (targetMacroStage === "INTERESTED") {
            targetLeadStage = "INTERESTED";
            targetMacroStage = "PROSPECT";
        }
    }

    if (targetLeadStage === "ASSIGNED") {
        if (actor && !["SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK"].includes(actor.role)) {
            throw AppError.forbidden("Only Front Desk officers and Admins can move leads into the Assigned stage.", "FORBIDDEN");
        }
        const targetCounselorId = payload?.assignedCounselorId || payload?.counselorId;
        if (!targetCounselorId || typeof targetCounselorId !== "string" || !targetCounselorId.trim()) {
            throw AppError.badRequest("Counselor selection is required when moving to Assigned.", "MISSING_COUNSELOR_ID");
        }
        const dateVal = payload?.appointmentDate || followUpDate;
        const timeVal = payload?.appointmentTime || followUpTime;
        const apptDatetimeStr = rawDatetime || (dateVal && timeVal
            ? `${dateVal}T${String(timeVal).length === 5 ? timeVal + ":00" : timeVal}`
            : null);
        if (!apptDatetimeStr) {
            throw AppError.badRequest("Appointment date and time are required when moving to Assigned.", "MISSING_APPOINTMENT_DATETIME");
        }
        const parsedApptDate = new Date(apptDatetimeStr);
        if (isNaN(parsedApptDate.getTime())) {
            throw AppError.badRequest("Invalid appointment date or time.", "INVALID_APPOINTMENT_DATETIME");
        }
        return assignLeadToCounselor(id, targetCounselorId.trim(), actor, {
            appointmentDatetime: parsedApptDate,
            durationMin,
            meetingMode,
            notes: followUpNotes,
        });
    }

    // Map target lead stage to macro stage if macro stage not explicitly set to something else
    if (targetLeadStage) {
        if (targetLeadStage === "NEW") {
            if (!targetMacroStage || targetMacroStage === "LEAD") {
                targetMacroStage = "LEAD";
            }
        } else if (targetLeadStage === "FOLLOW_UP") {
            // A prospect undergoing a follow-up remains at PROSPECT lifecycle; an initial lead remains at LEAD
            if (!targetMacroStage || targetMacroStage === "LEAD" || targetMacroStage === "PROSPECT") {
                targetMacroStage = student.currentStage === "PROSPECT" ? "PROSPECT" : "LEAD";
            }
        } else if (targetLeadStage === "COUNSELLING" || targetLeadStage === "INTERESTED" || targetLeadStage === "ASSIGNED") {
            if (!targetMacroStage || targetMacroStage === "LEAD" || targetMacroStage === "PROSPECT") {
                targetMacroStage = "PROSPECT";
            }
        } else if (targetLeadStage === "NOT_CONTRACTED") {
            if (!targetMacroStage || targetMacroStage === "LEAD" || targetMacroStage === "PROSPECT") {
                targetMacroStage = "LEAD";
            }
        }
    }

    // If targetLeadStage is FOLLOW_UP, require valid date and time!
    let apptDatetime = null;
    if (targetLeadStage === "FOLLOW_UP") {
        const dateStr = followUpDate || (rawDatetime ? String(rawDatetime).split("T")[0] : null);
        const timeStr = followUpTime || (rawDatetime ? String(rawDatetime).split("T")[1]?.slice(0, 5) : null);

        if (!dateStr || !timeStr) {
            throw AppError.badRequest(
                "Follow-up date and time are required when moving to Follow Up.",
                "MISSING_FOLLOWUP_DATETIME"
            );
        }

        apptDatetime = new Date(`${dateStr}T${timeStr}`);
        if (isNaN(apptDatetime.getTime())) {
            throw AppError.badRequest("Invalid follow-up date or time.", "INVALID_FOLLOWUP_DATETIME");
        }
    }

    // Validate macro stage transition if macro stage is changing
    if (targetMacroStage && targetMacroStage !== student.currentStage) {
        if (!isValidTransition(student.currentStage, targetMacroStage)) {
            throw AppError.badRequest(
                `Cannot move from ${student.currentStage} to ${targetMacroStage}. Only forward transitions or LOST are allowed.`,
                "INVALID_TRANSITION"
            );
        }
    }

    // Compare against persisted lead stage (JSONB-first precedence), NOT presentation fallback resolveLeadStage.
    // If a legacy prospect has leadStage = null, an explicit transition to COUNSELLING
    // must NOT short-circuit so the stage is actually written to the database.
    const persistedLeadStage = (
        (student.academicBackground && typeof student.academicBackground === "object"
            ? student.academicBackground.leadStage
            : null) ||
        student.leadStage ||
        null
    );
    const normalizedPersistedLeadStage = persistedLeadStage
        ? String(persistedLeadStage).toUpperCase().replace(/-/g, "_")
        : null;

    if (
        student.currentStage === targetMacroStage &&
        normalizedPersistedLeadStage === targetLeadStage &&
        !email &&
        targetLeadStage !== "FOLLOW_UP"
    ) {
        return formatStudentRecord(student);
    }

    const updateData = {};
    if (targetMacroStage && targetMacroStage !== student.currentStage) {
        updateData.currentStage = targetMacroStage;
    }

    const normalizedEmail = email?.trim()?.toLowerCase();

    // If transitioning to ENROLLED, email is mandatory so student portal credentials can be sent
    if (targetMacroStage === "ENROLLED") {
        const finalEmail = normalizedEmail || student.email;
        if (!finalEmail || !isValidEmail(finalEmail)) {
            throw AppError.badRequest(
                "A valid student email address is required to register as an enrolled student and send portal credentials.",
                "INVALID_OR_MISSING_EMAIL"
            );
        }
        if (normalizedEmail && normalizedEmail !== student.email) {
            const dup = await prisma.student.findFirst({
                where: { email: normalizedEmail, NOT: { id } },
                select: { id: true },
            });
            if (dup) {
                throw AppError.conflict("Another student already has this email address.", "DUPLICATE_EMAIL");
            }
            updateData.email = normalizedEmail;
        }

        await assertEmailNotConflictingWithStaffOrOtherStudent(
            finalEmail,
            id,
            "enroll student with this email"
        );
    } else if (normalizedEmail && normalizedEmail !== student.email) {
        const dup = await prisma.student.findFirst({
            where: { email: normalizedEmail, NOT: { id } },
            select: { id: true },
        });
        if (dup) {
            throw AppError.conflict("Another student already has this email address.", "DUPLICATE_EMAIL");
        }
        await assertEmailNotConflictingWithStaffOrOtherStudent(
            normalizedEmail,
            id,
            "update student to this email"
        );
        updateData.email = normalizedEmail;
    }

    // Prepare updated academicBackground with persisted leadStage
    const existingBg = (typeof student.academicBackground === "object" && student.academicBackground !== null)
        ? { ...student.academicBackground }
        : {};
    if (targetLeadStage) {
        existingBg.leadStage = targetLeadStage;
    } else if (targetMacroStage && !["LEAD", "PROSPECT"].includes(targetMacroStage)) {
        delete existingBg.leadStage;
    }
    const updatedBg = existingBg;
    updateData.academicBackground = updatedBg;

    // Execute stage change, appointment + follow-up log upsert, and history inside one atomic transaction
    const txResult = await prisma.$transaction(async (tx) => {
        let appointmentRecord = null;
        let followUpLogRecord = null;
        let followUpAction = null; // "SCHEDULED" | "RESCHEDULED" | null (no-op resubmission)

        if (targetLeadStage === "FOLLOW_UP" && apptDatetime) {
            // Idempotency rule: a student has at most ONE pending (SCHEDULED) pipeline FOLLOW_UP
            // appointment. Re-submissions update it in place; a different datetime is a reschedule.
            const existingAppt = await tx.appointment.findFirst({
                where: { studentId: id, type: "FOLLOW_UP", status: "SCHEDULED" },
                orderBy: { createdAt: "desc" },
            });

            const parsedDuration = durationMin ? parseInt(durationMin, 10) : 30;

            if (existingAppt) {
                const datetimeChanged =
                    new Date(existingAppt.datetime).getTime() !== apptDatetime.getTime();
                appointmentRecord = await tx.appointment.update({
                    where: { id: existingAppt.id },
                    data: {
                        datetime: apptDatetime,
                        notes: followUpNotes || existingAppt.notes,
                        meetingMode: meetingMode || existingAppt.meetingMode || "OFFICE",
                        durationMin: parsedDuration || existingAppt.durationMin,
                        // Preserve existing counselor; only backfill when previously unassigned
                        ...(existingAppt.counselorId ? {} : { counselorId: student.assignedCounselorId || null }),
                    },
                });
                followUpAction = datetimeChanged ? "RESCHEDULED" : null;
            } else {
                appointmentRecord = await tx.appointment.create({
                    data: {
                        studentId: id,
                        counselorId: student.assignedCounselorId,
                        datetime: apptDatetime,
                        durationMin: parsedDuration,
                        status: "SCHEDULED",
                        type: "FOLLOW_UP",
                        meetingMode: meetingMode || "OFFICE",
                        notes: followUpNotes || "Lead follow-up scheduled during stage transition to Follow Up",
                    },
                });
                followUpAction = "SCHEDULED";
            }

            // Synchronize the Follow-Ups page data source (CommunicationLog.nextFollowUpAt).
            // The log is linked to the appointment by a stable reference marker so that
            // re-submissions and reschedules update the same row instead of duplicating it.
            if (tx.communicationLog) {
                const refMarker = buildFollowUpRefMarker(appointmentRecord.id);
                const logContent = buildFollowUpLogContent(apptDatetime, followUpNotes, refMarker);
                const channel = mapMeetingModeToChannel(appointmentRecord.meetingMode);

                const existingLog = await tx.communicationLog.findFirst({
                    where: { studentId: id, content: { contains: refMarker } },
                });

                if (existingLog) {
                    followUpLogRecord = await tx.communicationLog.update({
                        where: { id: existingLog.id },
                        data: { nextFollowUpAt: apptDatetime, channel, content: logContent },
                    });
                } else {
                    followUpLogRecord = await tx.communicationLog.create({
                        data: {
                            studentId: id,
                            authorId: changedById || null,
                            channel,
                            direction: "OUTBOUND",
                            content: logContent,
                            nextFollowUpAt: apptDatetime,
                        },
                    });
                }
            }
        }

        const updatedStudent = await tx.student.update({
            where: { id },
            data: updateData,
            select: SAFE_STUDENT_SELECT,
        });

        await tx.pipelineStageHistory.create({
            data: {
                studentId: id,
                stage: targetMacroStage || student.currentStage,
                changedById,
                reasonCode: targetMacroStage === "LOST" ? reasonCode : (targetLeadStage || null),
            },
        });

        return {
            updatedStudent,
            appointmentRecord,
            followUpLogRecord,
            followUpAction,
        };
    });

    const finalStudent = {
        ...formatStudentRecord(txResult.updatedStudent),
        leadStage: targetLeadStage || resolveLeadStage(txResult.updatedStudent),
        followUpAppointment: txResult.appointmentRecord,
        followUpLog: txResult.followUpLogRecord,
    };

    // Refresh appointment reminders best-effort OUTSIDE the transaction (a failure here, e.g.
    // a missing AppointmentReminder table, must never abort or poison the stage change).
    if (txResult.appointmentRecord && txResult.followUpAction) {
        refreshFollowUpReminders(txResult.appointmentRecord).catch(() => {});
    }

    // When a lead becomes an enrolled student, provision the portal account and
    // email the welcome message with temporary credentials.
    if (targetMacroStage === "ENROLLED") {
        const provisionResult = await provisionPortalAndSendWelcome(finalStudent);
        return { ...finalStudent, _portalProvision: provisionResult };
    }

    // Preserve student confirmation email for appointments asynchronously
    // Only on a genuine create/reschedule — identical re-submissions send nothing.
    if (txResult.appointmentRecord && txResult.followUpAction && student.email) {
        const verb = txResult.followUpAction === "RESCHEDULED" ? "rescheduled" : "scheduled";
        sendNotificationEmail({
            to: student.email,
            subject: `Appointment ${verb === "rescheduled" ? "Rescheduled" : "Scheduled"} — DreamSky Education Consultancy`,
            body: `Hi ${student.firstName},\n\nYour follow-up appointment has been ${verb} for ${new Date(txResult.appointmentRecord.datetime).toISOString()}.\n\nDreamSky Education Consultancy`,
        }).catch(() => {});
    }

    // Notify counselor or designated branch staff asynchronously outside the transaction
    if (txResult.appointmentRecord && txResult.followUpAction) {
        let recipientUserId = student.assignedCounselorId;
        if (!recipientUserId) {
            const branchId =
                (typeof student.academicBackground === "object" && student.academicBackground?.branchId) ||
                (typeof finalStudent.academicBackground === "object" && finalStudent.academicBackground?.branchId) ||
                null;
            if (branchId) {
                const branchStaff = await prisma.user.findMany({
                    where: {
                        branchId,
                        status: "ACTIVE",
                        role: { in: ["BRANCH_ADMIN", "FRONT_DESK"] },
                    },
                    select: { id: true, role: true, createdAt: true },
                    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
                });
                const designated =
                    branchStaff.find((s) => s.role === "BRANCH_ADMIN") ||
                    branchStaff.find((s) => s.role === "FRONT_DESK") ||
                    branchStaff[0];
                recipientUserId = designated?.id || null;
            }
        }

        if (recipientUserId) {
            const studentName = [student.firstName, student.lastName].filter(Boolean).join(" ");
            await queueFollowUpNotification({
                recipientUserId,
                action: txResult.followUpAction,
                appointment: txResult.appointmentRecord,
                studentName,
                datetime: txResult.appointmentRecord.datetime,
            }).catch(() => {});
        } else {
            console.warn(`[StudentService] Follow-up appointment scheduled for unassigned student ${student.id} without determinable branch. Notification safely skipped.`);
        }
    }

    return finalStudent;
};

// ─── DELETE / DEACTIVATE ───────────────────────────────────────────────────────
const deleteStudent = async (id) => {
    const student = await prisma.student.findUnique({ where: { id }, select: { id: true } });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");

    // Guard against permanent deletion of clients with associated business or financial history
    const [
        paymentsCount,
        commissionsCount,
        applicationsCount,
        documentsCount,
        enrollmentsCount,
        appointmentsCount,
        communicationLogsCount,
        attendanceRecordsCount,
        testScoresCount,
        userAccount,
        recommendationResultsCount,
    ] = await Promise.all([
        prisma.payment.count({ where: { studentId: id } }),
        prisma.commission.count({ where: { studentId: id } }),
        prisma.application.count({ where: { studentId: id } }),
        prisma.document.count({ where: { studentId: id } }),
        prisma.enrollment.count({ where: { studentId: id } }),
        prisma.appointment.count({ where: { studentId: id } }),
        prisma.communicationLog.count({ where: { studentId: id } }),
        prisma.attendanceRecord.count({ where: { studentId: id } }),
        prisma.testScore.count({ where: { studentId: id } }),
        prisma.user.findFirst({ where: { studentId: id } }),
        prisma.recommendationResult.count({ where: { recordId: id } }),
    ]);

    const dependencies = [];
    if (paymentsCount > 0) dependencies.push(`${paymentsCount} payment(s)`);
    if (commissionsCount > 0) dependencies.push(`${commissionsCount} commission(s)`);
    if (applicationsCount > 0) dependencies.push(`${applicationsCount} application(s)`);
    if (documentsCount > 0) dependencies.push(`${documentsCount} document(s)`);
    if (enrollmentsCount > 0) dependencies.push(`${enrollmentsCount} enrollment(s)`);
    if (appointmentsCount > 0) dependencies.push(`${appointmentsCount} appointment(s)`);
    if (communicationLogsCount > 0) dependencies.push(`${communicationLogsCount} communication log(s)`);
    if (attendanceRecordsCount > 0) dependencies.push(`${attendanceRecordsCount} attendance record(s)`);
    if (testScoresCount > 0) dependencies.push(`${testScoresCount} test score(s)`);
    if (userAccount) dependencies.push("linked portal user account");
    if (recommendationResultsCount > 0) dependencies.push(`${recommendationResultsCount} recommendation snapshot(s)`);

    if (dependencies.length > 0) {
        throw AppError.conflict(
            `Cannot permanently delete student '${id}' with associated business history: ${dependencies.join(", ")}. Permanent deletion of related client history is prohibited.`,
            "CANNOT_DELETE_STUDENT_WITH_DEPENDENCIES"
        );
    }

    // Only allow hard delete if the student has zero dependencies
    await prisma.student.delete({ where: { id } });
    return { id, deleted: true };
};

// ─── SOFT DELETE / TRASH ───────────────────────────────────────────────────────
const softDeleteStudent = async (id, currentUser = null, reason = null) => {
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }
    if (!["SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK"].includes(currentUser.role)) {
        throw AppError.forbidden("You are not authorized to move students to Trash.", "FORBIDDEN");
    }

    const trimmedReason = typeof reason === "string" ? reason.trim() : "";
    if (!trimmedReason) {
        throw AppError.badRequest("A non-empty reason is required to move a record to Trash.", "MISSING_TRASH_REASON");
    }

    const student = await prisma.student.findUnique({
        where: { id },
        select: AUTHZ_STUDENT_SELECT,
    });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");

    assertStudentAuthorization(student, currentUser, "delete");

    if (student.isActive === false) {
        throw AppError.conflict("Student is already in Trash.", "STUDENT_ALREADY_TRASHED");
    }

    // ── 5-Guard Trash Protection (Pre-flight checks) ──
    // Guard 1: Only LEAD and PROSPECT (or legacy COUNSELING) can be trashed
    const isLeadOrProspect = ["LEAD", "PROSPECT", "COUNSELING", "COUNSELLING"].includes(student.currentStage);
    if (!isLeadOrProspect) {
        throw AppError.badRequest(
            `Cannot move student to Trash: record is at stage '${student.currentStage}'. Only prospective leads and counselling prospects can be trashed. Enrolled students and active cases cannot be trashed.`,
            "CANNOT_TRASH_ENROLLED_STUDENT"
        );
    }

    const actorId = currentUser.userId || currentUser.id || null;
    const currentLeadStage = resolveLeadStage(student);
    const existingBg = (student.academicBackground && typeof student.academicBackground === "object")
        ? student.academicBackground
        : {};
    const updatedBg = {
        ...existingBg,
        previousLeadStage: currentLeadStage,
        previousAssignedCounselorId: student.assignedCounselorId || null,
        trashReason: trimmedReason,
        trashedAt: new Date().toISOString(),
        trashedById: actorId,
    };

    const result = await prisma.$transaction(async (tx) => {
        // Re-check student record and stage inside the atomic transaction if available
        const findStudentFn = typeof tx?.student?.findUnique === "function" 
            ? tx.student.findUnique.bind(tx.student)
            : typeof prisma.student?.findUnique === "function"
            ? prisma.student.findUnique.bind(prisma.student)
            : null;

        if (findStudentFn) {
            const txStudent = await findStudentFn({
                where: { id },
                select: { id: true, currentStage: true, isActive: true },
            });
            if (txStudent) {
                if (txStudent.isActive === false) {
                    throw AppError.conflict("Student is already in Trash.", "STUDENT_ALREADY_TRASHED");
                }
                const txIsLeadOrProspect = ["LEAD", "PROSPECT", "COUNSELING", "COUNSELLING"].includes(txStudent.currentStage);
                if (!txIsLeadOrProspect) {
                    throw AppError.badRequest(
                        `Cannot move student to Trash: record is at stage '${txStudent.currentStage}'. Only prospective leads and counselling prospects can be trashed. Enrolled students and active cases cannot be trashed.`,
                        "CANNOT_TRASH_ENROLLED_STUDENT"
                    );
                }
            }
        }

        // Guard 2: Active university application check (re-validated inside transaction)
        const appClient = tx.application || prisma.application;
        if (appClient && typeof appClient.count === "function") {
            const activeAppCount = await appClient.count({
                where: { studentId: id, status: { notIn: ["REJECTED", "WITHDRAWN"] } },
            });
            if (activeAppCount > 0) {
                throw AppError.conflict(
                    `Cannot move student to Trash: ${activeAppCount} active university application(s) exist.`,
                    "STUDENT_HAS_ACTIVE_APPLICATIONS"
                );
            }
        }

        // Guard 3: Active visa case check (re-validated inside transaction using valid VisaStatus enum)
        const visaClient = tx.visaCase || prisma.visaCase;
        if (visaClient && typeof visaClient.count === "function") {
            const activeVisaCount = await visaClient.count({
                where: {
                    application: { studentId: id },
                    status: { in: ["PREPARING", "SUBMITTED", "APPROVED", "RESUBMITTING"] },
                },
            });
            if (activeVisaCount > 0) {
                throw AppError.conflict(
                    `Cannot move student to Trash: ${activeVisaCount} active or approved visa case(s) exist.`,
                    "STUDENT_HAS_ACTIVE_VISA_CASES"
                );
            }
        }

        // Guard 4: Outstanding payment obligations check (PENDING, PARTIAL, OVERDUE inside transaction)
        const paymentClient = tx.payment || prisma.payment;
        if (paymentClient && typeof paymentClient.count === "function") {
            const activePaymentCount = await paymentClient.count({
                where: { studentId: id, status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } },
            });
            if (activePaymentCount > 0) {
                throw AppError.conflict(
                    `Cannot move student to Trash: ${activePaymentCount} outstanding payment record(s) exist.`,
                    "STUDENT_HAS_ACTIVE_PAYMENTS"
                );
            }
        }

        // Guard 5: Active class enrollment check (re-validated inside transaction)
        const enrollmentClient = tx.enrollment || prisma.enrollment;
        if (enrollmentClient && typeof enrollmentClient.count === "function") {
            const activeEnrollmentCount = await enrollmentClient.count({
                where: { studentId: id, class: { isActive: true } },
            });
            if (activeEnrollmentCount > 0) {
                throw AppError.conflict(
                    `Cannot move student to Trash: student is actively enrolled in ${activeEnrollmentCount} class(es).`,
                    "STUDENT_HAS_ACTIVE_ENROLLMENTS"
                );
            }
        }
        const updateRes = await tx.student.updateMany({
            where: { id, isActive: true },
            data: {
                isActive: false,
                academicBackground: updatedBg,
            },
        });

        if (updateRes.count === 0) {
            throw AppError.conflict("Student is already in Trash.", "STUDENT_ALREADY_TRASHED");
        }

        // Suspend linked portal user account if any and revoke all refresh tokens
        if (tx.user && typeof tx.user.findFirst === "function") {
            const linkedUser = await tx.user.findFirst({ where: { studentId: id } });
            if (linkedUser) {
                await tx.user.update({
                    where: { id: linkedUser.id },
                    data: { status: "SUSPENDED" },
                });
                if (tx.refreshToken && typeof tx.refreshToken.deleteMany === "function") {
                    await tx.refreshToken.deleteMany({
                        where: { userId: linkedUser.id },
                    });
                }
            }
        }

        await tx.auditLog.create({
            data: {
                actorId,
                entity: "Student",
                entityId: id,
                field: "isActive",
                oldValue: "true",
                newValue: "false",
            },
        });

        await tx.auditLog.create({
            data: {
                actorId,
                entity: "Student",
                entityId: id,
                field: "trashReason",
                oldValue: null,
                newValue: trimmedReason,
            },
        });

        return {
            id,
            isActive: false,
            trashReason: trimmedReason,
            trashedAt: updatedBg.trashedAt,
            trashedById: actorId,
        };
    });

    return result;
};

// ─── RESTORE FROM TRASH ───────────────────────────────────────────────────────
const restoreStudent = async (id, currentUser = null) => {
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }
    if (!["SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK"].includes(currentUser.role)) {
        throw AppError.forbidden("You are not authorized to restore students from Trash.", "FORBIDDEN");
    }

    const student = await prisma.student.findUnique({
        where: { id },
        select: AUTHZ_STUDENT_SELECT,
    });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");

    assertStudentAuthorization(student, currentUser, "restore");

    if (student.isActive === true) {
        throw AppError.conflict("Student is already active.", "STUDENT_ALREADY_ACTIVE");
    }

    const actorId = currentUser.userId || currentUser.id || null;
    const existingBg = (student.academicBackground && typeof student.academicBackground === "object")
        ? student.academicBackground
        : {};

    const priorTrashReason = existingBg.trashReason || student.trashReason || null;
    const priorTrashedAt = existingBg.trashedAt || student.trashedAt || null;
    const restoredLeadStage = existingBg.previousLeadStage || "NEW";
    const restoredCounselorId = existingBg.previousAssignedCounselorId !== undefined
        ? existingBg.previousAssignedCounselorId
        : (student.assignedCounselorId || null);

    const updatedBg = {
        ...existingBg,
        leadStage: restoredLeadStage,
        lastTrashReason: priorTrashReason,
        lastTrashedAt: priorTrashedAt,
        restoredAt: new Date().toISOString(),
        restoredById: actorId,
    };
    delete updatedBg.trashReason;
    delete updatedBg.trashedAt;
    delete updatedBg.trashedById;
    delete updatedBg.previousLeadStage;
    delete updatedBg.previousAssignedCounselorId;

    const result = await prisma.$transaction(async (tx) => {
        const updateRes = await tx.student.updateMany({
            where: { id, isActive: false },
            data: {
                isActive: true,
                assignedCounselorId: restoredCounselorId,
                academicBackground: updatedBg,
            },
        });

        if (updateRes.count === 0) {
            throw AppError.conflict("Student is already active.", "STUDENT_ALREADY_ACTIVE");
        }

        // Reactivate linked portal user account if suspended
        if (tx.user && typeof tx.user.findFirst === "function") {
            const linkedUser = await tx.user.findFirst({ where: { studentId: id } });
            if (linkedUser && linkedUser.status === "SUSPENDED") {
                await tx.user.update({
                    where: { id: linkedUser.id },
                    data: { status: "ACTIVE" },
                });
            }
        }

        await tx.auditLog.create({
            data: {
                actorId,
                entity: "Student",
                entityId: id,
                field: "isActive",
                oldValue: "false",
                newValue: "true",
            },
        });

        await tx.auditLog.create({
            data: {
                actorId,
                entity: "Student",
                entityId: id,
                field: "restoredFromTrash",
                oldValue: priorTrashReason,
                newValue: "true",
            },
        });

        return {
            id,
            isActive: true,
            currentStage: student.currentStage,
            leadStage: resolveLeadStage({ ...student, academicBackground: updatedBg }),
            restoredAt: updatedBg.restoredAt,
        };
    });

    return result;
};

// ─── ASSIGN LEAD TO COUNSELOR ─────────────────────────────────────────────────
const assignLeadToCounselor = async (id, counselorId, currentUser, options = {}) => {
    if (!currentUser) throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    if (!["SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK"].includes(currentUser.role)) {
        throw AppError.forbidden("You are not authorized to assign leads to counselors.", "FORBIDDEN");
    }
    if (!counselorId || typeof counselorId !== "string" || !counselorId.trim()) {
        throw AppError.badRequest("counselorId is required.", "MISSING_COUNSELOR_ID");
    }
    const targetCounselorId = counselorId.trim();

    let apptDatetime = null;
    if (options?.appointmentDatetime instanceof Date && !isNaN(options.appointmentDatetime.getTime())) {
        apptDatetime = options.appointmentDatetime;
    } else if (options?.datetime || (options?.appointmentDate && options?.appointmentTime)) {
        const dtStr = options.datetime || `${options.appointmentDate}T${String(options.appointmentTime).length === 5 ? options.appointmentTime + ":00" : options.appointmentTime}`;
        const parsed = new Date(dtStr);
        if (isNaN(parsed.getTime())) {
            throw AppError.badRequest("Invalid appointment date or time.", "INVALID_APPOINTMENT_DATETIME");
        }
        apptDatetime = parsed;
    }
    const parsedDuration = options?.durationMin ? parseInt(options.durationMin, 10) : 30;
    const effectiveMeetingMode = options?.meetingMode || "OFFICE";
    const effectiveNotes = typeof options?.notes === "string" && options.notes.trim() ? options.notes.trim() : null;

    const student = await prisma.student.findUnique({
        where: { id },
        select: {
            ...AUTHZ_STUDENT_SELECT,
            currentStage: true,
            firstName: true,
            lastName: true,
        },
    });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");
    if (student.isActive === false) throw AppError.badRequest("Cannot assign counselor to a student in Trash.", "STUDENT_IN_TRASH");

    assertStudentAuthorization(student, currentUser, "assign counselor to");

    const counselor = await prisma.user.findFirst({
        where: { id: targetCounselorId, role: "COUNSELOR", status: "ACTIVE" },
    });
    if (!counselor) {
        throw AppError.badRequest("Selected counselor was not found or is inactive.", "INVALID_COUNSELOR");
    }

    if (currentUser.role !== "SUPER_ADMIN") {
        const studentBranch = resolveStudentBranchId(student) || currentUser.branchId;
        if (studentBranch && counselor.branchId && studentBranch !== counselor.branchId) {
            throw AppError.forbidden("Counselor does not belong to the lead's branch.", "CROSS_BRANCH_ASSIGNMENT_FORBIDDEN");
        }
    }

    const actorId = currentUser.userId || currentUser.id;
    const actorName = `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim() || currentUser.email || actorId;
    const previousCounselorId = student.assignedCounselorId || null;

    const existingBg = (student.academicBackground && typeof student.academicBackground === "object") ? { ...student.academicBackground } : {};
    const updatedBg = {
        ...existingBg,
        leadStage: "ASSIGNED",
        assignedById: actorId,
        assignedByName: actorName,
        assignedAt: new Date().toISOString(),
        previousAssignedCounselorId: previousCounselorId,
    };

    const targetMacroStage = student.currentStage === "LEAD" ? "PROSPECT" : student.currentStage;

    const txResult = await prisma.$transaction(async (tx) => {
        let appointmentRecord = null;

        if (apptDatetime && tx.appointment) {
            const existingAppt = await tx.appointment.findFirst({
                where: { studentId: id, type: "INITIAL_CONSULTATION", status: "SCHEDULED" },
                orderBy: { createdAt: "desc" },
            });

            const existingLeadStage = existingBg?.leadStage
                ? String(existingBg.leadStage).toUpperCase().replace(/-/g, "_")
                : null;

            if (
                existingAppt &&
                previousCounselorId === targetCounselorId &&
                existingLeadStage === "ASSIGNED" &&
                new Date(existingAppt.datetime).getTime() === apptDatetime.getTime()
            ) {
                throw AppError.conflict(
                    "This lead is already assigned to the selected counselor at this appointment time.",
                    "DUPLICATE_ASSIGNMENT"
                );
            }

            // Check counselor scheduling conflict against other SCHEDULED appointments
            const apptEnd = new Date(apptDatetime.getTime() + parsedDuration * 60 * 1000);
            const counselorAppts = await tx.appointment.findMany({
                where: {
                    counselorId: targetCounselorId,
                    status: "SCHEDULED",
                    datetime: { lt: apptEnd },
                    ...(existingAppt ? { id: { not: existingAppt.id } } : {}),
                },
                select: { id: true, datetime: true, durationMin: true },
            });
            for (const other of counselorAppts) {
                const otherEnd = new Date(new Date(other.datetime).getTime() + (other.durationMin || 30) * 60 * 1000);
                if (otherEnd > apptDatetime) {
                    throw AppError.conflict(
                        `Counselor already has a conflicting appointment at ${new Date(other.datetime).toISOString()}.`,
                        "COUNSELOR_CONFLICT"
                    );
                }
            }

            if (existingAppt) {
                appointmentRecord = await tx.appointment.update({
                    where: { id: existingAppt.id },
                    data: {
                        counselorId: targetCounselorId,
                        datetime: apptDatetime,
                        durationMin: parsedDuration,
                        meetingMode: effectiveMeetingMode,
                        notes: effectiveNotes !== null ? effectiveNotes : existingAppt.notes,
                    },
                });
            } else {
                appointmentRecord = await tx.appointment.create({
                    data: {
                        studentId: id,
                        counselorId: targetCounselorId,
                        datetime: apptDatetime,
                        durationMin: parsedDuration,
                        status: "SCHEDULED",
                        type: "INITIAL_CONSULTATION",
                        meetingMode: effectiveMeetingMode,
                        notes: effectiveNotes || "Initial consultation scheduled during counselor assignment",
                    },
                });
            }
        }

        const updatedStudent = await tx.student.update({
            where: { id },
            data: {
                assignedCounselorId: targetCounselorId,
                currentStage: targetMacroStage,
                academicBackground: updatedBg,
            },
            select: SAFE_STUDENT_SELECT,
        });

        await tx.pipelineStageHistory.create({
            data: {
                studentId: id,
                stage: targetMacroStage,
                changedById: actorId,
                reasonCode: "ASSIGNED",
            },
        });

        await tx.auditLog.create({
            data: {
                actorId,
                entity: "Student",
                entityId: id,
                field: "LEAD_ASSIGNED",
                oldValue: previousCounselorId,
                newValue: targetCounselorId,
            },
        });

        return { updatedStudent, appointmentRecord, counselorChanged: previousCounselorId !== targetCounselorId };
    });

    // Refresh appointment reminders best-effort OUTSIDE the transaction
    if (txResult.appointmentRecord) {
        refreshFollowUpReminders(txResult.appointmentRecord).catch(() => {});
    }

    // In-app notification to the assigned counselor (best effort)
    if (txResult.counselorChanged && prisma.notification && typeof prisma.notification.create === "function") {
        prisma.notification.create({
            data: {
                recipientUserId: targetCounselorId,
                channel: "IN_APP",
                subject: "New Lead Assigned",
                body: `Lead ${student.firstName} ${student.lastName} has been assigned to you by ${actorName}.`,
                status: "QUEUED",
                payload: { studentId: id, assignedById: actorId },
            },
        }).catch(() => {});
    }

    return {
        ...formatStudentRecord(txResult.updatedStudent),
        leadStage: "ASSIGNED",
        appointment: txResult.appointmentRecord || null,
    };
};

// ─── CROSS-BRANCH TRANSFER ────────────────────────────────────────────────────
const transferBranch = async (id, body, currentUser) => {
    if (!currentUser) throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    if (currentUser.role !== "SUPER_ADMIN") {
        throw AppError.forbidden("Only SUPER_ADMIN can execute cross-branch transfers.", "FORBIDDEN");
    }

    const destBranchId = typeof body?.destinationBranchId === "string" ? body.destinationBranchId.trim() : null;
    if (!destBranchId) {
        throw AppError.badRequest("destinationBranchId is required.", "MISSING_DESTINATION_BRANCH");
    }

    const destBranch = await prisma.branch.findUnique({
        where: { id: destBranchId },
    });
    if (!destBranch || destBranch.isActive === false) {
        throw AppError.badRequest("Destination branch does not exist or is inactive.", "INVALID_DESTINATION_BRANCH");
    }

    const student = await prisma.student.findUnique({
        where: { id },
        select: {
            ...AUTHZ_STUDENT_SELECT,
            currentStage: true,
            firstName: true,
            lastName: true,
        },
    });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");
    if (student.isActive === false) throw AppError.badRequest("Cannot transfer a student in Trash.", "STUDENT_IN_TRASH");

    const currentBranchId = resolveStudentBranchId(student);
    if (currentBranchId && currentBranchId === destBranchId) {
        throw AppError.badRequest("Destination branch must differ from current branch.", "IDENTICAL_DESTINATION_BRANCH");
    }

    let newCounselorIdToSet = student.assignedCounselorId;
    const rawNewCounselorId = body.newAssignedCounselorId;

    if (rawNewCounselorId !== undefined) {
        if (rawNewCounselorId === null || rawNewCounselorId === "") {
            newCounselorIdToSet = null;
        } else {
            const trimmedCounselorId = String(rawNewCounselorId).trim();
            const newCounselor = await prisma.user.findFirst({
                where: { id: trimmedCounselorId, role: "COUNSELOR", status: "ACTIVE" },
            });
            if (!newCounselor) {
                throw AppError.badRequest("Selected replacement counselor does not exist or is inactive.", "INVALID_COUNSELOR");
            }
            if (newCounselor.branchId !== destBranchId) {
                throw AppError.badRequest("Replacement counselor does not belong to the destination branch.", "COUNSELOR_BRANCH_MISMATCH");
            }
            newCounselorIdToSet = trimmedCounselorId;
        }
    } else if (student.assignedCounselorId) {
        const currentCounselor = await prisma.user.findUnique({
            where: { id: student.assignedCounselorId },
            select: { id: true, branchId: true },
        });
        if (currentCounselor?.branchId !== destBranchId) {
            throw AppError.badRequest(
                "Current assigned counselor does not belong to the destination branch. Please provide newAssignedCounselorId or null to unassign.",
                "COUNSELOR_BRANCH_MISMATCH"
            );
        }
    }

    const actorId = currentUser.userId || currentUser.id;
    const existingBg = (student.academicBackground && typeof student.academicBackground === "object") ? { ...student.academicBackground } : {};
    const updatedBg = {
        ...existingBg,
        branchId: destBranchId,
        transferredFromBranchId: currentBranchId || null,
        transferredAt: new Date().toISOString(),
        transferredById: actorId,
    };

    const counselorChanged = student.assignedCounselorId !== newCounselorIdToSet;

    const txResult = await prisma.$transaction(async (tx) => {
        const updateData = {
            academicBackground: updatedBg,
        };
        if (counselorChanged) {
            updateData.assignedCounselorId = newCounselorIdToSet;
        }

        const updatedStudent = await tx.student.update({
            where: { id },
            data: updateData,
            select: SAFE_STUDENT_SELECT,
        });

        await tx.auditLog.create({
            data: {
                actorId,
                entity: "Student",
                entityId: id,
                field: "BRANCH_TRANSFER",
                oldValue: currentBranchId || null,
                newValue: destBranchId,
            },
        });

        if (counselorChanged) {
            await tx.auditLog.create({
                data: {
                    actorId,
                    entity: "Student",
                    entityId: id,
                    field: "LEAD_ASSIGNED",
                    oldValue: student.assignedCounselorId || null,
                    newValue: newCounselorIdToSet,
                },
            });
        }

        return updatedStudent;
    });

    return formatStudentRecord(txResult);
};

// ─── LIST TRASH ───────────────────────────────────────────────────────────────
const listTrash = async (query = {}, currentUser = null) => {
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }
    if (!["SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK"].includes(currentUser.role)) {
        throw AppError.forbidden("You are not authorized to view Trash.", "FORBIDDEN");
    }
    if (currentUser.role === "FRONT_DESK") {
        const requestedStages = typeof query.stageIn === "string"
            ? query.stageIn.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
            : [];
        const allowedLeadStages = new Set(["LEAD", "PROSPECT"]);
        if (requestedStages.length === 0 || requestedStages.some((s) => !allowedLeadStages.has(s))) {
            throw AppError.forbidden("Front Desk is not authorized for unrestricted Trash management.", "FORBIDDEN");
        }
    }
    return listStudents({ type: "all", ...query, isActive: false }, currentUser);
};

// ─── TIMELINE ─────────────────────────────────────────────────────────────────
const getTimeline = async (id, currentUser = null) => {
    const student = await prisma.student.findUnique({
        where: { id },
        select: AUTHZ_STUDENT_SELECT,
    });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");

    if (currentUser) {
        try {
            assertStudentAuthorization(student, currentUser, "view timeline of");
        } catch {
            throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");
        }
    }

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
    listTrash,
    updateStudent,
    changePipelineStage,
    deleteStudent,
    softDeleteStudent,
    restoreStudent,
    assignLeadToCounselor,
    transferBranch,
    getTimeline,
    provisionPortalAndSendWelcome,
    assertStudentAuthorization,
    resolveStudentBranchId,
    resolveLeadStage,
};
