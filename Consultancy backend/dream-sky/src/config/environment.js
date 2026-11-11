/**
 * environment.js — Deployment Environment Identification & Fail-Closed Resolution (Phase 2.7.4)
 *
 * Enforces an explicit, fail-closed environment resolution policy across the application.
 *
 * Rules:
 * 1. Staging must require explicit NODE_ENV=staging.
 * 2. Production must require explicit NODE_ENV=production.
 * 3. Development and test must require explicit NODE_ENV=development and NODE_ENV=test.
 * 4. Missing, undefined, empty, or whitespace-only NODE_ENV must FAIL CLOSED immediately
 *    with EnvironmentConfigError so that deployments never silently activate insecure
 *    development fallbacks.
 * 5. Unexpected non-development/non-test values (e.g. "uat", "sandbox", "prod") are strictly
 *    treated as non-dev (isDevOrTest = false), failing closed against all fallback behavior.
 * 6. The same resolved environment model is used consistently by JWT, encryption, and CORS.
 */

class EnvironmentConfigError extends Error {
    constructor(message) {
        super(`[ENVIRONMENT CONFIG ERROR] ${message}`);
        this.name = "EnvironmentConfigError";
    }
}

const VALID_CANONICAL_ENVIRONMENTS = Object.freeze([
    "development",
    "test",
    "staging",
    "production",
]);

/**
 * Resolves and validates the execution environment against fail-closed security rules.
 *
 * @param {object} [env=process.env]
 * @returns {{
 *   nodeEnv: string,
 *   isDevOrTest: boolean,
 *   isDevelopment: boolean,
 *   isTest: boolean,
 *   isStaging: boolean,
 *   isProduction: boolean
 * }}
 */
function resolveEnvironment(env = process.env) {
    const raw = env ? env.NODE_ENV : undefined;

    if (raw === undefined || raw === null || String(raw).trim() === "") {
        throw new EnvironmentConfigError(
            "NODE_ENV is missing or empty. Deployments must explicitly configure NODE_ENV " +
            "('production', 'staging', 'development', or 'test'). " +
            "Refusing to start with an ambiguous, missing, or unconfigured deployment environment."
        );
    }

    const nodeEnv = String(raw).trim().toLowerCase();
    const isDevelopment = nodeEnv === "development";
    const isTest = nodeEnv === "test";
    const isStaging = nodeEnv === "staging";
    const isProduction = nodeEnv === "production";
    const isDevOrTest = isDevelopment || isTest;

    return {
        nodeEnv,
        isDevOrTest,
        isDevelopment,
        isTest,
        isStaging,
        isProduction,
    };
}

module.exports = {
    resolveEnvironment,
    EnvironmentConfigError,
    VALID_CANONICAL_ENVIRONMENTS,
};

