const AppError = require("../utils/apiError");

const VALID_TYPES = ["PASSPORT", "TRANSCRIPT", "ENGLISH_TEST", "BANK_STATEMENT", "OFFER_LETTER", "VISA", "OTHER"];
const VALID_STATUSES = ["VERIFIED", "REJECTED"];

const validateUpload = ({ studentId, type }) => {
    const errors = [];
    if (!studentId?.trim()) errors.push("studentId is required.");
    if (!type) errors.push("type is required.");
    if (type && !VALID_TYPES.includes(type))
        errors.push(`Invalid type. Must be one of: ${VALID_TYPES.join(", ")}`);
    if (errors.length) throw AppError.badRequest(errors.join(" "), "VALIDATION_ERROR");
};

const validateVerify = ({ status }) => {
    if (!status) throw AppError.badRequest("status is required.", "VALIDATION_ERROR");
    if (!VALID_STATUSES.includes(status))
        throw AppError.badRequest(`Status must be VERIFIED or REJECTED.`, "VALIDATION_ERROR");
};

module.exports = { validateUpload, validateVerify };
