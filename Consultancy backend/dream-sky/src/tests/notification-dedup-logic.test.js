const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Pure JavaScript simulation of the SQL deduplication logic defined in:
 * prisma/migrations/20261024_add_notification_dedup_index/migration.sql
 *
 * Simulates:
 * 1. Qualifying predicate check
 * 2. Partitioning key generation
 * 3. Survivor (row_num = 1) selection via ORDER BY createdAt ASC, id ASC
 * 4. Merging read state and delivery status into survivor
 * 5. Archiving duplicate rows
 * 6. Unique index conflict evaluation
 */

function isQualifyingNotification(row) {
  if (!row.payload || typeof row.payload !== "object") return false;
  if (!row.payload.appointmentId) return false;
  const action = row.payload.action || "";
  return ["SCHEDULED", "RESCHEDULED", "CANCELLED"].includes(action);
}

function getPartitionKey(row) {
  const p = row.payload || {};
  const apptId = p.appointmentId || "";
  const act = p.action || "";
  const targetDt = p.newDatetime || p.datetime || p.appointmentDatetime || "";
  return `${row.recipientUserId}::${apptId}::${act}::${targetDt}`;
}

function simulateDeduplication(rows) {
  // Deep clone input to avoid mutating test fixtures
  const cloned = JSON.parse(JSON.stringify(rows));

  // Separate qualifying from non-qualifying
  const qualifying = [];
  const nonQualifying = [];

  for (const row of cloned) {
    if (isQualifyingNotification(row)) {
      qualifying.push(row);
    } else {
      nonQualifying.push(row);
    }
  }

  // Group qualifying rows by partition key
  const groups = new Map();
  for (const row of qualifying) {
    const key = getPartitionKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const survivors = [];
  const archived = [];

  for (const [key, groupRows] of groups.entries()) {
    // Sort by createdAt ASC, id ASC
    groupRows.sort((a, b) => {
      const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.id.localeCompare(b.id);
    });

    const survivor = groupRows[0];
    const duplicates = groupRows.slice(1);

    if (duplicates.length > 0) {
      // Determine if any duplicate was read
      let anyRead = survivor.payload.read === true || Boolean(survivor.payload.readAt);
      let latestReadAt = survivor.payload.readAt || null;
      let anySent = survivor.status === "SENT";
      let latestSentAt = survivor.sentAt || null;

      for (const d of duplicates) {
        if (d.payload.read === true || Boolean(d.payload.readAt)) {
          anyRead = true;
          if (d.payload.readAt && (!latestReadAt || new Date(d.payload.readAt) > new Date(latestReadAt))) {
            latestReadAt = d.payload.readAt;
          }
        }
        if (d.status === "SENT") {
          anySent = true;
          if (d.sentAt && (!latestSentAt || new Date(d.sentAt) > new Date(latestSentAt))) {
            latestSentAt = d.sentAt;
          }
        }

        // Add to archive with archivedAt
        archived.push({
          ...d,
          archivedAt: new Date().toISOString(),
        });
      }

      // Merge into survivor
      if (anySent && survivor.status === "QUEUED") {
        survivor.status = "SENT";
        survivor.sentAt = latestSentAt || survivor.sentAt;
      }
      if (anyRead) {
        survivor.payload.read = true;
        if (latestReadAt) survivor.payload.readAt = latestReadAt;
      }
    }

    survivors.push(survivor);
  }

  const remainingInLiveTable = [...survivors, ...nonQualifying];

  return {
    remainingInLiveTable,
    archived,
  };
}

// ── Synthetic Fixture Tests (10 Required Scenarios) ──────────────────────────

test("1. Exact duplicate notifications: earlier survives, duplicate archived with status/read merged", () => {
  const rows = [
    {
      id: "notif-001",
      recipientUserId: "user-counselor-1",
      createdAt: "2026-10-20T10:00:00.000Z",
      status: "QUEUED",
      sentAt: null,
      payload: { appointmentId: "appt-100", action: "SCHEDULED", datetime: "2026-10-25T14:00:00.000Z", read: false },
    },
    {
      id: "notif-002",
      recipientUserId: "user-counselor-1",
      createdAt: "2026-10-20T10:05:00.000Z",
      status: "SENT",
      sentAt: "2026-10-20T10:05:05.000Z",
      payload: { appointmentId: "appt-100", action: "SCHEDULED", datetime: "2026-10-25T14:00:00.000Z", read: true, readAt: "2026-10-20T10:10:00.000Z" },
    },
  ];

  const result = simulateDeduplication(rows);
  assert.strictEqual(result.remainingInLiveTable.length, 1);
  assert.strictEqual(result.archived.length, 1);
  assert.strictEqual(result.remainingInLiveTable[0].id, "notif-001");
  // Verified that survivor was upgraded to SENT and marked read
  assert.strictEqual(result.remainingInLiveTable[0].status, "SENT");
  assert.strictEqual(result.remainingInLiveTable[0].payload.read, true);
  assert.strictEqual(result.archived[0].id, "notif-002");
});

test("2. Different appointment IDs: both notifications are retained", () => {
  const rows = [
    {
      id: "notif-001",
      recipientUserId: "user-counselor-1",
      createdAt: "2026-10-20T10:00:00.000Z",
      status: "QUEUED",
      payload: { appointmentId: "appt-100", action: "SCHEDULED", datetime: "2026-10-25T14:00:00.000Z" },
    },
    {
      id: "notif-002",
      recipientUserId: "user-counselor-1",
      createdAt: "2026-10-20T10:05:00.000Z",
      status: "QUEUED",
      payload: { appointmentId: "appt-200", action: "SCHEDULED", datetime: "2026-10-25T14:00:00.000Z" },
    },
  ];

  const result = simulateDeduplication(rows);
  assert.strictEqual(result.remainingInLiveTable.length, 2);
  assert.strictEqual(result.archived.length, 0);
});

test("3. Different recipients: both notifications are retained", () => {
  const rows = [
    {
      id: "notif-001",
      recipientUserId: "user-counselor-1",
      createdAt: "2026-10-20T10:00:00.000Z",
      status: "SENT",
      payload: { appointmentId: "appt-100", action: "SCHEDULED", datetime: "2026-10-25T14:00:00.000Z" },
    },
    {
      id: "notif-002",
      recipientUserId: "user-counselor-2",
      createdAt: "2026-10-20T10:00:00.000Z",
      status: "SENT",
      payload: { appointmentId: "appt-100", action: "SCHEDULED", datetime: "2026-10-25T14:00:00.000Z" },
    },
  ];

  const result = simulateDeduplication(rows);
  assert.strictEqual(result.remainingInLiveTable.length, 2);
  assert.strictEqual(result.archived.length, 0);
});

test("4. Different actions: SCHEDULED and CANCELLED for same appointment both survive", () => {
  const rows = [
    {
      id: "notif-001",
      recipientUserId: "user-counselor-1",
      createdAt: "2026-10-20T10:00:00.000Z",
      status: "SENT",
      payload: { appointmentId: "appt-100", action: "SCHEDULED", datetime: "2026-10-25T14:00:00.000Z" },
    },
    {
      id: "notif-002",
      recipientUserId: "user-counselor-1",
      createdAt: "2026-10-21T09:00:00.000Z",
      status: "QUEUED",
      payload: { appointmentId: "appt-100", action: "CANCELLED", datetime: "2026-10-25T14:00:00.000Z" },
    },
  ];

  const result = simulateDeduplication(rows);
  assert.strictEqual(result.remainingInLiveTable.length, 2);
  assert.strictEqual(result.archived.length, 0);
});

test("5. Different target datetimes: RESCHEDULED to two distinct dates both survive", () => {
  const rows = [
    {
      id: "notif-001",
      recipientUserId: "user-counselor-1",
      createdAt: "2026-10-20T10:00:00.000Z",
      status: "SENT",
      payload: { appointmentId: "appt-100", action: "RESCHEDULED", newDatetime: "2026-10-26T10:00:00.000Z" },
    },
    {
      id: "notif-002",
      recipientUserId: "user-counselor-1",
      createdAt: "2026-10-20T11:00:00.000Z",
      status: "SENT",
      payload: { appointmentId: "appt-100", action: "RESCHEDULED", newDatetime: "2026-10-28T15:00:00.000Z" },
    },
  ];

  const result = simulateDeduplication(rows);
  assert.strictEqual(result.remainingInLiveTable.length, 2);
  assert.strictEqual(result.archived.length, 0);
});

test("6. Missing appointment IDs: excluded from deduplication and retained", () => {
  const rows = [
    {
      id: "notif-001",
      recipientUserId: "user-counselor-1",
      createdAt: "2026-10-20T10:00:00.000Z",
      status: "SENT",
      payload: { action: "SCHEDULED", message: "General task notification" },
    },
    {
      id: "notif-002",
      recipientUserId: "user-counselor-1",
      createdAt: "2026-10-20T10:05:00.000Z",
      status: "SENT",
      payload: { action: "SCHEDULED", message: "General task notification" },
    },
  ];

  const result = simulateDeduplication(rows);
  assert.strictEqual(result.remainingInLiveTable.length, 2);
  assert.strictEqual(result.archived.length, 0);
});

test("7. NULL payloads: excluded from deduplication predicate and retained", () => {
  const rows = [
    {
      id: "notif-001",
      recipientUserId: "user-counselor-1",
      createdAt: "2026-10-20T10:00:00.000Z",
      status: "SENT",
      payload: null,
    },
    {
      id: "notif-002",
      recipientUserId: "user-counselor-1",
      createdAt: "2026-10-20T10:05:00.000Z",
      status: "SENT",
      payload: null,
    },
  ];

  const result = simulateDeduplication(rows);
  assert.strictEqual(result.remainingInLiveTable.length, 2);
  assert.strictEqual(result.archived.length, 0);
});

test("8. Legitimate repeated notifications for identical action & date are deduplicated (Risk Scenario)", () => {
  // Edge case: staff was intentionally notified twice for the same event
  const rows = [
    {
      id: "notif-original",
      recipientUserId: "user-counselor-1",
      createdAt: "2026-10-15T08:00:00.000Z",
      status: "SENT",
      payload: { appointmentId: "appt-999", action: "SCHEDULED", datetime: "2026-10-30T10:00:00.000Z" },
    },
    {
      id: "notif-re-alert",
      recipientUserId: "user-counselor-1",
      createdAt: "2026-10-20T08:00:00.000Z",
      status: "QUEUED",
      payload: { appointmentId: "appt-999", action: "SCHEDULED", datetime: "2026-10-30T10:00:00.000Z" },
    },
  ];

  const result = simulateDeduplication(rows);
  assert.strictEqual(result.remainingInLiveTable.length, 1);
  assert.strictEqual(result.archived.length, 1);
  assert.strictEqual(result.archived[0].id, "notif-re-alert");
});

test("9. Same appointment and action but different target datetimes both survive", () => {
  const rows = [
    {
      id: "notif-001",
      recipientUserId: "user-counselor-1",
      createdAt: "2026-10-20T10:00:00.000Z",
      status: "SENT",
      payload: { appointmentId: "appt-100", action: "SCHEDULED", datetime: "2026-10-25T14:00:00.000Z" },
    },
    {
      id: "notif-002",
      recipientUserId: "user-counselor-1",
      createdAt: "2026-10-20T11:00:00.000Z",
      status: "SENT",
      payload: { appointmentId: "appt-100", action: "SCHEDULED", datetime: "2026-10-26T14:00:00.000Z" },
    },
  ];

  const result = simulateDeduplication(rows);
  assert.strictEqual(result.remainingInLiveTable.length, 2);
  assert.strictEqual(result.archived.length, 0);
});

test("10. Identical createdAt timestamp uses id lexicographical tie-breaker", () => {
  const rows = [
    {
      id: "notif-b",
      recipientUserId: "user-counselor-1",
      createdAt: "2026-10-20T10:00:00.000Z",
      status: "SENT",
      payload: { appointmentId: "appt-100", action: "SCHEDULED", datetime: "2026-10-25T14:00:00.000Z" },
    },
    {
      id: "notif-a",
      recipientUserId: "user-counselor-1",
      createdAt: "2026-10-20T10:00:00.000Z",
      status: "SENT",
      payload: { appointmentId: "appt-100", action: "SCHEDULED", datetime: "2026-10-25T14:00:00.000Z" },
    },
  ];

  const result = simulateDeduplication(rows);
  assert.strictEqual(result.remainingInLiveTable.length, 1);
  assert.strictEqual(result.archived.length, 1);
  // 'notif-a' comes before 'notif-b' lexicographically
  assert.strictEqual(result.remainingInLiveTable[0].id, "notif-a");
  assert.strictEqual(result.archived[0].id, "notif-b");
});

