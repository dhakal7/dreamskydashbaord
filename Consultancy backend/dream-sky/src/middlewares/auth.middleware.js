const { verifyAccessToken } = require("../utils/jwt.util");
const AppError = require("../utils/apiError");

/**
 * requireAuth — Authentication Middleware (Contract #3 from backend split doc)
 *
 * Verifies the Bearer token in the Authorization header.
 * On success: attaches req.user = { userId, role, branchId, mustChangePassword }
 * On failure: throws 401 Unauthorized
 *
 * Track B imports this as a black box — they don't need to know how JWT works internally.
 * Usage in any route file:
 *   const { requireAuth } = require("../middlewares/auth.middleware");
 *   router.get("/protected", requireAuth, controller.handler);
 */
const requireAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            throw AppError.unauthorized("No token provided. Please log in.", "NO_TOKEN");
        }

        const token = authHeader.split(" ")[1];
        const decoded = verifyAccessToken(token);

        // Attach decoded payload to req — available downstream in all handlers
        req.user = decoded;
        next();
    } catch (err) {
        // jwt.verify throws JsonWebTokenError / TokenExpiredError — convert to AppError
        if (err.isOperational) return next(err);
        if (err.name === "TokenExpiredError")
            return next(AppError.unauthorized("Token has expired. Please refresh.", "TOKEN_EXPIRED"));
        return next(AppError.unauthorized("Invalid token.", "INVALID_TOKEN"));
    }
};

/**
 * requirePasswordChanged — blocks access if mustChangePassword is true.
 * Apply this on every protected route EXCEPT /auth/change-password itself.
 * Ensures students (and anyone with a temp password) cannot skip the change step.
 *
 * Usage:
 *   router.get("/dashboard", requireAuth, requirePasswordChanged, controller);
 */
const requirePasswordChanged = (req, res, next) => {
    if (req.user && req.user.mustChangePassword) {
        return next(
            AppError.forbidden(
                "You must change your password before accessing this resource.",
                "PASSWORD_CHANGE_REQUIRED"
            )
        );
    }
    next();
};

module.exports = { requireAuth, requirePasswordChanged };
