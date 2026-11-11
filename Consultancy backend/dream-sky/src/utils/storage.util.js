const fs = require("fs/promises");
const path = require("path");
const AppError = require("./apiError");
const { PERSISTENT_TEST_UPLOAD_DIR } = require("../config");

// Dedicated test-mode upload directory constant bound to authoritative persistent path
const DISPOSABLE_TEST_UPLOAD_DIR = PERSISTENT_TEST_UPLOAD_DIR;

/**
 * Resolves the upload directory enforcing strict isolation in test mode.
 * In test mode (NODE_ENV=test), UPLOAD_DIR must strictly resolve to the persistent test uploads directory.
 * Silently falling back to the project's ordinary uploads folder is strictly forbidden.
 */
function resolveUploadDir() {
    if (process.env.NODE_ENV === "test") {
        const configured = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : null;
        if (!configured || configured !== DISPOSABLE_TEST_UPLOAD_DIR) {
            throw new Error(
                `[STORAGE SECURITY ERROR] In test mode (NODE_ENV=test), UPLOAD_DIR must strictly be configured to '${DISPOSABLE_TEST_UPLOAD_DIR}'. ` +
                `Silently falling back to project uploads directory is forbidden.`
            );
        }
        return configured;
    }
    return process.env.UPLOAD_DIR
        ? path.resolve(process.env.UPLOAD_DIR)
        : path.join(process.cwd(), "uploads");
}

/**
 * Ensure the upload directory exists on startup.
 * Call once at app boot — safe to call multiple times.
 * In test mode, auto-creation is disabled on module load to prevent untracked filesystem mutations.
 */
const initUploadDir = async () => {
    if (process.env.NODE_ENV === "test") {
        return;
    }
    try {
        const dir = resolveUploadDir();
        await fs.mkdir(dir, { recursive: true });
    } catch (err) {
        console.error("[storage] Failed to create upload directory:", err);
    }
};
// Auto-initialize on module load in non-test mode
initUploadDir();

const resolveSafePath = (relativePath) => {
    if (!relativePath || typeof relativePath !== "string") {
        throw AppError.badRequest("Invalid file path.", "INVALID_FILE_PATH");
    }
    // Normalize Windows-style separators to POSIX to block traversal attempts across platforms
    const normalized = relativePath.replace(/\\/g, "/");
    const resolvedUploadDir = path.resolve(resolveUploadDir());
    const fullPath = path.resolve(resolvedUploadDir, normalized);
    if (!fullPath.startsWith(resolvedUploadDir + path.sep) && fullPath !== resolvedUploadDir) {
        throw AppError.badRequest("Invalid file path: path traversal detected.", "PATH_TRAVERSAL_DETECTED");
    }
    return fullPath;
};

/**
 * Save buffer to disk. Creates sub-directories as needed.
 * @returns {string} relative path (e.g. "students/abc123/doc456.enc")
 */
const saveFile = async (relativePath, buffer) => {
    const fullPath = resolveSafePath(relativePath);
    try {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, buffer);
    } catch (err) {
        console.error("[storage] Failed to save file:", fullPath, err);
        throw AppError.internal(
            `Failed to save uploaded file on server disk (${err.code || err.message}). Please verify write permissions for "${resolveUploadDir()}".`,
            "FILE_STORAGE_ERROR"
        );
    }
    return relativePath;
};

/**
 * Read file from disk → returns Buffer
 */
const readFile = async (relativePath) => {
    const fullPath = resolveSafePath(relativePath);
    try {
        return await fs.readFile(fullPath);
    } catch (err) {
        if (err.code === "ENOENT") {
            throw AppError.notFound("File content not found on server disk.", "FILE_NOT_FOUND");
        }
        throw AppError.internal(`Failed to read file from server disk: ${err.message}`, "FILE_READ_ERROR");
    }
};

/**
 * Delete file from disk. Silently ignores if file doesn't exist.
 */
const deleteFile = async (relativePath) => {
    const fullPath = resolveSafePath(relativePath);
    try {
        await fs.unlink(fullPath);
    } catch (err) {
        if (err.code !== "ENOENT") throw err;
    }
};

module.exports = { saveFile, readFile, deleteFile, initUploadDir, resolveSafePath, resolveUploadDir, DISPOSABLE_TEST_UPLOAD_DIR };


