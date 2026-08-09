const { Router } = require("express");
const appointmentController = require("../controllers/appointment.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

const router = Router();

router.use(requireAuth);

// ─── Dashboard (before /:id) ──────────────────────────────────────────────────
router.get(
    "/dashboard",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    appointmentController.dashboard
);

// ─── CRUD ─────────────────────────────────────────────────────────────────────
router.post(
    "/",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    appointmentController.create
);

router.get(
    "/",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    appointmentController.list
);

router.get("/:id", appointmentController.getOne);

router.put(
    "/:id",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    appointmentController.update
);

router.delete(
    "/:id",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN"),
    appointmentController.remove
);

// ─── Status change ────────────────────────────────────────────────────────────
router.patch(
    "/:id/status",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    appointmentController.changeStatus
);

module.exports = router;
