const { Router } = require("express");
const portalController = require("../controllers/portal.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireOwnStudentPortal } = require("../middlewares/rbac.middleware");

const router = Router();

router.use(requireAuth);

// All portal routes require student data isolation
router.use("/:studentId", requireOwnStudentPortal);

router.get("/:studentId/profile", portalController.profile);
router.get("/:studentId/dashboard", portalController.dashboard);
router.get("/:studentId/applications", portalController.applications);
router.get("/:studentId/visa-cases", portalController.visaCases);
router.get("/:studentId/documents", portalController.documents);
router.get("/:studentId/appointments", portalController.appointments);
router.get("/:studentId/follow-ups", portalController.followUps);

module.exports = router;
