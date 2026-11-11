const appointmentService = require("../services/appointment.service");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const {
    validateCreateAppointment,
    validateUpdateAppointment,
    validateStatusChange,
} = require("../validators/appointment.validator");

const create = async (req, res) => {
    validateCreateAppointment(req.body);
    const appt = await appointmentService.createAppointment(req.body, req.user);
    sendCreated(res, { message: "Appointment created.", data: appt });
};

const getOne = async (req, res) => {
    const appt = await appointmentService.getAppointmentById(req.params.id, req.user);
    sendSuccess(res, { data: appt });
};

const list = async (req, res) => {
    const result = await appointmentService.listAppointments(req.query, req.user);
    sendSuccess(res, { data: result });
};

const update = async (req, res) => {
    validateUpdateAppointment(req.body);
    const appt = await appointmentService.updateAppointment(req.params.id, req.body, req.user);
    sendSuccess(res, { message: "Appointment updated.", data: appt });
};

const changeStatus = async (req, res) => {
    validateStatusChange(req.body);
    const appt = await appointmentService.changeStatus(req.params.id, req.body, req.user);
    sendSuccess(res, { message: `Appointment marked as ${appt.status}.`, data: appt });
};

const remove = async (req, res) => {
    await appointmentService.deleteAppointment(req.params.id, req.user);
    sendSuccess(res, { message: "Appointment deleted." });
};

const upcomingFollowUps = async (req, res) => {
    const hours = req.query.hours ? parseInt(req.query.hours, 10) : 24;
    const reminders = await appointmentService.getUpcomingFollowUpReminders({
        hoursAhead: hours,
        counselorId: req.query.counselorId,
        currentUser: req.user,
    });
    sendSuccess(res, { data: reminders });
};

const dashboard = async (req, res) => {
    const stats = await appointmentService.getDashboardStats(req.user.userId, req.user.role);
    sendSuccess(res, { data: stats });
};

module.exports = { create, getOne, list, update, changeStatus, remove, dashboard, upcomingFollowUps };
