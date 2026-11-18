const applicationService = require("../services/application.service");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const { assertStudentAccessById, assertApplicationAccess } = require("../utils/student-access");
const {
    validateCreateApplication,
    validateUpdateApplication,
    validateStatusChange,
    validateOffer,
} = require("../validators/application.validator");

const create = async (req, res) => {
    validateCreateApplication(req.body);
    await assertStudentAccessById(req.user, req.body.studentId);
    const app = await applicationService.createApplication(req.body);
    sendCreated(res, { message: "Application created.", data: app });
};

const getOne = async (req, res) => {
    await assertApplicationAccess(req.user, req.params.id);
    const app = await applicationService.getApplicationById(req.params.id);
    sendSuccess(res, { data: app });
};

const list = async (req, res) => {
    const result = await applicationService.listApplications(req.query, req.user);
    sendSuccess(res, { data: result });
};

const update = async (req, res) => {
    validateUpdateApplication(req.body);
    await assertApplicationAccess(req.user, req.params.id);
    const app = await applicationService.updateApplication(req.params.id, req.body);
    sendSuccess(res, { message: "Application updated.", data: app });
};

const changeStatus = async (req, res) => {
    validateStatusChange(req.body);
    await assertApplicationAccess(req.user, req.params.id);
    const app = await applicationService.changeStatus(req.params.id, req.body);
    sendSuccess(res, { message: `Application status changed to ${app.status}.`, data: app });
};

const recordOffer = async (req, res) => {
    validateOffer(req.body);
    await assertApplicationAccess(req.user, req.params.id);
    const offer = await applicationService.recordOffer(req.params.id, req.body);
    sendCreated(res, { message: "Offer recorded.", data: offer });
};

const remove = async (req, res) => {
    await applicationService.deleteApplication(req.params.id);
    sendSuccess(res, { message: "Application deleted." });
};

const dashboard = async (req, res) => {
    const stats = await applicationService.getDashboardStats(req.user);
    sendSuccess(res, { data: stats });
};

module.exports = { create, getOne, list, update, changeStatus, recordOffer, remove, dashboard };
