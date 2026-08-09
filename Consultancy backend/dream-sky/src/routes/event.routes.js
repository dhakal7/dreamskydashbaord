const { Router } = require("express");
const eventController = require("../controllers/event.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

const router = Router();

router.use(requireAuth);

// ─── Calendar feed (static path BEFORE /:id) ─────────────────────────────────
router.get(
  "/calendar",
  eventController.getCalendarEvents
);

// ─── Event CRUD ───────────────────────────────────────────────────────────────
router.post(
  "/",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
  eventController.createEvent
);

router.get(
  "/",
  eventController.listEvents
);

router.get(
  "/:id",
  eventController.getEvent
);

router.put(
  "/:id",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
  eventController.updateEvent
);

router.delete(
  "/:id",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"),
  eventController.deleteEvent
);

// ─── Approval workflow (SUPER_ADMIN only) ─────────────────────────────────────
router.patch(
  "/:id/approve",
  requireRole("SUPER_ADMIN"),
  eventController.approveEvent
);

router.patch(
  "/:id/reject",
  requireRole("SUPER_ADMIN"),
  eventController.rejectEvent
);

module.exports = router;
