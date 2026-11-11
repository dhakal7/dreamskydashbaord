const prisma = require("../prisma");
const { verifyAccessToken } = require("../utils/jwt.util");
const AppError = require("../utils/apiError");

/**
 * requireAuth — Authentication Middleware
 *
 * 1. Verifies the Bearer token in the Authorization header.
 * 2. Retrieves current user from DB using the verified token's user ID claim.
 * 3. Selects only: id, role, status, branchId.
 * 4. Rejects missing users (401 USER_NOT_FOUND).
 * 5. Rejects accounts whose current status is not ACTIVE (401 ACCOUNT_INACTIVE).
 * 6. Populates req.user with verified token identity and fresh DB authorization fields.
 * 7. Fresh DB values override stale JWT role, status, and branch claims.
 */
const requireAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            throw AppError.unauthorized("No token provided. Please log in.", "NO_TOKEN");
        }

        const token = authHeader.split(" ")[1];
        let decoded;
        try {
            decoded = verifyAccessToken(token);
        } catch (jwtErr) {
            if (jwtErr.name === "TokenExpiredError") {
                throw AppError.unauthorized("Token has expired. Please refresh.", "TOKEN_EXPIRED");
            }
            throw AppError.unauthorized("Invalid token.", "INVALID_TOKEN");
        }

        const targetUserId = decoded?.userId || decoded?.id;
        if (!targetUserId || typeof targetUserId !== "string") {
            throw AppError.unauthorized("Invalid token payload.", "INVALID_TOKEN");
        }

        // Database-backed freshness check: Query PostgreSQL for fresh authorization state
        let dbUser;
        try {
            dbUser = await prisma.user.findUnique({
                where: { id: targetUserId },
                select: {
                    id: true,
                    role: true,
                    status: true,
                    branchId: true,
                },
            });
        } catch (dbErr) {
            // Fail closed: Do NOT fall back to stale JWT claims if DB lookup fails
            if (dbErr.isOperational) return next(dbErr);
            return next(AppError.internal("Authentication service unavailable.", "AUTH_SERVICE_UNAVAILABLE"));
        }

        // Reject missing users
        if (!dbUser) {
            throw AppError.unauthorized("User account not found.", "USER_NOT_FOUND");
        }

        // Reject accounts whose current status is not ACTIVE
        if (dbUser.status !== "ACTIVE") {
            throw AppError.unauthorized(
                "Your account is inactive or suspended. Please contact your administrator.",
                "ACCOUNT_INACTIVE"
            );
        }

        // Populate req.user: verified token identity with fresh DB authorization fields overriding stale JWT claims
        req.user = {
            ...decoded,
            id: dbUser.id,
            userId: dbUser.id,
            role: dbUser.role,
            status: dbUser.status,
            branchId: dbUser.branchId ?? null,
        };

        next();
    } catch (err) {
        if (err.isOperational) return next(err);
        return next(AppError.unauthorized(err.message || "Authentication failed.", "AUTHENTICATION_FAILED"));
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
