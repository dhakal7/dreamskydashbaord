const { Router } = require("express");
const reportController = require("../controllers/report.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

const router = Router();

router.use(requireAuth);

// Aligned with frontend RBAC `reports.view` (FRONT_DESK is not granted reports access).
// TEACHER uses the dedicated /reports/teacher endpoint below.
router.get(
  "/summary",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
  reportController.getSummary
);

router.get(
  "/teacher",
  requireRole("TEACHER", "SUPER_ADMIN"),
  reportController.getTeacherReports
);

module.exports = router;

