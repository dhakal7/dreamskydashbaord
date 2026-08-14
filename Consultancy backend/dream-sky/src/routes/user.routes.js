const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "BRANCH_ADMIN"), userController.listUsers);
router.post("/invite", requireRole("SUPER_ADMIN", "BRANCH_ADMIN"), userController.inviteUser);

module.exports = router;
