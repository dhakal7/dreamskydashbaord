const AppError = require("../utils/apiError");

const VALID_CHANNELS = ["EMAIL", "PHONE", "WHATSAPP", "IN_PERSON", "MEETING"];
const VALID_DIRECTIONS = ["INBOUND", "OUTBOUND"];

const validateCreateFollowUp = ({ studentId, channel, direction, content }) => {
    const errors = [];
    if (!studentId?.trim()) errors.push("studentId is required.");
    if (!channel) errors.push("channel is required.");
    if (channel && !VALID_CHANNELS.includes(channel))
        errors.push(`Invalid channel. Must be one of: ${VALID_CHANNELS.join(", ")}`);
    if (!direction) errors.push("direction is required.");
    if (direction && !VALID_DIRECTIONS.includes(direction))
        errors.push(`Invalid direction. Must be one of: ${VALID_DIRECTIONS.join(", ")}`);
    if (!content?.trim()) errors.push("content is required.");
    if (errors.length) throw AppError.badRequest(errors.join(" "), "VALIDATION_ERROR");
};

const validateUpdateFollowUp = ({ channel, direction }) => {
    if (channel && !VALID_CHANNELS.includes(channel))
        throw AppError.badRequest(`Invalid channel. Must be one of: ${VALID_CHANNELS.join(", ")}`, "VALIDATION_ERROR");
    if (direction && !VALID_DIRECTIONS.includes(direction))
        throw AppError.badRequest(`Invalid direction. Must be one of: ${VALID_DIRECTIONS.join(", ")}`, "VALIDATION_ERROR");
};

module.exports = { validateCreateFollowUp, validateUpdateFollowUp };
