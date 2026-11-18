const { Router } = require("express");
const studentController = require("../controllers/student.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

const router = Router();

// All student routes require authentication
router.use(requireAuth);

// ─── CRUD ─────────────────────────────────────────────────────────────────────

router.post(
    "/",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    studentController.create
);

router.get(
    "/",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    studentController.list
);

router.get(
    "/:id",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    studentController.getOne
);

router.put(
    "/:id",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    studentController.update
);

router.patch(
    "/:id",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    studentController.update
);

router.delete(
    "/:id",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    studentController.remove
);

// ─── Pipeline ─────────────────────────────────────────────────────────────────

router.patch(
    "/:id/pipeline",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    studentController.changePipeline
);

// ─── Timeline ─────────────────────────────────────────────────────────────────

router.get(
    "/:id/timeline",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    studentController.timeline
);

// ─── Credentials / Welcome Email ─────────────────────────────────────────────

router.post(
    "/:id/resend-credentials",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    studentController.resendCredentials
);

module.exports = router;
