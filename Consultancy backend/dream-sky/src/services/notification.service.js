const prisma = require("../prisma");
const { sendNotificationEmail, isConfigured } = require("./email.service");

/**
 * Render a template string by replacing {{token}} placeholders with data values.
 */
function renderTemplate(content, data) {
  return content.replace(/{{\s*([\w.]+)\s*}}/g, (_match, token) => {
    const value = data[token];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

function buildFallbackBody(templateName, data) {
  if (typeof data.message === "string" && data.message) {
    return data.message;
  }
  return `Notification queued for template "${templateName}".`;
}

/**
 * Queue a notification using the named template.
 * Persists a Notification row only — delivery providers not yet integrated.
 *
 * @param {string} recipientId - User.id of the recipient
 * @param {string} templateName - NotificationTemplate.name to look up
 * @param {Record<string,unknown>} data - Template variables and fallback message
 * @returns {Promise<Object>} The created Notification record
 */
async function sendNotification(recipientId, templateName, data = {}) {
  const template = await prisma.notificationTemplate.findUnique({
    where: { name: templateName },
  });

  const renderedBody = template
    ? renderTemplate(template.content, data)
    : buildFallbackBody(templateName, data);

  const subject = typeof data.subject === "string" ? data.subject : template?.name ?? null;

  const notification = await prisma.notification.create({
    data: {
      channel: template?.channel ?? "IN_APP",
      templateId: template?.id ?? null,
      recipientUserId: recipientId,
      subject,
      body: renderedBody,
      status: "QUEUED",
      payload: data,
    },
  });

  console.log(
    "[Notification] queued",
    JSON.stringify({
      notificationId: notification.id,
      recipientId,
      templateName,
      channel: notification.channel,
    })
  );

  deliverByEmail(notification, renderedBody).catch((err) => {
    console.error("[Notification] email delivery failed", err.message);
  });

  return notification;
}

/**
 * Send every queued notification as a real email from the consultancy address,
 * without breaking the in-app notification path. Fire-and-forget: any SMTP
 * failure is logged and recorded on the row, never thrown to the caller.
 * Opt out per-notification with data.skipEmail === true.
 */
async function deliverByEmail(notification, renderedBody) {
  if (!isConfigured()) return;

  const payload = notification.payload ?? {};
  if (payload.skipEmail === true) return;

  const recipient = await prisma.user.findUnique({
    where: { id: notification.recipientUserId },
    select: { email: true, firstName: true },
  });
  const email = recipient?.email;
  if (!email) return;

  const body =
    typeof renderedBody === "string" && renderedBody.length
      ? renderedBody
      : notification.body;

  try {
    await sendNotificationEmail({
      to: email,
      subject: notification.subject ?? `DreamSky Notification #${notification.id}`,
      body,
    });

    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: "SENT", sentAt: new Date() },
    });

    console.log(
      `[Notification] emailed #${notification.id} to ${email}`,
      JSON.stringify({ subject: notification.subject })
    );
  } catch (err) {
    console.error(
      `[Notification] email to ${email} failed for #${notification.id}`,
      err.message
    );
    await prisma.notification
      .update({
        where: { id: notification.id },
        data: { status: "FAILED" },
      })
      .catch(() => {});
  }
}

/**
 * List notification templates
 */
async function listTemplates() {
  return await prisma.notificationTemplate.findMany({
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get a template by ID
 */
async function getTemplateById(id) {
  return await prisma.notificationTemplate.findUnique({ where: { id } });
}

/**
 * Create a notification template
 */
async function createTemplate(data) {
  const { channel, name, content, approvalStatus, createdBy } = data;

  const existing = await prisma.notificationTemplate.findUnique({ where: { name } });
  if (existing) return { error: "DUPLICATE_NAME" };

  return await prisma.notificationTemplate.create({
    data: {
      channel,
      name: name.trim(),
      content,
      approvalStatus: approvalStatus ?? "DRAFT",
      createdBy,
    },
  });
}

/**
 * Update a notification template
 */
async function updateTemplate(id, data) {
  const { channel, name, content, approvalStatus } = data;

  // Check name uniqueness if renaming
  if (name) {
    const duplicate = await prisma.notificationTemplate.findFirst({
      where: { name, NOT: { id } },
    });
    if (duplicate) return { error: "DUPLICATE_NAME" };
  }

  return await prisma.notificationTemplate.update({
    where: { id },
    data: {
      ...(channel ? { channel } : {}),
      ...(name ? { name: name.trim() } : {}),
      ...(content !== undefined ? { content } : {}),
      ...(approvalStatus ? { approvalStatus } : {}),
    },
  });
}

/**
 * Delete a notification template
 */
async function deleteTemplate(id) {
  await prisma.notificationTemplate.delete({ where: { id } });
  return { deleted: true, id };
}

/**
 * List notifications for a recipient (or all for SUPER_ADMIN)
 */
async function listNotifications(query = {}) {
  const { recipientUserId, status } = query;
  const where = {};
  if (recipientUserId) where.recipientUserId = recipientUserId;
  if (status) where.status = status;

  return await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Send a direct custom notification email to a specific email address.
 */
async function sendDirectNotification({ to, subject, body }) {
  const result = await sendNotificationEmail({ to, subject, body });
  return { success: true, messageId: result?.messageId };
}

module.exports = {
  sendNotification,
  sendDirectNotification,
  listTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listNotifications,
};
