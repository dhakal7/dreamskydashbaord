const fs = require("fs/promises");
const path = require("path");

// Support a configurable upload directory via env (important for cPanel deployments
// where process.cwd() may not be writable, but a specific path is).
const UPLOAD_DIR = process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(process.cwd(), "uploads");

/**
 * Ensure the upload directory exists on startup.
 * Call once at app boot — safe to call multiple times.
 */
const initUploadDir = async () => {
    try {
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
    } catch (err) {
        console.error("[storage] Failed to create upload directory:", UPLOAD_DIR, err);
    }
};
// Auto-initialize on module load
initUploadDir();

/**
 * Save buffer to disk. Creates sub-directories as needed.
 * @returns {string} relative path (e.g. "students/abc123/doc456.enc")
 */
const saveFile = async (relativePath, buffer) => {
    const fullPath = path.join(UPLOAD_DIR, relativePath);
    try {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, buffer);
    } catch (err) {
        console.error("[storage] Failed to save file:", fullPath, err);
        throw err;
    }
    return relativePath;
};

/**
 * Read file from disk → returns Buffer
 */
const readFile = async (relativePath) => {
    const fullPath = path.join(UPLOAD_DIR, relativePath);
    return fs.readFile(fullPath);
};

/**
 * Delete file from disk. Silently ignores if file doesn't exist.
 */
const deleteFile = async (relativePath) => {
    const fullPath = path.join(UPLOAD_DIR, relativePath);
    try {
        await fs.unlink(fullPath);
    } catch (err) {
        if (err.code !== "ENOENT") throw err;
    }
};

module.exports = { saveFile, readFile, deleteFile, initUploadDir };

