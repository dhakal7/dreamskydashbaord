const AppError = require("../utils/apiError");

const VALID_STAGES = [
    "LEAD", "PROSPECT", "ENROLLED", "APPLIED",
    "OFFER_RECEIVED", "VISA_APPLIED", "VISA_APPROVED", "DEPARTED", "LOST",
];

const VALID_SOURCES = [
    "WALK_IN", "WEBSITE", "PHONE", "SOCIAL_MEDIA", "EDUCATION_FAIR", "REFERRAL", "OTHER",
];

const validateCreateStudent = ({ firstName, lastName, email }) => {
    const errors = [];
    if (!firstName?.trim()) errors.push("First name is required.");
    if (!lastName?.trim()) errors.push("Last name is required.");
    if (!email?.trim()) errors.push("Email is required.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
        errors.push("Email format is invalid.");
    if (errors.length) throw AppError.badRequest(errors.join(" "), "VALIDATION_ERROR");
};

const validateUpdateStudent = (body) => {
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()))
        throw AppError.badRequest("Email format is invalid.", "VALIDATION_ERROR");
};

const validatePipelineChange = ({ stage, reasonCode }) => {
    if (!stage) throw AppError.badRequest("Stage is required.", "VALIDATION_ERROR");
    if (!VALID_STAGES.includes(stage))
        throw AppError.badRequest(`Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}`, "VALIDATION_ERROR");
    if (stage === "LOST" && !reasonCode?.trim())
        throw AppError.badRequest("Reason code is required when moving to LOST.", "VALIDATION_ERROR");
};

module.exports = {
    validateCreateStudent,
    validateUpdateStudent,
    validatePipelineChange,
    VALID_STAGES,
    VALID_SOURCES,
};
