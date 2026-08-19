const { Router } = require("express");
const documentController = require("../controllers/document.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");
const { uploadSingle } = require("../middlewares/upload.middleware");

const router = Router();

router.use(requireAuth);

// ─── Student Profile summaries (Student-centric view) ────────────────────────
router.get(
    "/student-profiles",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    documentController.listProfiles
);

// ─── Upload (multipart) ──────────────────────────────────────────────────────
router.post(
    "/upload",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    uploadSingle,
    documentController.upload
);

// ─── Replace Document (new version) ──────────────────────────────────────────
router.post(
    "/:id/replace",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    uploadSingle,
    documentController.replace
);

// ─── Student Review (Approve / Request Changes) ──────────────────────────────
router.post(
    "/:id/review",
    documentController.review
);

// ─── Version History ─────────────────────────────────────────────────────────
router.get("/:id/history", documentController.getHistory);

// ─── List / Filter flat documents ─────────────────────────────────────────────
router.get(
    "/",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    documentController.list
);

// ─── Single document & download ──────────────────────────────────────────────
router.get("/:id", documentController.getOne);
router.get("/:id/download", documentController.download);

// ─── Verify / Reject ──────────────────────────────────────────────────────────
router.patch(
    "/:id/verify",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    documentController.verify
);

// ─── Rename ───────────────────────────────────────────────────────────────────
router.patch(
    "/:id/rename",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    documentController.rename
);

// ─── Update metadata ─────────────────────────────────────────────────────────
router.put(
    "/:id",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    documentController.update
);

// ─── Delete ───────────────────────────────────────────────────────────────────
router.delete(
    "/:id",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN"),
    documentController.remove
);

module.exports = router;
