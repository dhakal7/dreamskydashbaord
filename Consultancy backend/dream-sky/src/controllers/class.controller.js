const classService = require("../services/class.service");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const AppError = require("../utils/apiError");

const VALID_ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];
const VALID_CONTENT_TYPES = ["NOTE", "MATERIAL", "ASSIGNMENT"];

// ─── Class CRUD Controllers ───────────────────────────────────────────────────

const createClass = async (req, res, next) => {
  try {
    const { name, subject, schedule, branchId } = req.body;
    if (!name || !subject || !schedule || !branchId) {
      throw new AppError("Fields `name`, `subject`, `schedule`, and `branchId` are required.", 400);
    }

    const result = await classService.createClass(req.body, req.user);
    if (result.error === "BRANCH_NOT_FOUND") {
      throw new AppError(`Branch with id '${branchId}' not found.`, 404);
    }
    if (result.error === "TEACHER_NOT_FOUND") {
      throw new AppError("Teacher user not found.", 404);
    }
    if (result.error === "INVALID_TEACHER_ROLE") {
      throw new AppError("User does not have a TEACHER or SUPER_ADMIN role.", 400);
    }

    sendCreated(res, { message: "Class created successfully.", data: result.clazz });
  } catch (err) {
    next(err);
  }
};

const listClasses = async (req, res, next) => {
  try {
    const classes = await classService.listClasses(req.user);
    sendSuccess(res, { data: classes });
  } catch (err) {
    next(err);
  }
};

const getClass = async (req, res, next) => {
  try {
    const result = await classService.getClassById(req.params.id, req.user);
    if (result.error === "NOT_FOUND") {
      throw new AppError(result.message, 404);
    }
    if (result.error === "FORBIDDEN") {
      throw new AppError(result.message, 403);
    }
    sendSuccess(res, { data: result.clazz });
  } catch (err) {
    next(err);
  }
};

const updateClass = async (req, res, next) => {
  try {
    const result = await classService.updateClass(req.params.id, req.body, req.user);
    if (result.error === "NOT_FOUND") throw new AppError(result.message, 404);
    if (result.error === "FORBIDDEN") throw new AppError(result.message, 403);
    if (result.error === "BRANCH_NOT_FOUND") throw new AppError("Branch not found.", 404);
    if (result.error === "TEACHER_NOT_FOUND") throw new AppError("Teacher user not found.", 404);
    if (result.error === "INVALID_TEACHER_ROLE") throw new AppError("User does not have TEACHER role.", 400);
    if (result.error === "TEACHER_RESTRICTED") throw new AppError("Teachers cannot modify branch or teacher assignments.", 403);

    sendSuccess(res, { message: "Class updated.", data: result.clazz });
  } catch (err) {
    next(err);
  }
};

const deleteClass = async (req, res, next) => {
  try {
    const result = await classService.deleteClass(req.params.id, req.user);
    if (result.error === "NOT_FOUND") throw new AppError(result.message, 404);
    if (result.error === "FORBIDDEN") throw new AppError(result.message, 403);

    sendSuccess(res, { message: "Class deleted.", data: { deleted: true, id: req.params.id } });
  } catch (err) {
    next(err);
  }
};

// ─── Enrollments ─────────────────────────────────────────────────────────────

const enrollStudent = async (req, res, next) => {
  try {
    const { studentId } = req.body;
    if (!studentId) {
      throw new AppError("Field `studentId` is required.", 400);
    }

    const result = await classService.enrollStudent(req.params.classId, studentId);
    if (result.error === "CLASS_NOT_FOUND") throw new AppError(`Class with id '${req.params.classId}' not found.`, 404);
    if (result.error === "ALREADY_ENROLLED") throw new AppError("Student is already enrolled in this class.", 409);

    sendCreated(res, { message: "Student enrolled in class.", data: result.enrollment });
  } catch (err) {
    next(err);
  }
};

const unenrollStudent = async (req, res, next) => {
  try {
    const { studentId } = req.body;
    if (!studentId) {
      throw new AppError("Field `studentId` is required.", 400);
    }

    const result = await classService.unenrollStudent(req.params.classId, studentId);
    if (result.error === "ENROLLMENT_NOT_FOUND") throw new AppError("Enrollment not found.", 404);

    sendSuccess(res, { message: "Student unenrolled.", data: result });
  } catch (err) {
    next(err);
  }
};

// ─── Attendance ───────────────────────────────────────────────────────────────

const markAttendance = async (req, res, next) => {
  try {
    const { date, records } = req.body;
    if (!date || !records || !Array.isArray(records)) {
      throw new AppError("Fields `date` (string) and `records` (array) are required.", 400);
    }

    for (const record of records) {
      if (!record.studentId || !VALID_ATTENDANCE_STATUSES.includes(record.status)) {
        throw new AppError(`Invalid record format or status. Status must be one of: ${VALID_ATTENDANCE_STATUSES.join(", ")}`, 400);
      }
    }

    const result = await classService.markAttendance(req.params.classId, date, records, req.user);
    if (result.error === "NOT_FOUND") throw new AppError(result.message, 404);
    if (result.error === "FORBIDDEN") throw new AppError(result.message, 403);

    sendSuccess(res, { message: "Attendance marked.", data: result.results });
  } catch (err) {
    next(err);
  }
};

// ─── Content CRUD ─────────────────────────────────────────────────────────────

const createClassContent = async (req, res, next) => {
  try {
    const { type, title } = req.body;
    if (!type || !title) {
      throw new AppError("Fields `type` and `title` are required.", 400);
    }

    if (!VALID_CONTENT_TYPES.includes(type)) {
      throw new AppError(`Invalid type. Must be one of: ${VALID_CONTENT_TYPES.join(", ")}`, 400);
    }

    const result = await classService.createClassContent(req.params.classId, req.body, req.user);
    if (result.error === "NOT_FOUND") throw new AppError(result.message, 404);
    if (result.error === "FORBIDDEN") throw new AppError(result.message, 403);

    sendCreated(res, { message: "Class content created.", data: result.content });
  } catch (err) {
    next(err);
  }
};

const listClassContent = async (req, res, next) => {
  try {
    const result = await classService.listClassContent(req.params.classId, req.user);
    if (result.error === "NOT_FOUND") throw new AppError(result.message, 404);
    if (result.error === "FORBIDDEN") throw new AppError(result.message, 403);

    sendSuccess(res, { data: result.contents });
  } catch (err) {
    next(err);
  }
};

const updateClassContent = async (req, res, next) => {
  try {
    const result = await classService.updateClassContent(
      req.params.classId,
      req.params.contentId,
      req.body,
      req.user
    );
    if (result.error === "NOT_FOUND") throw new AppError(result.message, 404);
    if (result.error === "FORBIDDEN") throw new AppError(result.message, 403);
    if (result.error === "CONTENT_NOT_FOUND") throw new AppError("Class content not found.", 404);

    sendSuccess(res, { message: "Class content updated.", data: result.content });
  } catch (err) {
    next(err);
  }
};

const deleteClassContent = async (req, res, next) => {
  try {
    const result = await classService.deleteClassContent(
      req.params.classId,
      req.params.contentId,
      req.user
    );
    if (result.error === "NOT_FOUND") throw new AppError(result.message, 404);
    if (result.error === "FORBIDDEN") throw new AppError(result.message, 403);
    if (result.error === "CONTENT_NOT_FOUND") throw new AppError("Class content not found.", 404);

    sendSuccess(res, { message: "Class content deleted.", data: result });
  } catch (err) {
    next(err);
  }
};

// ─── Portal Views ─────────────────────────────────────────────────────────────

const getTeacherMeClasses = async (req, res, next) => {
  try {
    if (req.user.role !== "TEACHER") {
      throw new AppError("Access denied. This view is for teachers only.", 403);
    }
    const classes = await classService.listClasses(req.user);
    sendSuccess(res, { data: classes });
  } catch (err) {
    next(err);
  }
};

const getStudentEnrollments = async (req, res, next) => {
  try {
    const formattedResults = await classService.getStudentEnrollments(req.params.studentId);
    sendSuccess(res, { data: formattedResults });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createClass,
  listClasses,
  getClass,
  updateClass,
  deleteClass,
  enrollStudent,
  unenrollStudent,
  markAttendance,
  createClassContent,
  listClassContent,
  updateClassContent,
  deleteClassContent,
  getTeacherMeClasses,
  getStudentEnrollments,
};
