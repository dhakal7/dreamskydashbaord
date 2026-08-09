const visaService = require("../services/visa.service");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const { validateCreateVisa, validateStatusChange } = require("../validators/visa.validator");

const create = async (req, res) => {
    validateCreateVisa(req.body);
    const vc = await visaService.createVisaCase(req.body);
    sendCreated(res, { message: "Visa case created.", data: vc });
};

const getOne = async (req, res) => {
    const vc = await visaService.getVisaCaseById(req.params.id);
    sendSuccess(res, { data: vc });
};

const list = async (req, res) => {
    const result = await visaService.listVisaCases(req.query);
    sendSuccess(res, { data: result });
};

const update = async (req, res) => {
    const vc = await visaService.updateVisaCase(req.params.id, req.body);
    sendSuccess(res, { message: "Visa case updated.", data: vc });
};

const changeStatus = async (req, res) => {
    validateStatusChange(req.body);
    const vc = await visaService.changeStatus(req.params.id, req.body);
    sendSuccess(res, { message: `Visa case status changed to ${vc.status}.`, data: vc });
};

const remove = async (req, res) => {
    await visaService.deleteVisaCase(req.params.id);
    sendSuccess(res, { message: "Visa case deleted." });
};

const dashboard = async (req, res) => {
    const stats = await visaService.getDashboardStats();
    sendSuccess(res, { data: stats });
};

module.exports = { create, getOne, list, update, changeStatus, remove, dashboard };
