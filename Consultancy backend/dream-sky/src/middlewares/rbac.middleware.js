const AppError = require("../utils/apiError");

/**
 * requireRole — RBAC Middleware (Contract #3 from backend split doc)
 *
 * Factory function: returns a middleware that checks req.user.role.
 * Must always be used AFTER requireAuth (which sets req.user).
 *
 * Track B imports this alongside requireAuth. They treat it as a black box.
 * Usage:
 *   const { requireRole } = require("../middlewares/rbac.middleware");
 *   router.delete("/users/:id", requireAuth, requireRole("SUPER_ADMIN"), controller);
 *   router.get("/reports",      requireAuth, requireRole("SUPER_ADMIN", "BRANCH_ADMIN"), controller);
 */
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            // Defensive: requireAuth should always run first
            return next(AppError.unauthorized("Not authenticated.", "UNAUTHORIZED"));
        }

        if (!allowedRoles.includes(req.user.role)) {
            return next(
                AppError.forbidden(
                    `Access denied. Required role(s): ${allowedRoles.join(", ")}.`,
                    "INSUFFICIENT_ROLE"
                )
            );
        }

        next();
    };
};

/**
 * requireOwnStudentPortal — ensures ONLY a STUDENT user can access their own portal data.
 * Compares req.user.studentId with req.params.studentId (or req.body.studentId).
 *
 * All non-STUDENT roles (TEACHER, REFERRAL_AGENT, FRONT_DESK, COUNSELOR, BRANCH_ADMIN,
 * SUPER_ADMIN) are denied with 403 STUDENT_PORTAL_ACCESS_DENIED on /api/portal/:studentId/*.
 * Staff and administrators access student records through their dedicated CRM routes.
 */
const requireOwnStudentPortal = (req, res, next) => {
    const { role, studentId: tokenStudentId } = req.user;

    if (role !== "STUDENT") {
        return next(
            AppError.forbidden(
                "Student portal routes are restricted to the student account owner.",
                "STUDENT_PORTAL_ACCESS_DENIED"
            )
        );
    }

    // For STUDENT role: check they're accessing only their own record
    const requestedStudentId = req.params.studentId || req.body.studentId;
    if (!requestedStudentId || !tokenStudentId || tokenStudentId !== requestedStudentId) {
        return next(
            AppError.forbidden("You can only access your own portal data.", "STUDENT_PORTAL_ACCESS_DENIED")
        );
    }

    next();
};

module.exports = { requireRole, requireOwnStudentPortal };
