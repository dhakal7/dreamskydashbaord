const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const {
    JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET,
    JWT_ACCESS_EXPIRES_IN = "15m",
    JWT_REFRESH_EXPIRES_IN = "30d",
} = process.env;

/**
 * Sign an access token.
 * Payload (Contract #2 from backend split doc):
 *   { userId, role, branchId, mustChangePassword }
 */
const signAccessToken = (payload) => {
    return jwt.sign(payload, JWT_ACCESS_SECRET, {
        expiresIn: JWT_ACCESS_EXPIRES_IN,
    });
};

/**
 * Sign a refresh token.
 * Minimal payload — only userId. The full user context lives in the access token.
 */
const signRefreshToken = (payload) => {
    return jwt.sign(payload, JWT_REFRESH_SECRET, {
        expiresIn: JWT_REFRESH_EXPIRES_IN,
    });
};

/**
 * Verify an access token. Returns the decoded payload or throws.
 */
const verifyAccessToken = (token) => {
    return jwt.verify(token, JWT_ACCESS_SECRET);
};

/**
 * Verify a refresh token. Returns the decoded payload or throws.
 */
const verifyRefreshToken = (token) => {
    return jwt.verify(token, JWT_REFRESH_SECRET);
};

/**
 * Hash a refresh token before storing it in the DB.
 * We never store raw refresh tokens — only their SHA-256 hash.
 * This means even if the DB is compromised, tokens cannot be reused.
 */
const hashToken = (token) => {
    return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * Parse JWT_REFRESH_EXPIRES_IN ("30d", "7d", etc.) into a JS Date object.
 * Used to set the DB row expiry when storing a refresh token.
 */
const refreshExpiresAt = () => {
    const raw = JWT_REFRESH_EXPIRES_IN || "30d";
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
};
