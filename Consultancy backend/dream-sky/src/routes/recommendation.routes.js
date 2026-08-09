const { Router } = require("express");
const recommendationController = require("../controllers/recommendation.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

const router = Router();

router.use(requireAuth);

// POST: SUPER_ADMIN or COUNSELOR only (counselor triggers "Get Recommendations" for a student)
// GET reads: any authenticated role (profile page may display inline)
router.post(
  "/",
  requireRole("SUPER_ADMIN", "COUNSELOR"),
  recommendationController.generateRecommendations
);

router.get("/:recordId/latest", recommendationController.getLatestRecommendation);
router.get("/:recordId/history", recommendationController.getRecommendationHistory);

module.exports = router;
