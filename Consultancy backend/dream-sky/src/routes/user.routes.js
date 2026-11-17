const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

router.use(requireAuth);

// TEACHER intentionally excluded: teachers have no `users.view` permission in the
// frontend RBAC policy and no documented need for the full staff directory.
router.get("/", requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK", "COUNSELOR"), userController.listUsers);
router.get("/branches", requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK", "COUNSELOR", "TEACHER"), userController.listBranches);
router.get("/referral-agents", requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK", "COUNSELOR", "TEACHER", "REFERRAL_AGENT"), userController.listReferralAgents);
router.post("/invite", requireRole("SUPER_ADMIN", "BRANCH_ADMIN"), userController.inviteUser);
router.patch("/:id/status", requireRole("SUPER_ADMIN", "BRANCH_ADMIN"), userController.updateUserStatus);
router.patch("/:id/role", requireRole("SUPER_ADMIN", "BRANCH_ADMIN"), userController.updateUserRole);
router.patch("/:id/branch", requireRole("SUPER_ADMIN"), userController.updateUserBranch);
router.patch("/:id", requireRole("SUPER_ADMIN", "BRANCH_ADMIN"), userController.updateUserProfile);

module.exports = router;

