const studentService = require("../services/student.service");
const { sendSuccess, sendCreated } = require("../utils/response.util");
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

const remove = async (req, res) => {
    await studentService.softDeleteStudent(req.params.id);
    sendSuccess(res, { message: "Student deactivated successfully." });
};

const timeline = async (req, res) => {
    const history = await studentService.getTimeline(req.params.id);
    sendSuccess(res, { data: history });
};

module.exports = { create, getOne, list, update, changePipeline, remove, timeline };
