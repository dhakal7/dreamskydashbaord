const { Router } = require("express");
const visaController = require("../controllers/visa.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

const router = Router();

router.use(requireAuth);

// ─── Dashboard (before /:id) ──────────────────────────────────────────────────
router.get(
    "/dashboard",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    visaController.dashboard
);

// ─── CRUD ─────────────────────────────────────────────────────────────────────
router.post(
    "/",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    visaController.create
);

router.get(
    "/",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    visaController.list
);

router.get("/:id", visaController.getOne);

router.put(
    "/:id",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    visaController.update
);

router.delete(
    "/:id",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN"),
    visaController.remove
);

// ─── Status change ────────────────────────────────────────────────────────────
router.patch(
    "/:id/status",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    visaController.changeStatus
);

module.exports = router;
