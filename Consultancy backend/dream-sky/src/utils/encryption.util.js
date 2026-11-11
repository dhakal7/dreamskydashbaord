const crypto = require("crypto");
const { resolveEnvironment } = require("../config/environment");

class EncryptionConfigError extends Error {
    constructor(message) {
        super(`[ENCRYPTION CONFIG ERROR] ${message}`);
        this.name = "EncryptionConfigError";
    }
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const REQUIRED_HEX_LENGTH = 64;
const REQUIRED_BYTE_LENGTH = 32;

/**
 * Validates and resolves the active document encryption key configuration.
 *
 * Requirements:
 * - In staging and production: DOCUMENT_ENCRYPTION_KEY is strictly required,
 *   must be exactly 64 hexadecimal characters, and must decode to exactly 32 bytes.
 * - In development and test: unconfigured keys are permitted for local development,
 *   but if a key is provided, it must satisfy the 64-character hex format.
 * - Never logs secret key contents.
 *
 * @param {object} [env=process.env]
 * @returns {{ isConfigured: boolean, key: Buffer|null, hex: string|null, nodeEnv: string, isDevOrTest: boolean }}
 */
function resolveEncryptionConfig(env = process.env) {
    const envInfo = resolveEnvironment(env);
    const nodeEnv = envInfo.nodeEnv;
    const isDevOrTest = envInfo.isDevOrTest;

    const rawKey = env.DOCUMENT_ENCRYPTION_KEY;

    if (rawKey === undefined || rawKey === null || String(rawKey).trim() === "") {
        if (!isDevOrTest) {
            throw new EncryptionConfigError(
                `DOCUMENT_ENCRYPTION_KEY is required when NODE_ENV='${nodeEnv}'. ` +
                `Refusing to start in staging/production without document encryption.`
            );
        }
        return { isConfigured: false, key: null, hex: null, nodeEnv, isDevOrTest };
    }

    const trimmed = String(rawKey).trim();

    if (trimmed.length !== REQUIRED_HEX_LENGTH) {
        throw new EncryptionConfigError(
            `DOCUMENT_ENCRYPTION_KEY must be exactly ${REQUIRED_HEX_LENGTH} hexadecimal characters (received length ${trimmed.length}).`
        );
    }

    if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
        throw new EncryptionConfigError(
            "DOCUMENT_ENCRYPTION_KEY must contain only valid hexadecimal characters (0-9, a-f, A-F)."
        );
    }

    const keyBuffer = Buffer.from(trimmed, "hex");
    if (keyBuffer.length !== REQUIRED_BYTE_LENGTH) {
        throw new EncryptionConfigError(
            `DOCUMENT_ENCRYPTION_KEY must decode to exactly ${REQUIRED_BYTE_LENGTH} bytes (256 bits).`
        );
    }

    return { isConfigured: true, key: keyBuffer, hex: trimmed, nodeEnv, isDevOrTest };
}

/**
 * Validates document encryption configuration at startup. Throws EncryptionConfigError if invalid.
 */
function validateEncryptionConfig(env = process.env) {
    return resolveEncryptionConfig(env);
}

const getKey = () => {
    const config = resolveEncryptionConfig(process.env);
    if (!config.isConfigured) {
        throw new EncryptionConfigError("DOCUMENT_ENCRYPTION_KEY is not configured.");
    }
    return config.key;
};

/**
 * Encrypt a buffer using AES-256-GCM.
 * Prepends a 16-byte random IV and appends a 16-byte authentication tag.
 *
 * In staging/production: strictly fails closed if key is missing or encryption fails.
 * In development/test: falls back to unencrypted buffer only if key is not configured.
 *
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
const encrypt = (buffer) => {
    const config = resolveEncryptionConfig(process.env);
    if (!config.isConfigured) {
        // Unencrypted fallback permitted ONLY in dev/test when key is omitted
        return buffer;
    }

    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, config.key, iv);

        const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
        const authTag = cipher.getAuthTag();

        return Buffer.concat([iv, encrypted, authTag]);
    } catch (err) {
        if (!config.isDevOrTest) {
            throw new Error(`[ENCRYPTION ERROR] Document encryption failed: ${err.message}`);
        }
        return buffer;
    }
};

/**
 * Decrypt a buffer that was produced by encrypt().
 *
 * Structure: [IV (16 bytes)][Ciphertext][AuthTag (16 bytes)]
 * Throws if decryption fails or authentication tag does not verify.
 * Returns raw buffer if DOCUMENT_ENCRYPTION_KEY is not set in development/test.
 *
 * @param {Buffer} encryptedBuffer
 * @returns {Buffer}
 */
const decrypt = (encryptedBuffer) => {
    const config = resolveEncryptionConfig(process.env);
    if (!config.isConfigured) {
        // No key configured in dev/test — assume file was stored unencrypted
        return encryptedBuffer;
    }

    // Minimum length: IV_LENGTH (16) + at least 1 byte of data + AUTH_TAG_LENGTH (16) = 33 bytes
    if (!encryptedBuffer || encryptedBuffer.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
        throw new Error("Cannot decrypt: buffer is too short or corrupted.");
    }

    const iv = encryptedBuffer.subarray(0, IV_LENGTH);
    const authTag = encryptedBuffer.subarray(encryptedBuffer.length - AUTH_TAG_LENGTH);
    const ciphertext = encryptedBuffer.subarray(IV_LENGTH, encryptedBuffer.length - AUTH_TAG_LENGTH);

    try {
        const decipher = crypto.createDecipheriv(ALGORITHM, config.key, iv);
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (err) {
        throw new Error("Cannot decrypt: decryption failed or document is corrupted.");
    }
};

module.exports = {
    encrypt,
    decrypt,
    getKey,
    validateEncryptionConfig,
    resolveEncryptionConfig,
    EncryptionConfigError,
    ALGORITHM,
    IV_LENGTH,
    AUTH_TAG_LENGTH,
    REQUIRED_HEX_LENGTH,
    REQUIRED_BYTE_LENGTH,
};
