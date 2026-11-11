const AppError = require("../utils/apiError");

const VALID_CHANNELS = ["EMAIL", "PHONE", "WHATSAPP", "IN_PERSON", "MEETING"];
const VALID_DIRECTIONS = ["INBOUND", "OUTBOUND"];

const validateCreateFollowUp = ({ studentId, channel, direction, content, nextFollowUpAt }) => {
    const errors = [];
    if (!studentId?.trim()) errors.push("studentId is required.");
    if (!channel) errors.push("channel is required.");
    if (channel && !VALID_CHANNELS.includes(channel))
        errors.push(`Invalid channel. Must be one of: ${VALID_CHANNELS.join(", ")}`);
    if (!direction) errors.push("direction is required.");
    if (direction && !VALID_DIRECTIONS.includes(direction))
        errors.push(`Invalid direction. Must be one of: ${VALID_DIRECTIONS.join(", ")}`);
    if (!content?.trim()) errors.push("content is required.");

    if (nextFollowUpAt !== undefined && nextFollowUpAt !== null && nextFollowUpAt !== "") {
        const dateObj = new Date(nextFollowUpAt);
        if (Number.isNaN(dateObj.getTime())) {
            errors.push("nextFollowUpAt must be a valid date/time.");
        } else {
            // Buffer 5 minutes for minor client-server clock drift
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            if (dateObj < fiveMinutesAgo) {
                errors.push("nextFollowUpAt cannot be scheduled in the past.");
            }
        }
    }

    if (errors.length) throw AppError.badRequest(errors.join(" "), "VALIDATION_ERROR");
};

const validateUpdateFollowUp = ({ channel, direction, nextFollowUpAt }) => {
    const errors = [];
    if (channel && !VALID_CHANNELS.includes(channel))
        errors.push(`Invalid channel. Must be one of: ${VALID_CHANNELS.join(", ")}`);
    if (direction && !VALID_DIRECTIONS.includes(direction))
        errors.push(`Invalid direction. Must be one of: ${VALID_DIRECTIONS.join(", ")}`);

    if (nextFollowUpAt !== undefined && nextFollowUpAt !== null && nextFollowUpAt !== "") {
        const dateObj = new Date(nextFollowUpAt);
        if (Number.isNaN(dateObj.getTime())) {
            errors.push("nextFollowUpAt must be a valid date/time.");
        } else {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            if (dateObj < fiveMinutesAgo) {
                errors.push("nextFollowUpAt cannot be scheduled in the past.");
            }
        }
    }

    if (errors.length) throw AppError.badRequest(errors.join(" "), "VALIDATION_ERROR");
};

module.exports = { validateCreateFollowUp, validateUpdateFollowUp };
