const { Router } = require("express");
const classController = require("../controllers/class.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

const router = Router();

router.use(requireAuth);

// ─── Teacher / Student Portal Views (static paths BEFORE /:id) ───────────────
router.get(
  "/teacher/me",
  requireRole("TEACHER"),
  classController.getTeacherMeClasses
);

router.get(
  "/student/:studentId/enrollments",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "STUDENT", "TEACHER"),
  classController.getStudentEnrollments
);

// ─── Class CRUD ───────────────────────────────────────────────────────────────
router.post(
  "/",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "TEACHER"),
  classController.createClass
);

router.get(
  "/",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK", "TEACHER"),
  classController.listClasses
);

router.get(
  "/:id",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK", "TEACHER", "STUDENT"),
  classController.getClass
);

router.put(
  "/:id",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "TEACHER"),
  classController.updateClass
);

router.delete(
  "/:id",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "TEACHER"),
  classController.deleteClass
);

// ─── Enrollments ──────────────────────────────────────────────────────────────
router.post(
  "/:classId/enroll",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
  classController.enrollStudent
);

router.post(
  "/:classId/unenroll",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
  classController.unenrollStudent
);

// ─── Attendance ───────────────────────────────────────────────────────────────
router.post(
  "/:classId/attendance",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "TEACHER"),
  classController.markAttendance
);

// ─── Content CRUD ─────────────────────────────────────────────────────────────
router.post(
  "/:classId/content",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "TEACHER"),
  classController.createClassContent
);

router.get(
  "/:classId/content",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "TEACHER", "STUDENT"),
  classController.listClassContent
);

router.put(
  "/:classId/content/:contentId",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "TEACHER"),
  classController.updateClassContent
);

router.delete(
  "/:classId/content/:contentId",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "TEACHER"),
  classController.deleteClassContent
);

module.exports = router;
