const { Router } = require("express");
const applicationController = require("../controllers/application.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

const router = Router();

router.use(requireAuth);

// ─── Dashboard (before /:id) ──────────────────────────────────────────────────
router.get(
    "/dashboard",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    applicationController.dashboard
);

// ─── CRUD ─────────────────────────────────────────────────────────────────────
router.post(
    "/",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    applicationController.create
);

router.get(
    "/",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    applicationController.list
);

router.get("/:id", applicationController.getOne);

router.put(
    "/:id",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    applicationController.update
);

router.delete(
    "/:id",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN"),
    applicationController.remove
);

// ─── Status change ────────────────────────────────────────────────────────────
router.patch(
    "/:id/status",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    applicationController.changeStatus
);

// ─── Record offer ─────────────────────────────────────────────────────────────
router.post(
    "/:id/offers",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    applicationController.recordOffer
);

module.exports = router;
