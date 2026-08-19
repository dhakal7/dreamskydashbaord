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

router.get("/:id", studentController.getOne);

router.put(
    "/:id",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    studentController.update
);

router.delete(
    "/:id",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN"),
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

module.exports = router;
