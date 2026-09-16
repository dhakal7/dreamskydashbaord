const studentService = require("../services/student.service");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const { isValidEmail } = require("../services/email.service");
const {
    validateCreateStudent,
    validateUpdateStudent,
    validatePipelineChange,
} = require("../validators/student.validator");

const create = async (req, res) => {
    validateCreateStudent(req.body);
    const student = await studentService.createStudent(req.body);
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
    const student = await studentService.getStudentById(req.params.id);
    sendSuccess(res, { data: student });
};

const list = async (req, res) => {
    const result = await studentService.listStudents(req.query);
    sendSuccess(res, { data: result });
};

const update = async (req, res) => {
    validateUpdateStudent(req.body);
    const student = await studentService.updateStudent(req.params.id, req.body);
    sendSuccess(res, { message: "Student updated successfully.", data: student });
};

const changePipeline = async (req, res) => {
    validatePipelineChange(req.body);
    const student = await studentService.changePipelineStage(req.params.id, req.body, req.user.userId);
    const provision = student?._portalProvision;
    let message = "Pipeline stage updated.";
    if (provision) {
        const mailSkippedOrFailed = provision.mailResult?.error || provision.mailResult?.skipped;
        if (provision.success && !mailSkippedOrFailed) {
            message = "Pipeline stage updated. Portal credentials emailed to the student.";
        } else {
            message = "Pipeline stage updated, but the portal credentials email could not be sent. Use 'Send Portal Credentials' on the student profile to retry.";
        }
    }
    sendSuccess(res, { message, data: student });
};

const remove = async (req, res, next) => {
    try {
        await studentService.deleteStudent(req.params.id);
        sendSuccess(res, { message: "Student deleted successfully." });
    } catch (err) {
        next(err);
    }
};

const timeline = async (req, res) => {
    const history = await studentService.getTimeline(req.params.id);
    sendSuccess(res, { data: history });
};

const resendCredentials = async (req, res, next) => {
    try {
        const student = await studentService.getStudentById(req.params.id);
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

module.exports = { create, getOne, list, update, changePipeline, remove, timeline, resendCredentials };
