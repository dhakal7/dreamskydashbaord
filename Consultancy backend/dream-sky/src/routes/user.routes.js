const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK", "COUNSELOR", "TEACHER"), userController.listUsers);
router.get("/branches", requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK", "COUNSELOR", "TEACHER"), userController.listBranches);
router.get("/referral-agents", requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK", "COUNSELOR", "TEACHER", "REFERRAL_AGENT"), userController.listReferralAgents);
router.post("/invite", requireRole("SUPER_ADMIN", "BRANCH_ADMIN"), userController.inviteUser);
router.patch("/:id/status", requireRole("SUPER_ADMIN", "BRANCH_ADMIN"), userController.updateUserStatus);
router.patch("/:id/role", requireRole("SUPER_ADMIN", "BRANCH_ADMIN"), userController.updateUserRole);
router.patch("/:id/branch", requireRole("SUPER_ADMIN"), userController.updateUserBranch);

module.exports = router;

