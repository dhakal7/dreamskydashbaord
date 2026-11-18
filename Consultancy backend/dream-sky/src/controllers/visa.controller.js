const visaService = require("../services/visa.service");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const { assertStudentAccessById, assertApplicationAccess, assertVisaCaseAccess } = require("../utils/student-access");
const { validateCreateVisa, validateStatusChange } = require("../validators/visa.validator");

const create = async (req, res) => {
    validateCreateVisa(req.body);
    if (req.body.applicationId) await assertApplicationAccess(req.user, req.body.applicationId);
    else await assertStudentAccessById(req.user, req.body.studentId);
    const vc = await visaService.createVisaCase(req.body);
    sendCreated(res, { message: "Visa case created.", data: vc });
};

const getOne = async (req, res) => {
    await assertVisaCaseAccess(req.user, req.params.id);
    const vc = await visaService.getVisaCaseById(req.params.id);
    sendSuccess(res, { data: vc });
};

const list = async (req, res) => {
    const result = await visaService.listVisaCases(req.query, req.user);
    sendSuccess(res, { data: result });
};

const update = async (req, res) => {
    await assertVisaCaseAccess(req.user, req.params.id);
    const vc = await visaService.updateVisaCase(req.params.id, req.body);
    sendSuccess(res, { message: "Visa case updated.", data: vc });
};

const changeStatus = async (req, res) => {
    validateStatusChange(req.body);
    await assertVisaCaseAccess(req.user, req.params.id);
    const vc = await visaService.changeStatus(req.params.id, req.body);
    sendSuccess(res, { message: `Visa case status changed to ${vc.status}.`, data: vc });
};

const remove = async (req, res) => {
    await assertVisaCaseAccess(req.user, req.params.id);
    await visaService.deleteVisaCase(req.params.id);
    sendSuccess(res, { message: "Visa case deleted." });
};

const dashboard = async (req, res) => {
    const stats = await visaService.getDashboardStats(req.user);
    sendSuccess(res, { data: stats });
};

module.exports = { create, getOne, list, update, changeStatus, remove, dashboard };
