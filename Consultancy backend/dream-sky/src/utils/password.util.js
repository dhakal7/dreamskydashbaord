const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 12;

/**
 * Hash a plain-text password.
 * Always use this — never store plain text passwords.
 */
const hashPassword = async (plainText) => {
    return bcrypt.hash(plainText, SALT_ROUNDS);
};

/**
 * Compare a plain-text password against a stored hash.
 * Returns true if they match, false otherwise.
 * Safe against timing attacks (bcrypt handles this internally).
 */
const comparePassword = async (plainText, hash) => {
    return bcrypt.compare(plainText, hash);
};

/**
 * Generate a random temporary password for student portal activation.
 * Format: 4 uppercase + 4 digits + 4 lowercase = 12 chars, always readable.
 */
const generateTempPassword = () => {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const digits = "23456789";
    const lower = "abcdefghjkmnpqrstuvwxyz";
    const pick = (set, n) =>
        Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join("");
    const raw = pick(upper, 4) + pick(digits, 4) + pick(lower, 4);
    // Shuffle the combined string
    return raw.split("").sort(() => Math.random() - 0.5).join("");
};

module.exports = { hashPassword, comparePassword, generateTempPassword };
