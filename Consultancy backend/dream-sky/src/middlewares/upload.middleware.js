const multer = require("multer");
const AppError = require("../utils/apiError");

const ALLOWED_MIMES = [
    "image/jpeg",
    "image/png",
    "application/pdf",
];

const MAX_IMAGE_SIZE = 2 * 1024 * 1024;  // 2 MB
const MAX_PDF_SIZE = 10 * 1024 * 1024;   // 10 MB

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
        return cb(AppError.badRequest("Only JPG, PNG, and PDF files are allowed.", "INVALID_FILE_TYPE"), false);
    }
    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_PDF_SIZE }, // use max of the two; service checks image size separately
});

/**
 * Express middleware: expects a single file field named "file"
 */
const uploadSingle = (req, res, next) => {
    upload.single("file")(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return next(AppError.badRequest("File exceeds maximum allowed size (10 MB).", "FILE_TOO_LARGE"));
            }
            return next(AppError.badRequest(err.message, "UPLOAD_ERROR"));
        }
        if (err) return next(err);
        if (!req.file) return next(AppError.badRequest("No file uploaded.", "NO_FILE"));

        // Extra size check for images
        const isImage = req.file.mimetype.startsWith("image/");
        if (isImage && req.file.size > MAX_IMAGE_SIZE) {
            return next(AppError.badRequest("Image files must be under 2 MB.", "FILE_TOO_LARGE"));
        }

        next();
    });
};

module.exports = { uploadSingle };
