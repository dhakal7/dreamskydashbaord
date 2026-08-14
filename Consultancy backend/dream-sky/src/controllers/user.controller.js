const userService = require("../services/user.service");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const AppError = require("../utils/apiError");

const listUsers = async (req, res, next) => {
    try {
        const users = await userService.listUsers(req.query);
        sendSuccess(res, { data: users });
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

        const user = await userService.inviteStaffUser({ email, firstName, lastName, role, branchId });
        sendCreated(res, { message: "Staff user invited successfully. Credentials emailed.", data: user });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    listUsers,
    inviteUser,
};
