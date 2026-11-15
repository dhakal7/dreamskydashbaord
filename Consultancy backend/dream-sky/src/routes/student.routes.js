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
    "/trash",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK"),
    studentController.trash
);

router.get("/:id", studentController.getOne);

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

router.patch(
    "/:id/restore",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK"),
    studentController.restore
);

router.patch(
    "/:id/assign",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK"),
    studentController.assign
);

router.patch(
    "/:id/transfer-branch",
    requireRole("SUPER_ADMIN"),
    studentController.transferBranch
);

router.delete(
    "/:id",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK"),
    studentController.remove
);

// ─── Pipeline ─────────────────────────────────────────────────────────────────

router.patch(
    "/:id/pipeline",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    studentController.changePipeline
);

// ─── Timeline ─────────────────────────────────────────────────────────────────

router.get("/:id/timeline", studentController.timeline);

// ─── Credentials / Welcome Email ─────────────────────────────────────────────

router.post(
    "/:id/resend-credentials",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    studentController.resendCredentials
);

module.exports = router;
