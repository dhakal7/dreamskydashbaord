const path = require("path");
const multer = require("multer");
const AppError = require("../utils/apiError");

const ALLOWED_MIMES = [
    "image/jpeg",
    "image/jpg",
    "image/pjpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "application/x-pdf",
    "application/acrobat",
    "applications/vnd.pdf",
    "text/pdf",
    "text/x-pdf",
    "application/octet-stream",
];

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

const MAX_FILE_SIZE = 15 * 1024 * 1024;  // 15 MB

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const isMimeAllowed = ALLOWED_MIMES.includes(file.mimetype);
    const isExtAllowed = ALLOWED_EXTENSIONS.includes(ext);

    if (!isMimeAllowed && !isExtAllowed) {
        return cb(AppError.badRequest("Only JPG, PNG, WEBP, and PDF files are allowed.", "INVALID_FILE_TYPE"), false);
    }
    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE },
});

/**
 * Express middleware: expects a single file field named "file".
 */
const uploadSingle = (req, res, next) => {
    upload.single("file")(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return next(AppError.badRequest("File exceeds maximum allowed size (15 MB).", "FILE_TOO_LARGE"));
            }
            if (err.code === "LIMIT_UNEXPECTED_FILE") {
                return next(AppError.badRequest(
                    "Only one file can be uploaded at a time. Please upload documents one by one.",
                    "MULTIPLE_FILES_NOT_ALLOWED"
                ));
            }
            return next(AppError.badRequest(err.message, "UPLOAD_ERROR"));
        }
        if (err) return next(err);

        next();
    });
};

module.exports = { uploadSingle };

