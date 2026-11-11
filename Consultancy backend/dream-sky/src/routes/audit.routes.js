const { Router } = require("express");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");
const auditController = require("../controllers/audit.controller");

const router = Router();

router.use(requireAuth);

/**
 * GET /audit-logs
 * List immutable audit logs with search, actor filter, action filter, date range filter.
 * Accessible only to SUPER_ADMIN and BRANCH_ADMIN.
 */
router.get("/", requireRole("SUPER_ADMIN", "BRANCH_ADMIN"), auditController.list);

module.exports = router;

