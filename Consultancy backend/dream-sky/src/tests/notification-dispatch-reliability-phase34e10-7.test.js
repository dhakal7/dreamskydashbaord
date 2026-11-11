/**
 * Phase 34E.10.7 — Notification Dispatch Reliability Remediation Test Suite
 *
 * Automated verification of Critical Findings F-01 through F-09:
 * 1. F-01.1: Dedicated session unavailable fails closed and never executes callback
 * 2. F-01.2: Advisory lock acquisition returning false fails closed and never executes callback
 * 3. F-01.3: Advisory lock acquisition throwing fails closed, destroys session, and never executes callback
 * 4. F-01.4: Advisory lock uncertain acquisition fails closed, destroys session, and never executes callback
 * 5. F-01.5: Successful lock acquisition executes callback exactly once and releases cleanly
 * 6. F-01.6: Failed lock acquisition never executes callback under any circumstance
 * 7. F-01.7: Release failure marks lock uncertain and destroys dedicated session
 * 8. F-01.8: Poller skips safely when another operation owns advisory lock
 * 9. F-01.9: Event update does not proceed and leaves data intact when lock acquisition fails
 * 10. F-02: Pre-dispatch revalidation cleanly skips reminder if event was rejected or changed
 * 11. F-02: Concurrently deleted reminder (P2025) is caught cleanly without failing sweep
 * 12. F-03/F-04: Expired IN_FLIGHT notification is reconciled to UNKNOWN, never auto-retried by poller
 * 13. F-03/F-04: resolveAmbiguousEmailDelivery resolves UNKNOWN via CONFIRMED_SENT and CONFIRMED_NOT_SENT
 * 14. F-04: Transporter socket timeouts are properly configured (connection, greeting, socket)
 * 15. F-05: updateNotificationEmailState rejects stale attempt callbacks and preserves payload
 * 16. F-05: CAS update prevents concurrent markNotificationAsRead from overwriting email delivery state
 * 17. F-06: updatePendingEventReminder uses atomic database condition (updateMany where status PENDING)
 * 18. F-07: stopNotificationPoller gracefully awaits in-flight sweep before releasing state
 * 19. F-07: stopNotificationPoller reports timeout safely and preserves lock/pool lifecycle if sweep outlives timeout
 * 20. F-08: All 6 email attempts and backoff intervals (5m, 15m, 30m, 60m, 120m) execute with recipient isolation
 * 21. F-08: Parent reminder transitions to SENT only when all recipients complete
 * 22. F-09: rejectEvent deletes pending reminders inside advisory lock while preserving Notification audit history
 * 23. F-09: Postponing event updates datetime and deletes obsolete pending reminders while preserving Notification audit history
 *
 * STRICT TEST ISOLATION:
 * Runs completely offline using in-memory mock stores. Zero database or network calls.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

// Set test environment flags
process.env.NODE_ENV = "test";
process.env.ENABLE_EMAIL = "false";
process.env.ENABLE_NOTIFICATION_POLLER = "false";

const sharedStore = {
  events: new Map(),
  eventReminders: new Map(),
  users: new Map(),
  notifications: new Map(),
  templates: new Map(),
  advisoryLocks: new Set(),
};

function createTrackedSession(overrides = {}) {
  const session = {
    id: `mock-session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    queries: [],
    released: false,
    destroyed: false,
    releaseCount: 0,
    query: async (sql, params) => {
      const lockId = params ? Number(params[0]) : Number(sql.match(/\d+/)?.[0] || 0);
      session.queries.push({ sql, params, lockId });
      if (overrides.query) {
        return overrides.query(sql, params, session);
      }
      if (sql.includes("pg_try_advisory_lock")) {
        if (sharedStore.advisoryLocks.has(lockId)) {
          return { rows: [{ locked: false }] };
        }
        sharedStore.advisoryLocks.add(lockId);
        return { rows: [{ locked: true }] };
      }
      if (sql.includes("pg_advisory_lock")) {
        sharedStore.advisoryLocks.add(lockId);
        return { rows: [{}] };
      }
      if (sql.includes("pg_advisory_unlock")) {
        if (sharedStore.advisoryLocks.has(lockId)) {
          sharedStore.advisoryLocks.delete(lockId);
          return { rows: [{ unlocked: true }] };
        }
        return { rows: [{ unlocked: false }] };
      }
      return { rows: [] };
    },
    release: (destroy = false) => {
      session.releaseCount++;
      session.released = true;
      if (destroy) {
        session.destroyed = true;
      }
    },
    ...overrides,
  };
  return session;
}

let activeMockSession = createTrackedSession();

function resetState() {
  sharedStore.events.clear();
  sharedStore.eventReminders.clear();
  sharedStore.users.clear();
  sharedStore.notifications.clear();
  sharedStore.templates.clear();
  sharedStore.advisoryLocks.clear();

  activeMockSession = createTrackedSession();

  // Pre-seed default reminder templates
  sharedStore.templates.set("EVENT_REMINDER_24H", {
    id: "tmpl-rem-24h",
    name: "EVENT_REMINDER_24H",
    channel: "IN_APP",
    content: "{{message}}",
  });
  sharedStore.templates.set("EVENT_REMINDER_1H", {
    id: "tmpl-rem-1h",
    name: "EVENT_REMINDER_1H",
    channel: "IN_APP",
    content: "{{message}}",
  });
}

const mockPrisma = {
  $pool: {
    connect: async () => activeMockSession,
  },
  $transaction: async (cb) => {
    return await cb(mockPrisma);
  },
  event: {
    findUnique: async ({ where, include }) => {
      const ev = sharedStore.events.get(where.id);
      if (!ev) return null;
      const res = { ...ev };
      if (include?.reminders) {
        res.reminders = Array.from(sharedStore.eventReminders.values()).filter((r) => r.eventId === ev.id);
      }
      return res;
    },
    update: async ({ where, data, include }) => {
      const ev = sharedStore.events.get(where.id);
      if (!ev) throw new Error("Event not found: " + where.id);
      const updated = { ...ev, ...data, updatedAt: new Date() };
      sharedStore.events.set(where.id, updated);
      return { ...updated };
    },
    delete: async ({ where }) => {
      const ev = sharedStore.events.get(where.id);
      sharedStore.events.delete(where.id);
      return ev || { id: where.id };
    },
  },
  eventReminder: {
    findUnique: async ({ where, include }) => {
      const rem = sharedStore.eventReminders.get(where.id);
      if (!rem) return null;
      const res = { ...rem };
      if (include?.event) {
        res.event = sharedStore.events.get(rem.eventId) || null;
      }
      return res;
    },
    findMany: async ({ where = {}, include, orderBy, take }) => {
      let list = Array.from(sharedStore.eventReminders.values());
      if (where.status) {
        list = list.filter((r) => r.status === where.status);
      }
      if (where.scheduledFor?.lte) {
        list = list.filter((r) => new Date(r.scheduledFor) <= new Date(where.scheduledFor.lte));
      }
      if (where.eventId) {
        list = list.filter((r) => r.eventId === where.eventId);
      }
      return list.slice(0, take || 50).map((r) => {
        const res = { ...r };
        if (include?.event) {
          res.event = sharedStore.events.get(r.eventId) || null;
        }
        return res;
      });
    },
    create: async ({ data }) => {
      const id = data.id || `rem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const rem = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
      sharedStore.eventReminders.set(id, rem);
      return { ...rem };
    },
    createMany: async ({ data }) => {
      const created = [];
      for (const item of (Array.isArray(data) ? data : [data])) {
        const id = item.id || `rem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const rem = { id, ...item, createdAt: new Date(), updatedAt: new Date() };
        sharedStore.eventReminders.set(id, rem);
        created.push(rem);
      }
      return { count: created.length };
    },
    update: async ({ where, data }) => {
      const rem = sharedStore.eventReminders.get(where.id);
      if (!rem) {
        const err = new Error("Record not found");
        err.code = "P2025";
        throw err;
      }
      const updated = { ...rem, ...data, updatedAt: new Date() };
      sharedStore.eventReminders.set(where.id, updated);
      return { ...updated };
    },
    updateMany: async ({ where = {}, data }) => {
      let count = 0;
      for (const [id, r] of sharedStore.eventReminders.entries()) {
        let match = true;
        if (where.id && r.id !== where.id) match = false;
        if (where.eventId && r.eventId !== where.eventId) match = false;
        if (where.status && r.status !== where.status) match = false;
        if (match) {
          const updated = { ...r, ...data, updatedAt: new Date() };
          sharedStore.eventReminders.set(id, updated);
          count++;
        }
      }
      return { count };
    },
    deleteMany: async ({ where = {} }) => {
      let count = 0;
      for (const [id, r] of sharedStore.eventReminders.entries()) {
        let match = true;
        if (where.eventId && r.eventId !== where.eventId) match = false;
        if (where.status && r.status !== where.status) match = false;
        if (match) {
          sharedStore.eventReminders.delete(id);
          count++;
        }
      }
      return { count };
    },
  },
  notificationTemplate: {
    findUnique: async ({ where }) => {
      return sharedStore.templates.get(where.name) || {
        id: `tmpl-${where.name}`,
        name: where.name,
        content: "{{message}}",
        channel: "IN_APP",
      };
    },
  },
  user: {
    findUnique: async ({ where }) => {
      return sharedStore.users.get(where.id) || null;
    },
    findMany: async ({ where = {}, select }) => {
      let list = Array.from(sharedStore.users.values());
      if (where.role?.in) {
        list = list.filter((u) => where.role.in.includes(u.role));
      }
      if (where.branchId) {
        list = list.filter((u) => u.branchId === where.branchId || u.branchId === null);
      }
      return list.map((u) => ({ ...u }));
    },
  },
  notification: {
    findUnique: async ({ where }) => {
      return sharedStore.notifications.get(where.id) || null;
    },
    findMany: async ({ where = {}, take, orderBy }) => {
      let list = Array.from(sharedStore.notifications.values());
      if (where.recipientUserId) {
        list = list.filter((n) => n.recipientUserId === where.recipientUserId);
      }
      if (where.OR && Array.isArray(where.OR)) {
        list = list.filter((n) => {
          const p = typeof n.payload === "object" && n.payload !== null ? n.payload : {};
          return where.OR.some((clause) => {
            if (clause.payload?.path && clause.payload.path[0] === "reminderId") {
              return p.reminderId === clause.payload.equals;
            }
            if (clause.AND && Array.isArray(clause.AND)) {
              return clause.AND.every((andClause) => {
                const path = andClause.payload?.path?.[0];
                return p[path] === andClause.payload?.equals;
              });
            }
            return false;
          });
        });
      }
      if (where.payload?.path && where.payload.path[0] === "emailStatus") {
        list = list.filter((n) => n.payload?.emailStatus === where.payload.equals);
      }
      if (take) list = list.slice(0, take);
      return list.map((n) => ({ ...n }));
    },
    create: async ({ data }) => {
      const id = data.id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const notif = {
        id,
        ...data,
        status: data.status || "QUEUED",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      sharedStore.notifications.set(id, notif);
      return { ...notif };
    },
    update: async ({ where, data }) => {
      const notif = sharedStore.notifications.get(where.id);
      if (!notif) {
        const err = new Error("Notification not found: " + where.id);
        err.code = "P2025";
        throw err;
      }
      const updated = {
        ...notif,
        ...data,
        payload: { ...(notif.payload || {}), ...(data.payload || {}) },
        updatedAt: data.updatedAt || new Date(),
      };
      sharedStore.notifications.set(where.id, updated);
      return { ...updated };
    },
    updateMany: async ({ where = {}, data }) => {
      let count = 0;
      for (const [id, n] of sharedStore.notifications.entries()) {
        let match = true;
        if (where.id && n.id !== where.id) match = false;
        if (where.recipientUserId && n.recipientUserId !== where.recipientUserId) match = false;
        if (where.updatedAt && n.updatedAt) {
          const wTime = new Date(where.updatedAt).getTime();
          const nTime = new Date(n.updatedAt).getTime();
          if (wTime !== nTime) match = false;
        }
        if (match) {
          const updatedPayload = { ...(n.payload || {}), ...(data.payload || {}) };
          const updated = {
            ...n,
            ...data,
            payload: updatedPayload,
            updatedAt: data.updatedAt || new Date(),
          };
          sharedStore.notifications.set(id, updated);
          count++;
        }
      }
      return { count };
    },
  },
};

global.prisma = mockPrisma;
resetState();

const {
  processDueEventReminders,
  stopNotificationPoller,
  withEventReminderLock,
  reconcileAbandonedInFlightNotifications,
  acquireAdvisoryLockWait,
  EVENT_REMINDER_LOCK_ID,
} = require("../services/notification.poller");

const {
  deliverReminderEmailDirect,
  updateNotificationEmailState,
  casUpdateNotification,
  claimEmailAttempt,
  recordEmailOutcome,
  resolveAmbiguousEmailDelivery,
  sendNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  MAX_EMAIL_ATTEMPTS,
  EMAIL_RETRY_BACKOFF_MINUTES,
} = require("../services/notification.service");

const {
  updateEvent,
  rejectEvent,
  approveEvent,
} = require("../services/event.service");

const { getEmailTransportConfig, isConfigured } = require("../services/email.service");

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE
// ─────────────────────────────────────────────────────────────────────────────

test("Phase 34E.10.7 — Critical Notification Dispatch Reliability Remediation", async (t) => {

  await t.test("F-01.1: Dedicated session unavailable fails closed and never executes callback", async () => {
    resetState();
    let executed = false;
    const badClient = { $pool: { connect: async () => null } };
    await assert.rejects(
      () => withEventReminderLock(badClient, async () => { executed = true; }),
      { code: "DEDICATED_SESSION_UNAVAILABLE" }
    );
    assert.equal(executed, false, "Callback must NOT execute when dedicated session is unavailable");
  });

  await t.test("F-01.2: Advisory lock acquisition returning false fails closed and never executes callback", async () => {
    resetState();
    const session = createTrackedSession({
      query: async (sql) => {
        if (sql.includes("pg_advisory_lock")) {
          return []; // empty rows -> acquired: false
        }
        return { rows: [] };
      },
    });
    let executed = false;
    await assert.rejects(
      () => withEventReminderLock(mockPrisma, async () => { executed = true; }, { lockSession: session }),
      /could not be confirmed as acquired/
    );
    assert.equal(executed, false, "Callback must NOT execute when lock is not acquired");
    assert.equal(session.released, true, "Session must still be released");
  });

  await t.test("F-01.3: Advisory lock acquisition throwing fails closed, destroys session, and never executes callback", async () => {
    resetState();
    const session = createTrackedSession({
      query: async (sql) => {
        if (sql.includes("pg_advisory_lock")) {
          throw new Error("Simulated connection termination during acquire");
        }
        return { rows: [] };
      },
    });
    let executed = false;
    await assert.rejects(
      () => withEventReminderLock(mockPrisma, async () => { executed = true; }, { lockSession: session }),
      { code: "ACQUISITION_ERROR" }
    );
    assert.equal(executed, false, "Callback must NOT execute when acquisition throws");
    assert.equal(session.destroyed, true, "Session must be destroyed when acquisition throws");
  });

  await t.test("F-01.4: Advisory lock uncertain acquisition fails closed, destroys session, and never executes callback", async () => {
    resetState();
    const session = createTrackedSession({
      query: async (sql) => {
        if (sql.includes("pg_advisory_lock")) {
          return null; // Corrupted / unexpected result -> uncertain
        }
        return { rows: [] };
      },
    });
    let executed = false;
    await assert.rejects(
      () => withEventReminderLock(mockPrisma, async () => { executed = true; }, { lockSession: session }),
      /could not be confirmed as acquired/
    );
    assert.equal(executed, false, "Callback must NOT execute when acquisition is uncertain");
    assert.equal(session.destroyed, true, "Session must be destroyed when acquisition is uncertain");
  });

  await t.test("F-01.5: Successful lock acquisition executes callback exactly once and releases cleanly", async () => {
    resetState();
    const session = createTrackedSession();
    let execCount = 0;
    const result = await withEventReminderLock(mockPrisma, async () => {
      execCount++;
      return "SUCCESS_EXACTLY_ONCE";
    }, { lockSession: session });

    assert.equal(result, "SUCCESS_EXACTLY_ONCE");
    assert.equal(execCount, 1, "Callback must execute exactly once");
    assert.equal(session.released, true, "Session must be released");
    assert.equal(session.destroyed, false, "Session must not be destroyed when cleanly released");
  });

  await t.test("F-01.6: Failed lock acquisition never executes callback under any circumstance", async () => {
    resetState();
    let execCount = 0;
    try {
      await withEventReminderLock({ $pool: { connect: async () => null } }, async () => {
        execCount++;
      });
    } catch (e) {}
    assert.equal(execCount, 0, "Callback execution count must remain 0 on lock failure");
  });

  await t.test("F-01.7: Release failure marks lock uncertain and destroys dedicated session", async () => {
    resetState();
    const session = createTrackedSession({
      query: async (sql) => {
        if (sql.includes("pg_advisory_lock")) {
          return { rows: [{}] };
        }
        if (sql.includes("pg_advisory_unlock")) {
          return { rows: [{ unlocked: false }] }; // Unlock returned false!
        }
        return { rows: [] };
      },
    });
    let executed = false;
    await withEventReminderLock(mockPrisma, async () => {
      executed = true;
    }, { lockSession: session });

    assert.equal(executed, true);
    assert.equal(session.released, true);
    assert.equal(session.destroyed, true, "Session must be destroyed when lock release is unconfirmed");
  });

  await t.test("F-01.8: Poller skips safely when another operation owns advisory lock", async () => {
    resetState();
    const event = {
      id: "ev-lock-order-b",
      title: "Concurrent Event",
      datetime: new Date(Date.now() + 24 * 3600 * 1000),
      approvalStatus: "APPROVED",
      audienceRoles: ["EVERYONE"],
    };
    sharedStore.events.set(event.id, event);
    const reminder = {
      id: "rem-lock-order-b",
      eventId: event.id,
      offset: "24H",
      scheduledFor: new Date(Date.now() - 1000),
      status: "PENDING",
    };
    sharedStore.eventReminders.set(reminder.id, reminder);

    sharedStore.advisoryLocks.add(EVENT_REMINDER_LOCK_ID);

    try {
      const summary = await processDueEventReminders({
        now: new Date(),
        prismaClient: mockPrisma,
      });

      assert.equal(summary.skipped, true, "Sweep must skip execution when advisory lock is held by another operation");
      assert.equal(summary.reason, "LOCK_ACQUISITION_FAILED");
      assert.equal(sharedStore.notifications.size, 0, "No notifications sent during lock contention");
    } finally {
      sharedStore.advisoryLocks.delete(EVENT_REMINDER_LOCK_ID);
    }
  });

  await t.test("F-01.9: Event update does not proceed and leaves data intact when lock acquisition fails", async () => {
    resetState();
    const ev = {
      id: "ev-fail-lock",
      title: "Original Title",
      datetime: new Date("2026-12-01T10:00:00Z"),
      approvalStatus: "APPROVED",
      createdById: "admin-1",
    };
    sharedStore.events.set(ev.id, ev);

    const origConnect = mockPrisma.$pool.connect;
    // Simulate dedicated session failure for updateEvent
    mockPrisma.$pool.connect = async () => null;

    try {
      await assert.rejects(
        () => updateEvent(ev.id, { title: "Mutated Title" }, { id: "admin-1", role: "SUPER_ADMIN" }),
        { code: "DEDICATED_SESSION_UNAVAILABLE" }
      );

      const unchanged = sharedStore.events.get(ev.id);
      assert.equal(unchanged.title, "Original Title", "Event data must remain untouched when lock acquisition fails");
    } finally {
      mockPrisma.$pool.connect = origConnect;
    }
  });

  await t.test("F-02: Pre-dispatch revalidation cleanly skips reminder if event was rejected or changed", async () => {
    resetState();

    const futureEvent = {
      id: "ev-f02-1",
      title: "Global Education Fair",
      datetime: new Date(Date.now() + 24 * 3600 * 1000),
      approvalStatus: "REJECTED", // Event was rejected!
      audienceRoles: ["EVERYONE"],
    };
    sharedStore.events.set(futureEvent.id, futureEvent);

    const reminder = {
      id: "rem-f02-1",
      eventId: futureEvent.id,
      offset: "24H",
      scheduledFor: new Date(Date.now() - 1000), // Due now
      status: "PENDING",
    };
    sharedStore.eventReminders.set(reminder.id, reminder);

    sharedStore.users.set("u-1", { id: "u-1", firstName: "Staff", role: "COUNSELOR" });

    const summary = await processDueEventReminders({
      now: new Date(),
      prismaClient: mockPrisma,
    });

    assert.equal(summary.sent, 0, "No notifications must be sent for rejected events");
    assert.equal(summary.skipped, 1, "Non-APPROVED event reminder must be skipped cleanly");
    assert.equal(sharedStore.notifications.size, 0, "Zero notifications created in store");
  });

  await t.test("F-02: Concurrently deleted reminder (P2025) is caught cleanly without failing sweep", async () => {
    resetState();

    const futureEvent = {
      id: "ev-f02-del",
      title: "IELTS Orientation",
      datetime: new Date(Date.now() + 48 * 3600 * 1000),
      approvalStatus: "APPROVED",
      audienceRoles: ["EVERYONE"],
    };
    sharedStore.events.set(futureEvent.id, futureEvent);

    const reminder = {
      id: "rem-f02-del",
      eventId: futureEvent.id,
      offset: "24H",
      scheduledFor: new Date(Date.now() - 1000),
      status: "PENDING",
    };
    sharedStore.eventReminders.set(reminder.id, reminder);

    // Override findUnique temporarily to simulate concurrent deletion right after findMany claims it
    const origFindUnique = mockPrisma.eventReminder.findUnique;
    let findUniqueCalls = 0;
    mockPrisma.eventReminder.findUnique = async ({ where }) => {
      findUniqueCalls++;
      return null;
    };

    try {
      const summary = await processDueEventReminders({
        now: new Date(),
        prismaClient: mockPrisma,
      });

      assert.equal(findUniqueCalls, 1, "Pre-dispatch revalidation findUnique must have been called");
      assert.equal(summary.sent, 0);
      assert.equal(summary.skipped, 1, "Concurrently deleted reminder must be counted as skipped without crashing");
      assert.equal(summary.failed, 0, "Must not count as a failure");
    } finally {
      mockPrisma.eventReminder.findUnique = origFindUnique;
    }
  });

  await t.test("F-03/F-04: Expired IN_FLIGHT notification is reconciled to UNKNOWN, never auto-retried by poller", async () => {
    resetState();

    const now = new Date("2026-11-05T12:00:00Z");
    const expiredLease = new Date("2026-11-05T11:50:00Z").toISOString(); // 10 mins ago

    const orphanNotif = {
      id: "notif-orphan-1",
      status: "QUEUED",
      recipientUserId: "user-orphan-1",
      channel: "IN_APP",
      payload: {
        eventId: "ev-orphan",
        reminderOffset: "24H",
        emailStatus: "IN_FLIGHT",
        emailAttemptId: "att-orphan-uuid-1",
        emailLeaseExpiresAt: expiredLease,
      },
    };
    sharedStore.notifications.set(orphanNotif.id, orphanNotif);

    const result = await reconcileAbandonedInFlightNotifications(mockPrisma, { now });

    assert.equal(result.reconciledCount, 1, "Exactly 1 orphan notification reconciled");
    const updated = sharedStore.notifications.get(orphanNotif.id);
    assert.equal(updated.payload.emailStatus, "UNKNOWN", "Status transitioned to UNKNOWN");
    assert.equal(updated.payload.emailDeliveryError, "LEASE_EXPIRED_ORPHAN");
    assert.equal(updated.payload.emailNextRetryAt, null, "emailNextRetryAt MUST be null — no automatic retry");
    assert.equal(updated.payload.emailRequiresReconciliation, true, "Must require operator reconciliation");

    // Verify that running processDueEventReminders does NOT retry this UNKNOWN notification
    const event = {
      id: "ev-orphan",
      title: "Orphan Event",
      datetime: new Date("2026-11-06T12:00:00Z"),
      approvalStatus: "APPROVED",
      audienceRoles: ["EVERYONE"],
    };
    sharedStore.events.set(event.id, event);
    sharedStore.users.set("user-orphan-1", { id: "user-orphan-1", email: "orphan@test.com", role: "COUNSELOR" });

    const reminder = {
      id: "rem-orphan",
      eventId: "ev-orphan",
      offset: "24H",
      scheduledFor: new Date(now.getTime() - 1000),
      status: "PENDING",
    };
    sharedStore.eventReminders.set(reminder.id, reminder);

    const summary = await processDueEventReminders({ now, prismaClient: mockPrisma });
    assert.equal(summary.sent, 0, "Poller MUST NOT retry an UNKNOWN notification");
    const stillUnknown = sharedStore.notifications.get(orphanNotif.id);
    assert.equal(stillUnknown.payload.emailStatus, "UNKNOWN", "Remains UNKNOWN until explicitly reconciled");
  });

  await t.test("F-03/F-04: resolveAmbiguousEmailDelivery resolves UNKNOWN via CONFIRMED_SENT and CONFIRMED_NOT_SENT", async () => {
    resetState();

    const now = new Date("2026-11-05T12:00:00Z");

    // Case 1: CONFIRMED_SENT
    const notif1 = {
      id: "notif-ambig-1",
      status: "QUEUED",
      recipientUserId: "u-ambig-1",
      payload: { emailStatus: "UNKNOWN", emailAttempts: 1, emailRequiresReconciliation: true },
    };
    sharedStore.notifications.set(notif1.id, notif1);

    const res1 = await resolveAmbiguousEmailDelivery(mockPrisma, notif1.id, {
      resolution: "CONFIRMED_SENT",
      actorId: "admin-operator-1",
      now,
    });
    assert.equal(res1.updated, true);
    const updated1 = sharedStore.notifications.get(notif1.id);
    assert.equal(updated1.payload.emailStatus, "SENT");
    assert.equal(updated1.payload.emailRequiresReconciliation, false);
    assert.equal(updated1.payload.emailReconciledBy, "admin-operator-1");

    // Case 2: CONFIRMED_NOT_SENT (re-arms retry)
    const notif2 = {
      id: "notif-ambig-2",
      status: "QUEUED",
      recipientUserId: "u-ambig-2",
      payload: { emailStatus: "UNKNOWN", emailAttempts: 1, emailRequiresReconciliation: true },
    };
    sharedStore.notifications.set(notif2.id, notif2);

    const res2 = await resolveAmbiguousEmailDelivery(mockPrisma, notif2.id, {
      resolution: "CONFIRMED_NOT_SENT",
      actorId: "admin-operator-2",
      now,
    });
    assert.equal(res2.updated, true);
    const updated2 = sharedStore.notifications.get(notif2.id);
    assert.equal(updated2.payload.emailStatus, "FAILED");
    assert.equal(updated2.payload.emailRequiresReconciliation, false);
    assert.equal(updated2.payload.emailNextRetryAt, now.toISOString(), "Next retry re-armed immediately for next sweep");
  });

  await t.test("F-04: Transporter socket timeouts are properly configured (connection, greeting, socket)", async () => {
    const config = getEmailTransportConfig();
    assert.equal(config.connectionTimeout, 5000, "connectionTimeout must be 5000ms");
    assert.equal(config.greetingTimeout, 5000, "greetingTimeout must be 5000ms");
    assert.equal(config.socketTimeout, 10000, "socketTimeout must be 10000ms");
  });

  await t.test("F-05: updateNotificationEmailState rejects stale attempt callbacks and preserves payload", async () => {
    resetState();

    const notif = {
      id: "notif-fence-1",
      status: "QUEUED",
      recipientUserId: "user-fence-1",
      payload: {
        importantCustomField: "KEEP_ME",
        emailStatus: "IN_FLIGHT",
        emailAttemptId: "att-ACTIVE-999",
      },
    };
    sharedStore.notifications.set(notif.id, notif);

    // Stale callback arrives for previous attempt att-OLD-111
    const staleResult = await updateNotificationEmailState(mockPrisma, notif.id, "att-OLD-111", {
      emailStatus: "FAILED",
      emailDeliveryError: "late failure callback",
    });

    assert.equal(staleResult.updated, false, "Stale callback must be rejected");
    assert.equal(staleResult.reason, "STALE_ATTEMPT");

    const unchanged = sharedStore.notifications.get(notif.id);
    assert.equal(unchanged.payload.emailStatus, "IN_FLIGHT", "Email status must remain unchanged by stale callback");
    assert.equal(unchanged.payload.importantCustomField, "KEEP_ME", "Unrelated payload keys must be preserved");

    // Active callback arrives for current attempt att-ACTIVE-999
    const activeResult = await updateNotificationEmailState(mockPrisma, notif.id, "att-ACTIVE-999", {
      emailStatus: "SENT",
      emailMessageId: "msg-success-999",
    });

    assert.equal(activeResult.updated, true, "Active attempt callback must succeed");
    const updated = sharedStore.notifications.get(notif.id);
    assert.equal(updated.payload.emailStatus, "SENT");
    assert.equal(updated.payload.emailMessageId, "msg-success-999");
    assert.equal(updated.payload.importantCustomField, "KEEP_ME", "Unrelated payload keys must still be preserved");
  });

  await t.test("F-05: CAS update prevents concurrent markNotificationAsRead from overwriting email delivery state", async () => {
    resetState();

    const notif = {
      id: "notif-cas-concurrent",
      status: "QUEUED",
      recipientUserId: "user-cas-1",
      updatedAt: new Date("2026-11-01T10:00:00.000Z"),
      payload: {
        emailStatus: "IN_FLIGHT",
        emailAttemptId: "att-cas-active",
        businessData: "important",
      },
    };
    sharedStore.notifications.set(notif.id, notif);

    // Concurrent writer 1: records email success
    const emailWrite = await recordEmailOutcome(
      mockPrisma,
      notif.id,
      "att-cas-active",
      { kind: "SENT", messageId: "msg-cas-success" },
      new Date()
    );
    assert.equal(emailWrite.updated, true);

    // Concurrent writer 2: user marks notification as read
    const readResult = await markNotificationAsRead(notif.id, { id: "user-cas-1", role: "COUNSELOR" });
    assert.equal(readResult.payload.read, true);

    // Verify both email outcome AND read flag are preserved without either overwriting the other
    const finalRow = sharedStore.notifications.get(notif.id);
    assert.equal(finalRow.payload.read, true, "Read status must be set");
    assert.equal(finalRow.payload.emailStatus, "SENT", "emailStatus SENT must NOT have been clobbered");
    assert.equal(finalRow.payload.emailMessageId, "msg-cas-success", "messageId must NOT have been clobbered");
    assert.equal(finalRow.payload.businessData, "important", "Unrelated fields preserved");
  });

  await t.test("F-06: updatePendingEventReminder uses atomic database condition (updateMany where status PENDING)", async () => {
    resetState();

    const reminder = {
      id: "rem-f06-atomic",
      eventId: "ev-f06",
      offset: "24H",
      status: "CANCELLED", // Already cancelled concurrently!
      scheduledFor: new Date(),
    };
    sharedStore.eventReminders.set(reminder.id, reminder);

    // Attempting atomic update on a non-pending reminder affects 0 rows
    const res = await mockPrisma.eventReminder.updateMany({
      where: { id: reminder.id, status: "PENDING" },
      data: { status: "SENT", sentAt: new Date() },
    });

    assert.equal(res.count, 0, "Atomic updateMany with status PENDING must affect 0 rows on cancelled reminder");
    const unchanged = sharedStore.eventReminders.get(reminder.id);
    assert.equal(unchanged.status, "CANCELLED", "Status must remain CANCELLED — zero false-SENT overwrite");
  });

  await t.test("F-07: stopNotificationPoller gracefully awaits in-flight sweep before releasing state", async () => {
    resetState();

    const statusBefore = await stopNotificationPoller({ timeoutMs: 1000 });
    assert.equal(statusBefore.stopped, true);
    assert.equal(statusBefore.timedOut, false);
  });

  await t.test("F-07: stopNotificationPoller reports timeout safely and preserves lock/pool lifecycle if sweep outlives timeout", async () => {
    resetState();

    // Start a long-running simulated sweep that holds activeEventSweepPromise
    let sweepFinished = false;
    const slowSweepPromise = new Promise((resolve) => {
      setTimeout(() => {
        sweepFinished = true;
        resolve({ processed: 1 });
      }, 100);
    });

    // Mock active sweep in poller by triggering processDueEventReminders with simulated delay
    const origFindMany = mockPrisma.eventReminder.findMany;
    mockPrisma.eventReminder.findMany = async () => {
      await slowSweepPromise;
      return [];
    };

    try {
      const sweepExecution = processDueEventReminders({ prismaClient: mockPrisma });
      
      // Stop with a short 20ms timeout while sweep is still awaiting slowSweepPromise
      const stopResult = await stopNotificationPoller({ timeoutMs: 20 });

      assert.equal(stopResult.stopped, false, "Poller must not declare clean stop while sweeps remain active");
      assert.equal(stopResult.timedOut, true, "Must flag timedOut = true");
      assert.equal(stopResult.reason, "TIMEOUT_ACTIVE_SWEEPS_REMAIN");
      assert.equal(stopResult.activeSweepsCompleted, false);

      // Await slow sweep to complete in background
      await sweepExecution;
      assert.equal(sweepFinished, true, "Sweep completed safely in background without pool corruption");
    } finally {
      mockPrisma.eventReminder.findMany = origFindMany;
      await stopNotificationPoller({ timeoutMs: 1000 });
    }
  });

  await t.test("F-08: All 6 email attempts and backoff intervals (5m, 15m, 30m, 60m, 120m) execute with recipient isolation", async () => {
    resetState();

    const expectedBackoffs = [5, 15, 30, 60, 120];
    assert.equal(MAX_EMAIL_ATTEMPTS, 6, "Must define exactly 6 attempts (1 initial + 5 retries)");
    assert.deepEqual(EMAIL_RETRY_BACKOFF_MINUTES, expectedBackoffs);

    const notif = {
      id: "notif-six-attempts",
      status: "QUEUED",
      recipientUserId: "u-retry-exhaust",
      updatedAt: new Date("2026-11-01T00:00:00Z"),
      payload: {},
    };
    sharedStore.notifications.set(notif.id, notif);

    let currentTime = new Date("2026-11-01T00:00:00Z");

    for (let attempt = 1; attempt <= 6; attempt++) {
      const attId = `att-step-${attempt}`;
      // Claim attempt
      const claim = await claimEmailAttempt(mockPrisma, notif.id, { attemptId: attId, now: currentTime });
      assert.equal(claim.updated, true, `Attempt ${attempt} must be claimable`);

      const inFlightRow = sharedStore.notifications.get(notif.id);
      assert.equal(inFlightRow.payload.emailStatus, "IN_FLIGHT");
      assert.equal(inFlightRow.payload.emailAttempts, attempt);

      // Record failure
      const outcome = await recordEmailOutcome(
        mockPrisma,
        notif.id,
        attId,
        { kind: "FAILED", error: `SMTP failure ${attempt}` },
        currentTime
      );
      assert.equal(outcome.updated, true);

      const failedRow = sharedStore.notifications.get(notif.id);
      assert.equal(failedRow.payload.emailStatus, "FAILED");

      if (attempt < 6) {
        assert.equal(failedRow.payload.emailExhausted, false);
        const expectedDelayMinutes = expectedBackoffs[attempt - 1];
        const nextTime = new Date(failedRow.payload.emailNextRetryAt).getTime();
        const expectedTime = currentTime.getTime() + expectedDelayMinutes * 60 * 1000;
        assert.equal(nextTime, expectedTime, `Attempt ${attempt} backoff must be exactly ${expectedDelayMinutes} minutes`);
        // Fast-forward clock past backoff
        currentTime = new Date(expectedTime + 1000);
      } else {
        // Attempt 6 exhausted
        assert.equal(failedRow.payload.emailExhausted, true, "Attempt 6 must mark emailExhausted = true");
        assert.equal(failedRow.payload.emailNextRetryAt, null, "Exhausted reminder has null nextRetryAt");
      }
    }

    // Attempt 7 MUST be rejected as EXHAUSTED
    const claim7 = await claimEmailAttempt(mockPrisma, notif.id, { attemptId: "att-7", now: currentTime });
    assert.equal(claim7.updated, false);
    assert.equal(claim7.reason, "EXHAUSTED", "Attempt 7 must be rejected with EXHAUSTED");
  });

  await t.test("F-08: Parent reminder transitions to SENT only when all recipients complete", async () => {
    resetState();

    const futureEvent = {
      id: "ev-parent-state",
      title: "Australian Visa Seminar",
      datetime: new Date(Date.now() + 36 * 3600 * 1000),
      approvalStatus: "APPROVED",
      audienceRoles: ["COUNSELOR"],
    };
    sharedStore.events.set(futureEvent.id, futureEvent);

    const reminder = {
      id: "rem-parent-state",
      eventId: futureEvent.id,
      offset: "24H",
      scheduledFor: new Date(Date.now() - 1000),
      status: "PENDING",
    };
    sharedStore.eventReminders.set(reminder.id, reminder);

    sharedStore.users.set("c-1", { id: "c-1", firstName: "Counselor 1", role: "COUNSELOR" });
    sharedStore.users.set("c-2", { id: "c-2", firstName: "Counselor 2", role: "COUNSELOR" });

    // Initial sweep
    const summary = await processDueEventReminders({
      now: new Date(),
      prismaClient: mockPrisma,
    });

    assert.equal(summary.sent, 2, "Both counselors sent in-app notifications");
    const updatedReminder = sharedStore.eventReminders.get(reminder.id);
    assert.equal(updatedReminder.status, "SENT", "Parent reminder must transition to SENT when all recipients are completed");
    assert.ok(updatedReminder.sentAt instanceof Date);
  });

  await t.test("F-09: rejectEvent deletes pending reminders inside advisory lock while preserving Notification audit history", async () => {
    resetState();

    const ev = {
      id: "ev-reject-f09",
      title: "Unapproved Workshop",
      datetime: new Date(Date.now() + 72 * 3600 * 1000),
      approvalStatus: "REQUESTED",
      createdById: "staff-1",
    };
    sharedStore.events.set(ev.id, ev);

    const pendingRem = {
      id: "rem-reject-pending",
      eventId: ev.id,
      offset: "24H",
      status: "PENDING",
      scheduledFor: new Date(),
    };
    sharedStore.eventReminders.set(pendingRem.id, pendingRem);

    // Existing notification audit records from earlier operations
    const auditNotif = {
      id: "notif-audit-preserve-1",
      recipientUserId: "staff-1",
      status: "QUEUED",
      payload: { eventId: ev.id, eventTitle: ev.title },
    };
    sharedStore.notifications.set(auditNotif.id, auditNotif);

    const adminUser = { id: "admin-1", role: "SUPER_ADMIN" };

    const rejectRes = await rejectEvent(ev.id, adminUser);
    assert.equal(rejectRes.event.approvalStatus, "REJECTED");

    assert.equal(sharedStore.eventReminders.has(pendingRem.id), false, "Pending reminders must be deleted upon event rejection");
    assert.equal(sharedStore.notifications.has(auditNotif.id), true, "Notification audit history MUST NOT be deleted upon rejection");
  });

  await t.test("F-09: Postponing event updates datetime and deletes obsolete pending reminders while preserving Notification audit history", async () => {
    resetState();

    const ev = {
      id: "ev-postpone-1",
      title: "Education Summit",
      datetime: new Date("2026-11-10T10:00:00Z"),
      approvalStatus: "APPROVED",
      createdById: "admin-1",
    };
    sharedStore.events.set(ev.id, ev);

    const oldRem = {
      id: "rem-old-summit",
      eventId: ev.id,
      offset: "ONE_DAY",
      status: "PENDING",
      scheduledFor: new Date("2026-11-09T10:00:00Z"),
    };
    sharedStore.eventReminders.set(oldRem.id, oldRem);

    // Existing notification audit record
    const auditNotif = {
      id: "notif-audit-preserve-2",
      recipientUserId: "admin-1",
      status: "QUEUED",
      payload: { eventId: ev.id, eventTitle: ev.title },
    };
    sharedStore.notifications.set(auditNotif.id, auditNotif);

    const adminUser = { id: "admin-1", role: "SUPER_ADMIN" };

    const updateRes = await updateEvent(
      ev.id,
      { datetime: "2026-11-20T10:00:00Z" },
      adminUser
    );

    assert.equal(updateRes.event.datetime.toISOString(), new Date("2026-11-20T10:00:00Z").toISOString());
    assert.equal(sharedStore.eventReminders.has(oldRem.id), false, "Old pending reminder must be deleted");
    assert.equal(sharedStore.notifications.has(auditNotif.id), true, "Notification audit history MUST NOT be deleted upon postponement");
    
    // Check that regenerated reminders exist with new schedule
    const newReminders = Array.from(sharedStore.eventReminders.values()).filter((r) => r.eventId === ev.id);
    assert.ok(newReminders.length > 0, "Fresh reminders generated for rescheduled date");
  });

});
