const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const getAccessSecret = () => {
    const secret = process.env.JWT_ACCESS_SECRET?.trim();
    if (!secret && process.env.NODE_ENV === "production") {
        throw new Error("[SECURITY CONFIG ERROR] JWT_ACCESS_SECRET must be set in production.");
    }
    return secret || "ds_access_super_secret_key_change_in_production_64chars_minimum";
};

const getRefreshSecret = () => {
    const secret = process.env.JWT_REFRESH_SECRET?.trim();
    if (!secret && process.env.NODE_ENV === "production") {
        throw new Error("[SECURITY CONFIG ERROR] JWT_REFRESH_SECRET must be set in production.");
    }
    return secret || "ds_refresh_super_secret_key_change_in_production_64chars_minimum";
};

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
};
