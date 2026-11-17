const userService = require("../services/user.service");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const AppError = require("../utils/apiError");

const listUsers = async (req, res, next) => {
    try {
        const users = await userService.listUsers(req.query, req.user);
        sendSuccess(res, { data: users });
    } catch (err) {
        next(err);
    }
};

const listReferralAgents = async (req, res, next) => {
    try {
        const agents = await userService.listReferralAgents(req.query, req.user);
        sendSuccess(res, { data: agents });
    } catch (err) {
        next(err);
    }
};

const inviteUser = async (req, res, next) => {
    try {
        const { email, firstName, lastName, role, branchId } = req.body;
        if (!email || !firstName || !lastName || !role) {
            throw new AppError("Fields `email`, `firstName`, `lastName`, and `role` are required.", 400);
        }

        const validRoles = ["SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK", "TEACHER", "REFERRAL_AGENT"];
        if (!validRoles.includes(role)) {
            throw new AppError(`Invalid role '${role}'. Must be one of: ${validRoles.join(", ")}`, 400);
        }

        const currentUser = req.user;
        if (!currentUser) {
            throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
        }

        // Server-side RBAC validation for staff invitation
        if (currentUser.role === "BRANCH_ADMIN") {
            // 1. Prohibit privilege escalation (cannot invite administrative roles)
            const allowedBranchAdminRoles = ["COUNSELOR", "FRONT_DESK", "TEACHER", "REFERRAL_AGENT"];
            if (!allowedBranchAdminRoles.includes(role)) {
                throw AppError.forbidden(`Branch admins cannot invite role '${role}'. Permitted roles: ${allowedBranchAdminRoles.join(", ")}`, "FORBIDDEN");
            }

            // 2. Enforce assigned branch context
            if (!currentUser.branchId) {
                throw AppError.forbidden("Branch Admin lacks assigned branch context.", "NO_BRANCH_CONTEXT");
            }

            // 3. Prohibit cross-branch assignment
            if (branchId && branchId !== currentUser.branchId) {
                throw AppError.forbidden("Branch admins cannot assign staff to other branches.", "FORBIDDEN");
            }
        }

        // Lock branchId to currentUser.branchId for branch admins
        const effectiveBranchId = currentUser.role === "BRANCH_ADMIN" ? currentUser.branchId : (branchId || null);

        const user = await userService.inviteStaffUser(
            { email, firstName, lastName, role, branchId: effectiveBranchId },
            currentUser
        );
        sendCreated(res, { message: "Staff user invited successfully. Credentials emailed.", data: user });
    } catch (err) {
        next(err);
    }
};

const updateUserStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const updated = await userService.updateUserStatus(id, status, req.user);
        sendSuccess(res, {
            message: `User status successfully updated to ${updated.status}.`,
            data: updated,
        });
    } catch (err) {
        next(err);
    }
};

const updateUserRole = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        const updated = await userService.updateUserRole(id, role, req.user);
        sendSuccess(res, {
            message: `User role successfully updated to ${updated.role}.`,
            data: updated,
        });
    } catch (err) {
        next(err);
    }
};

const updateUserBranch = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { branchId } = req.body;
        const updated = await userService.updateUserBranch(id, branchId, req.user);
        sendSuccess(res, {
            message: "User branch assignment successfully updated.",
            data: updated,
        });
    } catch (err) {
        next(err);
    }
};

const updateUserProfile = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { firstName, lastName, name, email, phone } = req.body;
        const updated = await userService.updateUserProfile(
            id,
            { firstName, lastName, name, email, phone },
            req.user
        );
        sendSuccess(res, {
            message: "User profile successfully updated.",
            data: updated,
        });
    } catch (err) {
        next(err);
    }
};

const listBranches = async (req, res, next) => {
    try {
        const branches = await userService.listBranches();
        sendSuccess(res, { data: branches });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    listUsers,
    listReferralAgents,
    inviteUser,
    updateUserStatus,
    updateUserRole,
    updateUserBranch,
    updateUserProfile,
    listBranches,
};

