const AppError = require("../utils/apiError");

const VALID_STATUSES = ["NOT_APPLIED", "PREPARING", "SUBMITTED", "APPROVED", "REFUSED", "RESUBMITTING"];

const validateCreateVisa = ({ applicationId, studentId }) => {
    if (!applicationId?.trim() && !studentId?.trim())
        throw AppError.badRequest("applicationId or studentId is required.", "VALIDATION_ERROR");
};

const validateStatusChange = ({ status }) => {
    if (!status) throw AppError.badRequest("status is required.", "VALIDATION_ERROR");
    if (!VALID_STATUSES.includes(status))
        throw AppError.badRequest(`Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`, "VALIDATION_ERROR");
};

module.exports = { validateCreateVisa, validateStatusChange };
