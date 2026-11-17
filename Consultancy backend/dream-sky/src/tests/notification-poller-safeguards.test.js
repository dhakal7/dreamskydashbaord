/**
 * Phase 34E.3.2 — Production Advisory Lock Session Lifecycle Verification Tests
 *
 * Execution Mode: Zero-database isolated unit testing.
 * Strictly mocks Prisma client, pg.Pool, and PostgreSQL session interfaces.
 * ZERO connections to PostgreSQL (ports 5432/5433).
 *
 * NOTE: All tests in this file use simulated in-memory stores and mock sessions.
 * Real PostgreSQL session affinity and distributed multi-process concurrency
 * can only be verified in a live PostgreSQL staging environment.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

// Save initial environment
const originalEnv = { ...process.env };

function restoreEnv() {
  process.env = { ...originalEnv };
}

// ── In-Memory Isolated Store & Mock Prisma Client with pg.Pool ──────────────
function createMockPrismaStore() {
  const store = {
    eventReminders: new Map(),
    events: new Map(),
    appointmentReminders: new Map(),
    appointments: new Map(),
    users: new Map(),
    notifications: new Map(),
    advisoryLocks: new Set(),
    poolClients: [],
  };

  const mockPool = {
    connect: async () => {
      const client = {
        id: `mock-session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        released: false,
        destroyed: false,
        releaseCount: 0,
        queries: [],
        query: async (sql, params) => {
          client.queries.push({ sql, params });
          const lockId = params ? Number(params[0]) : Number(sql.match(/\d+/)?.[0] || 0);
          if (sql.includes("pg_try_advisory_lock")) {
            if (store.advisoryLocks.has(lockId)) {
              return { rows: [{ locked: false }] };
            }
            store.advisoryLocks.add(lockId);
            return { rows: [{ locked: true }] };
          }
          if (sql.includes("pg_advisory_unlock")) {
            if (store.advisoryLocks.has(lockId)) {
              store.advisoryLocks.delete(lockId);
              return { rows: [{ unlocked: true }] };
            }
            return { rows: [{ unlocked: false }] };
          }
          return { rows: [] };
        },
        release: (destroy = false) => {
          client.releaseCount++;
          client.released = true;
          if (destroy) {
            client.destroyed = true;
          }
        },
      };
      store.poolClients.push(client);
      return client;
    },
  };

  const mockPrisma = {
    $pool: mockPool,

    eventReminder: {
      findMany: async ({ where = {}, include, orderBy, take }) => {
        let list = Array.from(store.eventReminders.values());
        if (where.status) {
          list = list.filter((r) => r.status === where.status);
        }
        if (where.scheduledFor?.lte) {
          list = list.filter((r) => new Date(r.scheduledFor) <= new Date(where.scheduledFor.lte));
        }
        return list.slice(0, take || 50).map((r) => {
          const res = { ...r };
          if (include?.event) {
            res.event = store.events.get(r.eventId) || null;
          }
          return res;
        });
      },
      update: async ({ where, data }) => {
        const r = store.eventReminders.get(where.id);
        if (!r) throw new Error("EventReminder not found: " + where.id);
        const updated = { ...r, ...data, updatedAt: new Date() };
        store.eventReminders.set(where.id, updated);
        return updated;
      },
    },

    appointmentReminder: {
      findMany: async ({ where = {}, include, orderBy, take }) => {
        let list = Array.from(store.appointmentReminders.values());
        if (where.status) {
          list = list.filter((r) => r.status === where.status);
        }
        if (where.scheduledFor?.lte) {
          list = list.filter((r) => new Date(r.scheduledFor) <= new Date(where.scheduledFor.lte));
        }
        return list.slice(0, take || 50).map((r) => {
          const res = { ...r };
          if (include?.appointment) {
            const appt = store.appointments.get(r.appointmentId);
            if (appt) {
              const apptCopy = { ...appt };
              if (include.appointment.include?.student) {
                const s = store.users.get(appt.studentId) || { id: appt.studentId, firstName: "Test", lastName: "Student", isActive: true };
                apptCopy.student = s;
              }
              if (include.appointment.include?.counselor) {
                apptCopy.counselor = store.users.get(appt.counselorId) || null;
              }
              res.appointment = apptCopy;
            } else {
              res.appointment = null;
            }
          }
          return res;
        });
      },
      update: async ({ where, data }) => {
        const r = store.appointmentReminders.get(where.id);
        if (!r) throw new Error("AppointmentReminder not found: " + where.id);
        const updated = { ...r, ...data, updatedAt: new Date() };
        store.appointmentReminders.set(where.id, updated);
        return updated;
      },
      delete: async ({ where }) => {
        const r = store.appointmentReminders.get(where.id);
        store.appointmentReminders.delete(where.id);
        return r || { id: where.id };
      },
    },

    user: {
      findMany: async ({ where = {}, select }) => {
        let list = Array.from(store.users.values());
        if (where.role?.in) {
          list = list.filter((u) => where.role.in.includes(u.role));
        }
        if (where.branchId) {
          list = list.filter((u) => u.branchId === where.branchId || u.branchId === null);
        }
        return list.map((u) => {
          if (select) {
            const res = {};
            for (const key of Object.keys(select)) res[key] = u[key];
            return res;
          }
          return { ...u };
        });
      },
      findUnique: async ({ where }) => {
        const u = store.users.get(where.id);
        return u ? { ...u } : { id: where.id, email: `${where.id}@example.com`, role: "COUNSELOR", firstName: "Test", lastName: "User" };
      },
    },

    notificationTemplate: {
      findUnique: async ({ where }) => {
        return {
          id: `tmpl-${where.name}`,
          name: where.name,
          content: "{{message}}",
          channel: "IN_APP",
        };
      },
    },

    notification: {
      findMany: async ({ where = {}, take, orderBy }) => {
        let list = Array.from(store.notifications.values());
        if (where.recipientUserId) {
          list = list.filter((n) => n.recipientUserId === where.recipientUserId);
        }
        if (where.payload?.path && where.payload.path[0] === "appointmentId") {
          list = list.filter((n) => n.payload?.appointmentId === where.payload.equals);
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
        let res = list;
        if (take) {
          res = res.slice(0, take);
        }
        return res.map((n) => ({ ...n }));
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
        store.notifications.set(id, notif);
        return { ...notif };
      },
      update: async ({ where, data }) => {
        const notif = store.notifications.get(where.id);
        if (!notif) return { id: where.id, ...data };
        const updated = {
          ...notif,
          ...data,
          payload: { ...(notif.payload || {}), ...(data.payload || {}) },
          updatedAt: new Date(),
        };
        store.notifications.set(where.id, updated);
        return updated;
      },
    },
  };

  return { store, mockPrisma };
}

test("Phase 34E.3.2 — Production Advisory Lock Session Lifecycle Verification", async (t) => {
  // Ensure ../prisma is stubbed before requiring notification.poller or server
  const prismaPath = require.resolve("../prisma");
  if (!require.cache[prismaPath]) {
    const { mockPrisma: initialMockPrisma } = createMockPrismaStore();
    require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: initialMockPrisma };
  }

  const {
    startNotificationPoller,
    stopNotificationPoller,
    processDueEventReminders,
    processDueAppointmentReminders,
    acquireDedicatedSession,
    acquireAdvisoryLock,
    releaseAdvisoryLock,
    hasEventReminderBeenSent,
    getPollerStatus,
    isRetryableError,
    isUnsupportedJsonQueryError,
    EVENT_REMINDER_LOCK_ID,
    APPOINTMENT_REMINDER_LOCK_ID,
  } = require("../services/notification.poller");
  const { handleGracefulShutdown, _resetShutdownForTesting } = require("../server");

  t.afterEach(async () => {
    await stopNotificationPoller({ timeoutMs: 100 });
    if (typeof _resetShutdownForTesting === "function") _resetShutdownForTesting();
    restoreEnv();
  });

  // ── 1. ENVIRONMENT GATE & FORCE-OPTION BYPASS TESTS ───────────────────────────

  await t.test("[MOCKED] Poller is disabled when ENABLE_NOTIFICATION_POLLER is missing", () => {
    delete process.env.ENABLE_NOTIFICATION_POLLER;
    const result = startNotificationPoller();
    assert.deepEqual(result, { started: false, reason: "POLLER_DISABLED" });
  });

  await t.test("[MOCKED] Poller is disabled when ENABLE_NOTIFICATION_POLLER is 'false'", () => {
    process.env.ENABLE_NOTIFICATION_POLLER = "false";
    const result = startNotificationPoller();
    assert.deepEqual(result, { started: false, reason: "POLLER_DISABLED" });
  });

  await t.test("[MOCKED] Poller is disabled when ENABLE_NOTIFICATION_POLLER has nonstandard values", () => {
    const nonstandardValues = ["1", "true ", "yes", "TRUE", "enabled", "on"];
    for (const val of nonstandardValues) {
      process.env.ENABLE_NOTIFICATION_POLLER = val;
      const result = startNotificationPoller();
      assert.deepEqual(result, { started: false, reason: "POLLER_DISABLED" });
    }
  });

  await t.test("[MOCKED] Force-option cannot bypass disabled poller environment gate", () => {
    delete process.env.ENABLE_NOTIFICATION_POLLER;
    const res = startNotificationPoller({ force: true });
    assert.deepEqual(res, { started: false, reason: "POLLER_DISABLED" });
  });

  await t.test("[MOCKED] Poller enables ONLY when ENABLE_NOTIFICATION_POLLER is strictly 'true'", () => {
    process.env.ENABLE_NOTIFICATION_POLLER = "true";
    const { mockPrisma } = createMockPrismaStore();
    const result = startNotificationPoller({
      prismaClient: mockPrisma,
      skipInitialSweep: true,
      intervalMs: 999999,
    });
    assert.equal(result.started, true);
  });

  await t.test("[MOCKED] Disabled poller performs zero sweeps and does not schedule intervals", async () => {
    delete process.env.ENABLE_NOTIFICATION_POLLER;
    let sweepCalled = false;
    const result = startNotificationPoller({
      onEventSweep: () => { sweepCalled = true; },
    });
    assert.equal(result.started, false);
    assert.equal(sweepCalled, false);
  });

  await t.test("[MOCKED] Importing notification.poller does not execute sweeps", () => {
    const pollerModule = require("../services/notification.poller");
    assert.equal(typeof pollerModule.startNotificationPoller, "function");
    assert.equal(typeof pollerModule.processDueEventReminders, "function");
    assert.equal(typeof pollerModule.processDueAppointmentReminders, "function");
  });

  // ── 2. DEDICATED SESSION ACQUISITION & LIFECYCLE TESTS ────────────────────────

  await t.test("[MOCKED] Production sweep obtains a dedicated session from pg.Pool", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    assert.equal(store.poolClients.length, 0);

    const result = await processDueEventReminders({
      now: new Date(),
      prismaClient: mockPrisma,
    });

    assert.equal(result.processed, 0);
    assert.equal(store.poolClients.length, 1, "Exactly one dedicated client must be checked out from pg.Pool");
    assert.equal(store.poolClients[0].released, true, "Dedicated client must be released after sweep");
    assert.equal(store.poolClients[0].destroyed, false, "Successful sweep cleanly returns connection to pool without destruction");
  });

  await t.test("[MOCKED] Same dedicated session is used for both lock acquisition and release", async () => {
    const { store, mockPrisma } = createMockPrismaStore();
    const queryLog = [];

    // Intercept client queries to verify session continuity
    const origConnect = mockPrisma.$pool.connect;
    mockPrisma.$pool.connect = async () => {
      const client = await origConnect();
      const origQuery = client.query;
      client.query = async (sql, params) => {
        queryLog.push({ sessionId: client.id, sql, params });
        return origQuery(sql, params);
      };
      return client;
    };

    await processDueAppointmentReminders({
      now: new Date(),
      prismaClient: mockPrisma,
    });

    assert.equal(queryLog.length, 2, "Must execute exactly two lock queries (acquire and release)");
    assert.match(queryLog[0].sql, /pg_try_advisory_lock/);
    assert.match(queryLog[1].sql, /pg_advisory_unlock/);
    assert.equal(queryLog[0].sessionId, queryLog[1].sessionId, "Acquire and release MUST execute on the exact same session ID");
  });

  await t.test("[MOCKED] Session cleanup occurs cleanly after successful processing", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    await processDueEventReminders({
      now: new Date(),
      prismaClient: mockPrisma,
    });

    const client = store.poolClients[0];
    assert.equal(client.released, true);
    assert.equal(client.destroyed, false, "Connection returned to pool for reuse on clean unlock");
    assert.equal(client.releaseCount, 1, "Session released exactly once");
    assert.equal(store.advisoryLocks.has(EVENT_REMINDER_LOCK_ID), false, "Advisory lock was released");
  });

  await t.test("[MOCKED] Session cleanup occurs cleanly after processing errors", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    mockPrisma.eventReminder.findMany = async () => {
      throw new Error("Simulated query failure inside sweep");
    };

    await assert.rejects(
      processDueEventReminders({
        now: new Date(),
        prismaClient: mockPrisma,
      }),
      /Simulated query failure/
    );

    const client = store.poolClients[0];
    assert.equal(client.released, true, "Connection released even after sweep processing error");
    assert.equal(client.releaseCount, 1, "Session released exactly once");
    assert.equal(store.advisoryLocks.has(EVENT_REMINDER_LOCK_ID), false, "Lock released in finally block");
  });

  await t.test("[MOCKED] Unlock returning false triggers connection destruction rather than pool reuse", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    // Override mock client so unlock returns false (simulating uncertain lock state)
    const origConnect = mockPrisma.$pool.connect;
    mockPrisma.$pool.connect = async () => {
      const client = await origConnect();
      client.query = async (sql) => {
        if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
        if (sql.includes("pg_advisory_unlock")) return { rows: [{ unlocked: false }] };
        return { rows: [] };
      };
      return client;
    };

    await processDueEventReminders({
      now: new Date(),
      prismaClient: mockPrisma,
    });

    const client = store.poolClients[0];
    assert.equal(client.released, true);
    assert.equal(client.destroyed, true, "Connection MUST be destroyed from pool when unlock returns false to prevent lock leakage");
    assert.equal(client.releaseCount, 1, "Session released exactly once");
  });

  await t.test("[MOCKED] Unlock throwing an exception triggers connection destruction rather than pool reuse", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    const origConnect = mockPrisma.$pool.connect;
    mockPrisma.$pool.connect = async () => {
      const client = await origConnect();
      client.query = async (sql) => {
        if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
        if (sql.includes("pg_advisory_unlock")) throw new Error("Socket closed during unlock");
        return { rows: [] };
      };
      return client;
    };

    await processDueEventReminders({
      now: new Date(),
      prismaClient: mockPrisma,
    });

    const client = store.poolClients[0];
    assert.equal(client.released, true);
    assert.equal(client.destroyed, true, "Connection MUST be destroyed from pool when unlock throws to prevent lock leakage");
  });

  await t.test("[MOCKED] No sweep when dedicated-session acquisition fails", async () => {
    const { mockPrisma } = createMockPrismaStore();

    // Simulate pool connection failure
    mockPrisma.$pool.connect = async () => {
      throw new Error("Pool exhausted: max connections reached");
    };

    let findManyCalled = false;
    mockPrisma.eventReminder.findMany = async () => {
      findManyCalled = true;
      return [];
    };

    const result = await processDueEventReminders({
      now: new Date(),
      prismaClient: mockPrisma,
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, "DEDICATED_SESSION_UNAVAILABLE");
    assert.equal(findManyCalled, false, "Sweep must not execute when dedicated session cannot be obtained");
  });

  await t.test("[MOCKED] No fallback to unsafe global Prisma session-level locking", async () => {
    // Client has NO $pool, NO sessionProvider, and NO lockSession
    const barePrisma = {
      $queryRawUnsafe: async () => [{ locked: true }],
      eventReminder: { findMany: async () => [] },
    };

    const result = await processDueEventReminders({
      now: new Date(),
      prismaClient: barePrisma,
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, "DEDICATED_SESSION_UNAVAILABLE", "Must strictly fail closed without falling back to bare prisma queries");
  });

  await t.test("[MOCKED] Multiple simulated workers cannot acquire the same advisory lock simultaneously", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    const session1 = await acquireDedicatedSession(mockPrisma);
    const session2 = await acquireDedicatedSession(mockPrisma);

    const worker1 = await acquireAdvisoryLock(session1, EVENT_REMINDER_LOCK_ID);
    assert.equal(worker1.acquired, true);

    const worker2 = await acquireAdvisoryLock(session2, EVENT_REMINDER_LOCK_ID);
    assert.equal(worker2.acquired, false, "Worker 2 cannot acquire already held lock");

    await releaseAdvisoryLock(session1, EVENT_REMINDER_LOCK_ID);
    session1.release(false);
    session2.release(false);
  });

  // ── 3. IDEMPOTENCY & LIFECYCLE TESTS ──────────────────────────────────────────

  await t.test("[MOCKED] Event reminders are not duplicated under concurrent processing", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    const event = {
      id: "event-general-1",
      title: "IELTS Orientation Seminar",
      datetime: new Date("2026-11-05T10:00:00Z"),
      type: "SEMINAR",
      location: "Main Hall",
      audienceRoles: ["EVERYONE"],
      branchId: null,
    };
    store.events.set(event.id, event);

    const reminder = {
      id: "event-rem-1",
      eventId: event.id,
      offset: "24H",
      scheduledFor: new Date("2026-11-04T10:00:00Z"),
      status: "PENDING",
      sentAt: null,
    };
    store.eventReminders.set(reminder.id, reminder);

    const user = {
      id: "user-student-1",
      firstName: "Aarav",
      lastName: "Sharma",
      email: "aarav@example.com",
      role: "STUDENT",
      branchId: null,
    };
    store.users.set(user.id, user);

    const sweep1 = await processDueEventReminders({
      now: new Date("2026-11-04T11:00:00Z"),
      prismaClient: mockPrisma,
    });
    assert.equal(sweep1.sent, 1);
    assert.equal(sweep1.skipped, 0);

    store.eventReminders.set(reminder.id, { ...reminder, status: "PENDING" });

    const sweep2 = await processDueEventReminders({
      now: new Date("2026-11-04T11:00:00Z"),
      prismaClient: mockPrisma,
    });
    assert.equal(sweep2.sent, 0, "No duplicate notification should be sent");
    assert.equal(sweep2.skipped, 1, "Duplicate notification should be skipped via idempotency check");
  });

  await t.test("[MOCKED] Appointment reminders remain deduplicated under concurrent processing", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    const appt = {
      id: "appt-dedup-1",
      studentId: "student-1",
      counselorId: "counselor-1",
      datetime: new Date("2026-11-02T10:00:00Z"),
      status: "SCHEDULED",
    };
    store.appointments.set(appt.id, appt);

    const reminder = {
      id: "rem-dedup-1",
      appointmentId: appt.id,
      offset: "24H",
      scheduledFor: new Date("2026-11-01T10:00:00Z"),
      status: "PENDING",
      sentAt: null,
    };
    store.appointmentReminders.set(reminder.id, reminder);

    store.notifications.set("existing-notif-1", {
      id: "existing-notif-1",
      recipientUserId: "counselor-1",
      status: "QUEUED",
      createdAt: new Date("2026-11-01T10:00:05Z"),
      payload: {
        appointmentId: appt.id,
        action: "REMINDER_24H",
        appointmentDatetime: appt.datetime.toISOString(),
        newDatetime: appt.datetime.toISOString(),
      },
    });

    mockPrisma.notification.create = async () => {
      const err = new Error("Unique constraint failed on (recipientUserId, appointmentId, action)");
      err.code = "P2002";
      throw err;
    };

    const summary = await processDueAppointmentReminders({
      now: new Date("2026-11-01T11:00:00Z"),
      prismaClient: mockPrisma,
    });

    assert.equal(summary.sent, 1, "Collision recovery should mark reminder as SENT without double dispatch");
    assert.equal(summary.failed, 0);

    const updated = store.appointmentReminders.get(reminder.id);
    assert.equal(updated.status, "SENT");
  });

  await t.test("[MOCKED] Failed reminder processing can be retried safely", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    const appt = {
      id: "appt-retry-1",
      studentId: "student-1",
      counselorId: "counselor-1",
      datetime: new Date("2026-11-02T10:00:00Z"),
      status: "SCHEDULED",
    };
    store.appointments.set(appt.id, appt);

    const reminder = {
      id: "rem-retry-1",
      appointmentId: appt.id,
      offset: "24H",
      scheduledFor: new Date("2026-11-01T10:00:00Z"),
      status: "PENDING",
      sentAt: null,
    };
    store.appointmentReminders.set(reminder.id, reminder);

    let failAttempt = true;
    mockPrisma.notification.create = async () => {
      if (failAttempt) {
        throw new Error("Temporary network timeout");
      }
      return { id: "notif-retry-success", status: "QUEUED" };
    };

    const run1 = await processDueAppointmentReminders({
      now: new Date("2026-11-01T11:00:00Z"),
      prismaClient: mockPrisma,
    });
    assert.equal(run1.failed, 1);
    assert.equal(store.appointmentReminders.get(reminder.id).status, "FAILED");

    store.appointmentReminders.set(reminder.id, {
      ...store.appointmentReminders.get(reminder.id),
      status: "PENDING",
    });
    failAttempt = false;

    const run2 = await processDueAppointmentReminders({
      now: new Date("2026-11-01T11:00:00Z"),
      prismaClient: mockPrisma,
    });
    assert.equal(run2.sent, 1);
    assert.equal(store.appointmentReminders.get(reminder.id).status, "SENT");
  });

  await t.test("[MOCKED] Phase 34E.2 notification status behavior remains intact", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    const event = {
      id: "event-intact-1",
      title: "Visa Workshop",
      datetime: new Date("2026-11-05T10:00:00Z"),
      type: "WORKSHOP",
      audienceRoles: ["EVERYONE"],
    };
    store.events.set(event.id, event);

    const reminder = {
      id: "event-rem-intact-1",
      eventId: event.id,
      offset: "1H",
      scheduledFor: new Date("2026-11-05T09:00:00Z"),
      status: "PENDING",
    };
    store.eventReminders.set(reminder.id, reminder);

    const user = {
      id: "user-intact-1",
      firstName: "Maya",
      lastName: "Rai",
      email: "maya@example.com",
      role: "COUNSELOR",
    };
    store.users.set(user.id, user);

    const summary = await processDueEventReminders({
      now: new Date("2026-11-05T09:30:00Z"),
      prismaClient: mockPrisma,
    });

    assert.equal(summary.sent, 1);
    const notifications = Array.from(store.notifications.values());
    assert.equal(notifications.length, 1);
    assert.notEqual(notifications[0].status, "FAILED", "IN_APP notification must never be degraded to FAILED");
    assert.equal(notifications[0].status, "QUEUED", "IN_APP notification status remains QUEUED/active");
  });

  await t.test("[MOCKED] Existing reminder scheduling and recipient rules remain unchanged", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    const event = {
      id: "event-rules-1",
      title: "Counselor Briefing",
      datetime: new Date("2026-11-06T10:00:00Z"),
      type: "MEETING",
      audienceRoles: ["COUNSELOR"],
      branchId: "branch-ktm",
    };
    store.events.set(event.id, event);

    const reminder = {
      id: "event-rem-rules-1",
      eventId: event.id,
      offset: "24H",
      scheduledFor: new Date("2026-11-05T10:00:00Z"),
      status: "PENDING",
    };
    store.eventReminders.set(reminder.id, reminder);

    store.users.set("counselor-1", {
      id: "counselor-1",
      firstName: "Kiran",
      role: "COUNSELOR",
      branchId: "branch-ktm",
    });

    store.users.set("student-1", {
      id: "student-1",
      firstName: "Bikash",
      role: "STUDENT",
      branchId: "branch-ktm",
    });

    const summary = await processDueEventReminders({
      now: new Date("2026-11-05T12:00:00Z"),
      prismaClient: mockPrisma,
    });

    assert.equal(summary.sent, 1);
    const sentNotifs = Array.from(store.notifications.values());
    assert.equal(sentNotifs.length, 1);
    assert.equal(sentNotifs[0].recipientUserId, "counselor-1", "Notification must only route to authorized COUNSELOR role");
  });

  // ── 4. PHASE 34E.3.3 ADVISORY LOCK ACQUISITION FAILURE CLEANUP TESTS ─────────

  await t.test("[MOCKED] False lock result releases checked-out connection cleanly exactly once without unlocking (Event Reminders)", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    // Simulate another worker holding EVENT_REMINDER_LOCK_ID
    store.advisoryLocks.add(EVENT_REMINDER_LOCK_ID);

    const result = await processDueEventReminders({
      now: new Date(),
      prismaClient: mockPrisma,
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, "LOCK_ACQUISITION_FAILED");
    assert.equal(result.lockReason, "LOCK_HELD_BY_ANOTHER_SESSION");

    assert.equal(store.poolClients.length, 1, "Exactly one client checked out");
    const client = store.poolClients[0];
    assert.equal(client.released, true, "Connection released back to pool");
    assert.equal(client.releaseCount, 1, "Connection released exactly once");
    assert.equal(client.destroyed, false, "Connection returned cleanly without destruction");

    // Must NOT have executed unlock query
    const unlockQuery = client.queries.find((q) => q.sql.includes("pg_advisory_unlock"));
    assert.equal(unlockQuery, undefined, "Worker that failed to acquire lock must NOT call pg_advisory_unlock");

    // Lock must remain intact for the other worker
    assert.equal(store.advisoryLocks.has(EVENT_REMINDER_LOCK_ID), true, "Other worker's lock remains held");
  });

  await t.test("[MOCKED] False lock result releases checked-out connection cleanly exactly once without unlocking (Appointment Reminders)", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    // Simulate another worker holding APPOINTMENT_REMINDER_LOCK_ID
    store.advisoryLocks.add(APPOINTMENT_REMINDER_LOCK_ID);

    const result = await processDueAppointmentReminders({
      now: new Date(),
      prismaClient: mockPrisma,
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, "LOCK_ACQUISITION_FAILED");
    assert.equal(result.lockReason, "LOCK_HELD_BY_ANOTHER_SESSION");

    assert.equal(store.poolClients.length, 1, "Exactly one client checked out");
    const client = store.poolClients[0];
    assert.equal(client.released, true, "Connection released back to pool");
    assert.equal(client.releaseCount, 1, "Connection released exactly once");
    assert.equal(client.destroyed, false, "Connection returned cleanly without destruction");

    const unlockQuery = client.queries.find((q) => q.sql.includes("pg_advisory_unlock"));
    assert.equal(unlockQuery, undefined, "Worker that failed to acquire lock must NOT call pg_advisory_unlock");
    assert.equal(store.advisoryLocks.has(APPOINTMENT_REMINDER_LOCK_ID), true);
  });

  await t.test("[MOCKED] Thrown acquisition query destroys the connection exactly once without unlocking", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    // Override mock connect to throw on pg_try_advisory_lock
    const origConnect = mockPrisma.$pool.connect;
    mockPrisma.$pool.connect = async () => {
      const client = await origConnect();
      client.query = async (sql, params) => {
        client.queries.push({ sql, params });
        if (sql.includes("pg_try_advisory_lock")) {
          throw new Error("PostgreSQL connection terminated unexpectedly");
        }
        return { rows: [] };
      };
      return client;
    };

    const result = await processDueEventReminders({
      now: new Date(),
      prismaClient: mockPrisma,
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, "LOCK_ACQUISITION_FAILED");
    assert.equal(result.lockReason, "ACQUISITION_ERROR");

    assert.equal(store.poolClients.length, 1);
    const client = store.poolClients[0];
    assert.equal(client.released, true, "Session release called");
    assert.equal(client.releaseCount, 1, "Released exactly once");
    assert.equal(client.destroyed, true, "Broken connection MUST be destroyed from pool");

    const unlockQuery = client.queries.find((q) => q.sql.includes("pg_advisory_unlock"));
    assert.equal(unlockQuery, undefined, "Worker must NOT attempt unlock if acquisition query threw");
  });

  await t.test("[MOCKED] Neither false nor thrown acquisition executes reminder queries or dispatches notifications", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    // Populate due reminders
    const event = {
      id: "ev-due-1",
      title: "IELTS Masterclass",
      datetime: new Date("2026-11-05T10:00:00Z"),
      audienceRoles: ["EVERYONE"],
    };
    store.events.set(event.id, event);

    const reminder = {
      id: "rem-due-1",
      eventId: event.id,
      offset: "24H",
      scheduledFor: new Date("2026-11-04T09:00:00Z"),
      status: "PENDING",
    };
    store.eventReminders.set(reminder.id, reminder);

    store.users.set("u-student-1", {
      id: "u-student-1",
      email: "student@example.com",
      role: "STUDENT",
    });

    // 1. Test case: Lock returns false (held by another session)
    store.advisoryLocks.add(EVENT_REMINDER_LOCK_ID);

    let findManyCalls = 0;
    const origFindMany = mockPrisma.eventReminder.findMany;
    mockPrisma.eventReminder.findMany = async (...args) => {
      findManyCalls++;
      return origFindMany(...args);
    };

    const resFalse = await processDueEventReminders({
      now: new Date("2026-11-04T10:00:00Z"),
      prismaClient: mockPrisma,
    });

    assert.equal(resFalse.skipped, true);
    assert.equal(findManyCalls, 0, "No reminder queries executed when lock returns false");
    assert.equal(store.notifications.size, 0, "No notifications dispatched");
    assert.equal(store.eventReminders.get(reminder.id).status, "PENDING", "Reminder status unchanged");

    // 2. Test case: Lock query throws
    store.advisoryLocks.delete(EVENT_REMINDER_LOCK_ID); // clear lock
    const origConnect = mockPrisma.$pool.connect;
    mockPrisma.$pool.connect = async () => {
      const client = await origConnect();
      client.query = async (sql, params) => {
        client.queries.push({ sql, params });
        if (sql.includes("pg_try_advisory_lock")) {
          throw new Error("Simulated query timeout");
        }
        return { rows: [] };
      };
      return client;
    };

    const resThrow = await processDueEventReminders({
      now: new Date("2026-11-04T10:00:00Z"),
      prismaClient: mockPrisma,
    });

    assert.equal(resThrow.skipped, true);
    assert.equal(findManyCalls, 0, "No reminder queries executed when lock acquisition throws");
    assert.equal(store.notifications.size, 0, "No notifications dispatched");
    assert.equal(store.eventReminders.get(reminder.id).status, "PENDING", "Reminder status unchanged");
  });

  await t.test("[MOCKED] A worker that fails to acquire does not unlock or affect the owning worker's lock", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    // Worker 1 acquires lock on session 1
    const session1 = await acquireDedicatedSession(mockPrisma);
    const lock1 = await acquireAdvisoryLock(session1, EVENT_REMINDER_LOCK_ID);
    assert.equal(lock1.acquired, true);
    assert.equal(store.advisoryLocks.has(EVENT_REMINDER_LOCK_ID), true);

    // Worker 2 attempts reminder sweep
    const sweepResult = await processDueEventReminders({
      now: new Date(),
      prismaClient: mockPrisma,
    });

    assert.equal(sweepResult.skipped, true);
    assert.equal(sweepResult.reason, "LOCK_ACQUISITION_FAILED");

    // Verify Worker 1 still holds the lock in the store
    assert.equal(store.advisoryLocks.has(EVENT_REMINDER_LOCK_ID), true, "Worker 1's lock MUST NOT be released by Worker 2");

    // Worker 1 can now release its own lock safely
    const unlockResult = await releaseAdvisoryLock(session1, EVENT_REMINDER_LOCK_ID);
    assert.equal(unlockResult.released, true);
    assert.equal(store.advisoryLocks.has(EVENT_REMINDER_LOCK_ID), false, "Lock released only when owner releases");
    session1.release(false);
  });

  await t.test("[MOCKED] Repeated lock contention does not accumulate checked-out connections in the pool", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    // Pre-hold both locks
    store.advisoryLocks.add(EVENT_REMINDER_LOCK_ID);
    store.advisoryLocks.add(APPOINTMENT_REMINDER_LOCK_ID);

    const TICKS = 10;
    for (let i = 0; i < TICKS; i++) {
      const eventRes = await processDueEventReminders({ now: new Date(), prismaClient: mockPrisma });
      assert.equal(eventRes.skipped, true);

      const apptRes = await processDueAppointmentReminders({ now: new Date(), prismaClient: mockPrisma });
      assert.equal(apptRes.skipped, true);
    }

    // Total checked-out clients over 10 ticks = 20
    assert.equal(store.poolClients.length, TICKS * 2);

    // Every single client must be released cleanly
    const unreleasedClients = store.poolClients.filter((c) => !c.released);
    assert.equal(unreleasedClients.length, 0, "Zero checked-out connections may remain active in the pool");

    for (const client of store.poolClients) {
      assert.equal(client.released, true);
      assert.equal(client.releaseCount, 1, "Each client released exactly once");
      assert.equal(client.destroyed, false, "Healthy contended connections returned to pool without destruction");
    }
  });

  await t.test("[MOCKED] Successful acquisition still follows existing unlock and cleanup lifecycle", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    const sweepResult = await processDueEventReminders({
      now: new Date(),
      prismaClient: mockPrisma,
    });

    assert.equal(sweepResult.processed, 0);
    assert.equal(store.poolClients.length, 1);
    const client = store.poolClients[0];
    assert.equal(client.released, true);
    assert.equal(client.releaseCount, 1);
    assert.equal(client.destroyed, false);
    assert.equal(store.advisoryLocks.has(EVENT_REMINDER_LOCK_ID), false, "Lock cleanly unlocked at end");

    // Verify query sequence
    assert.match(client.queries[0].sql, /pg_try_advisory_lock/);
    assert.match(client.queries[1].sql, /pg_advisory_unlock/);
  });

  // ── 5. PHASE 34E.3.6 FINAL TEST-BYPASS ISOLATION & REMOVAL TESTS ──────────────

  await t.test("[MOCKED] Zero lock bypass mechanism exists or is exported in notification.poller", () => {
    const pollerModule = require("../services/notification.poller");
    assert.equal(typeof pollerModule.createTestLockBypassToken, "undefined", "No token creation helper may be exported");
    assert.equal(typeof pollerModule.revokeTestLockBypassToken, "undefined", "No token revocation helper may be exported");
    assert.equal(typeof pollerModule.TEST_LOCK_BYPASS_SYMBOL, "undefined", "No bypass Symbol may be exported");
    assert.equal(typeof pollerModule.isLockBypassAuthorized, "undefined", "No bypass authorization checker may be exported");
    assert.equal(typeof pollerModule.isLockBypassAllowed, "undefined", "No legacy bypass checker may be exported");
    assert.equal(typeof pollerModule.skipLock, "undefined", "No skipLock property may be exported");
  });

  await t.test("[MOCKED] NODE_ENV='test' alone CANNOT activate lock bypass", async () => {
    process.env.NODE_ENV = "test";
    const { store, mockPrisma } = createMockPrismaStore();

    // Even with NODE_ENV='test' and skipLock: true, reminder sweep MUST acquire lock
    const sweepResult = await processDueEventReminders({
      now: new Date(),
      prismaClient: mockPrisma,
      skipLock: true,
    });

    assert.equal(sweepResult.processed, 0);
    assert.equal(store.poolClients.length, 1, "Must checkout dedicated connection from pg.Pool");
    const client = store.poolClients[0];
    assert.equal(client.released, true);
    assert.equal(client.releaseCount, 1);
    assert.equal(client.queries.some((q) => q.sql.includes("pg_try_advisory_lock")), true);
  });

  await t.test("[MOCKED] NODE_ENV='production' always requires advisory locking", async () => {
    process.env.NODE_ENV = "production";
    const { store, mockPrisma } = createMockPrismaStore();

    const sweepResult = await processDueAppointmentReminders({
      now: new Date(),
      prismaClient: mockPrisma,
      skipLock: true,
    });

    assert.equal(sweepResult.processed, 0);
    assert.equal(store.poolClients.length, 1, "Must checkout dedicated connection in production");
    const client = store.poolClients[0];
    assert.equal(client.released, true);
    assert.equal(client.releaseCount, 1);
    assert.equal(client.queries.some((q) => q.sql.includes("pg_try_advisory_lock")), true);
  });

  await t.test("[MOCKED] An explicitly supplied skipLock: true cannot bypass locking through application-facing functions", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    // 1. Event reminders with explicit skipLock: true
    const eventRes = await processDueEventReminders({
      now: new Date(),
      prismaClient: mockPrisma,
      skipLock: true,
    });
    assert.equal(eventRes.processed, 0);
    assert.equal(store.poolClients.length, 1);
    assert.equal(store.poolClients[0].queries.some((q) => q.sql.includes("pg_try_advisory_lock")), true);

    // 2. Appointment reminders with explicit skipLock: true
    const apptRes = await processDueAppointmentReminders({
      now: new Date(),
      prismaClient: mockPrisma,
      skipLock: true,
    });
    assert.equal(apptRes.processed, 0);
    assert.equal(store.poolClients.length, 2);
    assert.equal(store.poolClients[1].queries.some((q) => q.sql.includes("pg_try_advisory_lock")), true);

    // 3. Direct lock acquire with explicit skipLock: true
    const dummyClient = await mockPrisma.$pool.connect();
    const lockRes = await acquireAdvisoryLock(dummyClient, EVENT_REMINDER_LOCK_ID, { skipLock: true });
    assert.equal(lockRes.acquired, true); // Lock was acquired via actual query
    assert.equal(dummyClient.queries.some((q) => q.sql.includes("pg_try_advisory_lock")), true, "Acquire executed query despite skipLock: true");
    await releaseAdvisoryLock(dummyClient, EVENT_REMINDER_LOCK_ID, { skipLock: true });
    assert.equal(dummyClient.queries.some((q) => q.sql.includes("pg_advisory_unlock")), true, "Release executed query despite skipLock: true");
    dummyClient.release();
  });

  await t.test("[MOCKED] Poller startup cannot enable unlocked sweeps", async () => {
    process.env.ENABLE_NOTIFICATION_POLLER = "true";
    const { store, mockPrisma } = createMockPrismaStore();

    const startRes = startNotificationPoller({
      skipLock: true,
      prismaClient: mockPrisma,
      intervalMs: 999999,
    });
    assert.equal(startRes.started, true);

    // Await immediate startup tick
    await new Promise((resolve) => setImmediate(resolve));

    // Both event and appointment sweeps must have checked out connections and acquired locks
    assert.equal(store.poolClients.length >= 2, true, "Startup sweeps must checkout dedicated sessions");
    for (const client of store.poolClients) {
      assert.equal(client.released, true);
      assert.equal(client.queries.some((q) => q.sql.includes("pg_try_advisory_lock")), true);
    }
  });

  await t.test("[MOCKED] Both event and appointment sweeps require dedicated sessions (fail-closed)", async () => {
    const barePrisma = {
      $queryRawUnsafe: async () => [{ locked: true }],
      eventReminder: { findMany: async () => [] },
      appointmentReminder: { findMany: async () => [] },
    };

    const eventRes = await processDueEventReminders({
      now: new Date(),
      prismaClient: barePrisma,
    });
    assert.equal(eventRes.skipped, true);
    assert.equal(eventRes.reason, "DEDICATED_SESSION_UNAVAILABLE");

    const apptRes = await processDueAppointmentReminders({
      now: new Date(),
      prismaClient: barePrisma,
    });
    assert.equal(apptRes.skipped, true);
    assert.equal(apptRes.reason, "DEDICATED_SESSION_UNAVAILABLE");
  });

  await t.test("[MOCKED] Lock contention skips processing and failed acquisition does not execute reminder queries", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    store.advisoryLocks.add(EVENT_REMINDER_LOCK_ID);

    const event = {
      id: "ev-contention-1",
      title: "IELTS Strategy Session",
      datetime: new Date("2026-11-05T10:00:00Z"),
      audienceRoles: ["EVERYONE"],
    };
    store.events.set(event.id, event);

    const reminder = {
      id: "rem-contention-1",
      eventId: event.id,
      offset: "24H",
      scheduledFor: new Date("2026-11-04T09:00:00Z"),
      status: "PENDING",
    };
    store.eventReminders.set(reminder.id, reminder);

    let findManyCalls = 0;
    const origFindMany = mockPrisma.eventReminder.findMany;
    mockPrisma.eventReminder.findMany = async (...args) => {
      findManyCalls++;
      return origFindMany(...args);
    };

    const result = await processDueEventReminders({
      now: new Date("2026-11-04T10:00:00Z"),
      prismaClient: mockPrisma,
      skipLock: true, // Caller attempts bypass
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, "LOCK_ACQUISITION_FAILED");
    assert.equal(result.lockReason, "LOCK_HELD_BY_ANOTHER_SESSION");
    assert.equal(findManyCalls, 0, "No reminder queries executed when lock acquisition fails");
    assert.equal(store.notifications.size, 0, "No notifications dispatched");
    assert.equal(store.eventReminders.get(reminder.id).status, "PENDING", "Reminder status untouched");

    // Connection returned cleanly without destruction
    const client = store.poolClients[0];
    assert.equal(client.released, true);
    assert.equal(client.destroyed, false);
    assert.equal(store.advisoryLocks.has(EVENT_REMINDER_LOCK_ID), true, "Owning worker's lock untouched");
  });

  await t.test("[MOCKED] JSON and deserialized objects have zero effect on locking", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    const deserializedPayload = JSON.parse(
      JSON.stringify({
        skipLock: true,
        force: true,
        bypass: true,
        session: "fake",
      })
    );

    const sweepResult = await processDueEventReminders({
      now: new Date(),
      prismaClient: mockPrisma,
      ...deserializedPayload,
    });

    assert.equal(sweepResult.processed, 0);
    assert.equal(store.poolClients.length, 1, "Must checkout dedicated connection despite deserialized bypass properties");
    const client = store.poolClients[0];
    assert.equal(client.released, true);
    assert.equal(client.queries.some((q) => q.sql.includes("pg_try_advisory_lock")), true);
  });

  // ── 6. PHASE 34E.5 RELIABILITY REMEDIATIONS (F-01, F-02, F-03, F-05) ─────────────

  await t.test("[MOCKED] F-01: Per-item error isolation prevents single failing reminder from aborting batch", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    const user1 = { id: "u-f01-1", firstName: "Staff", lastName: "One", email: "staff1@dreamsky.internal", role: "COUNSELOR" };
    const user2 = { id: "u-f01-2", firstName: "Staff", lastName: "Two", email: "staff2@dreamsky.internal", role: "COUNSELOR" };
    store.users.set(user1.id, user1);
    store.users.set(user2.id, user2);

    const event1 = {
      id: "ev-f01-1",
      title: "Faulty Event",
      datetime: new Date("2026-11-05T10:00:00Z"),
      audienceRoles: ["COUNSELOR"],
    };
    const event2 = {
      id: "ev-f01-2",
      title: "Healthy Event",
      datetime: new Date("2026-11-05T14:00:00Z"),
      audienceRoles: ["COUNSELOR"],
    };
    store.events.set(event1.id, event1);
    store.events.set(event2.id, event2);

    const reminder1 = {
      id: "rem-f01-1",
      eventId: event1.id,
      offset: "24H",
      scheduledFor: new Date("2026-11-04T09:00:00Z"),
      status: "PENDING",
    };
    const reminder2 = {
      id: "rem-f01-2",
      eventId: event2.id,
      offset: "24H",
      scheduledFor: new Date("2026-11-04T09:30:00Z"),
      status: "PENDING",
    };
    store.eventReminders.set(reminder1.id, reminder1);
    store.eventReminders.set(reminder2.id, reminder2);

    // Simulate failure specifically on reminder1's notification creation
    const origCreate = mockPrisma.notification.create;
    mockPrisma.notification.create = async ({ data }) => {
      if (data.payload?.reminderId === reminder1.id) {
        throw new Error("Simulated dispatch network timeout on reminder 1");
      }
      return origCreate({ data });
    };

    const summary = await processDueEventReminders({
      now: new Date("2026-11-04T10:00:00Z"),
      prismaClient: mockPrisma,
    });

    assert.equal(summary.processed, 2, "Both reminders in batch must be processed");
    assert.equal(summary.failed, 1, "Reminder 1 must be recorded as failed");
    assert.ok(summary.sent >= 2, "Reminder 2 must succeed for its recipients despite Reminder 1 failure");

    // Check statuses in store
    const r1After = store.eventReminders.get(reminder1.id);
    const r2After = store.eventReminders.get(reminder2.id);

    assert.equal(r1After.status, "PENDING", "Failing reminder must NOT be marked SENT (preserves retry semantics)");
    assert.equal(r1After.sentAt, undefined, "sentAt must not be set on failed reminder");
    assert.equal(r2After.status, "SENT", "Subsequent reminder must successfully transition to SENT");
    assert.ok(r2After.sentAt instanceof Date, "sentAt must be set on successful reminder");

    // Verify session and advisory lock were cleaned up cleanly
    const client = store.poolClients[0];
    assert.equal(client.released, true);
    assert.equal(store.advisoryLocks.has(EVENT_REMINDER_LOCK_ID), false, "Lock must be released despite item failure");
  });

  await t.test("[MOCKED] F-01: Database update failure on EventReminder does not abort batch or leave lock held", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    const user = { id: "u-f01-3", firstName: "Staff", lastName: "Three", email: "staff3@dreamsky.internal", role: "COUNSELOR" };
    store.users.set(user.id, user);

    const event1 = { id: "ev-f01-3", title: "DB Error Event 1", datetime: new Date("2026-11-05T10:00:00Z"), audienceRoles: ["COUNSELOR"] };
    const event2 = { id: "ev-f01-4", title: "DB Good Event 2", datetime: new Date("2026-11-05T14:00:00Z"), audienceRoles: ["COUNSELOR"] };
    store.events.set(event1.id, event1);
    store.events.set(event2.id, event2);

    const reminder1 = { id: "rem-f01-3", eventId: event1.id, offset: "24H", scheduledFor: new Date("2026-11-04T09:00:00Z"), status: "PENDING" };
    const reminder2 = { id: "rem-f01-4", eventId: event2.id, offset: "24H", scheduledFor: new Date("2026-11-04T09:30:00Z"), status: "PENDING" };
    store.eventReminders.set(reminder1.id, reminder1);
    store.eventReminders.set(reminder2.id, reminder2);

    const origUpdate = mockPrisma.eventReminder.update;
    mockPrisma.eventReminder.update = async ({ where, data }) => {
      if (where.id === reminder1.id) {
        throw new Error("Simulated database write lock conflict on EventReminder update");
      }
      return origUpdate({ where, data });
    };

    const summary = await processDueEventReminders({
      now: new Date("2026-11-04T10:00:00Z"),
      prismaClient: mockPrisma,
    });

    assert.equal(summary.processed, 2);
    assert.equal(summary.failed, 1, "Failed update is isolated and tracked in failed summary");
    assert.equal(store.eventReminders.get(reminder1.id).status, "PENDING");
    assert.equal(store.eventReminders.get(reminder2.id).status, "SENT");
    assert.equal(store.advisoryLocks.has(EVENT_REMINDER_LOCK_ID), false, "Lock released cleanly");
  });

  await t.test("[MOCKED] F-02: stopNotificationPoller awaits active in-flight sweep", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    let sweepCompleted = false;
    const origFindMany = mockPrisma.eventReminder.findMany;
    mockPrisma.eventReminder.findMany = async (...args) => {
      // Simulate asynchronous sweep delay
      await new Promise((r) => setTimeout(r, 40));
      sweepCompleted = true;
      return origFindMany(...args);
    };

    // Start background sweep
    const sweepPromise = processDueEventReminders({
      now: new Date(),
      prismaClient: mockPrisma,
    });

    // Immediately stop poller
    const stopResult = await stopNotificationPoller({ timeoutMs: 500 });

    assert.equal(stopResult.stopped, true);
    assert.equal(stopResult.timedOut, false);
    assert.equal(stopResult.activeSweepsCompleted, true);
    assert.equal(sweepCompleted, true, "In-flight sweep must finish before stop completes");

    await sweepPromise;
  });

  await t.test("[MOCKED] F-02: stopNotificationPoller handles hanging sweep without deadlock (timeout protection)", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    let resolveHang;
    mockPrisma.eventReminder.findMany = async () => {
      return new Promise((resolve) => {
        resolveHang = resolve;
      });
    };

    // Trigger hanging sweep
    const sweepPromise = processDueEventReminders({
      now: new Date(),
      prismaClient: mockPrisma,
    }).catch(() => {});

    const startTime = Date.now();
    const stopResult = await stopNotificationPoller({ timeoutMs: 50 });
    const elapsed = Date.now() - startTime;

    assert.equal(stopResult.stopped, false, "Timeout must report incomplete stop, not successful completion");
    assert.equal(stopResult.completed, false);
    assert.equal(stopResult.timedOut, true);
    assert.ok(elapsed >= 45 && elapsed < 300, `Halt should occur near timeout (elapsed: ${elapsed}ms)`);

    // Unblock hanging sweep so state resets cleanly
    if (resolveHang) resolveHang([]);
    await sweepPromise;
  });

  await t.test("[MOCKED] F-02: handleGracefulShutdown coordinates poller stop, HTTP server close, and DB disconnect", async () => {
    let pollerStopped = false;
    let serverClosed = false;
    let poolEnded = false;
    let disconnected = false;

    const mockStopPoller = async ({ timeoutMs }) => {
      pollerStopped = true;
      return { stopped: true, activeSweepsCompleted: true };
    };

    const mockServer = {
      listening: true,
      close: (cb) => {
        serverClosed = true;
        cb(null);
      },
    };

    const mockPrismaClient = {
      $pool: {
        end: async () => {
          poolEnded = true;
        },
      },
      $disconnect: async () => {
        disconnected = true;
      },
    };

    const result = await handleGracefulShutdown("SIGTERM", {
      stopNotificationPoller: mockStopPoller,
      server: mockServer,
      prismaClient: mockPrismaClient,
      pollerTimeoutMs: 100,
      skipExit: true,
    });

    assert.equal(result.completed, true);
    assert.equal(result.signal, "SIGTERM");
    assert.equal(pollerStopped, true, "Poller must be stopped first");
    assert.equal(serverClosed, true, "Server close must be called");
    assert.equal(poolEnded, true, "Database pool end must be called");
    assert.equal(disconnected, true, "Prisma disconnect must be called");
  });

  await t.test("[MOCKED] F-02: Duplicate shutdown signal is rejected to prevent race conditions", async () => {
    let callCount = 0;
    const mockStopPoller = async () => {
      callCount++;
      return { stopped: true };
    };

    const res1 = await handleGracefulShutdown("SIGTERM", {
      stopNotificationPoller: mockStopPoller,
      skipExit: true,
    });
    assert.equal(res1.completed, true);

    const res2 = await handleGracefulShutdown("SIGINT", {
      stopNotificationPoller: mockStopPoller,
      skipExit: true,
    });
    assert.equal(res2.alreadyShuttingDown, true, "Second shutdown signal must be ignored");
    assert.equal(callCount, 1, "Poller stop must only be invoked once");
  });

  await t.test("[MOCKED] F-03: Deduplication succeeds when recipient has >50 newer unrelated notifications", async () => {
    const { store, mockPrisma } = createMockPrismaStore();
    const recipientId = "u-f03-recipient";
    const reminderId = "rem-f03-target";
    const eventId = "ev-f03-target";
    const offset = "24H";

    // 1. Seed 65 newer notifications unrelated to this reminder
    for (let i = 1; i <= 65; i++) {
      const id = `notif-unrelated-${i}`;
      store.notifications.set(id, {
        id,
        recipientUserId: recipientId,
        subject: `Unrelated Alert ${i}`,
        payload: { type: "GENERAL_ALERT", index: i },
        createdAt: new Date(Date.now() - (65 - i) * 60000), // more recent
      });
    }

    // 2. Add the older event reminder notification
    const olderReminderNotifId = "notif-target-reminder";
    store.notifications.set(olderReminderNotifId, {
      id: olderReminderNotifId,
      recipientUserId: recipientId,
      subject: "Old Reminder",
      payload: { reminderId, eventId, reminderOffset: offset },
      createdAt: new Date(Date.now() - 100 * 60000), // oldest
    });

    // 3. Verify hasEventReminderBeenSent detects the notification even though it's beyond index 50
    const alreadySent = await hasEventReminderBeenSent(mockPrisma, recipientId, reminderId, eventId, offset);
    assert.equal(alreadySent, true, "Must detect prior notification despite >50 newer notifications in inbox");
  });

  await t.test("[MOCKED] F-03: processDueEventReminders skips dispatch when prior notification is beyond 50-row window", async () => {
    const { store, mockPrisma } = createMockPrismaStore();
    const recipient = { id: "u-f03-skip", firstName: "Skip", lastName: "User", email: "skip@dreamsky.internal", role: "COUNSELOR" };
    store.users.set(recipient.id, recipient);

    const event = { id: "ev-f03-skip", title: "Dedup Test Event", datetime: new Date("2026-11-05T10:00:00Z"), audienceRoles: ["COUNSELOR"] };
    store.events.set(event.id, event);

    const reminder = { id: "rem-f03-skip", eventId: event.id, offset: "24H", scheduledFor: new Date("2026-11-04T09:00:00Z"), status: "PENDING" };
    store.eventReminders.set(reminder.id, reminder);

    // Seed 70 newer notifications
    for (let i = 1; i <= 70; i++) {
      const id = `notif-noise-${i}`;
      store.notifications.set(id, {
        id,
        recipientUserId: recipient.id,
        payload: { noise: true },
        createdAt: new Date(Date.now() - (70 - i) * 10000),
      });
    }

    // Seed prior reminder notification
    store.notifications.set("prior-event-notif", {
      id: "prior-event-notif",
      recipientUserId: recipient.id,
      payload: { reminderId: reminder.id, eventId: event.id, reminderOffset: reminder.offset },
      createdAt: new Date(Date.now() - 900000),
    });

    const initialNotifCount = store.notifications.size;

    const summary = await processDueEventReminders({
      now: new Date("2026-11-04T10:00:00Z"),
      prismaClient: mockPrisma,
    });

    assert.equal(summary.processed, 1);
    assert.equal(summary.skipped, 1, "Must skip duplicate dispatch");
    assert.equal(summary.sent, 0, "Zero new notifications sent");
    assert.equal(store.notifications.size, initialNotifCount, "Notification store count unchanged");
  });

  await t.test("[MOCKED] F-05: getPollerStatus reports accurate operational metrics and telemetry", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    const statusInitial = getPollerStatus();
    assert.equal(typeof statusInitial.isRunning, "boolean");
    assert.equal(statusInitial.isShuttingDown, false);
    assert.equal(statusInitial.isProcessingEvents, false);
    assert.equal(statusInitial.isProcessingAppointments, false);
    assert.equal(statusInitial.batchSize, 50);
    assert.equal(statusInitial.lockIds.eventReminder, EVENT_REMINDER_LOCK_ID);
    assert.equal(statusInitial.lockIds.appointmentReminder, APPOINTMENT_REMINDER_LOCK_ID);

    // Execute event sweep
    await processDueEventReminders({
      now: new Date(),
      prismaClient: mockPrisma,
    });

    const statusAfter = getPollerStatus();
    assert.ok(statusAfter.lastEventSweepAt instanceof Date, "lastEventSweepAt must be recorded");
    assert.equal(statusAfter.lastEventSweepResult.processed, 0);
  });

  // ── 7. PHASE 34E.7 LIFECYCLE, RETRY & SHUTDOWN HARDENING TESTS ────────────────

  await t.test("[MOCKED] F-06: Shutdown timeout on appointment sweep reports incomplete stop and retains tracking", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    let unblockAppt;
    const apptHoldPromise = new Promise((resolve) => {
      unblockAppt = resolve;
    });

    mockPrisma.appointmentReminder.findMany = async () => {
      await apptHoldPromise;
      return [];
    };

    const sweepPromise = processDueAppointmentReminders({
      now: new Date(),
      prismaClient: mockPrisma,
    }).catch(() => {});

    await new Promise((r) => setTimeout(r, 20));

    const stopResult = await stopNotificationPoller({ timeoutMs: 50 });

    assert.equal(stopResult.stopped, false, "Must report stopped: false when timed out");
    assert.equal(stopResult.completed, false, "Must report completed: false when timed out");
    assert.equal(stopResult.timedOut, true);
    assert.equal(stopResult.reason, "TIMEOUT_ACTIVE_SWEEPS_REMAIN");

    const status = getPollerStatus();
    assert.equal(status.isShuttingDown, true, "isShuttingDown must remain true while sweep is still in flight");
    assert.equal(status.hasActiveSweeps, true, "Must report active sweeps in flight");

    // Cleanly unblock sweep
    unblockAppt();
    await sweepPromise;
  });

  await t.test("[MOCKED] F-06: handleGracefulShutdown defers DB pool closure when poller times out", async () => {
    let poolEnded = false;
    let disconnected = false;
    let serverClosed = false;

    const mockTimedOutPoller = async () => {
      return { stopped: false, completed: false, timedOut: true, activeSweepsCompleted: false };
    };

    const mockServer = {
      listening: true,
      close: (cb) => {
        serverClosed = true;
        cb(null);
      },
    };

    const mockPrismaClient = {
      $pool: {
        end: async () => {
          poolEnded = true;
        },
      },
      $disconnect: async () => {
        disconnected = true;
      },
    };

    const result = await handleGracefulShutdown("SIGTERM", {
      stopNotificationPoller: mockTimedOutPoller,
      server: mockServer,
      prismaClient: mockPrismaClient,
      pollerTimeoutMs: 50,
      skipExit: true,
    });

    assert.equal(result.completed, false, "Shutdown must report completed: false on timeout");
    assert.equal(result.timedOut, true);
    assert.equal(serverClosed, true, "HTTP server should still be closed to halt incoming traffic");
    assert.equal(poolEnded, false, "CRITICAL: Database pool MUST NOT be ended while sweeps may be active");
    assert.equal(disconnected, false, "CRITICAL: Prisma disconnect MUST NOT be called while sweeps may be active");
  });

  await t.test("[MOCKED] F-06: startNotificationPoller is rejected while an active sweep is still in flight", async () => {
    process.env.ENABLE_NOTIFICATION_POLLER = "true";
    const { mockPrisma } = createMockPrismaStore();

    let unblockSweep;
    const sweepHoldPromise = new Promise((resolve) => {
      unblockSweep = resolve;
    });

    mockPrisma.eventReminder.findMany = async () => {
      await sweepHoldPromise;
      return [];
    };

    const sweepPromise = processDueEventReminders({
      now: new Date(),
      prismaClient: mockPrisma,
    }).catch(() => {});

    await new Promise((r) => setTimeout(r, 20));

    // Poller start should be rejected while sweep is in-flight
    const startResult = startNotificationPoller();
    assert.equal(startResult.started, false);
    assert.equal(startResult.reason, "SHUTDOWN_IN_PROGRESS");

    unblockSweep();
    await sweepPromise;
    await stopNotificationPoller({ timeoutMs: 50 });
  });

  await t.test("[MOCKED] F-07: Event sweep halts cooperatively upon shutdown without marking unprocessed items as SENT", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    const user = { id: "u-f07-coop", firstName: "Coop", lastName: "Staff", email: "coop@dreamsky.internal", role: "COUNSELOR" };
    store.users.set(user.id, user);

    const event = { id: "ev-f07-coop", title: "Cooperative Event", datetime: new Date("2026-11-06T10:00:00Z"), audienceRoles: ["COUNSELOR"] };
    store.events.set(event.id, event);

    const r1 = { id: "rem-coop-1", eventId: event.id, offset: "24H", scheduledFor: new Date("2026-11-05T09:00:00Z"), status: "PENDING" };
    const r2 = { id: "rem-coop-2", eventId: event.id, offset: "24H", scheduledFor: new Date("2026-11-05T09:10:00Z"), status: "PENDING" };
    const r3 = { id: "rem-coop-3", eventId: event.id, offset: "24H", scheduledFor: new Date("2026-11-05T09:20:00Z"), status: "PENDING" };
    store.eventReminders.set(r1.id, r1);
    store.eventReminders.set(r2.id, r2);
    store.eventReminders.set(r3.id, r3);

    // After reminder 1 is sent, initiate shutdown so loop encounters isShuttingDown = true before reminder 2
    const origCreate = mockPrisma.notification.create;
    mockPrisma.notification.create = async ({ data }) => {
      if (data.payload?.reminderId === r1.id) {
        // Trigger shutdown mid-sweep
        await stopNotificationPoller({ timeoutMs: 100 });
      }
      return origCreate({ data });
    };

    const summary = await processDueEventReminders({
      now: new Date("2026-11-05T10:00:00Z"),
      prismaClient: mockPrisma,
    });

    assert.equal(summary.processed, 1, "Only 1 reminder should be processed before cooperative break");
    assert.equal(summary.sent, 1);

    // Reminder 1 should be SENT, but Reminders 2 and 3 MUST remain PENDING
    assert.equal(store.eventReminders.get(r1.id).status, "SENT");
    assert.equal(store.eventReminders.get(r2.id).status, "PENDING", "Unreached reminder must stay PENDING");
    assert.equal(store.eventReminders.get(r3.id).status, "PENDING", "Unreached reminder must stay PENDING");

    // Dedicated session and lock must be released cleanly
    const client = store.poolClients[0];
    assert.equal(client.released, true);
    assert.equal(store.advisoryLocks.has(EVENT_REMINDER_LOCK_ID), false, "Advisory lock unlocked despite early break");
  });

  await t.test("[MOCKED] F-07: Appointment sweep halts cooperatively upon shutdown", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    const counselor = { id: "c-f07-coop", firstName: "Counselor", lastName: "A", email: "counselor@dreamsky.internal", role: "COUNSELOR" };
    const student = { id: "s-f07-coop", firstName: "Student", lastName: "A", isActive: true };
    store.users.set(counselor.id, counselor);
    store.users.set(student.id, student);

    const appt1 = { id: "app-f07-1", status: "SCHEDULED", counselorId: counselor.id, studentId: student.id, datetime: new Date("2026-11-06T10:00:00Z") };
    const appt2 = { id: "app-f07-2", status: "SCHEDULED", counselorId: counselor.id, studentId: student.id, datetime: new Date("2026-11-06T11:00:00Z") };
    store.appointments.set(appt1.id, appt1);
    store.appointments.set(appt2.id, appt2);

    const r1 = { id: "rem-app-coop-1", appointmentId: appt1.id, offset: "24H", scheduledFor: new Date("2026-11-05T09:00:00Z"), status: "PENDING" };
    const r2 = { id: "rem-app-coop-2", appointmentId: appt2.id, offset: "24H", scheduledFor: new Date("2026-11-05T09:10:00Z"), status: "PENDING" };
    store.appointmentReminders.set(r1.id, r1);
    store.appointmentReminders.set(r2.id, r2);

    const origCreate = mockPrisma.notification.create;
    mockPrisma.notification.create = async ({ data }) => {
      if (data.payload?.reminderId === r1.id) {
        await stopNotificationPoller({ timeoutMs: 100 });
      }
      return origCreate({ data });
    };

    const summary = await processDueAppointmentReminders({
      now: new Date("2026-11-05T10:00:00Z"),
      prismaClient: mockPrisma,
    });

    assert.equal(summary.processed, 1);
    assert.equal(store.appointmentReminders.get(r1.id).status, "SENT");
    assert.equal(store.appointmentReminders.get(r2.id).status, "PENDING", "Second reminder stays PENDING");
    assert.equal(store.advisoryLocks.has(APPOINTMENT_REMINDER_LOCK_ID), false, "Advisory lock unlocked cleanly");
  });

  await t.test("[MOCKED] F-08: Deduplication matches modern reminderId and historical (eventId, offset) payloads", async () => {
    const { store, mockPrisma } = createMockPrismaStore();
    const recipientId = "u-f08-target";

    // 1. Modern notification with reminderId
    store.notifications.set("n-modern", {
      id: "n-modern",
      recipientUserId: recipientId,
      payload: { reminderId: "rem-modern-123" },
      createdAt: new Date(),
    });

    // 2. Historical notification with eventId and reminderOffset
    store.notifications.set("n-historical", {
      id: "n-historical",
      recipientUserId: recipientId,
      payload: { eventId: "ev-hist-456", reminderOffset: "24H" },
      createdAt: new Date(),
    });

    // Verify modern match
    const hasModern = await hasEventReminderBeenSent(mockPrisma, recipientId, "rem-modern-123", "other-ev", "24H");
    assert.equal(hasModern, true, "Modern reminderId must match");

    // Verify historical match
    const hasHistorical = await hasEventReminderBeenSent(mockPrisma, recipientId, "other-rem", "ev-hist-456", "24H");
    assert.equal(hasHistorical, true, "Historical (eventId, offset) must match");

    // Verify unmatched returns false
    const hasUnmatched = await hasEventReminderBeenSent(mockPrisma, recipientId, "non-existent-rem", "non-existent-ev", "1H");
    assert.equal(hasUnmatched, false, "Unmatched reminder must return false");
  });

  await t.test("[MOCKED] F-09: Transient dispatch error backs off scheduledFor into future without queue starvation", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    const user = { id: "u-f09-backoff", firstName: "Backoff", lastName: "User", email: "backoff@dreamsky.internal", role: "COUNSELOR" };
    store.users.set(user.id, user);

    const event = { id: "ev-f09-backoff", title: "Future Event", datetime: new Date("2026-11-10T10:00:00Z"), audienceRoles: ["COUNSELOR"] };
    store.events.set(event.id, event);

    const reminder = {
      id: "rem-f09-transient",
      eventId: event.id,
      offset: "24H",
      scheduledFor: new Date("2026-11-04T09:00:00Z"),
      status: "PENDING",
    };
    store.eventReminders.set(reminder.id, reminder);

    // Simulate transient network timeout
    mockPrisma.notification.create = async () => {
      const err = new Error("Connection reset by peer");
      err.code = "ECONNRESET";
      throw err;
    };

    const initialScheduled = new Date(reminder.scheduledFor);
    const summary = await processDueEventReminders({
      now: new Date("2026-11-04T10:00:00Z"),
      prismaClient: mockPrisma,
    });

    assert.equal(summary.failed, 1);
    const updatedReminder = store.eventReminders.get(reminder.id);
    assert.equal(updatedReminder.status, "PENDING", "Transient error keeps PENDING status");
    assert.ok(
      new Date(updatedReminder.scheduledFor).getTime() > initialScheduled.getTime(),
      "scheduledFor must be bumped forward into the future to prevent head-of-line blocking"
    );
  });

  await t.test("[MOCKED] F-09: Permanent error marks reminder as FAILED immediately", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    const user = { id: "u-f09-perm", firstName: "Perm", lastName: "User", email: "perm@dreamsky.internal", role: "COUNSELOR" };
    store.users.set(user.id, user);

    const event = { id: "ev-f09-perm", title: "Corrupt Event", datetime: new Date("2026-11-10T10:00:00Z"), audienceRoles: ["COUNSELOR"] };
    store.events.set(event.id, event);

    const reminder = {
      id: "rem-f09-perm",
      eventId: event.id,
      offset: "24H",
      scheduledFor: new Date("2026-11-04T09:00:00Z"),
      status: "PENDING",
    };
    store.eventReminders.set(reminder.id, reminder);

    // Simulate permanent validation error
    mockPrisma.notification.create = async () => {
      const err = new Error("Template not found: EVENT_REMINDER_24H");
      err.name = "ValidationError";
      throw err;
    };

    const summary = await processDueEventReminders({
      now: new Date("2026-11-04T10:00:00Z"),
      prismaClient: mockPrisma,
    });

    assert.equal(summary.failed, 1);
    const updatedReminder = store.eventReminders.get(reminder.id);
    assert.equal(updatedReminder.status, "FAILED", "Permanent error transitions status to FAILED");
  });

  await t.test("[MOCKED] F-10: Appointment sweep transitions to FAILED upon dispatch error to avoid batch starvation", async () => {
    const { store, mockPrisma } = createMockPrismaStore();

    const counselor = { id: "c-f10", firstName: "Counselor", lastName: "B", email: "cb@dreamsky.internal", role: "COUNSELOR" };
    const student = { id: "s-f10", firstName: "Student", lastName: "B", isActive: true };
    store.users.set(counselor.id, counselor);
    store.users.set(student.id, student);

    const appt = { id: "app-f10", status: "SCHEDULED", counselorId: counselor.id, studentId: student.id, datetime: new Date("2026-11-10T10:00:00Z") };
    store.appointments.set(appt.id, appt);

    const reminder = { id: "rem-app-f10", appointmentId: appt.id, offset: "24H", scheduledFor: new Date("2026-11-05T09:00:00Z"), status: "PENDING" };
    store.appointmentReminders.set(reminder.id, reminder);

    mockPrisma.notification.create = async () => {
      throw new Error("SMTP connection refused: Simulated network failure");
    };

    const summary = await processDueAppointmentReminders({
      now: new Date("2026-11-05T10:00:00Z"),
      prismaClient: mockPrisma,
    });

    assert.equal(summary.failed, 1);
    const updatedReminder = store.appointmentReminders.get(reminder.id);
    assert.equal(updatedReminder.status, "FAILED", "Failed appointment reminder transitions to FAILED so it never blocks the queue");
  });

  await t.test("[MOCKED] Observability: getPollerStatus accurately reflects active sweep count and shutdown flag", async () => {
    const status = getPollerStatus();
    assert.equal(typeof status.hasActiveSweeps, "boolean");
    assert.equal(typeof status.activeSweepCount, "number");
    assert.equal(typeof status.isShuttingDown, "boolean");
  });

  // ── 8. PHASE 34E.9.1 DEDUPLICATION FAIL-CLOSED CONTRACT & SAFETY TESTS ───────

  await t.test("[MOCKED] F-08.1: Missing Prisma client throws descriptive error", async () => {
    await assert.rejects(
      async () => {
        await hasEventReminderBeenSent(null, "u-1", "rem-1", "ev-1", "24H");
      },
      (err) => err.message.includes("Prisma client is required"),
      "Missing Prisma client must throw and fail closed"
    );
  });

  await t.test("[MOCKED] F-08.2: Missing notification model throws descriptive error", async () => {
    await assert.rejects(
      async () => {
        await hasEventReminderBeenSent({}, "u-2", "rem-2", "ev-2", "24H");
      },
      (err) => err.message.includes("notification model is unavailable"),
      "Missing notification model must throw and fail closed"
    );
  });

  await t.test("[MOCKED] F-08.3: Missing findMany throws descriptive error", async () => {
    await assert.rejects(
      async () => {
        await hasEventReminderBeenSent({ notification: {} }, "u-3", "rem-3", "ev-3", "24H");
      },
      (err) => err.message.includes("notification.findMany method is unavailable"),
      "Missing findMany method must throw and fail closed"
    );
  });

  await t.test("[MOCKED] F-08.4: No deduplication identifier throws descriptive error", async () => {
    const { mockPrisma } = createMockPrismaStore();
    await assert.rejects(
      async () => {
        await hasEventReminderBeenSent(mockPrisma, "u-4", null, null, null);
      },
      (err) => err.message.includes("either a valid modern reminderId or valid historical"),
      "Missing both modern and historical deduplication keys must throw"
    );
  });

  await t.test("[MOCKED] F-08.5: Missing recipient identifier throws descriptive error", async () => {
    const { mockPrisma } = createMockPrismaStore();
    await assert.rejects(
      async () => {
        await hasEventReminderBeenSent(mockPrisma, null, "rem-5", "ev-5", "24H");
      },
      (err) => err.message.includes("valid recipientUserId is required"),
      "Null recipientUserId must throw"
    );
    await assert.rejects(
      async () => {
        await hasEventReminderBeenSent(mockPrisma, "   ", "rem-5", "ev-5", "24H");
      },
      (err) => err.message.includes("valid recipientUserId is required"),
      "Blank recipientUserId must throw"
    );
  });

  await t.test("[MOCKED] F-08.6: Modern reminder ID match returns true", async () => {
    const { store, mockPrisma } = createMockPrismaStore();
    const recipientId = "u-6";
    store.notifications.set("notif-6", {
      id: "notif-6",
      recipientUserId: recipientId,
      payload: { reminderId: "rem-6" },
      createdAt: new Date(),
    });

    const res = await hasEventReminderBeenSent(mockPrisma, recipientId, "rem-6", "ev-6", "24H");
    assert.equal(res, true, "Matching modern reminderId must return true");
  });

  await t.test("[MOCKED] F-08.7: Modern reminder ID non-match returns false after a successful query", async () => {
    const { store, mockPrisma } = createMockPrismaStore();
    const recipientId = "u-7";
    store.notifications.set("notif-7", {
      id: "notif-7",
      recipientUserId: recipientId,
      payload: { reminderId: "rem-other" },
      createdAt: new Date(),
    });

    const res = await hasEventReminderBeenSent(mockPrisma, recipientId, "rem-7", null, null);
    assert.equal(res, false, "Non-matching reminderId must return false after clean query");
  });

  await t.test("[MOCKED] F-08.8: Historical event ID and reminder offset match returns true", async () => {
    const { store, mockPrisma } = createMockPrismaStore();
    const recipientId = "u-8";
    store.notifications.set("notif-8", {
      id: "notif-8",
      recipientUserId: recipientId,
      payload: { eventId: "ev-8", reminderOffset: "24H" },
      createdAt: new Date(),
    });

    const res = await hasEventReminderBeenSent(mockPrisma, recipientId, null, "ev-8", "24H");
    assert.equal(res, true, "Historical (eventId, reminderOffset) must match");
  });

  await t.test("[MOCKED] F-08.9: Integer zero offset matches correctly", async () => {
    const { store, mockPrisma } = createMockPrismaStore();
    const recipientId = "u-9";
    store.notifications.set("notif-9", {
      id: "notif-9",
      recipientUserId: recipientId,
      payload: { eventId: "ev-9", reminderOffset: 0 },
      createdAt: new Date(),
    });

    const res = await hasEventReminderBeenSent(mockPrisma, recipientId, null, "ev-9", 0);
    assert.equal(res, true, "Integer offset 0 must match correctly and not be treated as falsy/absent");
  });

  await t.test("[MOCKED] F-08.10: String zero offset matches correctly if supported", async () => {
    const { store, mockPrisma } = createMockPrismaStore();
    const recipientId = "u-10";
    store.notifications.set("notif-10", {
      id: "notif-10",
      recipientUserId: recipientId,
      payload: { eventId: "ev-10", reminderOffset: "0" },
      createdAt: new Date(),
    });

    const res = await hasEventReminderBeenSent(mockPrisma, recipientId, null, "ev-10", "0");
    assert.equal(res, true, "String offset '0' must match correctly");
  });

  await t.test("[MOCKED] F-08.11: Null and undefined offsets are handled safely", async () => {
    const { mockPrisma } = createMockPrismaStore();
    await assert.rejects(
      async () => {
        await hasEventReminderBeenSent(mockPrisma, "u-11", null, "ev-11", null);
      },
      (err) => err.message.includes("either a valid modern reminderId or valid historical"),
      "Null offset with no reminderId must be rejected"
    );
    await assert.rejects(
      async () => {
        await hasEventReminderBeenSent(mockPrisma, "u-11", null, "ev-11", undefined);
      },
      (err) => err.message.includes("either a valid modern reminderId or valid historical"),
      "Undefined offset with no reminderId must be rejected"
    );
  });

  await t.test("[MOCKED] F-08.12: Another recipient's notification never counts as a match", async () => {
    const { store, mockPrisma } = createMockPrismaStore();
    store.notifications.set("notif-12", {
      id: "notif-12",
      recipientUserId: "other-user",
      payload: { reminderId: "rem-12" },
      createdAt: new Date(),
    });

    const res = await hasEventReminderBeenSent(mockPrisma, "target-user", "rem-12", null, null);
    assert.equal(res, false, "Notification belonging to another user must never match target user");
  });

  await t.test("[MOCKED] F-08.13: A specifically recognized unsupported JSON-path capability error uses permitted fallback", async () => {
    const { store, mockPrisma } = createMockPrismaStore();
    const recipientId = "u-13";
    store.notifications.set("notif-13", {
      id: "notif-13",
      recipientUserId: recipientId,
      payload: { reminderId: "rem-13" },
      createdAt: new Date(),
    });

    const origFindMany = mockPrisma.notification.findMany;
    mockPrisma.notification.findMany = async (args) => {
      if (args.where?.OR) {
        const err = new Error("Unknown argument `path` on JsonFilter");
        err.code = "P2009";
        throw err;
      }
      return origFindMany(args);
    };

    const res = await hasEventReminderBeenSent(mockPrisma, recipientId, "rem-13", null, null);
    assert.equal(res, true, "Fallback query must execute when error explicitly references path on JsonFilter");
  });

  await t.test("[MOCKED] F-08.14: Generic P2009 does not automatically authorize fallback", async () => {
    const { mockPrisma } = createMockPrismaStore();
    mockPrisma.notification.findMany = async () => {
      const err = new Error("Failed to validate query: syntax error in selection");
      err.code = "P2009";
      throw err;
    };

    await assert.rejects(
      async () => {
        await hasEventReminderBeenSent(mockPrisma, "u-14", "rem-14", null, null);
      },
      (err) => err.code === "P2009",
      "Generic P2009 error must propagate and NOT authorize fallback"
    );
  });

  await t.test("[MOCKED] F-08.15: Generic P2019 does not automatically authorize fallback", async () => {
    const { mockPrisma } = createMockPrismaStore();
    mockPrisma.notification.findMany = async () => {
      const err = new Error("Input error: expected integer got string");
      err.code = "P2019";
      throw err;
    };

    await assert.rejects(
      async () => {
        await hasEventReminderBeenSent(mockPrisma, "u-15", "rem-15", null, null);
      },
      (err) => err.code === "P2019",
      "Generic P2019 error must propagate and NOT authorize fallback"
    );
  });

  await t.test("[MOCKED] F-08.16: Generic validation errors propagate", async () => {
    const { mockPrisma } = createMockPrismaStore();
    mockPrisma.notification.findMany = async () => {
      const err = new Error("Validation failed for field recipientUserId");
      err.name = "ValidationError";
      throw err;
    };

    await assert.rejects(
      async () => {
        await hasEventReminderBeenSent(mockPrisma, "u-16", "rem-16", null, null);
      },
      (err) => err.name === "ValidationError",
      "Generic ValidationError must propagate"
    );
  });

  await t.test("[MOCKED] F-08.17: Connection errors propagate", async () => {
    const { mockPrisma } = createMockPrismaStore();
    mockPrisma.notification.findMany = async () => {
      const err = new Error("read ECONNRESET");
      err.code = "ECONNRESET";
      throw err;
    };

    await assert.rejects(
      async () => {
        await hasEventReminderBeenSent(mockPrisma, "u-17", "rem-17", null, null);
      },
      (err) => err.code === "ECONNRESET",
      "ECONNRESET must propagate"
    );
  });

  await t.test("[MOCKED] F-08.18: Timeout errors propagate", async () => {
    const { mockPrisma } = createMockPrismaStore();
    mockPrisma.notification.findMany = async () => {
      const err = new Error("Statement timeout expired after 10000ms");
      err.code = "ETIMEDOUT";
      throw err;
    };

    await assert.rejects(
      async () => {
        await hasEventReminderBeenSent(mockPrisma, "u-18", "rem-18", null, null);
      },
      (err) => err.code === "ETIMEDOUT",
      "ETIMEDOUT must propagate"
    );
  });

  await t.test("[MOCKED] F-08.19: Deadlock and serialization errors propagate", async () => {
    const { mockPrisma } = createMockPrismaStore();
    mockPrisma.notification.findMany = async () => {
      const err = new Error("deadlock detected");
      err.code = "40P01";
      throw err;
    };

    await assert.rejects(
      async () => {
        await hasEventReminderBeenSent(mockPrisma, "u-19", "rem-19", null, null);
      },
      (err) => err.code === "40P01",
      "Deadlock error 40P01 must propagate"
    );
  });

  await t.test("[MOCKED] F-08.20: Fallback query failure propagates", async () => {
    const { mockPrisma } = createMockPrismaStore();
    let calls = 0;
    mockPrisma.notification.findMany = async () => {
      calls++;
      if (calls === 1) {
        const err = new Error("Unknown argument `path` on JsonFilter");
        err.code = "ERR_UNSUPPORTED_JSON_QUERY";
        throw err;
      }
      const fallbackErr = new Error("Connection lost during fallback query");
      fallbackErr.code = "ECONNRESET";
      throw fallbackErr;
    };

    await assert.rejects(
      async () => {
        await hasEventReminderBeenSent(mockPrisma, "u-20", "rem-20", null, null);
      },
      (err) => err.message === "Connection lost during fallback query",
      "Failure during fallback query must propagate"
    );
  });

  await t.test("[MOCKED] F-08.21: Missing client or uncertain deduplication prevents sendNotification()", async () => {
    const { store, mockPrisma } = createMockPrismaStore();
    const user = { id: "u-21", firstName: "Uncertain", lastName: "User", email: "u21@dreamsky.internal", role: "COUNSELOR" };
    store.users.set(user.id, user);
    const event = { id: "ev-21", title: "Event 21", datetime: new Date("2026-11-10T10:00:00Z"), audienceRoles: ["COUNSELOR"] };
    store.events.set(event.id, event);
    const reminder = { id: "rem-21", eventId: event.id, offset: "24H", scheduledFor: new Date("2026-11-04T09:00:00Z"), status: "PENDING" };
    store.eventReminders.set(reminder.id, reminder);

    let sendNotificationCalled = false;
    mockPrisma.notification.create = async () => {
      sendNotificationCalled = true;
      throw new Error("Should not be called");
    };

    // Missing prismaClient.notification model
    const brokenPrisma = { ...mockPrisma, notification: null };
    const summary = await processDueEventReminders({
      now: new Date("2026-11-04T10:00:00Z"),
      prismaClient: brokenPrisma,
    });

    assert.equal(sendNotificationCalled, false, "sendNotification must NEVER be called when deduplication fails closed");
    assert.equal(summary.sent, 0);
    assert.equal(summary.failed, 1);
  });

  await t.test("[MOCKED] F-08.22: Uncertain deduplication never marks the reminder SENT", async () => {
    const { store, mockPrisma } = createMockPrismaStore();
    const user = { id: "u-22", firstName: "Safe", lastName: "User", email: "u22@dreamsky.internal", role: "COUNSELOR" };
    store.users.set(user.id, user);
    const event = { id: "ev-22", title: "Event 22", datetime: new Date("2026-11-10T10:00:00Z"), audienceRoles: ["COUNSELOR"] };
    store.events.set(event.id, event);
    const reminder = { id: "rem-22", eventId: event.id, offset: "24H", scheduledFor: new Date("2026-11-04T09:00:00Z"), status: "PENDING" };
    store.eventReminders.set(reminder.id, reminder);

    mockPrisma.notification.findMany = async () => {
      const err = new Error("Connection reset");
      err.code = "ECONNRESET";
      throw err;
    };

    await processDueEventReminders({
      now: new Date("2026-11-04T10:00:00Z"),
      prismaClient: mockPrisma,
    });

    const updated = store.eventReminders.get(reminder.id);
    assert.notEqual(updated.status, "SENT", "Reminder MUST NOT be marked SENT when deduplication query fails");
    assert.equal(updated.status, "PENDING", "Transient error keeps status PENDING");
  });

  await t.test("[MOCKED] F-08.23: Successful deduplication preserves existing notification delivery behavior", async () => {
    const { store, mockPrisma } = createMockPrismaStore();
    const user = { id: "u-23", firstName: "Success", lastName: "User", email: "u23@dreamsky.internal", role: "COUNSELOR" };
    store.users.set(user.id, user);
    const event = { id: "ev-23", title: "Event 23", datetime: new Date("2026-11-10T10:00:00Z"), audienceRoles: ["COUNSELOR"] };
    store.events.set(event.id, event);
    const reminder = { id: "rem-23", eventId: event.id, offset: "24H", scheduledFor: new Date("2026-11-04T09:00:00Z"), status: "PENDING" };
    store.eventReminders.set(reminder.id, reminder);

    const summary = await processDueEventReminders({
      now: new Date("2026-11-04T10:00:00Z"),
      prismaClient: mockPrisma,
    });

    assert.equal(summary.sent, 1, "Notification must be sent when deduplication check cleanly returns false");
    assert.equal(summary.failed, 0);
    assert.equal(store.eventReminders.get(reminder.id).status, "SENT", "Reminder must be marked SENT upon successful dispatch");
  });
});
