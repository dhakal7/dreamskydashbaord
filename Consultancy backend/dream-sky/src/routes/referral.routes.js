const { Router } = require("express");
const referralController = require("../controllers/referral.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK", "COUNSELOR", "REFERRAL_AGENT"),
  referralController.listReferrals
);

module.exports = router;

