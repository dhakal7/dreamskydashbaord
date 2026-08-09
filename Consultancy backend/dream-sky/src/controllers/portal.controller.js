const portalService = require("../services/portal.service");
const { sendSuccess } = require("../utils/response.util");

const profile = async (req, res) => {
    const data = await portalService.getProfile(req.params.studentId);
    sendSuccess(res, { data });
};

const dashboard = async (req, res) => {
    const data = await portalService.getDashboard(req.params.studentId);
    sendSuccess(res, { data });
};

const applications = async (req, res) => {
    const data = await portalService.getApplications(req.params.studentId);
    sendSuccess(res, { data });
};

const visaCases = async (req, res) => {
    const data = await portalService.getVisaCases(req.params.studentId);
    sendSuccess(res, { data });
};

const documents = async (req, res) => {
    const data = await portalService.getDocuments(req.params.studentId);
    sendSuccess(res, { data });
};

const appointments = async (req, res) => {
    const data = await portalService.getAppointments(req.params.studentId);
    sendSuccess(res, { data });
};

const followUps = async (req, res) => {
    const data = await portalService.getFollowUps(req.params.studentId);
    sendSuccess(res, { data });
};

module.exports = { profile, dashboard, applications, visaCases, documents, appointments, followUps };
