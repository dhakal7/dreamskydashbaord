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
    sendCreated(res, { message: "Student created successfully.", data: student });
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
    sendSuccess(res, { message: "Pipeline stage updated.", data: student });
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
            return res.status(500).json({ success: false, message: result.error || "Failed to send portal credentials email." });
        }
        sendSuccess(res, { message: `Portal access credentials sent to ${student.email}.` });
    } catch (err) {
        next(err);
    }
};

module.exports = { create, getOne, list, update, changePipeline, remove, timeline, resendCredentials };
