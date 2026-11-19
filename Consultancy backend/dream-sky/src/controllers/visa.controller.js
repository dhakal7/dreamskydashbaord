const visaService = require("../services/visa.service");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const { validateCreateVisa, validateStatusChange } = require("../validators/visa.validator");

const create = async (req, res) => {
    validateCreateVisa(req.body);
    const vc = await visaService.createVisaCase(req.body, req.user);
    sendCreated(res, { message: "Visa case created.", data: vc });
};

const getOne = async (req, res) => {
    const vc = await visaService.getVisaCaseById(req.params.id, req.user);
    sendSuccess(res, { data: vc });
};

const list = async (req, res) => {
    const result = await visaService.listVisaCases(req.query, req.user);
    sendSuccess(res, { data: result });
};

const update = async (req, res) => {
    const vc = await visaService.updateVisaCase(req.params.id, req.body, req.user);
    sendSuccess(res, { message: "Visa case updated.", data: vc });
};

const changeStatus = async (req, res) => {
    validateStatusChange(req.body);
    const vc = await visaService.changeStatus(req.params.id, req.body, req.user);
    sendSuccess(res, { message: `Visa case status changed to ${vc.status}.`, data: vc });
};

const remove = async (req, res) => {
    await visaService.deleteVisaCase(req.params.id, req.user);
    sendSuccess(res, { message: "Visa case deleted." });
};

const dashboard = async (req, res) => {
    const stats = await visaService.getDashboardStats(req.user);
    sendSuccess(res, { data: stats });
};

const listGranted = async (req, res) => {
    const students = await visaService.listVisaGrantedStudents(req.query, req.user);
    sendSuccess(res, { data: students });
};

const grantedAnalytics = async (req, res) => {
    const analytics = await visaService.getVisaGrantedAnalytics(req.user);
    sendSuccess(res, { data: analytics });
};

const updateDeparture = async (req, res) => {
    const details = await visaService.updateStudentDepartureStatus(req.params.studentId, req.body, req.user);
    sendSuccess(res, { message: "Departure status updated.", data: details });
};

module.exports = {
    create,
    getOne,
    list,
    update,
    changeStatus,
    remove,
    dashboard,
    listGranted,
    grantedAnalytics,
    updateDeparture,
};
