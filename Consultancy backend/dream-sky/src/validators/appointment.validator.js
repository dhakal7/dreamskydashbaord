const AppError = require("../utils/apiError");

const VALID_TYPES = ["INITIAL_CONSULTATION", "FOLLOW_UP", "DOCUMENT_REVIEW", "VISA_COUNSELING", "OTHER"];
const VALID_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"];
const VALID_MODES = ["OFFICE", "ONLINE"];

const validateCreateAppointment = ({ studentId, datetime, type }) => {
    const errors = [];
    if (!studentId?.trim()) errors.push("studentId is required.");
    if (!datetime) errors.push("datetime is required.");
    if (datetime && isNaN(Date.parse(datetime))) errors.push("datetime must be a valid date.");
    if (!type) errors.push("type is required.");
    if (type && !VALID_TYPES.includes(type))
        errors.push(`Invalid type. Must be one of: ${VALID_TYPES.join(", ")}`);
    if (errors.length) throw AppError.badRequest(errors.join(" "), "VALIDATION_ERROR");
};

const validateUpdateAppointment = ({ type, meetingMode, datetime }) => {
    if (type && !VALID_TYPES.includes(type))
        throw AppError.badRequest(`Invalid type. Must be one of: ${VALID_TYPES.join(", ")}`, "VALIDATION_ERROR");
    if (meetingMode && !VALID_MODES.includes(meetingMode))
        throw AppError.badRequest(`Invalid meetingMode. Must be OFFICE or ONLINE.`, "VALIDATION_ERROR");
    if (datetime && isNaN(Date.parse(datetime)))
        throw AppError.badRequest("datetime must be a valid date.", "VALIDATION_ERROR");
};

const validateStatusChange = ({ status }) => {
    if (!status) throw AppError.badRequest("status is required.", "VALIDATION_ERROR");
    if (!VALID_STATUSES.includes(status))
        throw AppError.badRequest(`Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`, "VALIDATION_ERROR");
};

module.exports = { validateCreateAppointment, validateUpdateAppointment, validateStatusChange };
