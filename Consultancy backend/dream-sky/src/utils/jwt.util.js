const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "ds_access_super_secret_key_change_in_production_64chars_minimum";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "ds_refresh_super_secret_key_change_in_production_64chars_minimum";
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "30d";

const signAccessToken = (payload) => {
    return jwt.sign(payload, JWT_ACCESS_SECRET, {
        expiresIn: JWT_ACCESS_EXPIRES_IN,
    });
};

const signRefreshToken = (payload) => {
    return jwt.sign(payload, JWT_REFRESH_SECRET, {
        expiresIn: JWT_REFRESH_EXPIRES_IN,
    });
};

const verifyAccessToken = (token) => {
    return jwt.verify(token, JWT_ACCESS_SECRET);
};

const verifyRefreshToken = (token) => {
    return jwt.verify(token, JWT_REFRESH_SECRET);
};

const hashToken = (token) => {
    return crypto.createHash("sha256").update(token).digest("hex");
};

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
