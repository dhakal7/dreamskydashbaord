const { Router } = require("express");
const reportController = require("../controllers/report.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

const router = Router();

router.use(requireAuth);

router.get(
  "/summary",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK", "COUNSELOR"),
  reportController.getSummary
);

router.get(
  "/teacher",
  requireRole("TEACHER", "SUPER_ADMIN"),
  reportController.getTeacherReports
);

module.exports = router;

