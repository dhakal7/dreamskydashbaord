const eventService = require("../services/event.service");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const AppError = require("../utils/apiError");

const createEvent = async (req, res, next) => {
  try {
    const { title, description, type, datetime, audienceRoles } = req.body;
    if (!title || !description || !type || !datetime || !audienceRoles) {
      throw new AppError("Fields `title`, `description`, `type`, `datetime`, and `audienceRoles` are required.", 400);
    }
    if (!eventService.VALID_EVENT_TYPES.includes(type)) {
      throw new AppError(`Invalid event type. Must be one of: ${eventService.VALID_EVENT_TYPES.join(", ")}`, 400);
    }
    if (!Array.isArray(audienceRoles) || audienceRoles.length === 0) {
      throw new AppError("`audienceRoles` must be a non-empty array.", 400);
    }

    const result = await eventService.createEvent(req.body, req.user);
    if (result.error === "INVALID_DATETIME") throw new AppError("Invalid `datetime` format.", 400);
    if (result.error === "BRANCH_NOT_FOUND") throw new AppError("Branch not found.", 404);

    sendCreated(res, { message: "Event created.", data: result.event });
  } catch (err) {
    next(err);
  }
};

const listEvents = async (req, res, next) => {
  try {
    const events = await eventService.listEvents(req.query, req.user);
    sendSuccess(res, { data: events });
  } catch (err) {
    next(err);
  }
};

const getEvent = async (req, res, next) => {
  try {
    const result = await eventService.getEventById(req.params.id, req.user);
    if (result.error === "NOT_FOUND") throw new AppError(`Event '${req.params.id}' not found.`, 404);
    if (result.error === "FORBIDDEN") throw new AppError("Access denied.", 403);
    sendSuccess(res, { data: result.event });
  } catch (err) {
    next(err);
  }
};

const updateEvent = async (req, res, next) => {
  try {
    const result = await eventService.updateEvent(req.params.id, req.body, req.user);
    if (result.error === "NOT_FOUND") throw new AppError(`Event '${req.params.id}' not found.`, 404);
    if (result.error === "FORBIDDEN") throw new AppError(result.message || "Access denied.", 403);
    if (result.error === "INVALID_DATETIME") throw new AppError("Invalid `datetime` format.", 400);
    sendSuccess(res, { message: "Event updated.", data: result.event });
  } catch (err) {
    next(err);
  }
};

const deleteEvent = async (req, res, next) => {
  try {
    const result = await eventService.deleteEvent(req.params.id, req.user);
    if (result.error === "NOT_FOUND") throw new AppError(`Event '${req.params.id}' not found.`, 404);
    if (result.error === "FORBIDDEN") throw new AppError(result.message || "Access denied.", 403);
    sendSuccess(res, { message: "Event deleted.", data: result });
  } catch (err) {
    next(err);
  }
};

const approveEvent = async (req, res, next) => {
  try {
    const result = await eventService.approveEvent(req.params.id, req.user);
    if (result.error === "NOT_FOUND") throw new AppError(`Event '${req.params.id}' not found.`, 404);
    if (result.error === "WRONG_STATUS") {
      throw new AppError(`Event is already ${result.currentStatus.toLowerCase()}. Only REQUESTED events can be approved.`, 409);
    }
    sendSuccess(res, { message: "Event approved.", data: result.event });
  } catch (err) {
    next(err);
  }
};

const rejectEvent = async (req, res, next) => {
  try {
    const result = await eventService.rejectEvent(req.params.id, req.user);
    if (result.error === "NOT_FOUND") throw new AppError(`Event '${req.params.id}' not found.`, 404);
    if (result.error === "WRONG_STATUS") {
      throw new AppError(`Event is already ${result.currentStatus.toLowerCase()}. Only REQUESTED events can be rejected.`, 409);
    }
    sendSuccess(res, { message: "Event rejected.", data: result.event });
  } catch (err) {
    next(err);
  }
};

const getCalendarEvents = async (req, res, next) => {
  try {
    const events = await eventService.getCalendarEvents(req.query, req.user);
    sendSuccess(res, { data: events });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  deleteEvent,
  approveEvent,
  rejectEvent,
  getCalendarEvents,
};
