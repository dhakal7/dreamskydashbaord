const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

const getKey = () => {
    const hex = process.env.DOCUMENT_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) throw new Error("DOCUMENT_ENCRYPTION_KEY must be a 64-char hex string (32 bytes).");
    return Buffer.from(hex, "hex");
};

const encrypt = (buffer) => {
    try {
        const hex = process.env.DOCUMENT_ENCRYPTION_KEY;
        if (!hex || hex.length !== 64) return buffer;
        const key = Buffer.from(hex, "hex");
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
        const authTag = cipher.getAuthTag();

        return Buffer.concat([iv, encrypted, authTag]);
    } catch (err) {
        return buffer;
    }
};

/**
 * Decrypt a buffer that was produced by encrypt().
 * Throws if decryption fails so callers get a proper error (not corrupted bytes).
 * Returns raw buffer if DOCUMENT_ENCRYPTION_KEY is not set (unencrypted mode).
 */
const decrypt = (encryptedBuffer) => {
    const hex = process.env.DOCUMENT_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        // No key configured — assume file was stored unencrypted
        return encryptedBuffer;
    }

    // Minimum length: IV_LENGTH (16) + at least 1 byte of data + AUTH_TAG_LENGTH (16)
    if (!encryptedBuffer || encryptedBuffer.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
        throw new Error("Cannot decrypt: buffer is too short or corrupted.");
    }

    const key = Buffer.from(hex, "hex"); // ← properly declared in this scope
    const iv = encryptedBuffer.subarray(0, IV_LENGTH);
    const authTag = encryptedBuffer.subarray(encryptedBuffer.length - AUTH_TAG_LENGTH);
    const ciphertext = encryptedBuffer.subarray(IV_LENGTH, encryptedBuffer.length - AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};

module.exports = { encrypt, decrypt };
