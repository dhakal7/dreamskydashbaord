const AppError = require("../utils/apiError");

/**
 * Simple manual validators — no external library needed for these small bodies.
 * Each validator returns nothing if valid, throws AppError if invalid.
 * Controllers call these before passing data to the service.
 */

const validateLogin = ({ email, password }) => {
    const errors = [];
    if (!email || typeof email !== "string") errors.push("Email is required.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
        errors.push("Email format is invalid.");
    if (!password || typeof password !== "string") errors.push("Password is required.");
    if (errors.length) throw AppError.badRequest(errors.join(" "), "VALIDATION_ERROR");
};

const validateChangePassword = ({ currentPassword, newPassword }) => {
    const errors = [];
    if (!currentPassword) errors.push("Current password is required.");
    if (!newPassword) errors.push("New password is required.");
    if (newPassword && newPassword.length < 8)
        errors.push("New password must be at least 8 characters.");
    if (newPassword && currentPassword && newPassword === currentPassword)
        errors.push("New password must differ from current password.");
    if (errors.length) throw AppError.badRequest(errors.join(" "), "VALIDATION_ERROR");
};

const validateRefreshToken = ({ refreshToken }) => {
    if (!refreshToken || typeof refreshToken !== "string")
        throw AppError.badRequest("Refresh token is required.", "VALIDATION_ERROR");
};

const validateActivatePortal = ({ studentId }) => {
    if (!studentId || typeof studentId !== "string")
        throw AppError.badRequest("studentId is required.", "VALIDATION_ERROR");
};

const validateUpdateMe = ({ firstName, lastName, name, email, phone }) => {
    const errors = [];
    const hasAnyField =
        firstName !== undefined ||
        lastName !== undefined ||
        name !== undefined ||
        email !== undefined ||
        phone !== undefined;

    if (!hasAnyField) {
        errors.push("At least one profile field (name, firstName, lastName, email, or phone) is required.");
    }
    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        errors.push("Name cannot be empty.");
    }
    if (firstName !== undefined && (typeof firstName !== "string" || !firstName.trim())) {
        errors.push("First name cannot be empty.");
    }
    if (lastName !== undefined && typeof lastName !== "string") {
        errors.push("Last name must be a string.");
    }
    if (email !== undefined) {
        if (typeof email !== "string" || !email.trim()) {
            errors.push("Email cannot be empty.");
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            errors.push("Email format is invalid.");
        }
    }
    if (phone !== undefined && phone !== null) {
        if (typeof phone !== "string") {
            errors.push("Phone must be a string.");
        } else if (phone.trim().length > 30) {
            errors.push("Phone number must be 30 characters or fewer.");
        }
    }
    if (errors.length) throw AppError.badRequest(errors.join(" "), "VALIDATION_ERROR");
};

module.exports = {
    validateLogin,
    validateChangePassword,
    validateRefreshToken,
    validateActivatePortal,
    validateUpdateMe,
};
