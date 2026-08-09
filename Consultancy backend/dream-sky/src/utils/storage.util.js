const fs = require("fs/promises");
const path = require("path");

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

/**
 * Save buffer to disk. Creates directories as needed.
 * @returns {string} relative path (e.g. "students/abc123/doc456.enc")
 */
const saveFile = async (relativePath, buffer) => {
    const fullPath = path.join(UPLOAD_DIR, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
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

module.exports = { saveFile, readFile, deleteFile };
