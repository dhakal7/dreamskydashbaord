const { Router } = require("express");
const visaController = require("../controllers/visa.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

const router = Router();

router.use(requireAuth);

// ─── Dashboard & Visa Granted (before /:id) ──────────────────────────────────
router.get(
    "/dashboard",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    visaController.dashboard
);

router.get(
    "/granted",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK", "COUNSELOR", "REFERRAL_AGENT"),
    visaController.listGranted
);

router.get(
    "/granted/analytics",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK"),
    visaController.grantedAnalytics
);

router.patch(
    "/granted/:studentId/departure",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK", "COUNSELOR"),
    visaController.updateDeparture
);

// ─── CRUD ─────────────────────────────────────────────────────────────────────
router.post(
    "/",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    visaController.create
);

router.get(
    "/",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    visaController.list
);

router.get(
    "/:id",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    visaController.getOne
);

router.put(
    "/:id",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    visaController.update
);

router.delete(
    "/:id",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    visaController.remove
);

// ─── Status change ────────────────────────────────────────────────────────────
router.patch(
    "/:id/status",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    visaController.changeStatus
);

module.exports = router;
