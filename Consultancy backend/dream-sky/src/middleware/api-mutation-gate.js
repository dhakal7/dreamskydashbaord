/**
 * api-mutation-gate.js — Dedicated API Mutation Gate Middleware
 *
 * Prevents automated test scripts, PowerShell wrappers, or browser tests from
 * executing mutating HTTP operations (POST, PUT, PATCH, DELETE) against a running
 * server unless the server has been explicitly authorized with a verified disposable target.
 *
 * In production/development (NODE_ENV !== 'test'), normal CRM operations proceed unaffected.
 * In test mode (NODE_ENV === 'test'), all mutations fail closed with 403 Forbidden
 * unless authorizeDisposableSession() was completed at server boot.
 */

let activeVerificationContext = null;

/**
 * Authorizes mutating operations for a dedicated test session.
 * Can only be called during verified test server initialization.
 *
 * @param {object} context
 * @param {string} context.sessionToken - Unique session token
 * @param {string} context.targetPort - Must strictly be "5433"
 * @param {string} context.targetDatabase - Must strictly be "dreamsky_test_disposable"
 */
function authorizeDisposableSession(context) {
    if (!context || typeof context !== "object") {
        throw new Error("[MUTATION GATE ERROR] Invalid verification context provided.");
    }
    if (String(context.targetPort) !== "5433") {
        throw new Error(`[MUTATION GATE ERROR] Mutation gate requires target port 5433. Received '${context.targetPort}'.`);
    }
    if (context.targetDatabase !== "dreamsky_test_disposable") {
        throw new Error(`[MUTATION GATE ERROR] Mutation gate requires target database 'dreamsky_test_disposable'. Received '${context.targetDatabase}'.`);
    }
    if (!context.sessionToken || typeof context.sessionToken !== "string" || !context.sessionToken.trim()) {
        throw new Error("[MUTATION GATE ERROR] Mutation gate requires a valid sessionToken.");
    }

    activeVerificationContext = Object.freeze({
        sessionToken: context.sessionToken,
        targetPort: "5433",
        targetDatabase: "dreamsky_test_disposable",
        authorizedAt: new Date().toISOString(),
    });
}

/**
 * Revokes any active disposable session (used for teardown).
 */
function revokeDisposableSession() {
    activeVerificationContext = null;
}

/**
 * Returns true if an active, valid disposable session is authorized.
 * @returns {boolean}
 */
function isDisposableSessionAuthorized() {
    return activeVerificationContext !== null && activeVerificationContext.targetPort === "5433";
}

/**
 * Read-only getter for diagnostic and test inspection.
 * @returns {object|null}
 */
function getGateContext() {
    return activeVerificationContext ? { ...activeVerificationContext } : null;
}

/**
 * Express middleware for gating mutating HTTP operations.
 */
function apiMutationGate(req, res, next) {
    const method = req.method.toUpperCase();
    const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

    // Read-only operations (GET, HEAD, OPTIONS) never mutate database state
    if (!isMutating) {
        return next();
    }

    // Explicit Read-Only Maintenance Mode (API_READ_ONLY_MODE === "true"):
    // Blocks all data mutations while permitting authentication session endpoints
    // (/api/auth/login, /api/auth/refresh, /api/auth/logout, /api/v1/auth/..., /auth/...)
    // so administrators can still sign in and inspect data.
    if (String(process.env.API_READ_ONLY_MODE).toLowerCase() === "true") {
        const rawPath = String(req.originalUrl || req.path || "").split("?")[0];
        const isAuthSessionEndpoint = /^(\/api(\/v1)?)?\/auth\/(login|refresh|logout)\/?$/i.test(rawPath);
        if (!isAuthSessionEndpoint) {
            return res.status(503).json({
                success: false,
                code: "API_READ_ONLY_MODE_ACTIVE",
                message: "The CRM is currently in read-only maintenance mode. Data modifications are temporarily disabled.",
            });
        }
    }

    // Normal production and development behavior:
    // Allow legitimate business mutations to proceed to standard authentication/RBAC middleware
    if (process.env.NODE_ENV !== "test") {
        return next();
    }

    // Test mode (NODE_ENV === "test"):
    // Mutating requests are strictly rejected unless a verified disposable session is active
    if (!isDisposableSessionAuthorized()) {
        return res.status(403).json({
            success: false,
            code: "API_MUTATION_GATE_BLOCKED",
            message: "[API MUTATION GATE] Mutating API operations (POST/PUT/PATCH/DELETE) are blocked in test mode because the server has not completed disposable database verification."
        });
    }

    return next();
}

module.exports = {
    apiMutationGate,
    authorizeDisposableSession,
    revokeDisposableSession,
    isDisposableSessionAuthorized,
    getGateContext,
};
