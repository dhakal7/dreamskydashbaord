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
 * Express middleware: expects a single file field named "file".
 * Returns a clean JSON 400 when:
 *  - Multiple files are sent (MulterError: Unexpected field)
 *  - File exceeds size limit
 *  - Invalid file type
 *  - No file included at all
 */
const uploadSingle = (req, res, next) => {
    upload.single("file")(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return next(AppError.badRequest("File exceeds maximum allowed size (10 MB).", "FILE_TOO_LARGE"));
            }
            // LIMIT_UNEXPECTED_FILE fires when multiple files or wrong field name is sent
            if (err.code === "LIMIT_UNEXPECTED_FILE") {
                return next(AppError.badRequest(
                    "Only one file can be uploaded at a time. Please upload documents one by one.",
                    "MULTIPLE_FILES_NOT_ALLOWED"
                ));
            }
            return next(AppError.badRequest(err.message, "UPLOAD_ERROR"));
        }
        if (err) return next(err);

        // Missing file — controller will handle this gracefully
        // (we don't reject here so the controller can return a typed error message)

        // Extra size check for images
        if (req.file) {
            const isImage = req.file.mimetype.startsWith("image/");
            if (isImage && req.file.size > MAX_IMAGE_SIZE) {
                return next(AppError.badRequest("Image files must be under 2 MB.", "FILE_TOO_LARGE"));
            }
        }

        next();
    });
};

module.exports = { uploadSingle };
