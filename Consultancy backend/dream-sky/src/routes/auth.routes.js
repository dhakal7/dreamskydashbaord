const { Router } = require("express");
const authController = require("../controllers/auth.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

const router = Router();

// --- Public Routes (no token required) ---------------------------------------

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Works for ALL user types: staff and students use the same endpoint.
 */
router.post("/login", authController.login);

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 * Issues a new access + refresh token pair. Old refresh token is invalidated.
 */
router.post("/refresh", authController.refresh);

// --- Protected Routes (valid access token required) ---------------------------

/**
 * POST /api/auth/logout
 * Header: Authorization: Bearer <accessToken>
 * Body: { refreshToken } (optional — revokes that specific session)
 */
router.post("/logout", requireAuth, authController.logout);

/**
 * GET /api/auth/me
 * Header: Authorization: Bearer <accessToken>
 * Returns the authenticated user's profile.
 */
router.get("/me", requireAuth, authController.getMe);

/**
 * POST /api/auth/change-password
 * Header: Authorization: Bearer <accessToken>
 * Body: { currentPassword, newPassword }
 * Available to ALL authenticated users — required path for first-login students.
 * NOTE: No requirePasswordChanged here intentionally — this IS the change endpoint.
 */
router.post("/change-password", requireAuth, authController.changePassword);

// --- Admin-Only Routes --------------------------------------------------------

/**
 * POST /api/auth/activate-student-portal
 * Header: Authorization: Bearer <accessToken>
 * Body: { studentId }
 * Creates a User account for a Student and generates a temp password.
 * Restricted to staff who manage students.
 */
router.post(
    "/activate-student-portal",
    requireAuth,
    requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"),
    authController.activateStudentPortal
);

module.exports = router;
