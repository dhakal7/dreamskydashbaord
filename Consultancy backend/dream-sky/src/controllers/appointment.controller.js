const appointmentService = require("../services/appointment.service");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const AppError = require("../utils/apiError");
const { assertStudentAccessById, assertAppointmentAccess } = require("../utils/student-access");
const {
    validateCreateAppointment,
    validateUpdateAppointment,
    validateStatusChange,
} = require("../validators/appointment.validator");

const create = async (req, res) => {
    validateCreateAppointment(req.body);
    if (req.body.studentId) await assertStudentAccessById(req.user, req.body.studentId);
    const payload = { ...req.body };
    if (req.user.role === "COUNSELOR") {
        if (payload.counselorId && payload.counselorId !== req.user.userId) {
            throw AppError.forbidden("Counselors cannot assign another counselor as appointment host.", "FORBIDDEN");
        }
        payload.counselorId = req.user.userId;
    }
    const appt = await appointmentService.createAppointment(payload, req.user);
    sendCreated(res, { message: "Appointment created.", data: appt });
};

const getOne = async (req, res) => {
    await assertAppointmentAccess(req.user, req.params.id);
    const appt = await appointmentService.getAppointmentById(req.params.id);
    sendSuccess(res, { data: appt });
};

const list = async (req, res) => {
    const result = await appointmentService.listAppointments(req.query, req.user);
    sendSuccess(res, { data: result });
};

const update = async (req, res) => {
    validateUpdateAppointment(req.body);
    await assertAppointmentAccess(req.user, req.params.id);
    if (
        req.user.role === "COUNSELOR" &&
        req.body.counselorId !== undefined &&
        req.body.counselorId !== req.user.userId
    ) {
        throw AppError.forbidden("Counselors cannot assign another counselor as appointment host.", "FORBIDDEN");
    }
    const appt = await appointmentService.updateAppointment(req.params.id, req.body, req.user);
    sendSuccess(res, { message: "Appointment updated.", data: appt });
};

const changeStatus = async (req, res) => {
    validateStatusChange(req.body);
    await assertAppointmentAccess(req.user, req.params.id);
    const appt = await appointmentService.changeStatus(req.params.id, req.body);
    sendSuccess(res, { message: `Appointment marked as ${appt.status}.`, data: appt });
};

const remove = async (req, res) => {
    await assertAppointmentAccess(req.user, req.params.id);
    await appointmentService.deleteAppointment(req.params.id);
    sendSuccess(res, { message: "Appointment deleted." });
};

const dashboard = async (req, res) => {
    const stats = await appointmentService.getDashboardStats(req.user.userId, req.user.role);
    sendSuccess(res, { data: stats });
};

module.exports = { create, getOne, list, update, changeStatus, remove, dashboard };
