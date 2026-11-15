const studentService = require("../services/student.service");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const { isValidEmail } = require("../services/email.service");
const {
    validateCreateStudent,
    validateUpdateStudent,
    validatePipelineChange,
    validateTrashReason,
    validateBranchTransfer,
    validateCounselorAssignmentBody,
    validateAssignmentAppointment,
} = require("../validators/student.validator");

const create = async (req, res) => {
    validateCreateStudent(req.body);
    const student = await studentService.createStudent(req.body, req.user);
    let message = "Student created successfully.";
    if (student?._portalProvision) {
        const mailSkippedOrFailed = student._portalProvision.mailResult?.error || student._portalProvision.mailResult?.skipped;
        if (student._portalProvision.success && !mailSkippedOrFailed) {
            message = "Student created. Portal credentials emailed to the student.";
        } else {
            message = "Student created, but the portal credentials email could not be sent. Use 'Send Portal Credentials' on the student profile to retry.";
        }
    }
    sendCreated(res, { message, data: student });
};

const getOne = async (req, res) => {
    const student = await studentService.getStudentById(req.params.id, req.user);
    sendSuccess(res, { data: student });
};

const list = async (req, res) => {
    const result = await studentService.listStudents(req.query, req.user);
    sendSuccess(res, { data: result });
};

const update = async (req, res) => {
    validateUpdateStudent(req.body);
    const student = await studentService.updateStudent(req.params.id, req.body, req.user);
    sendSuccess(res, { message: "Student updated successfully.", data: student });
};

const changePipeline = async (req, res) => {
    validatePipelineChange(req.body);
    const student = await studentService.changePipelineStage(req.params.id, req.body, req.user);
    const provision = student?._portalProvision;
    let message = "Pipeline stage updated.";
    if (provision) {
        const mailResult = provision.mailResult;
        const mailSkippedOrFailed = mailResult?.error || mailResult?.skipped;
        if (provision.success && !mailSkippedOrFailed) {
            message = "Pipeline stage updated. Portal credentials emailed to the student.";
        } else {
            // Build a descriptive reason for the frontend
            let reason = "unknown";
            if (!provision.success) reason = provision.error || provision.reason || "provisioning failed";
            else if (mailResult?.skipped) reason = mailResult.reason === "SMTP_NOT_CONFIGURED"
                ? "SMTP is not configured on the server"
                : mailResult.reason || "email skipped";
            else if (mailResult?.error) reason = mailResult.error;
            message = `Pipeline stage updated, but the portal credentials email could not be sent (${reason}). Use 'Send Portal Credentials' on the student profile to retry.`;
        }
    }
    sendSuccess(res, { message, data: student });
};

const remove = async (req, res, next) => {
    try {
        const reason = req.body?.reason;
        validateTrashReason(reason);
        const result = await studentService.softDeleteStudent(req.params.id, req.user, reason);
        sendSuccess(res, { message: "Student moved to Trash successfully.", data: result });
    } catch (err) {
        next(err);
    }
};

const trash = async (req, res, next) => {
    try {
        const result = await studentService.listTrash(req.query, req.user);
        sendSuccess(res, { data: result });
    } catch (err) {
        next(err);
    }
};

const restore = async (req, res, next) => {
    try {
        const result = await studentService.restoreStudent(req.params.id, req.user);
        sendSuccess(res, { message: "Student restored successfully.", data: result });
    } catch (err) {
        next(err);
    }
};

const timeline = async (req, res) => {
    const history = await studentService.getTimeline(req.params.id, req.user);
    sendSuccess(res, { data: history });
};

const assign = async (req, res, next) => {
    try {
        const validatedCounselorId = validateCounselorAssignmentBody(req.body);
        const counselorId = validatedCounselorId || req.body.assignedCounselorId || req.body.counselorId;
        const appointmentDatetime = validateAssignmentAppointment(req.body);
        const result = await studentService.assignLeadToCounselor(req.params.id, counselorId, req.user, {
            appointmentDatetime,
            durationMin: req.body?.durationMin,
            meetingMode: req.body?.meetingMode,
            notes: req.body?.notes,
        });
        sendSuccess(res, { message: "Lead assigned to counselor successfully.", data: result });
    } catch (err) {
        next(err);
    }
};

const transferBranch = async (req, res, next) => {
    try {
        validateBranchTransfer(req.body);
        const result = await studentService.transferBranch(req.params.id, req.body, req.user);
        sendSuccess(res, { message: "Student transferred to destination branch successfully.", data: result });
    } catch (err) {
        next(err);
    }
};

const resendCredentials = async (req, res, next) => {
    try {
        const student = await studentService.getStudentById(req.params.id, req.user);
        if (student.isActive === false) {
            return res.status(400).json({ success: false, message: "Cannot send portal credentials to a student in Trash.", data: { message: "Cannot send portal credentials to a student in Trash." } });
        }
        if (!student.email || !isValidEmail(student.email)) {
            return res.status(400).json({ success: false, message: "This student does not have a valid email address." });
        }
        const result = await studentService.provisionPortalAndSendWelcome(student);
        if (!result.success) {
            const errorMsg = result.error || result.reason || "Failed to send portal credentials email.";
            return res.status(500).json({ success: false, message: errorMsg, data: { message: errorMsg } });
        }
        // Check if the email itself was actually sent (provisioning can succeed but email can be skipped/failed)
        const mailResult = result.mailResult;
        if (mailResult?.skipped) {
            const reason = mailResult.reason === "SMTP_NOT_CONFIGURED"
                ? "Email not sent: SMTP is not configured on the server. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS in your .env file."
                : mailResult.reason === "INVALID_EMAIL_FORMAT"
                    ? "Email not sent: The student's email address appears to be invalid or a placeholder."
                    : `Email was skipped (reason: ${mailResult.reason || "unknown"}).`;
            return res.status(500).json({ success: false, message: reason, data: { message: reason } });
        }
        if (mailResult?.error) {
            const reason = `Email sending failed: ${mailResult.error}`;
            return res.status(500).json({ success: false, message: reason, data: { message: reason } });
        }
        const msg = `Portal access credentials sent to ${student.email}.`;
        sendSuccess(res, { message: msg, data: { success: true, message: msg } });
    } catch (err) {
        next(err);
    }
};

module.exports = { create, getOne, list, trash, update, changePipeline, remove, restore, timeline, resendCredentials, assign, transferBranch };
