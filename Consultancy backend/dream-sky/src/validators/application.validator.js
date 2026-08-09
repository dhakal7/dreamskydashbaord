const AppError = require("../utils/apiError");

const VALID_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "REJECTED", "DEFERRED", "WITHDRAWN"];
const VALID_PRIORITIES = ["HIGH", "MEDIUM", "LOW"];
const VALID_OFFER_TYPES = ["CONDITIONAL", "UNCONDITIONAL"];

const validateCreateApplication = ({ studentId, universityId, courseId }) => {
    const errors = [];
    if (!studentId?.trim()) errors.push("studentId is required.");
    if (!universityId?.trim()) errors.push("universityId is required.");
    if (!courseId?.trim()) errors.push("courseId is required.");
    if (errors.length) throw AppError.badRequest(errors.join(" "), "VALIDATION_ERROR");
};

const validateUpdateApplication = ({ priority }) => {
    if (priority && !VALID_PRIORITIES.includes(priority))
        throw AppError.badRequest(`Invalid priority. Must be one of: ${VALID_PRIORITIES.join(", ")}`, "VALIDATION_ERROR");
};

const validateStatusChange = ({ status }) => {
    if (!status) throw AppError.badRequest("status is required.", "VALIDATION_ERROR");
    if (!VALID_STATUSES.includes(status))
        throw AppError.badRequest(`Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`, "VALIDATION_ERROR");
};

const validateOffer = ({ type }) => {
    if (!type) throw AppError.badRequest("type is required.", "VALIDATION_ERROR");
    if (!VALID_OFFER_TYPES.includes(type))
        throw AppError.badRequest(`Invalid offer type. Must be CONDITIONAL or UNCONDITIONAL.`, "VALIDATION_ERROR");
};

module.exports = { validateCreateApplication, validateUpdateApplication, validateStatusChange, validateOffer };
