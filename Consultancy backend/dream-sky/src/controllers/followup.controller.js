const followUpService = require("../services/followup.service");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const { validateCreateFollowUp, validateUpdateFollowUp } = require("../validators/followup.validator");

const create = async (req, res) => {
    validateCreateFollowUp(req.body);
    const followUp = await followUpService.createFollowUp(req.body, req.user.userId);
    sendCreated(res, { message: "Follow-up created.", data: followUp });
};

const getOne = async (req, res) => {
    const followUp = await followUpService.getFollowUpById(req.params.id, req.user);
    sendSuccess(res, { data: followUp });
};

const list = async (req, res) => {
    const result = await followUpService.listFollowUps(req.query, req.user);
    sendSuccess(res, { data: result });
};

const studentTimeline = async (req, res) => {
    const logs = await followUpService.getStudentTimeline(req.params.studentId, req.user);
    sendSuccess(res, { data: logs });
};

const update = async (req, res) => {
    validateUpdateFollowUp(req.body);
    const followUp = await followUpService.updateFollowUp(req.params.id, req.body, req.user);
    sendSuccess(res, { message: "Follow-up updated.", data: followUp });
};

const remove = async (req, res) => {
    const result = await followUpService.deleteFollowUp(req.params.id, req.user);
    sendSuccess(res, {
        message: result.message || "Follow-up reminder cancelled.",
        data: result,
    });
};

const dashboard = async (req, res) => {
    const stats = await followUpService.getDashboardStats(req.user.userId, req.user.role);
    sendSuccess(res, { data: stats });
};

module.exports = { create, getOne, list, studentTimeline, update, remove, dashboard };
