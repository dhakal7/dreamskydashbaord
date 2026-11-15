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
    if (email && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
        errors.push("Email format is invalid.");
    if (errors.length) throw AppError.badRequest(errors.join(" "), "VALIDATION_ERROR");
};

const validateUpdateStudent = (body) => {
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()))
        throw AppError.badRequest("Email format is invalid.", "VALIDATION_ERROR");
};

const VALID_LEAD_STAGES = ["NEW", "FOLLOW_UP", "ASSIGNED", "COUNSELLING", "INTERESTED", "NOT_CONTRACTED"];

const validateAssignmentAppointment = (body) => {
    const { appointmentDate, appointmentTime, followUpDate, followUpTime, datetime } = body || {};
    const dateVal = appointmentDate || followUpDate;
    const timeVal = appointmentTime || followUpTime;

    const hasDate = Boolean(dateVal || (datetime && String(datetime).includes("T")));
    const hasTime = Boolean(timeVal || (datetime && String(datetime).includes("T")));
    if (!hasDate || !hasTime) {
        throw AppError.badRequest(
            "Appointment date and time are required when moving to Assigned.",
            "MISSING_APPOINTMENT_DATETIME"
        );
    }

    const dateStr = datetime || `${dateVal}T${timeVal && String(timeVal).length === 5 ? timeVal + ":00" : timeVal}`;
    const parsedDate = new Date(dateStr);
    if (isNaN(parsedDate.getTime())) {
        throw AppError.badRequest(
            "Invalid appointment date or time format.",
            "INVALID_APPOINTMENT_DATETIME"
        );
    }

    return parsedDate;
};

const validatePipelineChange = (body) => {
    const { stage, leadStage, reasonCode, email, followUpDate, followUpTime, datetime } = body || {};
    const effectiveStage = stage || leadStage;
    if (!effectiveStage) throw AppError.badRequest("Stage is required.", "VALIDATION_ERROR");

    const upperStage = String(effectiveStage).toUpperCase().replace(/-/g, "_");
    const upperLeadStage = leadStage ? String(leadStage).toUpperCase().replace(/-/g, "_") : null;

    const isLeadStage = VALID_LEAD_STAGES.includes(upperStage) || (upperLeadStage && VALID_LEAD_STAGES.includes(upperLeadStage));
    const isMacroStage = VALID_STAGES.includes(upperStage);

    if (!isLeadStage && !isMacroStage) {
        throw AppError.badRequest(
            `Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}, ${VALID_LEAD_STAGES.join(", ")}`,
            "VALIDATION_ERROR"
        );
    }

    if (upperStage === "FOLLOW_UP" || upperLeadStage === "FOLLOW_UP") {
        const hasDate = Boolean(followUpDate || (datetime && String(datetime).includes("T")));
        const hasTime = Boolean(followUpTime || (datetime && String(datetime).includes("T")));
        if (!hasDate || !hasTime) {
            throw AppError.badRequest(
                "Follow-up date and time are required when moving to Follow Up.",
                "MISSING_FOLLOWUP_DATETIME"
            );
        }

        const dateStr = datetime || `${followUpDate}T${followUpTime && followUpTime.length === 5 ? followUpTime + ":00" : followUpTime}`;
        const parsedDate = new Date(dateStr);
        if (isNaN(parsedDate.getTime())) {
            throw AppError.badRequest(
                "Invalid follow-up date or time format.",
                "INVALID_FOLLOWUP_DATETIME"
            );
        }
    }

    if (upperStage === "ASSIGNED" || upperLeadStage === "ASSIGNED") {
        validateCounselorAssignmentBody(body);
        validateAssignmentAppointment(body);
    }

    if (upperStage === "LOST" && !reasonCode?.trim())
        throw AppError.badRequest("Reason code is required when moving to LOST.", "VALIDATION_ERROR");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
        throw AppError.badRequest("Email format is invalid.", "VALIDATION_ERROR");
};

const validateTrashReason = (reason) => {
    if (typeof reason !== "string" || !reason.trim()) {
        throw AppError.badRequest(
            "A non-empty reason is required to move a record to Trash.",
            "MISSING_TRASH_REASON"
        );
    }
    return reason.trim();
};

const validateBranchTransfer = (body) => {
    const { destinationBranchId, newAssignedCounselorId } = body || {};
    if (!destinationBranchId || typeof destinationBranchId !== "string" || !destinationBranchId.trim()) {
        throw AppError.badRequest("Destination branch ID is required.", "MISSING_DESTINATION_BRANCH");
    }
    if (newAssignedCounselorId !== undefined && newAssignedCounselorId !== null) {
        if (typeof newAssignedCounselorId !== "string" || !newAssignedCounselorId.trim()) {
            throw AppError.badRequest("Invalid replacement counselor ID.", "INVALID_REPLACEMENT_COUNSELOR");
        }
    }
    return {
        destinationBranchId: destinationBranchId.trim(),
        newAssignedCounselorId: newAssignedCounselorId ? newAssignedCounselorId.trim() : newAssignedCounselorId,
    };
};

const validateCounselorAssignmentBody = (body) => {
    const rawId = body?.assignedCounselorId ?? body?.counselorId;
    if (!rawId || typeof rawId !== "string" || !rawId.trim()) {
        throw AppError.badRequest("Counselor ID is required for assignment.", "MISSING_COUNSELOR_ID");
    }
    return rawId.trim();
};

module.exports = {
    validateCreateStudent,
    validateUpdateStudent,
    validatePipelineChange,
    validateTrashReason,
    validateBranchTransfer,
    validateCounselorAssignmentBody,
    validateAssignmentAppointment,
    VALID_STAGES,
    VALID_LEAD_STAGES,
    VALID_SOURCES,
};
