/**
 * Notification Poller — Event & Appointment Reminder Background Job
 *
 * Runs inside dream-sky's process as a setInterval.
 * Checks every 60 seconds for:
 * 1. EventReminder rows that are due (PENDING, scheduledFor <= now)
 * 2. AppointmentReminder rows that are due (PENDING, scheduledFor <= now)
 *
 * Dispatches notifications to authorized recipients without broad broadcasting,
 * revalidates eligibility, handles failure/retry status safely without false-sent marking,
 * and maintains an in-process mutex to prevent overlapping executions.
 *
 * MULTI-PROCESS / CLUSTER CONCURRENCY SAFEGUARDS:
 * In a multi-worker or multi-container environment (e.g. Kubernetes, multiple PM2 instances),
 * in-process mutex flags (isProcessingAppointments) protect only the current process.
 * To achieve safe distributed execution across multiple worker nodes in PostgreSQL without double-dispatch:
 *
 * 1. Atomic Transactional Claiming via FOR UPDATE SKIP LOCKED:
 *    A worker starts a transaction, selects up to BATCH_SIZE due rows locking only unclaimed rows:
 *      SELECT id FROM "AppointmentReminder"
 *      WHERE status = 'PENDING' AND "scheduledFor" <= NOW()
 *      ORDER BY "scheduledFor" ASC
 *      LIMIT 50
 *      FOR UPDATE SKIP LOCKED;
 *
 * 2. Two-Phase Claim Transition:
 *    Alternatively, atomically claim IDs using a single UPDATE:
 *      WITH claimed AS (
 *        SELECT id FROM "AppointmentReminder"
 *        WHERE status = 'PENDING' AND "scheduledFor" <= NOW()
 *        ORDER BY "scheduledFor" ASC
 *        LIMIT 50
 *        FOR UPDATE SKIP LOCKED
 *      )
 *      UPDATE "AppointmentReminder"
 *      SET status = 'PROCESSING', "updatedAt" = NOW()
 *      WHERE id IN (SELECT id FROM claimed)
 *      RETURNING *;
 *
 * 3. Advisory Locks:
 *    Alternatively, a PostgreSQL session advisory lock (e.g. pg_try_advisory_lock(REMINDER_WORKER_LOCK_ID))
 *    can guarantee that only one worker node executes the reminder sweep at any given second.
 */
const prisma = require("../prisma");
const {
  sendNotification,
  deliverReminderEmailDirect,
  updateNotificationEmailState,
} = require("./notification.service");
const { resolveFollowUpRecipient } = require("./appointment.service");

const POLL_INTERVAL_MS = 60_000; // 60 seconds
const BATCH_SIZE = 50;

// Distributed concurrency advisory lock IDs (PostgreSQL 64-bit safe integers)
const EVENT_REMINDER_LOCK_ID = 884401;
const APPOINTMENT_REMINDER_LOCK_ID = 884402;

let pollerHandle = null;
let isProcessingEvents = false;
let isProcessingAppointments = false;
let isShuttingDown = false;
let activeEventSweepPromise = null;
let activeAppointmentSweepPromise = null;

let lastEventSweepAt = null;
let lastEventSweepResult = null;
let lastAppointmentSweepAt = null;
let lastAppointmentSweepResult = null;

/**
 * Acquire a dedicated PostgreSQL session for advisory locking.
 * Guarantees that subsequent lock acquisition and release run on the exact same connection.
 * STRICT FAIL-CLOSED: Returns null if no dedicated session mechanism is available (NO UNSAFE POOLED FALLBACK).
 */
async function acquireDedicatedSession(prismaClient, options = {}) {
  // 1. Explicit lock session passed in options (tests or custom runner)
  if (options.lockSession) {
    return options.lockSession;
  }

  // 2. Custom session provider function
  if (typeof options.sessionProvider === "function") {
    try {
      const session = await options.sessionProvider();
      if (session && typeof session.query === "function" && typeof session.release === "function") {
        return session;
      }
    } catch (err) {
      console.warn("[Notification Poller] Session provider error:", err.message);
      return null;
    }
  }

  // 3. Dedicated connection from pg.Pool (options.pool or prismaClient.$pool)
  const pool = options.pool || prismaClient?.$pool;
  if (pool && typeof pool.connect === "function") {
    try {
      const client = await pool.connect();
      if (!client || typeof client.query !== "function") {
        console.warn("[Notification Poller] Pool connection did not return a valid client with query method.");
        return null;
      }
      let released = false;
      return {
        id: `pg-session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        query: (sql, params) => client.query(sql, params),
        release: (destroy = false) => {
          if (released) return;
          released = true;
          if (destroy) {
            // Discard connection so Postgres automatically terminates backend session and purges any advisory locks
            client.release(destroy === true ? new Error("Advisory lock uncertain - destroying connection") : destroy);
          } else {
            client.release();
          }
        },
      };
    } catch (err) {
      console.warn("[Notification Poller] Failed to obtain dedicated connection from pool:", err.message);
      return null;
    }
  }

  return null;
}

/**
 * Acquire a PostgreSQL session-level advisory lock using a dedicated database session.
 * STRICT FAIL-CLOSED: Requires a valid dedicated session. Returns acquired: false on any failure.
 */
async function acquireAdvisoryLock(session, lockId, options = {}) {
  if (!session || typeof session.query !== "function") {
    console.warn(`[Notification Poller] Cannot acquire advisory lock ${lockId}: Dedicated session is unavailable or missing query method.`);
    return { acquired: false, reason: "DEDICATED_SESSION_UNAVAILABLE" };
  }

  try {
    const result = await session.query("SELECT pg_try_advisory_lock($1) as locked;", [Number(lockId)]);
    const rows = Array.isArray(result) ? result : Array.isArray(result?.rows) ? result.rows : null;
    if (Array.isArray(rows) && rows.length > 0) {
      const row = rows[0];
      const isLocked = Boolean(row?.locked ?? row?.pg_try_advisory_lock);
      if (isLocked) {
        return { acquired: true, session };
      }
      return { acquired: false, reason: "LOCK_HELD_BY_ANOTHER_SESSION" };
    }

    console.warn(`[Notification Poller] Lock acquisition returned unexpected result for lock ${lockId}:`, result);
    return { acquired: false, reason: "UNEXPECTED_QUERY_RESULT", queryThrew: false, uncertain: true };
  } catch (err) {
    console.warn(`[Notification Poller] Advisory lock acquisition error for lock ${lockId}:`, err.message);
    return { acquired: false, reason: "ACQUISITION_ERROR", error: err.message, queryThrew: true };
  }
}

/**
 * Release a PostgreSQL session-level advisory lock on the exact same dedicated database session.
 * STRICT FAIL-CLOSED: Verifies pg_advisory_unlock returned true.
 */
async function releaseAdvisoryLock(session, lockId, options = {}) {
  if (!session || typeof session.query !== "function") {
    console.warn(`[Notification Poller] Cannot release advisory lock ${lockId}: Dedicated session is unavailable.`);
    return { released: false, reason: "DEDICATED_SESSION_UNAVAILABLE" };
  }

  try {
    const result = await session.query("SELECT pg_advisory_unlock($1) as unlocked;", [Number(lockId)]);
    const rows = Array.isArray(result) ? result : Array.isArray(result?.rows) ? result.rows : null;
    if (Array.isArray(rows) && rows.length > 0) {
      const row = rows[0];
      const isUnlocked = Boolean(row?.unlocked ?? row?.pg_advisory_unlock);
      if (!isUnlocked) {
        console.warn(`[Notification Poller] Advisory lock ${lockId} was NOT held by this session upon release.`);
        return { released: false, reason: "LOCK_NOT_HELD_BY_SESSION" };
      }
      return { released: true };
    }

    console.warn(`[Notification Poller] Lock release returned unexpected result for lock ${lockId}:`, result);
    return { released: false, reason: "UNEXPECTED_QUERY_RESULT" };
  } catch (err) {
    console.warn(`[Notification Poller] Advisory lock release error for lock ${lockId}:`, err.message);
    return { released: false, reason: "RELEASE_ERROR", error: err.message };
  }
}

/**
 * Acquire a PostgreSQL session-level advisory lock using a blocking wait (pg_advisory_lock).
 */
async function acquireAdvisoryLockWait(session, lockId, options = {}) {
  if (!session || typeof session.query !== "function") {
    console.warn(`[Notification Poller] Cannot acquire advisory lock ${lockId}: Dedicated session is unavailable.`);
    return { acquired: false, reason: "DEDICATED_SESSION_UNAVAILABLE" };
  }

  try {
    const result = await session.query("SELECT pg_advisory_lock($1);", [Number(lockId)]);
    const rows = Array.isArray(result) ? result : Array.isArray(result?.rows) ? result.rows : null;
    if (!Array.isArray(rows) || rows.length === 0) {
      console.warn(`[Notification Poller] Lock acquisition returned unexpected or empty result for lock ${lockId}:`, result);
      return { acquired: false, reason: "UNEXPECTED_QUERY_RESULT", queryThrew: false, uncertain: true };
    }
    return { acquired: true, session };
  } catch (err) {
    console.warn(`[Notification Poller] Advisory lock wait error for lock ${lockId}:`, err.message);
    return { acquired: false, reason: "ACQUISITION_ERROR", error: err.message, queryThrew: true, uncertain: true };
  }
}

/**
 * Execute a callback within the event reminder advisory lock (F-01).
 * Coordinates event updates/rejections with reminder dispatching.
 * STRICT FAIL-CLOSED: The protected callback is NEVER executed unless
 * the advisory lock is positively confirmed as acquired on a dedicated session.
 */
async function withEventReminderLock(prismaClient, callback, options = {}) {
  const session = await acquireDedicatedSession(prismaClient, options);
  if (!session || typeof session.query !== "function") {
    const err = new Error("Cannot execute protected operation: Dedicated database session is unavailable for advisory lock.");
    err.code = "DEDICATED_SESSION_UNAVAILABLE";
    throw err;
  }

  let lockAcquired = false;
  let lockUncertain = false;

  try {
    let lockRes;
    try {
      lockRes = await acquireAdvisoryLockWait(session, EVENT_REMINDER_LOCK_ID, options);
    } catch (acqErr) {
      lockUncertain = true;
      const err = new Error(`Cannot execute protected operation: Advisory lock acquisition threw: ${acqErr.message}`);
      err.code = "ACQUISITION_ERROR";
      err.cause = acqErr;
      throw err;
    }

    if (!lockRes || !lockRes.acquired) {
      if (lockRes?.queryThrew || lockRes?.uncertain) {
        lockUncertain = true;
      }
      const reason = lockRes?.reason || "LOCK_NOT_ACQUIRED";
      const err = new Error(`Cannot execute protected operation: Advisory lock ${EVENT_REMINDER_LOCK_ID} could not be confirmed as acquired (${reason}).`);
      err.code = reason;
      throw err;
    }

    lockAcquired = true;
    return await callback(session);
  } finally {
    if (lockAcquired) {
      try {
        const relRes = await releaseAdvisoryLock(session, EVENT_REMINDER_LOCK_ID, options);
        if (!relRes || !relRes.released) {
          lockUncertain = true;
          console.warn(`[Notification Poller] Advisory lock release uncertain for ${EVENT_REMINDER_LOCK_ID}: destroying connection.`);
        }
      } catch (relErr) {
        lockUncertain = true;
        console.warn(`[Notification Poller] Advisory lock release threw for ${EVENT_REMINDER_LOCK_ID}: destroying connection.`);
      }
    }
    try {
      session.release(lockUncertain);
    } catch (cleanupErr) {
      console.warn("[Notification Poller] Error releasing dedicated session:", cleanupErr.message);
    }
  }
}

/**
 * Reconcile abandoned IN_FLIGHT notifications whose lease has expired (F-03).
 * Transitions them to 'UNKNOWN' with a 15-minute cool-down to prevent premature retries.
 */
async function reconcileAbandonedInFlightNotifications(prismaClient = prisma, options = {}) {
  const db = prismaClient;
  const now = options.now || new Date();

  let reconciledCount = 0;

  try {
    let inFlightCandidates = [];
    try {
      inFlightCandidates = await db.notification.findMany({
        where: {
          status: "QUEUED",
          payload: {
            path: ["emailStatus"],
            equals: "IN_FLIGHT",
          },
        },
        take: 100,
      });
    } catch (queryErr) {
      if (typeof db.notification?.findMany === "function") {
        const recentNotifs = await db.notification.findMany({
          where: { status: "QUEUED" },
          take: 200,
          orderBy: { createdAt: "desc" },
        });
        inFlightCandidates = recentNotifs.filter((n) => {
          const p = typeof n.payload === "object" && n.payload !== null ? n.payload : {};
          return p.emailStatus === "IN_FLIGHT";
        });
      }
    }

    for (const notif of inFlightCandidates) {
      const p = typeof notif.payload === "object" && notif.payload !== null ? notif.payload : {};
      if (p.emailStatus === "IN_FLIGHT") {
        const expiresAt = p.emailLeaseExpiresAt ? new Date(p.emailLeaseExpiresAt) : null;
        const isExpired = expiresAt
          ? expiresAt.getTime() <= now.getTime()
          : (Date.now() - new Date(notif.updatedAt || notif.createdAt).getTime() > 5 * 60 * 1000);

        if (isExpired) {
          // F-03/F-04: Expired leases are ambiguous (remote SMTP may still be in flight).
          // Reconcile to UNKNOWN with emailNextRetryAt = null. Never auto-retry.
          // Requires explicit operator reconciliation via resolveAmbiguousEmailDelivery().
          const res = await updateNotificationEmailState(
            db,
            notif.id,
            null,
            {
              emailStatus: "UNKNOWN",
              emailDeliveryError: "LEASE_EXPIRED_ORPHAN",
              emailNextRetryAt: null,
              emailRequiresReconciliation: true,
            },
            {
              precondition: (currentPayload) => currentPayload.emailStatus === "IN_FLIGHT",
            }
          );
          if (res && res.updated) {
            reconciledCount++;
          }
        }
      }
    }
  } catch (err) {
    console.error("[Notification Poller] Error reconciling abandoned in-flight notifications:", err.message);
  }

  return { reconciledCount };
}

/**
 * Classify whether an error is transient/retryable or permanent (F-09, F-10).
 */
function isRetryableError(err) {
  if (!err) return false;
  // Non-retryable database validation and application errors
  if (err.code === "P2025" || err.code === "P2003" || err.code === "P2000" || err.code === "P2002") return false;
  if (err.name === "ValidationError" || err.name === "TypeError" || err.name === "ReferenceError") return false;
  if (/not found|invalid role|template.*not found|unauthorized|recipient/i.test(err.message)) return false;

  // Retryable network, lock contention, timeout, or temporary errors
  if (err.code === "P2034" || err.code === "40P01" || err.code === "55P03") return true;
  if (err.code === "ECONNRESET" || err.code === "ETIMEDOUT" || err.code === "ECONNREFUSED") return true;
  if (/timeout|connection|network|deadlock|lock conflict|temporar|try again/i.test(err.message)) return true;

  return false;
}

/**
 * Classify whether a query error is specifically due to an unsupported JSON path query
 * capability in the database adapter or test environment (F-08).
 * STRICT FAIL-CLOSED:
 * 1. Connection errors, timeouts, deadlocks, and permission errors must NEVER be classified as unsupported JSON queries.
 * 2. Generic Prisma validation codes (P2009, P2019) or input errors must NEVER authorize fallback by code alone.
 * 3. Fallback is authorized ONLY when the error provides explicit evidence of unsupported JSON path filtering.
 */
function isUnsupportedJsonQueryError(err) {
  if (!err) return false;

  const code = (err.code || "").toUpperCase();
  const msg = err.message || "";

  // 1. Explicitly reject all genuine infrastructure, connection, timeout, or concurrency errors
  if (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "P2034" ||
    code === "40P01" ||
    code === "55P03" ||
    code === "57014"
  ) {
    return false;
  }

  if (/timeout|connection|deadlock|serialization|refused|reset|network|econnrefused|etimedout/i.test(msg)) {
    return false;
  }

  // 2. Specific test-adapter error code specifically defined for JSON query incompatibility:
  if (code === "ERR_UNSUPPORTED_JSON_QUERY") {
    return true;
  }

  // 3. Reject P2009 / P2019 by code alone. Only authorize fallback if the message explicitly establishes
  // that the query error is specifically due to unsupported JSON path filtering or unknown `path` argument on JsonFilter.
  // Generic validation errors, syntax errors, or other field errors MUST NOT authorize fallback.
  const isExplicitJsonPathError =
    /json.*path.*(?:not supported|unsupported)/i.test(msg) ||
    /unsupported.*json.*(?:path|filter)/i.test(msg) ||
    /json.*filter.*not supported/i.test(msg) ||
    /(?:unknown argument|field.*does not exist).*(?:`path`|'path'|"path"|\bpath\b).*(?:json|jsonfilter|filter)/i.test(msg) ||
    /(?:json|jsonfilter).*(?:unknown argument|field.*does not exist).*(?:`path`|'path'|"path"|\bpath\b)/i.test(msg) ||
    /Unknown argument `path`/i.test(msg) ||
    /Unknown argument path/i.test(msg) ||
    /Field 'path' does not exist in type 'JsonFilter'/i.test(msg);

  if (isExplicitJsonPathError) {
    return true;
  }

  return false;
}

/**
 * Check if an event reminder has already been dispatched to a specific recipient (F-03, F-08).
 * Uses targeted database-level filtering by JSON payload fields to avoid loading all user notifications
 * into memory, with defensive fallback for adapters without deep JSON path filtering.
 * STRICT FAIL-CLOSED:
 * 1. Missing Prisma client, missing notification model, or missing findMany method throws immediately.
 * 2. Missing recipientUserId or missing deduplication keys throws immediately.
 * 3. Database errors, connection failures, timeouts, and fallback errors propagate immediately.
 * 4. Never returns false when deduplication cannot be performed.
 */
async function hasEventReminderBeenSent(prismaClient, recipientUserId, reminderId, eventId, offset) {
  // Part A: Fail closed on missing client, model, or findMany method
  if (!prismaClient) {
    throw new Error("Deduplication check failed: Prisma client is required.");
  }
  if (!prismaClient.notification) {
    throw new Error("Deduplication check failed: notification model is unavailable on Prisma client.");
  }
  if (typeof prismaClient.notification.findMany !== "function") {
    throw new Error("Deduplication check failed: notification.findMany method is unavailable.");
  }

  // Part C: Validate recipient and deduplication identifiers
  if (!recipientUserId || typeof recipientUserId !== "string" || recipientUserId.trim() === "") {
    throw new Error("Deduplication check failed: valid recipientUserId is required.");
  }

  const hasReminderId = typeof reminderId === "string" && reminderId.trim() !== "";
  const hasEventId = typeof eventId === "string" && eventId.trim() !== "";
  const hasValidOffset =
    (typeof offset === "number" && !Number.isNaN(offset)) ||
    (typeof offset === "string" && offset.trim() !== "");

  const hasModernKey = hasReminderId;
  const hasHistoricalKey = hasEventId && hasValidOffset;

  if (!hasModernKey && !hasHistoricalKey) {
    throw new Error(
      "Deduplication check failed: either a valid modern reminderId or valid historical (eventId and offset) is required."
    );
  }

  const orConditions = [];
  if (hasModernKey) {
    orConditions.push({ payload: { path: ["reminderId"], equals: reminderId } });
  }
  if (hasHistoricalKey) {
    orConditions.push({
      AND: [
        { payload: { path: ["eventId"], equals: eventId } },
        { payload: { path: ["reminderOffset"], equals: offset } },
      ],
    });
  }

  try {
    // 1. Attempt targeted database query using payload JSON paths
    const candidateNotifs = await prismaClient.notification.findMany({
      where: {
        recipientUserId,
        OR: orConditions,
      },
      orderBy: { createdAt: "desc" },
    });

    return candidateNotifs.some((n) => {
      const p = typeof n.payload === "object" && n.payload !== null ? n.payload : {};
      const modernMatch = hasModernKey && p.reminderId === reminderId;
      const historicalMatch =
        hasHistoricalKey &&
        p.eventId === eventId &&
        (p.reminderOffset === offset ||
          (offset === 0 && (p.reminderOffset === 0 || p.reminderOffset === "0")) ||
          (offset === "0" && (p.reminderOffset === 0 || p.reminderOffset === "0")));
      return modernMatch || historicalMatch;
    });
  } catch (err) {
    // Fail closed: genuine database errors, timeouts, connection failures, or generic validation errors MUST propagate
    if (!isUnsupportedJsonQueryError(err)) {
      console.error(
        `[Event Reminder Poller] Database error querying deduplication status for recipient ${recipientUserId}:`,
        err.message
      );
      throw err;
    }

    // Fallback attempted ONLY if the error specifically represents an unsupported JSON path query in the adapter.
    // Fallback query errors are NOT caught or swallowed — they propagate to prevent duplicate dispatch.
    console.warn(
      `[Event Reminder Poller] Adapter does not support JSON path filtering (${err.message}). Using recipient in-memory fallback.`
    );
    const candidateNotifs = await prismaClient.notification.findMany({
      where: { recipientUserId },
      orderBy: { createdAt: "desc" },
    });

    return candidateNotifs.some((n) => {
      const p = typeof n.payload === "object" && n.payload !== null ? n.payload : {};
      const modernMatch = hasModernKey && p.reminderId === reminderId;
      const historicalMatch =
        hasHistoricalKey &&
        p.eventId === eventId &&
        (p.reminderOffset === offset ||
          (offset === 0 && (p.reminderOffset === 0 || p.reminderOffset === "0")) ||
          (offset === "0" && (p.reminderOffset === 0 || p.reminderOffset === "0")));
      return modernMatch || historicalMatch;
    });
  }
}

/**
 * Atomically update an EventReminder row only if its status is still PENDING (F-06).
 * Distinguishes atomic database conditions from application-level pre-dispatch revalidation.
 */
async function updatePendingEventReminder(prismaClient, id, data) {
  if (typeof prismaClient.eventReminder?.updateMany === "function") {
    const res = await prismaClient.eventReminder.updateMany({
      where: { id, status: "PENDING" },
      data,
    });
    return res && res.count > 0;
  }
  if (typeof prismaClient.eventReminder?.findUnique === "function") {
    const current = await prismaClient.eventReminder.findUnique({ where: { id } });
    if (!current || current.status !== "PENDING") return false;
  }
  await prismaClient.eventReminder.update({ where: { id }, data });
  return true;
}

/**
 * Process due EventReminder rows
 */
async function processDueEventReminders(options = {}) {
  const { now = new Date(), prismaClient = prisma } = options;

  if (isShuttingDown) {
    return { skipped: true, reason: "SHUTTING_DOWN" };
  }

  if (isProcessingEvents) {
    console.warn("[Event Reminder Poller] Sweep already in progress. Skipping overlapping tick.");
    return { skipped: true, reason: "OVERLAPPING_RUN" };
  }

  isProcessingEvents = true;
  let dedicatedSession = null;
  let lockAcquired = false;
  let lockUncertain = false;
  const summary = { processed: 0, sent: 0, skipped: 0, failed: 0 };

  const sweepExecution = async () => {
    try {
      dedicatedSession = await acquireDedicatedSession(prismaClient, options);
      if (!dedicatedSession) {
        console.warn("[Event Reminder Poller] Dedicated database session could not be acquired. Skipping sweep (no unsafe pooled fallback).");
        const res = { skipped: true, reason: "DEDICATED_SESSION_UNAVAILABLE" };
        lastEventSweepAt = new Date();
        lastEventSweepResult = res;
        return res;
      }

      const lockResult = await acquireAdvisoryLock(dedicatedSession, EVENT_REMINDER_LOCK_ID, options);
      if (!lockResult || !lockResult.acquired) {
        if (lockResult?.queryThrew || lockResult?.uncertain || lockResult?.reason === "ACQUISITION_ERROR" || lockResult?.reason === "UNEXPECTED_QUERY_RESULT") {
          lockUncertain = true;
        }
        console.warn("[Event Reminder Poller] Advisory lock could not be acquired. Another worker is processing event reminders.");
        const res = { skipped: true, reason: "LOCK_ACQUISITION_FAILED", lockReason: lockResult?.reason };
        lastEventSweepAt = new Date();
        lastEventSweepResult = res;
        return res;
      }
      lockAcquired = true;

      // Reconcile any abandoned in-flight notification leases before processing sweep (F-03)
      await reconcileAbandonedInFlightNotifications(prismaClient, { now });

      const reminders = await prismaClient.eventReminder.findMany({
        where: {
          status: "PENDING",
          scheduledFor: { lte: now },
        },
        include: {
          event: true,
        },
        orderBy: { scheduledFor: "asc" },
        take: BATCH_SIZE,
      });

      for (const reminder of reminders) {
        if (isShuttingDown) {
          console.warn(`[Event Reminder Poller] Shutdown in progress. Halting batch processing cooperatively before reminder ${reminder.id}.`);
          break;
        }
        summary.processed++;
        try {
          // Pre-Dispatch Revalidation: re-verify fresh reminder and event row
          let freshReminder = reminder;
          if (typeof prismaClient.eventReminder?.findUnique === "function") {
            freshReminder = await prismaClient.eventReminder.findUnique({
              where: { id: reminder.id },
              include: { event: true },
            });
          }

          if (!freshReminder || freshReminder.status !== "PENDING") {
            summary.skipped++;
            continue;
          }

          const event = freshReminder.event || reminder.event;
          if (!event) {
            console.warn(`[Event Reminder Poller] Event ${reminder.eventId} not found for reminder ${reminder.id}. Marking as FAILED.`);
            await updatePendingEventReminder(prismaClient, reminder.id, { status: "FAILED" });
            summary.failed++;
            continue;
          }

          // If event has an explicit approvalStatus, only dispatch if APPROVED
          if (event.approvalStatus && event.approvalStatus !== "APPROVED") {
            console.warn(`[Event Reminder Poller] Event ${event.id} is not APPROVED (${event.approvalStatus}). Skipping reminder.`);
            summary.skipped++;
            continue;
          }

          const eventTime = event.datetime ? new Date(event.datetime) : null;
          if (eventTime && eventTime.getTime() <= now.getTime()) {
            console.warn(`[Event Reminder Poller] Event ${event.id} datetime is in the past. Marking reminder as FAILED.`);
            await updatePendingEventReminder(prismaClient, reminder.id, { status: "FAILED" });
            summary.failed++;
            continue;
          }

          // Determine audience: EVERYONE means no role filter
          const audienceRoles =
            event.audienceRoles && event.audienceRoles.includes("EVERYONE") ? undefined : event.audienceRoles;

          const recipients = await prismaClient.user.findMany({
            where: {
              ...(audienceRoles ? { role: { in: audienceRoles } } : {}),
              ...(event.branchId
                ? { OR: [{ branchId: event.branchId }, { branchId: null }] }
                : {}),
            },
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          });

          if (recipients.length === 0) {
            await updatePendingEventReminder(prismaClient, reminder.id, {
              status: "SENT",
              sentAt: new Date(),
            });
            continue;
          }

          const recipientOutcomes = [];

          for (const recipient of recipients) {
            // Idempotency safeguard (F-03, F-08): check whether a reminder notification has already been sent to this recipient
            const alreadySent = await hasEventReminderBeenSent(
              prismaClient,
              recipient.id,
              reminder.id,
              event.id,
              reminder.offset
            );

            if (alreadySent) {
              // Notification row already exists in database. Check if it's an email failure needing retry.
              let candidateNotif = null;
              if (typeof prismaClient.notification?.findMany === "function") {
                try {
                  const found = await prismaClient.notification.findMany({
                    where: {
                      recipientUserId: recipient.id,
                      OR: [
                        { payload: { path: ["reminderId"], equals: reminder.id } },
                        {
                          AND: [
                            { payload: { path: ["eventId"], equals: event.id } },
                            { payload: { path: ["reminderOffset"], equals: reminder.offset } },
                          ],
                        },
                      ],
                    },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                  });
                  if (found && found.length > 0) candidateNotif = found[0];
                } catch (e) {
                  if (isUnsupportedJsonQueryError(e)) {
                    const allForUser = await prismaClient.notification.findMany({
                      where: { recipientUserId: recipient.id },
                      orderBy: { createdAt: "desc" },
                    });
                    candidateNotif = allForUser.find((n) => {
                      const p = typeof n.payload === "object" && n.payload !== null ? n.payload : {};
                      return p.reminderId === reminder.id || (p.eventId === event.id && (p.reminderOffset === reminder.offset || p.reminderOffset === String(reminder.offset)));
                    }) || null;
                  }
                }
              }

              const p = (candidateNotif && typeof candidateNotif.payload === "object" && candidateNotif.payload !== null)
                ? candidateNotif.payload
                : {};
              const emailStatus = p.emailStatus;
              const attempts = p.emailAttempts || 1;

              // If legacy notification with no email status, or already SENT / SKIPPED
              if (!emailStatus || emailStatus === "SENT" || emailStatus === "SKIPPED") {
                recipientOutcomes.push({ recipientId: recipient.id, status: emailStatus || "SENT", attempts });
                summary.skipped++;
                continue;
              }

              if (emailStatus === "IN_FLIGHT") {
                const leaseExp = p.emailLeaseExpiresAt ? new Date(p.emailLeaseExpiresAt) : null;
                if (leaseExp && leaseExp.getTime() > now.getTime()) {
                  recipientOutcomes.push({ recipientId: recipient.id, status: "IN_FLIGHT", attempts });
                  summary.skipped++;
                  continue;
                }
                // F-03/F-04: Expired lease reconciled to UNKNOWN with null nextRetry. Never auto-retry.
                await updateNotificationEmailState(prismaClient, candidateNotif.id, null, {
                  emailStatus: "UNKNOWN",
                  emailDeliveryError: "LEASE_EXPIRED_ORPHAN",
                  emailNextRetryAt: null,
                  emailRequiresReconciliation: true,
                }, { precondition: (curr) => curr.emailStatus === "IN_FLIGHT" });
                recipientOutcomes.push({ recipientId: recipient.id, status: "UNKNOWN", attempts, requiresReconciliation: true });
                summary.skipped++;
                continue;
              }

              if (emailStatus === "UNKNOWN") {
                // F-03/F-04: UNKNOWN status is ambiguous (timeout, socket reset, lease expiry).
                // Poller NEVER auto-retries an UNKNOWN notification. It requires explicit operator reconciliation
                // via resolveAmbiguousEmailDelivery() to prevent duplicate email transmissions.
                recipientOutcomes.push({ recipientId: recipient.id, status: "UNKNOWN", attempts, requiresReconciliation: true });
                summary.skipped++;
                continue;
              }

              if (emailStatus === "FAILED" && p.emailNextRetryAt && new Date(p.emailNextRetryAt).getTime() > now.getTime()) {
                recipientOutcomes.push({ recipientId: recipient.id, status: "FAILED", attempts, nextRetryAt: p.emailNextRetryAt });
                summary.skipped++;
                continue;
              }

              if (attempts >= 6) {
                recipientOutcomes.push({ recipientId: recipient.id, status: "FAILED", attempts, exhausted: true });
                continue;
              }

              // Eligible for email-only retry: direct delivery without creating duplicate in-app notification
              const newAttempts = attempts + 1;
              const attId = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
              const res = await deliverReminderEmailDirect({
                notificationId: candidateNotif.id,
                recipientUserId: recipient.id,
                subject: `Reminder: ${event.title}`,
                body: `${event.title} is scheduled for ${event.datetime.toISOString ? event.datetime.toISOString() : new Date(event.datetime).toISOString()}.`,
                attemptId: attId,
              }, prismaClient);

              const backoffs = [5, 15, 30, 60, 120];
              const backoffMinutes = backoffs[Math.min(newAttempts - 1, backoffs.length - 1)];
              const nextRetry = res.status === "UNKNOWN"
                ? null
                : (res.status === "FAILED" ? new Date(now.getTime() + backoffMinutes * 60 * 1000).toISOString() : null);

              await updateNotificationEmailState(prismaClient, candidateNotif.id, attId, {
                emailAttempts: newAttempts,
                emailNextRetryAt: nextRetry,
              });

              recipientOutcomes.push({
                recipientId: recipient.id,
                status: res.status,
                attempts: newAttempts,
                nextRetryAt: nextRetry,
              });
              continue;
            }

            // Fresh notification dispatch: queue in-app alert AND await email delivery
            const attId = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const created = await sendNotification(
              recipient.id,
              `EVENT_REMINDER_${reminder.offset}`,
              {
                subject: `Reminder: ${event.title}`,
                message: `${event.title} is scheduled for ${event.datetime.toISOString ? event.datetime.toISOString() : new Date(event.datetime).toISOString()}.`,
                eventId: event.id,
                eventTitle: event.title,
                eventType: event.type,
                eventDatetime: event.datetime.toISOString ? event.datetime.toISOString() : new Date(event.datetime).toISOString(),
                eventLocation: event.location,
                reminderOffset: reminder.offset,
                reminderId: reminder.id,
                recipientRole: recipient.role,
                emailAttempts: 1,
                emailAttemptId: attId,
              },
              prismaClient,
              { awaitEmail: true, attemptId: attId }
            );

            const outcomeStatus = created?.emailResult?.status || "SENT";
            const nextRetry = outcomeStatus === "UNKNOWN"
              ? null
              : (outcomeStatus === "FAILED" ? new Date(now.getTime() + 5 * 60 * 1000).toISOString() : null);

            recipientOutcomes.push({
              recipientId: recipient.id,
              status: outcomeStatus,
              attempts: 1,
              nextRetryAt: nextRetry,
            });
            summary.sent++;
          }

          // Evaluate parent reminder state based on all recipient outcomes
          const allResolved = recipientOutcomes.length > 0 && recipientOutcomes.every((r) => r.status === "SENT" || r.status === "SKIPPED");
          const allExhausted = recipientOutcomes.length > 0 && recipientOutcomes.every((r) => (r.status === "FAILED" && r.attempts >= 6) || (eventTime && eventTime.getTime() <= now.getTime()));

          if (allResolved) {
            await updatePendingEventReminder(prismaClient, reminder.id, {
              status: "SENT",
              sentAt: new Date(),
            });
          } else if (allExhausted) {
            await updatePendingEventReminder(prismaClient, reminder.id, {
              status: "FAILED",
            });
            summary.failed++;
          } else if (recipientOutcomes.length > 0) {
            let earliestNext = null;
            for (const o of recipientOutcomes) {
              if (o.nextRetryAt) {
                const dt = new Date(o.nextRetryAt);
                if (dt.getTime() > now.getTime() && (!earliestNext || dt.getTime() < earliestNext.getTime())) {
                  earliestNext = dt;
                }
              }
            }
            if (earliestNext) {
              await updatePendingEventReminder(prismaClient, reminder.id, {
                scheduledFor: earliestNext,
              });
            }
          } else {
            await updatePendingEventReminder(prismaClient, reminder.id, {
              status: "SENT",
              sentAt: new Date(),
            });
          }
        } catch (reminderErr) {
          if (reminderErr.code === "P2025") {
            summary.skipped++;
            continue;
          }
          // F-01, F-09: Per-item error isolation with retry backoff & batch starvation prevention
          summary.failed++;
          console.error(
            `[Event Reminder Poller] Processing failed for reminder ${reminder.id} (event ${reminder.eventId}):`,
            reminderErr.message
          );

          const retryable = isRetryableError(reminderErr);
          const eventTime = reminder.event?.datetime ? new Date(reminder.event.datetime) : null;
          const isPastEvent = eventTime && eventTime.getTime() < now.getTime();

          if (!retryable || isPastEvent) {
            console.warn(`[Event Reminder Poller] Non-retryable error or past event for reminder ${reminder.id}. Marking as FAILED.`);
            await prismaClient.eventReminder.update({
              where: { id: reminder.id },
              data: { status: "FAILED" },
            }).catch((err) => {
              if (err.code !== "P2025") {
                console.error(`[Event Reminder Poller] Failed to mark reminder ${reminder.id} as FAILED:`, err.message);
              }
            });
          } else {
            const nextRetry = new Date(now.getTime() + 5 * 60 * 1000);
            await prismaClient.eventReminder.update({
              where: { id: reminder.id },
              data: { scheduledFor: nextRetry },
            }).catch((err) => {
              if (err.code !== "P2025") {
                console.error(`[Event Reminder Poller] Failed to update backoff for reminder ${reminder.id}:`, err.message);
              }
            });
          }
        }
      }

      lastEventSweepAt = new Date();
      lastEventSweepResult = { ...summary };
      return summary;
    } finally {
      isProcessingEvents = false;
      if (dedicatedSession) {
        if (lockAcquired) {
          try {
            const releaseResult = await releaseAdvisoryLock(dedicatedSession, EVENT_REMINDER_LOCK_ID, options);
            if (!releaseResult?.released) {
              console.error(`[Event Reminder Poller] Advisory unlock failed for lock ${EVENT_REMINDER_LOCK_ID}. Destroying connection to prevent pool lock leakage.`);
              lockUncertain = true;
            }
          } catch (releaseErr) {
            console.error(`[Event Reminder Poller] Exception releasing advisory lock ${EVENT_REMINDER_LOCK_ID}:`, releaseErr.message);
            lockUncertain = true;
          }
        }

        try {
          dedicatedSession.release(lockUncertain);
        } catch (cleanupErr) {
          console.error("[Event Reminder Poller] Error releasing dedicated session:", cleanupErr.message);
        }
      }
    }
  };

  const currentPromise = sweepExecution();
  activeEventSweepPromise = currentPromise;
  try {
    return await currentPromise;
  } finally {
    if (activeEventSweepPromise === currentPromise) {
      activeEventSweepPromise = null;
    }
  }
}

/**
 * Process due AppointmentReminder rows
 *
 * Requirements:
 * 1. Select only reminders that are due and eligible for dispatch (PENDING, scheduledFor <= now).
 * 2. Revalidate appointment status and student trash status before dispatch.
 * 3. Purge obsolete reminders for cancelled/completed/no-show appointments or trashed students.
 * 4. Route notification strictly to the designated authorized recipient (counselor or branch staff).
 * 5. Handle delivery failure without false-sent marking (status=FAILED, sentAt=null).
 * 6. Set status=SENT and sentAt=new Date() on successful dispatch.
 * 7. In-process mutex prevents overlapping executions.
 */
async function processDueAppointmentReminders(options = {}) {
  const { now = new Date(), prismaClient = prisma } = options;

  if (isShuttingDown) {
    return { skipped: true, reason: "SHUTTING_DOWN" };
  }

  if (isProcessingAppointments) {
    console.warn("[Appointment Reminder Worker] Sweep already in progress. Skipping overlapping tick.");
    return { skipped: true, reason: "OVERLAPPING_RUN" };
  }

  isProcessingAppointments = true;
  let dedicatedSession = null;
  let lockAcquired = false;
  let lockUncertain = false;
  const summary = { processed: 0, sent: 0, failed: 0, cancelled: 0 };

  const sweepExecution = async () => {
    try {
      dedicatedSession = await acquireDedicatedSession(prismaClient, options);
      if (!dedicatedSession) {
        console.warn("[Appointment Reminder Worker] Dedicated database session could not be acquired. Skipping sweep (no unsafe pooled fallback).");
        const res = { skipped: true, reason: "DEDICATED_SESSION_UNAVAILABLE" };
        lastAppointmentSweepAt = new Date();
        lastAppointmentSweepResult = res;
        return res;
      }

      const lockResult = await acquireAdvisoryLock(dedicatedSession, APPOINTMENT_REMINDER_LOCK_ID, options);
      if (!lockResult || !lockResult.acquired) {
        if (lockResult?.queryThrew || lockResult?.uncertain || lockResult?.reason === "ACQUISITION_ERROR" || lockResult?.reason === "UNEXPECTED_QUERY_RESULT") {
          lockUncertain = true;
        }
        console.warn("[Appointment Reminder Worker] Advisory lock could not be acquired. Another worker is processing appointment reminders.");
        const res = { skipped: true, reason: "LOCK_ACQUISITION_FAILED", lockReason: lockResult?.reason };
        lastAppointmentSweepAt = new Date();
        lastAppointmentSweepResult = res;
        return res;
      }
      lockAcquired = true;

      const reminders = await prismaClient.appointmentReminder.findMany({
        where: {
          status: "PENDING",
          scheduledFor: { lte: now },
        },
        include: {
          appointment: {
            include: {
              student: {
                include: {
                  assignedCounselor: true,
                },
              },
              counselor: true,
            },
          },
        },
        orderBy: { scheduledFor: "asc" },
        take: BATCH_SIZE,
      });

      for (const reminder of reminders) {
        if (isShuttingDown) {
          console.warn(`[Appointment Reminder Worker] Shutdown in progress. Halting batch processing cooperatively before reminder ${reminder.id}.`);
          break;
        }
        summary.processed++;
        const appt = reminder.appointment;

        // 1. Revalidate appointment existence and SCHEDULED status
        if (!appt || appt.status !== "SCHEDULED") {
          console.warn(
            `[Appointment Reminder Worker] Appointment ${reminder.appointmentId} is no longer SCHEDULED (status: ${appt?.status || "DELETED"}). Purging obsolete reminder ${reminder.id}.`
          );
          await prismaClient.appointmentReminder.delete({
            where: { id: reminder.id },
          }).catch((err) => {
            console.error(`[Appointment Reminder Worker] Failed to purge obsolete reminder ${reminder.id}:`, err.message);
          });
          summary.cancelled++;
          continue;
        }

        // 2. Revalidate student existence and active status (not in Trash)
        const student = appt.student;
        if (!student || student.isActive === false) {
          console.warn(
            `[Appointment Reminder Worker] Student for appointment ${appt.id} is in Trash or missing. Purging obsolete reminder ${reminder.id}.`
          );
          await prismaClient.appointmentReminder.delete({
            where: { id: reminder.id },
          }).catch((err) => {
            console.error(`[Appointment Reminder Worker] Failed to purge obsolete reminder ${reminder.id}:`, err.message);
          });
          summary.cancelled++;
          continue;
        }

        // 3. Resolve authorized recipient with strict branch isolation
        const recipientUserId = await resolveFollowUpRecipient(
          appt.counselorId,
          student,
          null,
          null,
          prismaClient
        );

        if (!recipientUserId) {
          console.warn(
            `[Appointment Reminder Worker] Cannot resolve authorized recipient for appointment ${appt.id}. Marking reminder ${reminder.id} as FAILED.`
          );
          await prismaClient.appointmentReminder.update({
            where: { id: reminder.id },
            data: { status: "FAILED" },
          }).catch((err) => {
            console.error(`[Appointment Reminder Worker] Failed to mark reminder ${reminder.id} as FAILED:`, err.message);
          });
          summary.failed++;
          continue;
        }

        // 4. Construct message and dispatch notification
        const studentName = [student.firstName, student.lastName].filter(Boolean).join(" ");
        const offsetDisplay = reminder.offset === "24H" ? "24 Hours" : reminder.offset === "1H" ? "1 Hour" : reminder.offset;
        const apptTime = new Date(appt.datetime).toISOString();

        try {
          await sendNotification(
            recipientUserId,
            `APPOINTMENT_REMINDER_${reminder.offset}`,
            {
              subject: `Reminder: Upcoming Appointment in ${offsetDisplay}`,
              message: `Appointment with ${studentName || "Student"} is scheduled for ${apptTime} (in ${offsetDisplay}).`,
              appointmentId: appt.id,
              studentId: student.id,
              studentName: studentName || "Student",
              appointmentDatetime: apptTime,
              reminderOffset: reminder.offset,
              reminderId: reminder.id,
              recipientUserId,
              action: `REMINDER_${reminder.offset}`,
              newDatetime: apptTime,
            },
            prismaClient
          );

          // 5. Update status and sentAt consistently upon successful dispatch
          await prismaClient.appointmentReminder.update({
            where: { id: reminder.id },
            data: {
              status: "SENT",
              sentAt: new Date(),
            },
          });
          summary.sent++;
        } catch (dispatchErr) {
          // Classify whether the error indicates a unique constraint violation
          const isUniqueCollision =
            dispatchErr.code === "P2002" ||
            dispatchErr.code === "23505" ||
            (typeof dispatchErr.message === "string" && /unique constraint/i.test(dispatchErr.message));

          if (isUniqueCollision) {
            const expectedAction = `REMINDER_${reminder.offset}`;

            // Targeted query for existing matching notification
            const candidateNotifs = await prismaClient.notification.findMany({
              where: {
                recipientUserId,
                payload: {
                  path: ["appointmentId"],
                  equals: appt.id,
                },
              },
              orderBy: { createdAt: "desc" },
            }).catch(() => {
              return prismaClient.notification.findMany({
                where: { recipientUserId },
                orderBy: { createdAt: "desc" },
              });
            });

            const matchingNotif = candidateNotifs.find((n) => {
              const p = typeof n.payload === "object" && n.payload !== null ? n.payload : {};
              return (
                p.appointmentId === appt.id &&
                p.action === expectedAction &&
                (p.newDatetime === apptTime || p.appointmentDatetime === apptTime)
              );
            });

            if (matchingNotif) {
              console.warn(
                `[Appointment Reminder Worker] Verified existing notification (${matchingNotif.id}) for reminder ${reminder.id} after unique constraint collision. Safely transitioning reminder to SENT.`
              );
              await prismaClient.appointmentReminder.update({
                where: { id: reminder.id },
                data: {
                  status: "SENT",
                  sentAt: matchingNotif.createdAt || new Date(),
                },
              }).catch((updateErr) => {
                console.error(`[Appointment Reminder Worker] Failed to update reminder status to SENT:`, updateErr.message);
              });
              summary.sent++;
              continue;
            }

            console.error(
              `[Appointment Reminder Worker] Unrelated unique constraint collision for reminder ${reminder.id}; expected notification was NOT found. Marking reminder as FAILED.`,
              dispatchErr.message
            );
          } else {
            console.error(
              `[Appointment Reminder Worker] Dispatch failed for reminder ${reminder.id}:`,
              dispatchErr.message
            );
          }

          await prismaClient.appointmentReminder.update({
            where: { id: reminder.id },
            data: {
              status: "FAILED",
            },
          }).catch((updateErr) => {
            console.error(`[Appointment Reminder Worker] Failed to update reminder status to FAILED:`, updateErr.message);
          });
          summary.failed++;
        }
      }

      lastAppointmentSweepAt = new Date();
      lastAppointmentSweepResult = { ...summary };
      return summary;
    } finally {
      isProcessingAppointments = false;
      if (dedicatedSession) {
        if (lockAcquired) {
          try {
            const releaseResult = await releaseAdvisoryLock(dedicatedSession, APPOINTMENT_REMINDER_LOCK_ID, options);
            if (!releaseResult?.released) {
              console.error(`[Appointment Reminder Worker] Advisory unlock failed for lock ${APPOINTMENT_REMINDER_LOCK_ID}. Destroying connection to prevent pool lock leakage.`);
              lockUncertain = true;
            }
          } catch (releaseErr) {
            console.error(`[Appointment Reminder Worker] Exception releasing advisory lock ${APPOINTMENT_REMINDER_LOCK_ID}:`, releaseErr.message);
            lockUncertain = true;
          }
        }

        try {
          dedicatedSession.release(lockUncertain);
        } catch (cleanupErr) {
          console.error("[Appointment Reminder Worker] Error releasing dedicated session:", cleanupErr.message);
        }
      }
    }
  };

  const currentPromise = sweepExecution();
  activeAppointmentSweepPromise = currentPromise;
  try {
    return await currentPromise;
  } finally {
    if (activeAppointmentSweepPromise === currentPromise) {
      activeAppointmentSweepPromise = null;
    }
  }
}

/**
 * Start the notification poller.
 * Safe to call multiple times — only starts one interval.
 * Strictly gated by process.env.ENABLE_NOTIFICATION_POLLER === "true".
 * No bypasses permitted (options.force is not supported).
 */
function startNotificationPoller(options = {}) {
  const isExplicitlyEnabled = process.env.ENABLE_NOTIFICATION_POLLER === "true";
  if (!isExplicitlyEnabled) {
    console.log("[Notification Poller] Poller disabled (ENABLE_NOTIFICATION_POLLER !== 'true').");
    return { started: false, reason: "POLLER_DISABLED" };
  }

  // Prevent starting if shutdown is in progress or previous sweeps are still executing (F-06)
  if (isShuttingDown || activeEventSweepPromise || activeAppointmentSweepPromise) {
    console.warn("[Notification Poller] Cannot start poller: shutdown in progress or previous sweeps still executing.");
    return { started: false, reason: "SHUTDOWN_IN_PROGRESS" };
  }

  if (pollerHandle) {
    return { started: false, reason: "ALREADY_RUNNING" };
  }

  if (!options.skipInitialSweep) {
    // Immediate sweep on startup
    processDueEventReminders(options).catch((err) => {
      console.error("[Notification Poller] Initial event reminder sweep failed:", err);
    });
    processDueAppointmentReminders(options).catch((err) => {
      console.error("[Notification Poller] Initial appointment reminder sweep failed:", err);
    });
  }

  pollerHandle = setInterval(() => {
    processDueEventReminders(options).catch((err) => {
      console.error("[Notification Poller] Event reminder sweep failed:", err);
    });
    processDueAppointmentReminders(options).catch((err) => {
      console.error("[Notification Poller] Appointment reminder sweep failed:", err);
    });
  }, options.intervalMs || POLL_INTERVAL_MS);

  // Allow the process to exit normally even if this interval is pending
  if (pollerHandle.unref) pollerHandle.unref();

  console.log("[Notification Poller] Started — polling every 60s for due event & appointment reminders.");
  return { started: true };
}

/**
 * Stop the notification poller cleanly (useful for graceful shutdown and tests).
 * Awaits any in-flight reminder sweeps to complete within the specified timeout.
 */
async function stopNotificationPoller(options = {}) {
  const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : 10_000;
  isShuttingDown = true;

  if (pollerHandle) {
    clearInterval(pollerHandle);
    pollerHandle = null;
  }

  const activePromises = [];
  if (activeEventSweepPromise) activePromises.push(activeEventSweepPromise);
  if (activeAppointmentSweepPromise) activePromises.push(activeAppointmentSweepPromise);

  let timedOut = false;
  if (activePromises.length > 0) {
    let timerId = null;
    const timeoutPromise = new Promise((resolve) => {
      timerId = setTimeout(() => {
        timedOut = true;
        resolve("TIMEOUT");
      }, timeoutMs);
    });

    await Promise.race([
      Promise.allSettled(activePromises),
      timeoutPromise,
    ]);

    if (timerId) clearTimeout(timerId);
  }

  // F-06 Hardening: If timeout occurred, active sweeps are STILL executing!
  // Do NOT clear promise references or reset isShuttingDown while sweeps remain active.
  if (timedOut) {
    console.warn(`[Notification Poller] Shutdown timed out after ${timeoutMs}ms with active sweeps still running.`);
    // Attach background completion hooks to reset state once active sweeps actually settle
    Promise.allSettled(activePromises).finally(() => {
      activeEventSweepPromise = null;
      activeAppointmentSweepPromise = null;
      isProcessingEvents = false;
      isProcessingAppointments = false;
      isShuttingDown = false;
      console.log("[Notification Poller] In-flight sweeps completed after timeout. State reset.");
    });

    return {
      stopped: false,
      completed: false,
      timedOut: true,
      activeSweepsCompleted: false,
      reason: "TIMEOUT_ACTIVE_SWEEPS_REMAIN",
    };
  }

  // Clean stop: all sweeps finished within timeout
  isProcessingEvents = false;
  isProcessingAppointments = false;
  isShuttingDown = false;
  activeEventSweepPromise = null;
  activeAppointmentSweepPromise = null;

  return {
    stopped: true,
    completed: true,
    timedOut: false,
    activeSweepsCompleted: activePromises.length > 0,
  };
}

/**
 * Internal poller status and operational metrics (F-05).
 * Not exposed via any public HTTP routes.
 */
function getPollerStatus() {
  return {
    isRunning: Boolean(pollerHandle),
    isShuttingDown,
    isProcessingEvents,
    isProcessingAppointments,
    hasActiveSweeps: Boolean(activeEventSweepPromise || activeAppointmentSweepPromise),
    activeSweepCount: (activeEventSweepPromise ? 1 : 0) + (activeAppointmentSweepPromise ? 1 : 0),
    pollIntervalMs: POLL_INTERVAL_MS,
    batchSize: BATCH_SIZE,
    lastEventSweepAt,
    lastEventSweepResult,
    lastAppointmentSweepAt,
    lastAppointmentSweepResult,
    lockIds: {
      eventReminder: EVENT_REMINDER_LOCK_ID,
      appointmentReminder: APPOINTMENT_REMINDER_LOCK_ID,
    },
  };
}

module.exports = {
  startNotificationPoller,
  stopNotificationPoller,
  processDueEventReminders,
  processDueAppointmentReminders,
  acquireDedicatedSession,
  acquireAdvisoryLock,
  acquireAdvisoryLockWait,
  releaseAdvisoryLock,
  withEventReminderLock,
  reconcileAbandonedInFlightNotifications,
  hasEventReminderBeenSent,
  getPollerStatus,
  isRetryableError,
  isUnsupportedJsonQueryError,
  EVENT_REMINDER_LOCK_ID,
  APPOINTMENT_REMINDER_LOCK_ID,
};
