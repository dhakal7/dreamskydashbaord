const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { resolveEnvironment } = require("../config/environment");

class JwtConfigError extends Error {
    constructor(message) {
        super(`[JWT CONFIG ERROR] ${message}`);
        this.name = "JwtConfigError";
    }
}

const DEV_DEFAULT_ACCESS_SECRET = "ds_access_super_secret_key_change_in_production_64chars_minimum";
const DEV_DEFAULT_REFRESH_SECRET = "ds_refresh_super_secret_key_change_in_production_64chars_minimum";

const KNOWN_FALLBACK_SECRETS = new Set([
    DEV_DEFAULT_ACCESS_SECRET,
    DEV_DEFAULT_REFRESH_SECRET,
    "change-me-to-a-long-random-string",
    "change-me-to-a-different-long-random-string",
    "change-me",
    "secret",
    "jwt_secret",
    "your_jwt_secret",
]);

const MIN_SECRET_LENGTH = 32; // 256-bit minimum for HS256 (RFC 7518)

/**
 * Validates and resolves the active JWT configuration for the given environment.
 * In staging and production, strictly rejects missing, empty, short, or fallback secrets.
 *
 * @param {object} [env=process.env]
 * @returns {{ accessSecret: string, refreshSecret: string, nodeEnv: string, isDevOrTest: boolean }}
 */
function resolveJwtConfig(env = process.env) {
    const envInfo = resolveEnvironment(env);
    const nodeEnv = envInfo.nodeEnv;
    const isDevOrTest = envInfo.isDevOrTest;

    // 1. Access Secret Validation
    const rawAccess = env.JWT_ACCESS_SECRET;
    let accessSecret = "";
    if (rawAccess === undefined || rawAccess === null || String(rawAccess).trim() === "") {
        if (!isDevOrTest) {
            throw new JwtConfigError(`JWT_ACCESS_SECRET is required when NODE_ENV='${nodeEnv}'.`);
        }
        accessSecret = DEV_DEFAULT_ACCESS_SECRET;
    } else {
        accessSecret = String(rawAccess).trim();
        if (!isDevOrTest) {
            if (KNOWN_FALLBACK_SECRETS.has(accessSecret)) {
                throw new JwtConfigError(
                    `JWT_ACCESS_SECRET is set to a known insecure fallback or placeholder secret (NODE_ENV='${nodeEnv}').`
                );
            }
            if (accessSecret.length < MIN_SECRET_LENGTH) {
                throw new JwtConfigError(
                    `JWT_ACCESS_SECRET must be at least ${MIN_SECRET_LENGTH} characters long (NODE_ENV='${nodeEnv}').`
                );
            }
        }
    }

    // 2. Refresh Secret Validation
    const rawRefresh = env.JWT_REFRESH_SECRET;
    let refreshSecret = "";
    if (rawRefresh === undefined || rawRefresh === null || String(rawRefresh).trim() === "") {
        if (!isDevOrTest) {
            throw new JwtConfigError(`JWT_REFRESH_SECRET is required when NODE_ENV='${nodeEnv}'.`);
        }
        refreshSecret = DEV_DEFAULT_REFRESH_SECRET;
    } else {
        refreshSecret = String(rawRefresh).trim();
        if (!isDevOrTest) {
            if (KNOWN_FALLBACK_SECRETS.has(refreshSecret)) {
                throw new JwtConfigError(
                    `JWT_REFRESH_SECRET is set to a known insecure fallback or placeholder secret (NODE_ENV='${nodeEnv}').`
                );
            }
            if (refreshSecret.length < MIN_SECRET_LENGTH) {
                throw new JwtConfigError(
                    `JWT_REFRESH_SECRET must be at least ${MIN_SECRET_LENGTH} characters long (NODE_ENV='${nodeEnv}').`
                );
            }
        }
    }

    // 3. Distinct Secrets Requirement
    if (!isDevOrTest && accessSecret === refreshSecret) {
        throw new JwtConfigError("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct secrets.");
    }

    return { accessSecret, refreshSecret, nodeEnv, isDevOrTest };
}

/**
 * Validates JWT configuration at boot. Throws JwtConfigError if invalid.
 */
function validateJwtConfig(env = process.env) {
    return resolveJwtConfig(env);
}

const getAccessSecret = () => resolveJwtConfig(process.env).accessSecret;
const getRefreshSecret = () => resolveJwtConfig(process.env).refreshSecret;

const signAccessToken = (payload) => {
    return jwt.sign(payload, getAccessSecret(), {
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    });
};

const signRefreshToken = (payload) => {
    return jwt.sign(payload, getRefreshSecret(), {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
    });
};

const verifyAccessToken = (token) => {
    return jwt.verify(token, getAccessSecret());
};

const verifyRefreshToken = (token) => {
    return jwt.verify(token, getRefreshSecret());
};

const hashToken = (token) => {
    return crypto.createHash("sha256").update(token).digest("hex");
};

const refreshExpiresAt = () => {
    const raw = process.env.JWT_REFRESH_EXPIRES_IN || "30d";
    const unit = raw.slice(-1);
    const value = parseInt(raw.slice(0, -1), 10);
    const ms =
        unit === "d" ? value * 24 * 60 * 60 * 1000 :
        unit === "h" ? value * 60 * 60 * 1000 :
        unit === "m" ? value * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    return new Date(Date.now() + ms);
};

module.exports = {
    signAccessToken,
    signRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    hashToken,
    refreshExpiresAt,
    validateJwtConfig,
    resolveJwtConfig,
    JwtConfigError,
    DEV_DEFAULT_ACCESS_SECRET,
    DEV_DEFAULT_REFRESH_SECRET,
    KNOWN_FALLBACK_SECRETS,
    MIN_SECRET_LENGTH,
};
