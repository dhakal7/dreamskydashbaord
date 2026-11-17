const { Router } = require("express");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");
const { getSummary, getCounselorSummary, getAdminMonitoring } = require("../controllers/dashboard.controller");

const router = Router();

// All dashboard endpoints require authentication
router.use(requireAuth);

/**
 * GET /dashboard/summary
 * Returns consolidated super-admin dashboard stats (1 request instead of 7).
 * Accessible by: SUPER_ADMIN, BRANCH_ADMIN (branch-scoped), FRONT_DESK
 * Organization-wide KPIs must never be exposed to COUNSELOR, TEACHER,
 * STUDENT or REFERRAL_AGENT.
 */
router.get("/summary", requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK"), getSummary);

/**
 * GET /dashboard/counselor-summary?counselorId=<id>
 * Returns stats scoped to a specific counselor.
 * Accessible by: SUPER_ADMIN, BRANCH_ADMIN (own-branch counselors), COUNSELOR (own stats only)
 */
router.get("/counselor-summary", requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"), getCounselorSummary);

/**
 * GET /dashboard/admin-monitoring
 * Returns comprehensive CRM stage breakdown & overdue task monitoring.
 * Accessible by: SUPER_ADMIN, BRANCH_ADMIN
 */
router.get("/admin-monitoring", requireRole("SUPER_ADMIN", "BRANCH_ADMIN"), getAdminMonitoring);

module.exports = router;
