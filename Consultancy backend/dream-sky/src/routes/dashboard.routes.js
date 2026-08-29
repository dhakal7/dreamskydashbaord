const { Router } = require("express");
const { requireAuth } = require("../middlewares/auth.middleware");
const { getSummary, getCounselorSummary } = require("../controllers/dashboard.controller");

const router = Router();

// All dashboard endpoints require authentication
router.use(requireAuth);

/**
 * GET /dashboard/summary
 * Returns consolidated super-admin dashboard stats (1 request instead of 7).
 * Accessible by: SUPER_ADMIN, FRONT_DESK
 */
router.get("/summary", getSummary);

/**
 * GET /dashboard/counselor-summary?counselorId=<id>
 * Returns stats scoped to a specific counselor.
 * Accessible by: SUPER_ADMIN, COUNSELOR (own stats)
 */
router.get("/counselor-summary", getCounselorSummary);

module.exports = router;
