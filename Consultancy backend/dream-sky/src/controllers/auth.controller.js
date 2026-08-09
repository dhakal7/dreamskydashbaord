const authService = require("../services/auth.service");
const { sendSuccess } = require("../utils/response.util");
const {
    validateLogin,
    validateChangePassword,
    validateRefreshToken,
    validateActivatePortal,
} = require("../validators/auth.validator");

/**
 * Controllers are thin. They:
 *   1. Extract data from req (body, params, user)
 *   2. Call validator
 *   3. Call service
 *   4. Send response
 *
 * No business logic lives here. No DB calls. No error catching needed —
 * the global error handler in app.js catches everything thrown by the service.
 */

const login = async (req, res) => {
    const { email, password } = req.body;
    validateLogin({ email, password });
    const result = await authService.login({ email, password });
    sendSuccess(res, { message: "Logged in successfully.", data: result });
};

const refresh = async (req, res) => {
    const { refreshToken } = req.body;
    validateRefreshToken({ refreshToken });
    const tokens = await authService.refreshToken({ refreshToken });
    sendSuccess(res, { message: "Token refreshed.", data: tokens });
};

const logout = async (req, res) => {
    // refreshToken in body is optional — logout still succeeds without it
    const { refreshToken } = req.body;
    await authService.logout({ refreshToken });
    sendSuccess(res, { message: "Logged out successfully." });
};

const getMe = async (req, res) => {
    // req.user is attached by auth.middleware after verifying the JWT
    const user = await authService.getMe(req.user.userId);
    sendSuccess(res, { data: user });
};

const changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    validateChangePassword({ currentPassword, newPassword });
    await authService.changePassword(req.user.userId, { currentPassword, newPassword });
    sendSuccess(res, { message: "Password changed successfully. Please log in again." });
};

const activateStudentPortal = async (req, res) => {
    const { studentId } = req.body;
    validateActivatePortal({ studentId });
    const result = await authService.activateStudentPortal({ studentId });
    sendSuccess(res, { message: result.message, data: result });
};

module.exports = { login, refresh, logout, getMe, changePassword, activateStudentPortal };
