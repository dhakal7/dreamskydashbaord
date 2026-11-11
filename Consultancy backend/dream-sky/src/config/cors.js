/**
 * cors.js — Explicit CORS origin allowlist (Phase 2.7)
 *
 * Replaces the previous permissive `cors({ origin: true, credentials: true })`,
 * which reflected ANY incoming Origin and granted it credentialed access.
 *
 * Configuration:
 *   CORS_ALLOWED_ORIGINS — comma-separated list of exact origins, e.g.
 *     CORS_ALLOWED_ORIGINS=https://staging.example.com,https://admin-staging.example.com
 *
 * Rules:
 *   - Each entry must be an absolute http(s) origin: scheme + host [+ port] only.
 *     Paths (other than a bare "/"), query strings, fragments and embedded
 *     credentials are rejected. Wildcards ("*") are rejected.
 *   - Blank segments (e.g. a trailing comma) are ignored; any malformed entry
 *     fails configuration loading.
 *   - development / test: if CORS_ALLOWED_ORIGINS is UNSET, the explicit local
 *     defaults below are used. If it is SET, it must contain ≥1 valid origin.
 *   - Any other NODE_ENV (production, staging, ...): CORS_ALLOWED_ORIGINS is
 *     REQUIRED and must contain ≥1 valid origin, otherwise startup fails.
 *   - Requests with no Origin header (server-to-server, curl, health checks)
 *     are not CORS requests and are passed through unchanged.
 *   - Requests whose Origin is not allowlisted receive NO CORS headers and are
 *     rejected with 403 CORS_ORIGIN_DENIED.
 *
 * Error messages never echo configured values; only entry positions and reasons.
 */

const cors = require("cors");
const { resolveEnvironment } = require("./environment");

const DEVELOPMENT_DEFAULT_ORIGINS = Object.freeze([
    "http://localhost:8000",
    "http://localhost:5173",
]);

const DEV_LIKE_ENVIRONMENTS = new Set(["development", "test"]);

class CorsConfigError extends Error {
    constructor(message) {
        super(`[CORS CONFIG ERROR] ${message}`);
        this.name = "CorsConfigError";
    }
}

/**
 * Normalizes a single origin string. Returns the canonical origin or null if invalid.
 * @param {string} value
 * @returns {string|null}
 */
function normalizeOrigin(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.includes("*")) return null;

    let parsed;
    try {
        parsed = new URL(trimmed);
    } catch {
        return null;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname) return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.search || parsed.hash) return null;
    if (parsed.pathname && parsed.pathname !== "/") return null;
    // Reject inputs like "https://example.com/" being confused with paths; "/" alone is tolerated.
    return parsed.origin;
}

/**
 * Parses a comma-separated allowlist. Throws CorsConfigError on any malformed entry.
 * @param {string} raw
 * @returns {string[]} unique canonical origins
 */
function parseAllowedOrigins(raw) {
    if (typeof raw !== "string") return [];
    const origins = [];
    const segments = raw.split(",");
    segments.forEach((segment, index) => {
        const trimmed = segment.trim();
        if (!trimmed) return; // blank segment (e.g. trailing comma) — ignored
        if (trimmed.includes("*")) {
            throw new CorsConfigError(
                `CORS_ALLOWED_ORIGINS entry #${index + 1} contains a wildcard. Wildcards are not permitted with credentialed CORS.`
            );
        }
        const normalized = normalizeOrigin(trimmed);
        if (!normalized) {
            throw new CorsConfigError(
                `CORS_ALLOWED_ORIGINS entry #${index + 1} is not a valid origin. ` +
                `Expected format: https://host[:port] with no path, query, fragment or credentials.`
            );
        }
        if (!origins.includes(normalized)) origins.push(normalized);
    });
    return origins;
}

/**
 * Resolves the effective allowlist for the given environment.
 * @param {object} [env=process.env]
 * @returns {{ nodeEnv: string, origins: string[], source: "configured"|"development-default" }}
 */
function resolveCorsConfig(env = process.env) {
    const envInfo = resolveEnvironment(env);
    const nodeEnv = envInfo.nodeEnv;
    const isDevLike = envInfo.isDevOrTest;
    const raw = env.CORS_ALLOWED_ORIGINS;
    const isSet = typeof raw === "string";

    if (!isSet) {
        if (isDevLike) {
            return { nodeEnv, origins: [...DEVELOPMENT_DEFAULT_ORIGINS], source: "development-default" };
        }
        throw new CorsConfigError(
            `CORS_ALLOWED_ORIGINS is required when NODE_ENV='${nodeEnv}'. ` +
            `Refusing to start with permissive or missing CORS configuration.`
        );
    }

    const origins = parseAllowedOrigins(raw);
    if (origins.length === 0) {
        throw new CorsConfigError(
            `CORS_ALLOWED_ORIGINS is set but contains no valid origins (NODE_ENV='${nodeEnv}').`
        );
    }
    return { nodeEnv, origins, source: "configured" };
}

/**
 * Builds the CORS middleware chain: [corsHeaders, rejectDisallowedOrigin].
 * @param {object} [env=process.env]
 * @returns {{ middleware: Function[], config: ReturnType<typeof resolveCorsConfig>, isOriginAllowed: (origin: string) => boolean }}
 */
function createCorsMiddleware(env = process.env) {
    const config = resolveCorsConfig(env);
    const allowed = new Set(config.origins);

    const isOriginAllowed = (origin) => {
        const normalized = normalizeOrigin(origin);
        return Boolean(normalized && allowed.has(normalized));
    };

    const corsHeaders = cors({
        origin(origin, callback) {
            // No Origin header: not a browser CORS request → no CORS headers needed.
            if (!origin) return callback(null, false);
            // Return the canonical allowlisted value (never the raw request header) when allowed.
            if (isOriginAllowed(origin)) return callback(null, normalizeOrigin(origin));
            return callback(null, false);
        },
        credentials: true,
        optionsSuccessStatus: 204,
    });

    const rejectDisallowedOrigin = (req, res, next) => {
        const origin = req.headers && req.headers.origin;
        if (origin === undefined || origin === null || origin === "") return next();
        if (isOriginAllowed(origin)) return next();
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({
            success: false,
            code: "CORS_ORIGIN_DENIED",
            message: "This origin is not permitted to access the API.",
        }));
    };

    return { middleware: [corsHeaders, rejectDisallowedOrigin], config, isOriginAllowed };
}

module.exports = {
    createCorsMiddleware,
    resolveCorsConfig,
    parseAllowedOrigins,
    normalizeOrigin,
    CorsConfigError,
    DEVELOPMENT_DEFAULT_ORIGINS,
};

