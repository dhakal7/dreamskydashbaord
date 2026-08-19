const AppError = require("../utils/apiError");

const VALID_CATEGORIES = ["IDENTITY", "ACADEMIC", "ENGLISH_TEST", "FINANCE", "VISA", "OTHER"];

const VALID_TYPES = [
    "PASSPORT", "CITIZENSHIP", "BIRTH_CERTIFICATE", "NATIONAL_ID",
    "SEE_CERTIFICATE", "PLUS_TWO_CERTIFICATE", "BACHELORS_CERTIFICATE", "TRANSCRIPT", "CHARACTER_CERTIFICATE",
    "IELTS", "PTE", "TOEFL", "DUOLINGO",
    "BANK_STATEMENT", "BANK_CERTIFICATE", "INCOME_CERTIFICATE", "TAX_CLEARANCE", "SPONSORSHIP_LETTER", "AFFIDAVIT", "LOAN_LETTER", "PROPERTY_VALUATION",
    "VISA_APPLICATION", "VISA_DOCUMENTS", "OFFER_LETTER", "COE",
    "CV", "SOP", "RECOMMENDATION", "FINANCIAL", "VISA_LETTER", "OTHER"
];

const VALID_STATUSES = [
    "UPLOADED", "PENDING_STUDENT_REVIEW", "CHANGES_REQUESTED", "RE_UPLOADED", "VERIFIED", "REJECTED", "EXPIRED", "PENDING"
];

const validateUpload = ({ studentId, type, category }) => {
    const errors = [];
    if (!studentId?.trim()) errors.push("studentId is required.");
    if (!type) errors.push("type is required.");
    if (type && !VALID_TYPES.includes(type.toUpperCase()))
        errors.push(`Invalid document type.`);
    if (category && !VALID_CATEGORIES.includes(category.toUpperCase()))
        errors.push(`Invalid category.`);
    if (errors.length) throw AppError.badRequest(errors.join(" "), "VALIDATION_ERROR");
};

const validateVerify = ({ status }) => {
    if (!status) throw AppError.badRequest("status is required.", "VALIDATION_ERROR");
    if (!VALID_STATUSES.includes(status.toUpperCase()))
        throw AppError.badRequest(`Invalid status value.`, "VALIDATION_ERROR");
};

const validateReview = ({ action, comment }) => {
    if (!action) throw AppError.badRequest("Action is required.", "VALIDATION_ERROR");
    if (!["APPROVE", "REQUEST_CHANGES"].includes(action.toUpperCase()))
        throw AppError.badRequest("Action must be APPROVE or REQUEST_CHANGES.", "VALIDATION_ERROR");
    if (action.toUpperCase() === "REQUEST_CHANGES" && !comment?.trim())
        throw AppError.badRequest("Comment is required when requesting changes.", "VALIDATION_ERROR");
};

module.exports = { validateUpload, validateVerify, validateReview, VALID_CATEGORIES, VALID_TYPES, VALID_STATUSES };
