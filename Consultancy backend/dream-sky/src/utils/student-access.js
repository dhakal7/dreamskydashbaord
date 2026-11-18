/**
 * Server-side student data access control.
 *
 * Rules:
 *   SUPER_ADMIN / BRANCH_ADMIN / FRONT_DESK → all students
 *   COUNSELOR → only students where assignedCounselorId === user.userId
 *   STUDENT   → only their own record (user.studentId)
 *   any other role → denied
 *
 * Never derives authorization from client-supplied query/body values.
 */
const prisma = require("../prisma");
const AppError = require("./apiError");

const FULL_ACCESS_ROLES = new Set(["SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK"]);

const hasFullStudentAccess = (user) => !!user && FULL_ACCESS_ROLES.has(user.role);

/** Pure check on an already-loaded student ({ id, assignedCounselorId }). */
const canAccessStudent = (user, student) => {
    if (!user || !student) return false;
    if (hasFullStudentAccess(user)) return true;
    if (user.role === "COUNSELOR") return !!user.userId && student.assignedCounselorId === user.userId;
    if (user.role === "STUDENT") return !!user.studentId && student.id === user.studentId;
    return false;
};

const forbidden = () => AppError.forbidden("You are not authorised to access this student's records.", "FORBIDDEN");

/** Throws 403 if the loaded student is not accessible to the user. */
const assertCanAccessStudent = (user, student) => {
    if (!canAccessStudent(user, student)) throw forbidden();
};

/** Loads the student by id (404 if missing) and asserts access. */
const assertStudentAccessById = async (user, studentId) => {
    if (hasFullStudentAccess(user)) return;
    if (!studentId) throw forbidden();
    const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { id: true, assignedCounselorId: true },
    });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");
    assertCanAccessStudent(user, student);
};

/**
 * Prisma `where` fragment restricting a Student relation for the caller,
 * or null when no restriction applies (full-access roles).
 */
const studentScopeFilter = (user) => {
    if (hasFullStudentAccess(user)) return null;
    if (user?.role === "COUNSELOR") return { assignedCounselorId: user.userId };
    if (user?.role === "STUDENT") return { id: user.studentId || "__none__" };
    return { id: "__none__" };
};

/** Asserts access to the student owning an application. Missing records fall through (service returns 404). */
const assertApplicationAccess = async (user, applicationId) => {
    if (hasFullStudentAccess(user)) return;
    const app = await prisma.application.findUnique({
        where: { id: applicationId },
        select: { student: { select: { id: true, assignedCounselorId: true } } },
    });
    if (!app) return;
    assertCanAccessStudent(user, app.student);
};

/** Asserts access to the student owning a visa case. Missing records fall through (service returns 404). */
const assertVisaCaseAccess = async (user, visaCaseId) => {
    if (hasFullStudentAccess(user)) return;
    const vc = await prisma.visaCase.findUnique({
        where: { id: visaCaseId },
        select: { application: { select: { student: { select: { id: true, assignedCounselorId: true } } } } },
    });
    if (!vc) return;
    assertCanAccessStudent(user, vc.application?.student);
};

/** Asserts access to the student owning a document. Missing records fall through (service returns 404). */
const assertDocumentAccess = async (user, documentId) => {
    if (hasFullStudentAccess(user)) return;
    const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { student: { select: { id: true, assignedCounselorId: true } } },
    });
    if (!doc) return;
    assertCanAccessStudent(user, doc.student);
};

/** Asserts access to the student owning a payment. Missing records fall through (service returns 404). */
const assertPaymentAccess = async (user, paymentId) => {
    if (hasFullStudentAccess(user)) return;
    const pay = await prisma.payment.findUnique({
        where: { id: paymentId },
        select: { student: { select: { id: true, assignedCounselorId: true } } },
    });
    if (!pay) return;
    assertCanAccessStudent(user, pay.student);
};

/**
 * Appointments: counselors may access appointments they host OR that belong
 * to a student assigned to them. Missing records fall through (service returns 404).
 */
const assertAppointmentAccess = async (user, appointmentId) => {
    if (hasFullStudentAccess(user)) return;
    const appt = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: { counselorId: true, student: { select: { id: true, assignedCounselorId: true } } },
    });
    if (!appt) return;
    if (user?.role === "COUNSELOR" && appt.counselorId && appt.counselorId === user.userId) return;
    assertCanAccessStudent(user, appt.student);
};

/** Prisma `where` fragment for appointment lists, or null for full-access roles. */
const appointmentScopeFilter = (user) => {
    if (hasFullStudentAccess(user)) return null;
    if (user?.role === "COUNSELOR") {
        return { OR: [{ counselorId: user.userId }, { student: { assignedCounselorId: user.userId } }] };
    }
    return { student: studentScopeFilter(user) };
};

/** Asserts access to the student owning a follow-up / communication log. Missing records fall through (service returns 404). */
const assertFollowUpAccess = async (user, followUpId) => {
    if (hasFullStudentAccess(user)) return;
    const log = await prisma.communicationLog.findUnique({
        where: { id: followUpId },
        select: { student: { select: { id: true, assignedCounselorId: true } } },
    });
    if (!log) return;
    assertCanAccessStudent(user, log.student);
};

module.exports = {
    assertFollowUpAccess,
    assertPaymentAccess,
    assertAppointmentAccess,
    appointmentScopeFilter,
    assertApplicationAccess,
    assertVisaCaseAccess,
    assertDocumentAccess,
    hasFullStudentAccess,
    canAccessStudent,
    assertCanAccessStudent,
    assertStudentAccessById,
    studentScopeFilter,
};
