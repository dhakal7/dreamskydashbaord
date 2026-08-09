const { Router } = require("express");
const documentController = require("../controllers/document.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");
const { uploadSingle } = require("../middlewares/upload.middleware");

const router = Router();

router.use(requireAuth);

// ─── Upload (multipart) ──────────────────────────────────────────────────────
router.post(
    "/upload",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    uploadSingle,
    documentController.upload
);

// ─── List / Filter ────────────────────────────────────────────────────────────
router.get(
    "/",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
    documentController.list
);

// ─── Single document ──────────────────────────────────────────────────────────
router.get("/:id", documentController.getOne);
router.get("/:id/download", documentController.download);

// ─── Verify / Reject ──────────────────────────────────────────────────────────
router.patch(
    "/:id/verify",
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    documentController.verify
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
