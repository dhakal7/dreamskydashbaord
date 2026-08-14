const notificationService = require("../services/notification.service");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const AppError = require("../utils/apiError");

const VALID_CHANNELS = ["IN_APP", "EMAIL", "SMS", "WHATSAPP"];
const VALID_TEMPLATE_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"];
const VALID_NOTIFICATION_STATUSES = ["QUEUED", "SENT", "FAILED", "READ"];

// ─── Notification Templates ───────────────────────────────────────────────────

const listTemplates = async (req, res, next) => {
  try {
    const templates = await notificationService.listTemplates();
    sendSuccess(res, { data: templates });
  } catch (err) {
    next(err);
  }
};

const getTemplate = async (req, res, next) => {
  try {
    const template = await notificationService.getTemplateById(req.params.id);
    if (!template) {
      throw new AppError(`Notification template '${req.params.id}' not found.`, 404);
    }
    sendSuccess(res, { data: template });
  } catch (err) {
    next(err);
  }
};

const createTemplate = async (req, res, next) => {
  try {
    const { channel, name, content, approvalStatus } = req.body;
    const createdBy = req.user ? req.user.id : null;

    if (!channel || !name || !content) {
      throw new AppError("Fields `channel`, `name`, and `content` are required.", 400);
    }

    if (!VALID_CHANNELS.includes(channel)) {
      throw new AppError(
        `Invalid channel '${channel}'. Must be one of: ${VALID_CHANNELS.join(", ")}.`,
        400
      );
    }

    if (approvalStatus && !VALID_TEMPLATE_STATUSES.includes(approvalStatus)) {
      throw new AppError(
        `Invalid approvalStatus '${approvalStatus}'. Must be one of: ${VALID_TEMPLATE_STATUSES.join(", ")}.`,
        400
      );
    }

    const result = await notificationService.createTemplate({ channel, name, content, approvalStatus, createdBy });
    if (result.error === "DUPLICATE_NAME") {
      throw new AppError(`Notification template '${name}' already exists.`, 409);
    }

    sendCreated(res, { message: "Notification template created.", data: result });
  } catch (err) {
    next(err);
  }
};

const updateTemplate = async (req, res, next) => {
  try {
    const existing = await notificationService.getTemplateById(req.params.id);
    if (!existing) {
      throw new AppError(`Notification template '${req.params.id}' not found.`, 404);
    }

    const { channel, name, content, approvalStatus } = req.body;

    if (channel && !VALID_CHANNELS.includes(channel)) {
      throw new AppError(
        `Invalid channel '${channel}'. Must be one of: ${VALID_CHANNELS.join(", ")}.`,
        400
      );
    }

    if (approvalStatus && !VALID_TEMPLATE_STATUSES.includes(approvalStatus)) {
      throw new AppError(
        `Invalid approvalStatus '${approvalStatus}'. Must be one of: ${VALID_TEMPLATE_STATUSES.join(", ")}.`,
        400
      );
    }

    const result = await notificationService.updateTemplate(req.params.id, { channel, name, content, approvalStatus });
    if (result.error === "DUPLICATE_NAME") {
      throw new AppError(`Notification template '${name}' already exists.`, 409);
    }

    sendSuccess(res, { message: "Notification template updated.", data: result });
  } catch (err) {
    next(err);
  }
};

const deleteTemplate = async (req, res, next) => {
  try {
    const existing = await notificationService.getTemplateById(req.params.id);
    if (!existing) {
      throw new AppError(`Notification template '${req.params.id}' not found.`, 404);
    }
    const result = await notificationService.deleteTemplate(req.params.id);
    sendSuccess(res, { message: "Notification template deleted.", data: result });
  } catch (err) {
    next(err);
  }
};

// ─── Notifications ────────────────────────────────────────────────────────────

const listNotifications = async (req, res, next) => {
  try {
    const { status } = req.query;
    if (status && !VALID_NOTIFICATION_STATUSES.includes(status)) {
      throw new AppError(
        `Invalid status '${status}'. Must be one of: ${VALID_NOTIFICATION_STATUSES.join(", ")}.`,
        400
      );
    }

    // Non-SUPER_ADMIN can only see their own notifications
    const query = { ...req.query };
    if (req.user.role !== "SUPER_ADMIN") {
      query.recipientUserId = req.user.id;
    }

    const notifications = await notificationService.listNotifications(query);
    sendSuccess(res, { data: notifications });
  } catch (err) {
    next(err);
  }
};

const sendDirectNotification = async (req, res, next) => {
  try {
    const { to, subject, body } = req.body;
    if (!to || !subject || !body) {
      throw new AppError("Fields `to`, `subject`, and `body` are required.", 400);
    }
    const result = await notificationService.sendDirectNotification({ to, subject, body });
    sendSuccess(res, { message: "Notification email sent successfully.", data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listNotifications,
  sendDirectNotification,
};
