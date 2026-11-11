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
 * @param {Object} txPrisma - Optional transaction Prisma client
 * @param {Object} options - Options: awaitEmail, attemptId
 * @returns {Promise<Object>} The created Notification record
 */
async function sendNotification(recipientId, templateName, data = {}, txPrisma = null, options = {}) {
  const db = txPrisma || prisma;
  const template = await db.notificationTemplate.findUnique({
    where: { name: templateName },
  });

  const renderedBody = template
    ? renderTemplate(template.content, data)
    : buildFallbackBody(templateName, data);

  const subject = typeof data.subject === "string" ? data.subject : template?.name ?? null;

  const notification = await db.notification.create({
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

  if (options && options.awaitEmail === true) {
    const emailResult = await deliverByEmail(notification, renderedBody, db, options);
    return { ...notification, emailResult };
  }

  deliverByEmail(notification, renderedBody, db, options).catch((err) => {
    console.error("[Notification] email delivery failed", err.message);
  });

  return notification;
}

// ─────────────────────────────────────────────────────────────────────────────
// Email delivery state machine (Phase 34E.10.7 closure)
//
// Recipient email state lives in Notification.payload (no schema change):
//   (absent)   → never attempted
//   IN_FLIGHT  → an attempt is claimed; lease in emailLeaseExpiresAt
//   SENT       → transport accepted the message (terminal)
//   SKIPPED    → not deliverable by policy/config (terminal)
//   FAILED     → definite transport rejection; retry allowed after emailNextRetryAt
//                while emailAttempts < MAX_EMAIL_ATTEMPTS, else emailExhausted (terminal)
//   UNKNOWN    → outcome ambiguous (timeout, reset, lease expiry, malformed response).
//                NEVER automatically retried. Requires explicit reconciliation via
//                resolveAmbiguousEmailDelivery().
//
// All payload writes go through casUpdateNotification(), a compare-and-swap on
// Notification.updatedAt implemented with updateMany({ where: { id, updatedAt } }).
// ─────────────────────────────────────────────────────────────────────────────

const MAX_EMAIL_ATTEMPTS = 6; // 1 initial + 5 retries
const EMAIL_RETRY_BACKOFF_MINUTES = [5, 15, 30, 60, 120]; // delay after failed attempt n (1..5)
const EMAIL_LEASE_MS = 5 * 60 * 1000;
const CAS_MAX_RETRIES = 8;

function asPayload(p) {
  return typeof p === "object" && p !== null && !Array.isArray(p) ? p : {};
}

function newAttemptId() {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveNow(options) {
  return options && options.now instanceof Date ? options.now : new Date();
}

/**
 * Backoff for the next retry after attempt number `attempts` failed definitively.
 * Returns null when no retries remain.
 */
function computeEmailRetryAt(attempts, now) {
  if (attempts >= MAX_EMAIL_ATTEMPTS) return null;
  const idx = Math.max(0, Math.min(attempts - 1, EMAIL_RETRY_BACKOFF_MINUTES.length - 1));
  return new Date(now.getTime() + EMAIL_RETRY_BACKOFF_MINUTES[idx] * 60 * 1000).toISOString();
}

async function readNotificationRow(db, id) {
  if (typeof db.notification?.findUnique === "function") {
    return db.notification.findUnique({ where: { id } });
  }
  if (typeof db.notification?.findMany === "function") {
    const list = await db.notification.findMany({ where: { id } });
    return (list || []).find((n) => n && n.id === id) || null;
  }
  return null;
}

/**
 * Compare-and-swap update of a Notification row.
 *
 * `mutate(row)` receives the freshly read row (payload normalised) and returns either
 *   { abort: true, reason, ...details }                         → no write
 *   { payloadPatch?: object, data?: object }                     → write
 * The patch is merged onto the payload that was read in the SAME iteration, and the
 * write only succeeds if updatedAt is unchanged since that read. On conflict the row
 * is re-read and `mutate` re-evaluated, so preconditions/fences are always checked
 * against the version that is actually overwritten.
 *
 * updatedAt is set explicitly to max(now, previous + 1ms) so every CAS write strictly
 * changes the version, even within the same millisecond.
 *
 * LIMITATION: clients without updateMany (legacy unit-test doubles only; every real
 * Prisma model delegate has updateMany) fall back to a NON-atomic update. Writers that
 * bypass this helper (e.g. raw SQL, Prisma Studio) are not protected.
 */
async function casUpdateNotification(db, id, mutate, options = {}) {
  const maxRetries = typeof options.maxRetries === "number" ? options.maxRetries : CAS_MAX_RETRIES;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const row = await readNotificationRow(db, id);
    if (!row) return { updated: false, reason: "NOT_FOUND" };

    const payload = asPayload(row.payload);
    const decision = mutate({ ...row, payload });
    if (!decision || decision.abort) {
      const { abort, ...rest } = decision || {};
      return { updated: false, reason: rest.reason || "ABORTED", ...rest };
    }

    const data = { ...(decision.data || {}) };
    if (decision.payloadPatch) {
      data.payload = { ...payload, ...decision.payloadPatch };
    }

    const canCas = typeof db.notification?.updateMany === "function" && row.updatedAt;
    if (!canCas) {
      const updated = await db.notification.update({ where: { id }, data });
      return { updated: true, atomic: false, notification: updated };
    }

    const prev = new Date(row.updatedAt);
    data.updatedAt = new Date(Math.max(Date.now(), prev.getTime() + 1));
    const res = await db.notification.updateMany({ where: { id, updatedAt: prev }, data });
    if (res && res.count === 1) {
      return { updated: true, atomic: true, notification: { ...row, ...data } };
    }
    // Lost the race: another writer changed the row. Re-read and re-evaluate.
  }

  console.error(`[Notification] CAS update for #${id} gave up after ${maxRetries + 1} conflicting attempts.`);
  return { updated: false, reason: "CONCURRENT_UPDATE_CONFLICT" };
}

/**
 * Update email-state fields in the payload with attempt fencing.
 * A write tagged with `attemptId` is rejected if the payload already belongs to a
 * different attempt. `options.precondition(payload)` may veto the write.
 * Unrelated payload keys (read flags, business data) are always preserved.
 */
async function updateNotificationEmailState(prismaClient, notificationId, attemptId, updateFields, options = {}) {
  const db = prismaClient || prisma;
  return casUpdateNotification(db, notificationId, (row) => {
    const p = row.payload;
    if (attemptId && p.emailAttemptId && p.emailAttemptId !== attemptId) {
      console.warn(
        `[Notification] Rejecting stale attempt callback for #${notificationId}: active is ${p.emailAttemptId}, callback attempt was ${attemptId}`
      );
      return { abort: true, reason: "STALE_ATTEMPT", currentAttemptId: p.emailAttemptId };
    }
    if (typeof options.precondition === "function" && !options.precondition(p)) {
      return { abort: true, reason: "PRECONDITION_FAILED" };
    }
    return { payloadPatch: updateFields };
  });
}

/**
 * Atomically claim the right to perform one SMTP attempt.
 * Allowed only from: never-attempted, or FAILED with retries remaining and backoff elapsed.
 * Never from IN_FLIGHT, UNKNOWN, SENT, SKIPPED. The attempt counter is incremented AT CLAIM
 * time (before SMTP) so a crash mid-send still consumes the attempt.
 */
async function claimEmailAttempt(db, notificationId, { attemptId, now }) {
  return casUpdateNotification(db, notificationId, (row) => {
    const p = row.payload;
    const status = p.emailStatus;
    const attempts = Number(p.emailAttempts || 0);
    if (status === undefined || status === null) {
      // fresh
    } else if (status === "FAILED") {
      if (p.emailExhausted || attempts >= MAX_EMAIL_ATTEMPTS) {
        return { abort: true, reason: "EXHAUSTED" };
      }
      if (p.emailNextRetryAt && new Date(p.emailNextRetryAt).getTime() > now.getTime()) {
        return { abort: true, reason: "BACKOFF_NOT_ELAPSED", nextRetryAt: p.emailNextRetryAt };
      }
    } else {
      return { abort: true, reason: `NOT_CLAIMABLE_${status}` };
    }
    return {
      payloadPatch: {
        emailStatus: "IN_FLIGHT",
        emailAttemptId: attemptId,
        emailAttempts: attempts + 1,
        emailLeaseExpiresAt: new Date(now.getTime() + EMAIL_LEASE_MS).toISOString(),
        emailNextRetryAt: null,
      },
    };
  });
}

/**
 * Record the outcome of a claimed attempt (fenced by attemptId).
 * outcome: { kind: "SENT"|"SKIPPED"|"FAILED"|"UNKNOWN", messageId?, error?, reason? }
 */
async function recordEmailOutcome(db, notificationId, attemptId, outcome, now) {
  return casUpdateNotification(db, notificationId, (row) => {
    const p = row.payload;
    if (p.emailAttemptId && p.emailAttemptId !== attemptId) {
      console.warn(
        `[Notification] Rejecting stale attempt callback for #${notificationId}: active is ${p.emailAttemptId}, callback attempt was ${attemptId}`
      );
      return { abort: true, reason: "STALE_ATTEMPT", currentAttemptId: p.emailAttemptId };
    }
    const attempts = Number(p.emailAttempts || 1);
    const base = { emailAttemptId: attemptId, emailLeaseExpiresAt: null };
    switch (outcome.kind) {
      case "SENT":
        return {
          payloadPatch: {
            ...base,
            emailStatus: "SENT",
            emailMessageId: outcome.messageId,
            emailSentAt: new Date(),
            emailNextRetryAt: null,
            emailRequiresReconciliation: false,
          },
        };
      case "SKIPPED":
        return {
          payloadPatch: { ...base, emailStatus: "SKIPPED", emailDeliverySkipped: outcome.reason, emailNextRetryAt: null },
        };
      case "FAILED": {
        const nextRetryAt = computeEmailRetryAt(attempts, now);
        return {
          payloadPatch: {
            ...base,
            emailStatus: "FAILED",
            emailDeliveryError: outcome.error,
            emailNextRetryAt: nextRetryAt,
            emailExhausted: nextRetryAt === null,
          },
        };
      }
      case "UNKNOWN":
      default:
        return {
          payloadPatch: {
            ...base,
            emailStatus: "UNKNOWN",
            emailDeliveryError: outcome.error || "AMBIGUOUS_TRANSPORT_RESPONSE",
            emailNextRetryAt: null,
            emailRequiresReconciliation: true,
          },
        };
    }
  });
}

/**
 * Classify a transport result. Only DEFINITE rejections are FAILED (retryable).
 * Timeouts, resets and malformed responses are UNKNOWN: the server may have accepted the
 * message, so an automatic retry could duplicate it.
 */
function classifyTransportResult(result) {
  if (result && result.messageId) return { kind: "SENT", messageId: result.messageId };
  if (result && result.skipped) return { kind: "SKIPPED", reason: result.reason };
  if (result && result.error) {
    const ambiguous = Boolean(result.isTimeout || result.code === "ETIMEDOUT" || result.code === "ECONNRESET");
    return { kind: ambiguous ? "UNKNOWN" : "FAILED", error: result.error };
  }
  return { kind: "UNKNOWN", error: "UNKNOWN_EMAIL_DISPATCH_RESULT" };
}

function classifyTransportException(err) {
  const msg = (err && err.message) || "Unknown transport exception";
  const ambiguous = Boolean(
    err && (err.code === "ETIMEDOUT" || err.code === "ESOCKETTIMEDOUT" || err.code === "ECONNRESET" || /timeout/i.test(msg))
  );
  return { kind: ambiguous ? "UNKNOWN" : "FAILED", error: msg };
}

async function lookupRecipientEmail(db, userId) {
  let recipient = null;
  if (typeof db.user?.findUnique === "function") {
    recipient = await db.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true } });
  } else if (typeof db.user?.findMany === "function") {
    const list = await db.user.findMany({ where: { id: userId }, select: { email: true, firstName: true } });
    recipient = (list || []).find((u) => u && u.id === userId) || (list || [])[0] || null;
  }
  return recipient?.email || null;
}

/**
 * Perform one claimed SMTP attempt for an IN_APP notification and record the outcome.
 */
async function performClaimedAttempt(db, notificationId, attemptId, { to, subject, body }, now) {
  let outcome;
  try {
    outcome = classifyTransportResult(await sendNotificationEmail({ to, subject, body }));
  } catch (err) {
    outcome = classifyTransportException(err);
  }
  const rec = await recordEmailOutcome(db, notificationId, attemptId, outcome, now);
  return {
    status: outcome.kind,
    messageId: outcome.messageId,
    error: outcome.error,
    reason: outcome.reason,
    recorded: rec.updated,
    recordReason: rec.updated ? undefined : rec.reason,
  };
}

/**
 * Retry the email for an EXISTING reminder Notification without creating a new in-app row.
 * Claims the attempt atomically first; if the claim fails nothing is sent.
 */
async function deliverReminderEmailDirect({ notificationId, recipientUserId, subject, body, attemptId, now }, prismaClient) {
  const db = prismaClient || prisma;
  const at = now instanceof Date ? now : new Date();
  const attId = attemptId || newAttemptId();

  const email = await lookupRecipientEmail(db, recipientUserId);
  if (!email || !isConfigured()) {
    const reason = !email ? "MISSING_RECIPIENT_EMAIL" : "SMTP_NOT_CONFIGURED";
    await updateNotificationEmailState(
      db,
      notificationId,
      null,
      { emailStatus: "SKIPPED", emailDeliverySkipped: reason, emailNextRetryAt: null },
      { precondition: (p) => p.emailStatus === "FAILED" }
    );
    return { status: "SKIPPED", reason };
  }

  const claim = await claimEmailAttempt(db, notificationId, { attemptId: attId, now: at });
  if (!claim.updated) {
    return { status: "NOT_CLAIMED", reason: claim.reason, nextRetryAt: claim.nextRetryAt };
  }

  return performClaimedAttempt(db, notificationId, attId, { to: email, subject: subject || "DreamSky Notification", body }, at);
}

/**
 * Send every queued notification as a real email from the consultancy address,
 * without breaking the in-app notification path. Fire-and-forget by default: any SMTP
 * failure is logged and recorded on the row, never thrown to the caller.
 * Opt out per-notification with data.skipEmail === true.
 */
async function deliverByEmail(notification, renderedBody, txPrisma = null, options = {}) {
  const db = txPrisma || prisma;
  const now = resolveNow(options);
  const initialPayload = asPayload(notification.payload);
  if (initialPayload.skipEmail === true) return { status: "SKIPPED", reason: "OPT_OUT" };

  const isEmailPrimary = notification.channel === "EMAIL";
  const attemptId = options.attemptId || newAttemptId();

  // EMAIL-primary rows track delivery in Notification.status (+ payload.deliveryError/messageId).
  const writePrimary = (status, payloadPatch, extra = {}) =>
    casUpdateNotification(db, notification.id, () => ({ data: { status, ...extra }, payloadPatch }))
      .catch((err) => console.error(`[Notification] Failed to record EMAIL status for #${notification.id}:`, err.message));

  if (!isConfigured()) {
    if (isEmailPrimary) {
      console.warn(`[Notification] SMTP not configured for EMAIL notification #${notification.id}`);
      await writePrimary("FAILED", { deliveryError: "SMTP_NOT_CONFIGURED" });
    } else {
      await updateNotificationEmailState(db, notification.id, attemptId, {
        emailStatus: "SKIPPED",
        emailDeliverySkipped: "SMTP_NOT_CONFIGURED",
        emailDeliveryError: "SMTP_NOT_CONFIGURED",
        emailAttemptId: attemptId,
      });
    }
    return { status: "SKIPPED", reason: "SMTP_NOT_CONFIGURED" };
  }

  const email = await lookupRecipientEmail(db, notification.recipientUserId);
  if (!email) {
    if (isEmailPrimary) {
      console.warn(`[Notification] Recipient email missing for user #${notification.recipientUserId} on EMAIL notification #${notification.id}`);
      await writePrimary("FAILED", { deliveryError: "MISSING_RECIPIENT_EMAIL" });
    } else {
      await updateNotificationEmailState(db, notification.id, attemptId, {
        emailStatus: "SKIPPED",
        emailDeliverySkipped: "MISSING_RECIPIENT_EMAIL",
        emailAttemptId: attemptId,
      });
    }
    return { status: "SKIPPED", reason: "MISSING_RECIPIENT_EMAIL" };
  }

  const body = typeof renderedBody === "string" && renderedBody.length ? renderedBody : notification.body;
  const subject = notification.subject ?? `DreamSky Notification #${notification.id}`;

  if (!isEmailPrimary) {
    const claim = await claimEmailAttempt(db, notification.id, { attemptId, now });
    if (!claim.updated) {
      console.warn(`[Notification] Email attempt for #${notification.id} not claimed (${claim.reason}); not sending.`);
      return { status: "NOT_CLAIMED", reason: claim.reason };
    }
    const res = await performClaimedAttempt(db, notification.id, attemptId, { to: email, subject, body }, now);
    if (res.status === "SENT") {
      console.log(`[Notification] emailed #${notification.id} to ${email}`, JSON.stringify({ subject, messageId: res.messageId }));
    } else if (res.status === "FAILED" || res.status === "UNKNOWN") {
      console.error(`[Notification] email to ${email} failed for #${notification.id}:`, res.error);
    } else if (res.status === "SKIPPED") {
      console.warn(`[Notification] email to ${email} skipped for #${notification.id}: ${res.reason}`);
    }
    return res;
  }

  // EMAIL-primary path (no retry state machine; status column is authoritative).
  let outcome;
  try {
    outcome = classifyTransportResult(await sendNotificationEmail({ to: email, subject, body }));
  } catch (err) {
    outcome = classifyTransportException(err);
  }

  if (outcome.kind === "SENT") {
    await writePrimary("SENT", { messageId: outcome.messageId }, { sentAt: new Date() });
    console.log(`[Notification] emailed #${notification.id} to ${email}`, JSON.stringify({ subject, messageId: outcome.messageId }));
  } else if (outcome.kind === "SKIPPED") {
    console.warn(`[Notification] email to ${email} skipped for #${notification.id}: ${outcome.reason}`);
    await writePrimary("FAILED", { deliveryError: `SKIPPED_${outcome.reason}` });
  } else {
    console.error(`[Notification] email to ${email} failed for #${notification.id}:`, outcome.error);
    await writePrimary("FAILED", { deliveryError: outcome.error });
  }
  return { status: outcome.kind, messageId: outcome.messageId, error: outcome.error, reason: outcome.reason };
}

/**
 * Explicit reconciliation for an UNKNOWN (ambiguous) delivery. This is the ONLY path out of
 * UNKNOWN other than a late, correctly fenced result from the original attempt.
 *   resolution = "CONFIRMED_SENT"     → SENT (e.g. operator verified in the SMTP provider log)
 *   resolution = "CONFIRMED_NOT_SENT" → FAILED and immediately retry-eligible if attempts remain
 * A new fence token is written so a late callback from the original attempt cannot
 * overwrite the operator's decision. The parent reminder (if still PENDING) is re-armed
 * so the poller re-evaluates convergence.
 */
async function resolveAmbiguousEmailDelivery(prismaClient, notificationId, { resolution, actorId = null, now } = {}) {
  const db = prismaClient || prisma;
  const at = now instanceof Date ? now : new Date();
  if (resolution !== "CONFIRMED_SENT" && resolution !== "CONFIRMED_NOT_SENT") {
    const err = new Error("resolution must be CONFIRMED_SENT or CONFIRMED_NOT_SENT");
    err.statusCode = 400;
    throw err;
  }

  let reminderId = null;
  const res = await casUpdateNotification(db, notificationId, (row) => {
    const p = row.payload;
    if (p.emailStatus !== "UNKNOWN") return { abort: true, reason: `NOT_UNKNOWN_${p.emailStatus}` };
    reminderId = p.reminderId || null;
    const attempts = Number(p.emailAttempts || 1);
    const common = {
      emailAttemptId: `reconciled-${newAttemptId()}`,
      emailRequiresReconciliation: false,
      emailReconciledAt: at.toISOString(),
      emailReconciledBy: actorId,
      emailReconciliation: resolution,
    };
    if (resolution === "CONFIRMED_SENT") {
      return { payloadPatch: { ...common, emailStatus: "SENT", emailNextRetryAt: null } };
    }
    const exhausted = attempts >= MAX_EMAIL_ATTEMPTS;
    return {
      payloadPatch: {
        ...common,
        emailStatus: "FAILED",
        emailNextRetryAt: exhausted ? null : at.toISOString(),
        emailExhausted: exhausted,
      },
    };
  });

  if (res.updated && reminderId && typeof db.eventReminder?.updateMany === "function") {
    await db.eventReminder.updateMany({ where: { id: reminderId, status: "PENDING" }, data: { scheduledFor: at } });
  }
  return res;
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
  const { recipientUserId, status, read, page, limit } = query;
  const where = {};
  if (recipientUserId) where.recipientUserId = recipientUserId;
  if (status) where.status = status;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const skip = (pageNum - 1) * pageSize;

  let rawNotifications;
  let total;

  if (read !== undefined) {
    // Read state is stored within the JSON payload; retrieve matching records and filter by payload read state
    const allMatching = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    const filtered = allMatching.filter((n) => {
      const payload = typeof n.payload === "object" && n.payload !== null ? n.payload : {};
      return Boolean(payload.read) === read;
    });
    total = filtered.length;
    rawNotifications = filtered.slice(skip, skip + pageSize);
  } else {
    [rawNotifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.notification.count({ where }),
    ]);
  }

  const notifications = rawNotifications.map((n) => {
    const payload = typeof n.payload === "object" && n.payload !== null ? n.payload : {};
    return {
      id: n.id,
      recipientId: n.recipientUserId,
      recipientUserId: n.recipientUserId,
      templateId: n.templateId,
      channel: n.channel,
      status: n.status,
      subject: n.subject,
      title: n.subject || "Notification",
      body: n.body,
      sentAt: n.sentAt,
      readAt: payload.readAt || null,
      read: Boolean(payload.read),
      metadata: payload,
      payload: n.payload,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    };
  });

  return {
    notifications,
    total,
    page: pageNum,
    limit: pageSize,
  };
}

/**
 * Mark a single notification as read by updating its payload using CAS concurrency protection
 */
async function markNotificationAsRead(id, currentUser = null) {
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) {
    const err = new Error(`Notification '${id}' not found.`);
    err.statusCode = 404;
    throw err;
  }

  if (currentUser) {
    const actorRole = currentUser.role;
    const actorId = currentUser.userId || currentUser.id;
    if (actorRole !== "SUPER_ADMIN" && notification.recipientUserId !== actorId) {
      const err = new Error("You are not authorized to update this notification.");
      err.statusCode = 403;
      throw err;
    }
  }

  const nowIso = new Date().toISOString();
  const res = await casUpdateNotification(prisma, id, () => ({
    payloadPatch: {
      read: true,
      readAt: nowIso,
    },
  }));

  if (!res.updated) {
    if (res.reason === "NOT_FOUND") {
      const err = new Error(`Notification '${id}' not found.`);
      err.statusCode = 404;
      throw err;
    }
    const err = new Error(`Failed to update notification '${id}' due to concurrent conflict.`);
    err.statusCode = 409;
    throw err;
  }

  return res.notification;
}

/**
 * Mark all notifications for the current user as read using CAS concurrency protection
 */
async function markAllNotificationsAsRead(currentUser) {
  const userId = currentUser ? currentUser.userId || currentUser.id : null;
  if (!userId) {
    const err = new Error("User context required.");
    err.statusCode = 400;
    throw err;
  }

  const unreadNotifications = await prisma.notification.findMany({
    where: { recipientUserId: userId },
  });

  const nowIso = new Date().toISOString();
  let count = 0;
  await Promise.all(
    unreadNotifications.map(async (n) => {
      const res = await casUpdateNotification(prisma, n.id, (row) => {
        if (row.payload && row.payload.read) {
          return { abort: true, reason: "ALREADY_READ" };
        }
        return {
          payloadPatch: {
            read: true,
            readAt: nowIso,
          },
        };
      });
      if (res.updated) count++;
    })
  );

  return { success: true, count };
}

/**
 * Queue a follow-up staff notification with duplicate suppression and graceful failure.
 */
async function queueFollowUpNotification({
  recipientUserId,
  action,
  appointment,
  studentName,
  datetime,
  previousDatetime,
}) {
  if (!recipientUserId || !appointment) return null;

  try {
    const recent = await prisma.notification.findMany({
      where: { recipientUserId },
      take: 100,
      orderBy: { createdAt: "desc" },
    });

    const targetTimeIso = (datetime ? new Date(datetime) : new Date(appointment.datetime)).toISOString();
    const isDuplicate = recent.some((n) => {
      const p = n.payload;
      if (!p || typeof p !== "object") return false;
      if (p.appointmentId !== appointment.id) return false;
      const itemAction = p.action || "";
      const targetAction = action || "";
      if (itemAction !== targetAction) return false;
      const itemTime = p.newDatetime || p.datetime || p.appointmentDatetime || "";
      return itemTime === targetTimeIso;
    });

    if (isDuplicate) {
      return null;
    }

    const dateStr = new Date(datetime || appointment.datetime).toISOString();
    let subject = "Follow-Up Scheduled";
    let body = `Follow-up scheduled with ${studentName || "Student"} for ${dateStr}.`;

    if (action === "RESCHEDULED") {
      subject = "Follow-Up Rescheduled";
      body = `Follow-up with ${studentName || "Student"} rescheduled to ${dateStr}.`;
    } else if (action === "CANCELLED") {
      subject = "Follow-Up Cancelled";
      body = `Follow-up scheduled for ${dateStr} with ${studentName || "Student"} has been cancelled.`;
    }

    return await prisma.notification.create({
      data: {
        channel: "IN_APP",
        recipientUserId,
        subject,
        body,
        status: "QUEUED",
        payload: {
          appointmentId: appointment.id,
          studentId: appointment.studentId,
          studentName: studentName || "Student",
          action,
          datetime: dateStr,
          newDatetime: dateStr,
          ...(previousDatetime ? { previousDatetime: new Date(previousDatetime).toISOString() } : {}),
        },
      },
    });
  } catch (err) {
    if (err.code === "P2002" || err.message?.includes("Unique constraint") || err.code === "23505") {
      // Concurrency collision caught and deduplicated by database constraint
      return null;
    }
    console.error("[Notification] Failed to queue follow-up notification:", err.message);
    return null;
  }
}

/**
 * Send a direct custom notification email to a specific email address.
 */
async function sendDirectNotification({ to, subject, body }) {
  const result = await sendNotificationEmail({ to, subject, body });
  if (result?.error) {
    return { success: false, error: result.error };
  }
  if (result?.skipped) {
    return { success: false, skipped: true, reason: result.reason };
  }
  return { success: true, messageId: result?.messageId };
}

module.exports = {
  deliverByEmail,
  deliverReminderEmailDirect,
  updateNotificationEmailState,
  casUpdateNotification,
  claimEmailAttempt,
  recordEmailOutcome,
  resolveAmbiguousEmailDelivery,
  MAX_EMAIL_ATTEMPTS,
  EMAIL_RETRY_BACKOFF_MINUTES,
  sendNotification,
  sendDirectNotification,
  queueFollowUpNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  listTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listNotifications,
};
