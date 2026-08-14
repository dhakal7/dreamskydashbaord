const { Router } = require("express");
const notificationController = require("../controllers/notification.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

const router = Router();

router.use(requireAuth);

// ─── Notification Templates (SUPER_ADMIN only) ────────────────────────────────
router.get(
  "/templates",
  requireRole("SUPER_ADMIN"),
  notificationController.listTemplates
);

router.get(
  "/templates/:id",
  requireRole("SUPER_ADMIN"),
  notificationController.getTemplate
);

router.post(
  "/templates",
  requireRole("SUPER_ADMIN"),
  notificationController.createTemplate
);

router.put(
  "/templates/:id",
  requireRole("SUPER_ADMIN"),
  notificationController.updateTemplate
);

router.delete(
  "/templates/:id",
  requireRole("SUPER_ADMIN"),
  notificationController.deleteTemplate
);

// ─── Notifications ────────────────────────────────────────────────────────────
// SUPER_ADMIN sees all; other roles see only their own (enforced in controller)
router.get("/", notificationController.listNotifications);
router.post("/send", notificationController.sendDirectNotification);

module.exports = router;
