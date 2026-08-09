const { Router } = require("express");
const commissionController = require("../controllers/commission.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

const router = Router();

router.use(requireAuth);

// ─── Commission Rules (SUPER_ADMIN & BRANCH_ADMIN) ───────────────────────────
router.get(
  "/rules",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN"),
  commissionController.listRules
);

router.get(
  "/rules/:id",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN"),
  commissionController.getRule
);

router.post(
  "/rules",
  requireRole("SUPER_ADMIN"),
  commissionController.createRule
);

router.put(
  "/rules/:id",
  requireRole("SUPER_ADMIN"),
  commissionController.updateRule
);

router.delete(
  "/rules/:id",
  requireRole("SUPER_ADMIN"),
  commissionController.deleteRule
);

// ─── Commissions ─────────────────────────────────────────────────────────────
router.get(
  "/",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "REFERRAL_AGENT"),
  commissionController.listCommissions
);

router.get(
  "/:id",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "REFERRAL_AGENT"),
  commissionController.getCommission
);

router.patch(
  "/:id/mark-paid",
  requireRole("SUPER_ADMIN"),
  commissionController.markPaid
);

router.patch(
  "/:id/dispute",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "REFERRAL_AGENT"),
  commissionController.dispute
);

module.exports = router;
