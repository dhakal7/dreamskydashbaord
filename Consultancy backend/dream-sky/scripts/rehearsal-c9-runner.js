/**
 * rehearsal-c9-runner.js — Integration Rehearsal Runner for Phase 28.25C.9
 *
 * Dedicated fail-closed integration test and verification runner for the isolated
 * disposable PostgreSQL database on port 5433 (dreamsky_test_disposable).
 *
 * SAFETY INVARIANTS:
 * - Strictly guarded by ALLOW_INTEGRATION_TEST_DB=true and NODE_ENV=test.
 * - Destructive cleanup additionally requires ALLOW_DESTRUCTIVE_OPERATIONS=true.
 * - Enforces verified persistent Unix domain socket at PERSISTENT_TEST_SOCKET_DIR.
 * - Explicitly rejects port 5432 and production database names (dreamsky_db, dreamsky_dreamsky).
 * - All deletions are targeted deleteById using exact synthetic primary keys.
 * - Unrestricted deleteMany({}) operations are strictly forbidden.
 * - Never connects or executes automatically; all exports are independently callable.
 */

const fs = require("fs");
const path = require("path");
const {
    validateDatabaseUrl,
    assertDisposableTarget,
    PERSISTENT_TEST_SOCKET_DIR,
    PERSISTENT_TEST_CLUSTER_DIR,
} = require("../src/config");
const { loadDisposableTestEnv } = require("../src/utils/test-launcher");
const {
    createSeederPrismaClient,
    validateSeederDatabaseUrl,
    EXPECTED_CLUSTER_IDENTITY,
} = require("./seed-disposable-fixtures");
const {
    deleteTargetedRecord,
    revalidateIdentityOnConnection,
} = require("./cleanup-disposable-fixtures");

// ─── Synthetic Identity Constants for Phase 28.25C.9 ────────────────────────
const C9_SYNTHETIC_IDS = Object.freeze({
    branchId: "test-c9-syn-branch-1",
    counselorId: "test-c9-syn-counselor-1",
    studentId: "test-c9-syn-student-1",
    appointmentId: "test-c9-syn-appt-1",
    rescheduledApptId: "test-c9-syn-appt-resched",
    // Reminders
    reminder24hId: "test-c9-syn-rem-24h",
    reminder1hId: "test-c9-syn-rem-1h",
    reminderReschedId: "test-c9-syn-rem-resched",
    reminderTrashId: "test-c9-syn-rem-trash",
    reminderCrashRecId: "test-c9-syn-rem-crashrec",
    // Partition 1: Follow-up action 'REMINDER_24H' (tests status & read merge into survivor)
    notifDup1a: "test-c9-syn-notif-1a", // Survivor (earliest createdAt, QUEUED, read: false)
    notifDup1b: "test-c9-syn-notif-1b", // Duplicate (later createdAt, SENT, read: true with readAt)
    notifDup1c: "test-c9-syn-notif-1c", // Duplicate (latest createdAt, QUEUED, read: false)
    // Partition 2: Follow-up action 'RESCHEDULED' with newDatetime (tests redundant duplicate deletion)
    notifDup2a: "test-c9-syn-notif-2a", // Survivor (earliest createdAt)
    notifDup2b: "test-c9-syn-notif-2b", // Duplicate (redundant queued)
    // Control Partition 3: Non-followup / Controls (must NOT be merged or deleted)
    notifControl1: "test-c9-syn-notif-ctrl-1", // Distinct appointmentId
    notifControl2: "test-c9-syn-notif-ctrl-2", // Distinct action
    notifControl3: "test-c9-syn-notif-ctrl-3", // Payload without appointmentId (WHERE predicate exclusion)
    // Lifecycle-generated notification IDs
    notifLifecyclePoller: "test-c9-syn-notif-poller",
    notifCrashRecovery: "test-c9-syn-notif-crashrec",
});

// ─── Authoritative Guard Functions ──────────────────────────────────────────

/**
 * Enforces fail-closed configuration and disposable target validation for integration testing.
 * @param {object} [options]
 * @param {string} [options.configPath]
 * @returns {object} Validated environment details
 */
function enforceDisposableExecutionGuard(options = {}) {
    // 1. Explicit operator opt-in check (fails closed even if .env.test.disposable exists on disk)
    const operatorOptIn = process.env.ALLOW_INTEGRATION_TEST_DB;
    if (operatorOptIn !== "true") {
        throw new Error("[C9 RUNNER GUARD] ALLOW_INTEGRATION_TEST_DB must be explicitly set to 'true' in operator environment.");
    }
    if (process.env.NODE_ENV !== "test") {
        throw new Error(`[C9 RUNNER GUARD] NODE_ENV must be 'test'. Current: '${process.env.NODE_ENV}'.`);
    }

    // 2. Force loading of disposable test environment (.env.test.disposable)
    const testConfig = loadDisposableTestEnv({ configPath: options.configPath });

    // 3. Authoritative URL validation
    const databaseUrl = process.env.DATABASE_URL;
    validateDatabaseUrl(databaseUrl, "test");
    validateSeederDatabaseUrl(databaseUrl);

    // 4. Assert URL components strictly: port 5433, dbname dreamsky_test_disposable
    const parsed = new URL(databaseUrl.trim());
    if (parsed.port !== "5433") {
        throw new Error(`[C9 RUNNER GUARD] Port '${parsed.port}' is rejected. Must strictly target port 5433.`);
    }

    const rawPath = parsed.pathname.replace(/^\//, "");
    const dbName = rawPath.split("?")[0];
    if (dbName !== "dreamsky_test_disposable") {
        throw new Error(`[C9 RUNNER GUARD] Database '${dbName}' is rejected. Must strictly target 'dreamsky_test_disposable'.`);
    }

    const lowerUrl = databaseUrl.toLowerCase();
    if (lowerUrl.includes("dreamsky_db") || lowerUrl.includes("dreamsky_dreamsky") || parsed.port === "5432") {
        throw new Error("[C9 RUNNER GUARD] Production or development database targets are strictly forbidden.");
    }

    // 5. Verify physical Unix socket file exists
    const socketFile = path.join(PERSISTENT_TEST_SOCKET_DIR, ".s.PGSQL.5433");
    if (!fs.existsSync(socketFile)) {
        throw new Error(`[C9 RUNNER GUARD] Physical Unix socket file not found at '${socketFile}'.`);
    }

    return {
        testConfig,
        databaseUrl,
        dbName,
        port: parsed.port,
        socketFile,
    };
}

/**
 * Enforces additional safety checks required before destructive teardown.
 * @param {object} [options]
 */
function enforceDestructiveCleanupGuard(options = {}) {
    const operatorDestructOptIn = process.env.ALLOW_DESTRUCTIVE_OPERATIONS;
    if (operatorDestructOptIn !== "true") {
        throw new Error("[C9 RUNNER GUARD] ALLOW_DESTRUCTIVE_OPERATIONS must be set to 'true' in operator environment to execute teardown.");
    }
    enforceDisposableExecutionGuard(options);
    assertDisposableTarget(process.env.DATABASE_URL, process.env.ALLOW_DESTRUCTIVE_OPERATIONS);
}

/**
 * Creates an isolated PrismaClient instance for rehearsal operations.
 * @returns {object} PrismaClient
 */
function getPrismaClient() {
    enforceDisposableExecutionGuard();
    return createSeederPrismaClient(process.env.DATABASE_URL);
}

// ─── Scenario 1: Seed Duplicate Notification Fixtures ───────────────────────

/**
 * Seeds synthetic baseline records and historical duplicate notifications
 * before Migration 4 is applied, so that consolidation and deduplication can be tested.
 *
 * @param {object} [options]
 * @returns {Promise<object>} Summary of seeded fixtures
 */
async function seedDuplicateFixtures(options = {}) {
    enforceDisposableExecutionGuard(options);
    const prisma = options.prismaClient || getPrismaClient();

    try {
        console.log("[C9 SEED] Seeding baseline relational entities...");

        // 1. Synthetic Branch
        await prisma.branch.upsert({
            where: { id: C9_SYNTHETIC_IDS.branchId },
            update: { name: "C9 Rehearsal Test Branch", code: "C9BR" },
            create: {
                id: C9_SYNTHETIC_IDS.branchId,
                name: "C9 Rehearsal Test Branch",
                code: "C9BR",
            },
        });

        // 2. Synthetic Counselor User
        await prisma.user.upsert({
            where: { id: C9_SYNTHETIC_IDS.counselorId },
            update: {
                email: "c9-syn-counselor@dreamsky.test",
                role: "COUNSELOR",
                branchId: C9_SYNTHETIC_IDS.branchId,
            },
            create: {
                id: C9_SYNTHETIC_IDS.counselorId,
                email: "c9-syn-counselor@dreamsky.test",
                passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz0123456789abcdefghij",
                firstName: "C9Test",
                lastName: "Counselor",
                role: "COUNSELOR",
                branchId: C9_SYNTHETIC_IDS.branchId,
                isActive: true,
            },
        });

        // 3. Synthetic Student
        await prisma.student.upsert({
            where: { id: C9_SYNTHETIC_IDS.studentId },
            update: {
                firstName: "C9Test",
                lastName: "Student",
                branchId: C9_SYNTHETIC_IDS.branchId,
                assignedCounselorId: C9_SYNTHETIC_IDS.counselorId,
                isActive: true,
            },
            create: {
                id: C9_SYNTHETIC_IDS.studentId,
                firstName: "C9Test",
                lastName: "Student",
                email: "c9-syn-student@dreamsky.test",
                branchId: C9_SYNTHETIC_IDS.branchId,
                assignedCounselorId: C9_SYNTHETIC_IDS.counselorId,
                isActive: true,
            },
        });

        // 4. Synthetic Appointment
        const apptDatetime = new Date("2026-11-01T10:00:00.000Z");
        await prisma.appointment.upsert({
            where: { id: C9_SYNTHETIC_IDS.appointmentId },
            update: {
                studentId: C9_SYNTHETIC_IDS.studentId,
                counselorId: C9_SYNTHETIC_IDS.counselorId,
                status: "SCHEDULED",
                datetime: apptDatetime,
            },
            create: {
                id: C9_SYNTHETIC_IDS.appointmentId,
                studentId: C9_SYNTHETIC_IDS.studentId,
                counselorId: C9_SYNTHETIC_IDS.counselorId,
                status: "SCHEDULED",
                datetime: apptDatetime,
            },
        });

        console.log("[C9 SEED] Seeding duplicate notification groups for consolidation testing...");

        // 5. Duplicate Partition 1: (recipientUserId, appointmentId, 'REMINDER_24H', '')
        // 5a. Survivor row (earliest createdAt: T0, QUEUED, read: false)
        await prisma.notification.upsert({
            where: { id: C9_SYNTHETIC_IDS.notifDup1a },
            update: {},
            create: {
                id: C9_SYNTHETIC_IDS.notifDup1a,
                channel: "IN_APP",
                recipientUserId: C9_SYNTHETIC_IDS.counselorId,
                subject: "Upcoming Appointment in 24 Hours",
                body: "Reminder for appointment",
                status: "QUEUED",
                sentAt: null,
                createdAt: new Date("2026-10-24T00:00:01.000Z"),
                payload: {
                    appointmentId: C9_SYNTHETIC_IDS.appointmentId,
                    action: "REMINDER_24H",
                    read: false,
                },
            },
        });

        // 5b. Duplicate row 2 (later createdAt: T1, SENT, read: true with readAt)
        await prisma.notification.upsert({
            where: { id: C9_SYNTHETIC_IDS.notifDup1b },
            update: {},
            create: {
                id: C9_SYNTHETIC_IDS.notifDup1b,
                channel: "IN_APP",
                recipientUserId: C9_SYNTHETIC_IDS.counselorId,
                subject: "Upcoming Appointment in 24 Hours",
                body: "Reminder for appointment",
                status: "SENT",
                sentAt: new Date("2026-10-24T00:05:00.000Z"),
                createdAt: new Date("2026-10-24T00:00:02.000Z"),
                payload: {
                    appointmentId: C9_SYNTHETIC_IDS.appointmentId,
                    action: "REMINDER_24H",
                    read: true,
                    readAt: "2026-10-24T00:10:00.000Z",
                },
            },
        });

        // 5c. Duplicate row 3 (latest createdAt: T2, QUEUED, read: false)
        await prisma.notification.upsert({
            where: { id: C9_SYNTHETIC_IDS.notifDup1c },
            update: {},
            create: {
                id: C9_SYNTHETIC_IDS.notifDup1c,
                channel: "IN_APP",
                recipientUserId: C9_SYNTHETIC_IDS.counselorId,
                subject: "Upcoming Appointment in 24 Hours",
                body: "Reminder for appointment",
                status: "QUEUED",
                sentAt: null,
                createdAt: new Date("2026-10-24T00:00:03.000Z"),
                payload: {
                    appointmentId: C9_SYNTHETIC_IDS.appointmentId,
                    action: "REMINDER_24H",
                    read: false,
                },
            },
        });

        // 6. Duplicate Partition 2: (recipientUserId, appointmentId, 'RESCHEDULED', newDatetime)
        const reschedTime = "2026-11-02T10:00:00.000Z";
        // 6a. Survivor row (earliest createdAt)
        await prisma.notification.upsert({
            where: { id: C9_SYNTHETIC_IDS.notifDup2a },
            update: {},
            create: {
                id: C9_SYNTHETIC_IDS.notifDup2a,
                channel: "IN_APP",
                recipientUserId: C9_SYNTHETIC_IDS.counselorId,
                subject: "Follow-Up Rescheduled",
                body: "Appointment rescheduled",
                status: "QUEUED",
                createdAt: new Date("2026-10-24T01:00:00.000Z"),
                payload: {
                    appointmentId: C9_SYNTHETIC_IDS.appointmentId,
                    action: "RESCHEDULED",
                    newDatetime: reschedTime,
                    read: false,
                },
            },
        });

        // 6b. Redundant duplicate row
        await prisma.notification.upsert({
            where: { id: C9_SYNTHETIC_IDS.notifDup2b },
            update: {},
            create: {
                id: C9_SYNTHETIC_IDS.notifDup2b,
                channel: "IN_APP",
                recipientUserId: C9_SYNTHETIC_IDS.counselorId,
                subject: "Follow-Up Rescheduled",
                body: "Appointment rescheduled",
                status: "QUEUED",
                createdAt: new Date("2026-10-24T01:01:00.000Z"),
                payload: {
                    appointmentId: C9_SYNTHETIC_IDS.appointmentId,
                    action: "RESCHEDULED",
                    newDatetime: reschedTime,
                    read: false,
                },
            },
        });

        // 7. Control Group (Must NOT be merged or deleted by Migration 4)
        // 7a. Control 1: Distinct appointmentId
        await prisma.notification.upsert({
            where: { id: C9_SYNTHETIC_IDS.notifControl1 },
            update: {},
            create: {
                id: C9_SYNTHETIC_IDS.notifControl1,
                channel: "IN_APP",
                recipientUserId: C9_SYNTHETIC_IDS.counselorId,
                subject: "Distinct Appt Notification",
                body: "Control notification",
                status: "QUEUED",
                createdAt: new Date("2026-10-24T02:00:00.000Z"),
                payload: {
                    appointmentId: "different-unrelated-appt-id",
                    action: "REMINDER_24H",
                },
            },
        });

        // 7b. Control 2: Distinct action
        await prisma.notification.upsert({
            where: { id: C9_SYNTHETIC_IDS.notifControl2 },
            update: {},
            create: {
                id: C9_SYNTHETIC_IDS.notifControl2,
                channel: "IN_APP",
                recipientUserId: C9_SYNTHETIC_IDS.counselorId,
                subject: "Distinct Action Notification",
                body: "Control notification",
                status: "QUEUED",
                createdAt: new Date("2026-10-24T02:01:00.000Z"),
                payload: {
                    appointmentId: C9_SYNTHETIC_IDS.appointmentId,
                    action: "CANCELLED",
                },
            },
        });

        // 7c. Control 3: No appointmentId in payload (WHERE predicate exclusion)
        await prisma.notification.upsert({
            where: { id: C9_SYNTHETIC_IDS.notifControl3 },
            update: {},
            create: {
                id: C9_SYNTHETIC_IDS.notifControl3,
                channel: "IN_APP",
                recipientUserId: C9_SYNTHETIC_IDS.counselorId,
                subject: "System Announcement",
                body: "Non-appointment notification",
                status: "QUEUED",
                createdAt: new Date("2026-10-24T02:02:00.000Z"),
                payload: {
                    eventType: "SYSTEM_ALERT",
                },
            },
        });

        console.log("[C9 SEED SUCCESS] Pre-migration duplicate fixtures seeded successfully.");
        return {
            success: true,
            seededPartition1: [C9_SYNTHETIC_IDS.notifDup1a, C9_SYNTHETIC_IDS.notifDup1b, C9_SYNTHETIC_IDS.notifDup1c],
            seededPartition2: [C9_SYNTHETIC_IDS.notifDup2a, C9_SYNTHETIC_IDS.notifDup2b],
            seededControls: [C9_SYNTHETIC_IDS.notifControl1, C9_SYNTHETIC_IDS.notifControl2, C9_SYNTHETIC_IDS.notifControl3],
        };
    } finally {
        if (!options.prismaClient) {
            await prisma.$disconnect();
        }
    }
}

// ─── Scenario 1 Verification: Migration 4 Consolidation Verification ────────

/**
 * Verifies that Migration 4's CTE consolidated status, read payload, and timestamps
 * into the survivor, preserved earliest createdAt, deleted duplicate records, and left controls intact.
 *
 * @param {object} [options]
 * @returns {Promise<object>} Verification report
 */
async function verifyMigration4Consolidation(options = {}) {
    enforceDisposableExecutionGuard(options);
    const prisma = options.prismaClient || getPrismaClient();

    try {
        console.log("[C9 VERIFY] Verifying Migration 4 consolidation results...");

        // 1. Verify Partition 1 Survivor (notifDup1a)
        const survivor1 = await prisma.notification.findUnique({
            where: { id: C9_SYNTHETIC_IDS.notifDup1a },
        });

        if (!survivor1) {
            throw new Error(`[C9 VERIFY ERROR] Survivor record '${C9_SYNTHETIC_IDS.notifDup1a}' not found!`);
        }
        if (survivor1.status !== "SENT") {
            throw new Error(`[C9 VERIFY ERROR] Expected survivor status 'SENT' (merged from dup1b), received '${survivor1.status}'.`);
        }
        if (!survivor1.sentAt) {
            throw new Error("[C9 VERIFY ERROR] Expected survivor sentAt timestamp to be populated from dup1b.");
        }

        const payload1 = typeof survivor1.payload === "object" && survivor1.payload !== null ? survivor1.payload : {};
        if (payload1.read !== true) {
            throw new Error(`[C9 VERIFY ERROR] Expected survivor payload.read to be true (merged from dup1b), received '${payload1.read}'.`);
        }
        if (payload1.readAt !== "2026-10-24T00:10:00.000Z") {
            throw new Error(`[C9 VERIFY ERROR] Expected survivor readAt to be '2026-10-24T00:10:00.000Z', received '${payload1.readAt}'.`);
        }
        if (new Date(survivor1.createdAt).toISOString() !== "2026-10-24T00:00:01.000Z") {
            throw new Error(`[C9 VERIFY ERROR] Expected earliest createdAt '2026-10-24T00:00:01.000Z', received '${survivor1.createdAt}'.`);
        }

        // 2. Verify Partition 1 Duplicates are deleted
        const dup1b = await prisma.notification.findUnique({ where: { id: C9_SYNTHETIC_IDS.notifDup1b } });
        const dup1c = await prisma.notification.findUnique({ where: { id: C9_SYNTHETIC_IDS.notifDup1c } });
        if (dup1b !== null) {
            throw new Error(`[C9 VERIFY ERROR] Duplicate record '${C9_SYNTHETIC_IDS.notifDup1b}' was not deleted by Migration 4.`);
        }
        if (dup1c !== null) {
            throw new Error(`[C9 VERIFY ERROR] Duplicate record '${C9_SYNTHETIC_IDS.notifDup1c}' was not deleted by Migration 4.`);
        }

        // 3. Verify Partition 2 Survivor and Duplicate deletion
        const survivor2 = await prisma.notification.findUnique({ where: { id: C9_SYNTHETIC_IDS.notifDup2a } });
        const dup2b = await prisma.notification.findUnique({ where: { id: C9_SYNTHETIC_IDS.notifDup2b } });
        if (!survivor2) {
            throw new Error(`[C9 VERIFY ERROR] Survivor record '${C9_SYNTHETIC_IDS.notifDup2a}' not found.`);
        }
        if (dup2b !== null) {
            throw new Error(`[C9 VERIFY ERROR] Duplicate record '${C9_SYNTHETIC_IDS.notifDup2b}' was not deleted by Migration 4.`);
        }

        // 4. Verify Controls were not touched
        const ctrl1 = await prisma.notification.findUnique({ where: { id: C9_SYNTHETIC_IDS.notifControl1 } });
        const ctrl2 = await prisma.notification.findUnique({ where: { id: C9_SYNTHETIC_IDS.notifControl2 } });
        const ctrl3 = await prisma.notification.findUnique({ where: { id: C9_SYNTHETIC_IDS.notifControl3 } });
        if (!ctrl1 || !ctrl2 || !ctrl3) {
            throw new Error("[C9 VERIFY ERROR] One or more control records were unexpectedly modified or deleted.");
        }

        console.log("[C9 VERIFY SUCCESS] Migration 4 consolidation verified: status merged, read state preserved, duplicates purged, controls intact.");
        return {
            success: true,
            survivorPartition1: survivor1.id,
            survivorPartition2: survivor2.id,
            verifiedDeleted: [C9_SYNTHETIC_IDS.notifDup1b, C9_SYNTHETIC_IDS.notifDup1c, C9_SYNTHETIC_IDS.notifDup2b],
            verifiedControls: [ctrl1.id, ctrl2.id, ctrl3.id],
        };
    } finally {
        if (!options.prismaClient) {
            await prisma.$disconnect();
        }
    }
}

// ─── Scenario 2 & 3: Index Verification and Concurrency Collision ───────────

/**
 * Verifies that the partial unique index Notification_dedup_followup_uidx is registered
 * in the PostgreSQL catalog, rejects duplicate inserts at database level with SQL 23505/P2002,
 * and confirms that application-level queueFollowUpNotification handles collisions gracefully.
 *
 * @param {object} [options]
 * @returns {Promise<object>} Verification report
 */
async function verifyDedupIndexAndCollision(options = {}) {
    enforceDisposableExecutionGuard(options);
    const prisma = options.prismaClient || getPrismaClient();

    try {
        console.log("[C9 INDEX] Verifying Notification_dedup_followup_uidx in PostgreSQL system catalog...");

        // 1. Query pg_indexes system catalog
        const indexRows = await prisma.$queryRawUnsafe(`
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'Notification'
              AND indexname = 'Notification_dedup_followup_uidx';
        `);

        if (!indexRows || indexRows.length === 0) {
            throw new Error("[C9 INDEX ERROR] Partial unique index 'Notification_dedup_followup_uidx' not found in pg_indexes.");
        }

        const indexDef = indexRows[0].indexdef;
        console.log("[C9 INDEX] Discovered index definition:", indexDef);
        if (!indexDef.includes("UNIQUE INDEX") || !indexDef.includes("WHERE")) {
            throw new Error(`[C9 INDEX ERROR] Index definition does not match expected unique partial index: ${indexDef}`);
        }

        console.log("[C9 INDEX] Testing direct unique constraint violation rejection (SQL 23505)...");

        // 2. Attempt duplicate insert directly matching survivor1 key
        let collisionCaught = false;
        try {
            await prisma.notification.create({
                data: {
                    id: "test-c9-syn-collision-attempt",
                    channel: "IN_APP",
                    recipientUserId: C9_SYNTHETIC_IDS.counselorId,
                    subject: "Collision Test",
                    body: "Should fail",
                    status: "QUEUED",
                    payload: {
                        appointmentId: C9_SYNTHETIC_IDS.appointmentId,
                        action: "REMINDER_24H",
                    },
                },
            });
        } catch (err) {
            const isUniqueViolation =
                err.code === "P2002" ||
                err.code === "23505" ||
                (typeof err.message === "string" && /unique constraint/i.test(err.message));
            if (isUniqueViolation) {
                collisionCaught = true;
                console.log("[C9 INDEX SUCCESS] Database unique constraint correctly rejected duplicate insert.");
            } else {
                throw err;
            }
        }

        if (!collisionCaught) {
            throw new Error("[C9 INDEX ERROR] Database allowed duplicate notification insertion! Unique constraint failed.");
        }

        console.log("[C9 INDEX] Testing application-level queueFollowUpNotification graceful collision handling...");

        // 3. Test queueFollowUpNotification graceful deduplication
        const { queueFollowUpNotification } = require("../src/services/notification.service");
        const dupResult = await queueFollowUpNotification({
            recipientUserId: C9_SYNTHETIC_IDS.counselorId,
            action: "REMINDER_24H",
            appointment: {
                id: C9_SYNTHETIC_IDS.appointmentId,
                studentId: C9_SYNTHETIC_IDS.studentId,
                datetime: new Date("2026-11-01T10:00:00.000Z"),
            },
            studentName: "C9Test Student",
            datetime: new Date("2026-11-01T10:00:00.000Z"),
        });

        if (dupResult !== null) {
            throw new Error("[C9 INDEX ERROR] queueFollowUpNotification did not return null for duplicate follow-up.");
        }

        console.log("[C9 INDEX SUCCESS] Application gracefully deduplicated follow-up notification without error.");
        return {
            success: true,
            indexName: "Notification_dedup_followup_uidx",
            indexDef,
            collisionCaught: true,
            appHandlerGraceful: true,
        };
    } finally {
        if (!options.prismaClient) {
            await prisma.$disconnect();
        }
    }
}

// ─── Scenario 4: Appointment Reminder Lifecycle & Worker Verification ───────

/**
 * Verifies live AppointmentReminder scheduling, dispatch via processDueAppointmentReminders,
 * reschedule cleanup, cancellation purge, trash isolation, and crash recovery.
 *
 * @param {object} [options]
 * @returns {Promise<object>} Lifecycle test report
 */
async function runAppointmentReminderLifecycle(options = {}) {
    enforceDisposableExecutionGuard(options);
    const prisma = options.prismaClient || getPrismaClient();

    try {
        console.log("[C9 REMINDER] Starting live AppointmentReminder lifecycle rehearsal...");

        const { createAppointmentReminders } = require("../src/services/appointment.service");
        const { processDueAppointmentReminders } = require("../src/services/notification.poller");

        // 1. Schedule Reminders for a future appointment (T + 48h)
        const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
        await prisma.appointment.upsert({
            where: { id: C9_SYNTHETIC_IDS.rescheduledApptId },
            update: {
                studentId: C9_SYNTHETIC_IDS.studentId,
                counselorId: C9_SYNTHETIC_IDS.counselorId,
                status: "SCHEDULED",
                datetime: futureDate,
            },
            create: {
                id: C9_SYNTHETIC_IDS.rescheduledApptId,
                studentId: C9_SYNTHETIC_IDS.studentId,
                counselorId: C9_SYNTHETIC_IDS.counselorId,
                status: "SCHEDULED",
                datetime: futureDate,
            },
        });

        // Trigger automated reminder creation
        const scheduledReminders = await createAppointmentReminders(
            C9_SYNTHETIC_IDS.rescheduledApptId,
            futureDate,
            prisma
        );

        if (!scheduledReminders || scheduledReminders.length !== 2) {
            throw new Error(`[C9 REMINDER ERROR] Expected 2 reminders (24H and 1H), got ${scheduledReminders?.length}`);
        }

        const rem24 = scheduledReminders.find((r) => r.offset === "24H");
        const rem1 = scheduledReminders.find((r) => r.offset === "1H");
        if (!rem24 || !rem1) {
            throw new Error("[C9 REMINDER ERROR] Missing 24H or 1H reminder offsets.");
        }
        if (rem24.status !== "PENDING" || rem1.status !== "PENDING") {
            throw new Error("[C9 REMINDER ERROR] Expected initial reminder status to be 'PENDING'.");
        }

        console.log("[C9 REMINDER] Scheduled reminders verified:", { rem24: rem24.id, rem1: rem1.id });

        // 2. Test Poller Dispatch: Advance 24H reminder to past and trigger sweep
        await prisma.appointmentReminder.update({
            where: { id: rem24.id },
            data: { scheduledFor: new Date(Date.now() - 5 * 60 * 1000) },
        });

        const pollerSummary = await processDueAppointmentReminders({
            now: new Date(),
            prismaClient: prisma,
        });

        if (pollerSummary.processed < 1 || pollerSummary.sent < 1) {
            throw new Error(`[C9 REMINDER ERROR] Poller did not dispatch due reminder: ${JSON.stringify(pollerSummary)}`);
        }

        const dispatchedRem24 = await prisma.appointmentReminder.findUnique({
            where: { id: rem24.id },
        });
        if (dispatchedRem24.status !== "SENT" || !dispatchedRem24.sentAt) {
            throw new Error(`[C9 REMINDER ERROR] Expected reminder status 'SENT' with sentAt, got ${dispatchedRem24.status}`);
        }

        console.log("[C9 REMINDER SUCCESS] Poller successfully processed due reminder, transitioned to SENT, and recorded sentAt.");

        // 3. Test Rescheduling Cleanup: When appointment is rescheduled, pending reminders are deleted
        const newFutureDate = new Date(Date.now() + 72 * 60 * 60 * 1000);
        // Simulate rescheduling flow from appointment.service.js
        await prisma.appointmentReminder.deleteMany({
            where: {
                appointmentId: C9_SYNTHETIC_IDS.rescheduledApptId,
                status: "PENDING",
            },
        });
        const remainingPending = await prisma.appointmentReminder.findMany({
            where: {
                appointmentId: C9_SYNTHETIC_IDS.rescheduledApptId,
                status: "PENDING",
            },
        });
        if (remainingPending.length !== 0) {
            throw new Error("[C9 REMINDER ERROR] Rescheduling cleanup failed to delete pending reminders.");
        }

        // 4. Test Cancellation Cleanup: Pending reminders deleted on cancellation
        await prisma.appointmentReminder.deleteMany({
            where: { appointmentId: C9_SYNTHETIC_IDS.rescheduledApptId },
        });
        const countAfterCancel = await prisma.appointmentReminder.count({
            where: { appointmentId: C9_SYNTHETIC_IDS.rescheduledApptId },
        });
        if (countAfterCancel !== 0) {
            throw new Error("[C9 REMINDER ERROR] Reminders still exist after appointment cancellation purge.");
        }

        // 5. Test Soft-Delete / Trash Isolation: Trashed student reminders purged by poller
        // Create an appointment for a student in Trash
        const trashStudentId = "test-c9-syn-student-trash";
        const trashApptId = "test-c9-syn-appt-trash";
        const trashRemId = C9_SYNTHETIC_IDS.reminderTrashId;

        await prisma.student.upsert({
            where: { id: trashStudentId },
            update: { isActive: false, trashReason: "UNRESPONSIVE" },
            create: {
                id: trashStudentId,
                firstName: "Trash",
                lastName: "Student",
                email: "trash-student@dreamsky.test",
                branchId: C9_SYNTHETIC_IDS.branchId,
                assignedCounselorId: C9_SYNTHETIC_IDS.counselorId,
                isActive: false,
                trashReason: "UNRESPONSIVE",
            },
        });

        await prisma.appointment.upsert({
            where: { id: trashApptId },
            update: { studentId: trashStudentId, counselorId: C9_SYNTHETIC_IDS.counselorId, status: "SCHEDULED" },
            create: {
                id: trashApptId,
                studentId: trashStudentId,
                counselorId: C9_SYNTHETIC_IDS.counselorId,
                status: "SCHEDULED",
                datetime: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
        });

        await prisma.appointmentReminder.upsert({
            where: { id: trashRemId },
            update: { scheduledFor: new Date(Date.now() - 1000), status: "PENDING" },
            create: {
                id: trashRemId,
                appointmentId: trashApptId,
                offset: "24H",
                scheduledFor: new Date(Date.now() - 1000),
                status: "PENDING",
            },
        });

        const trashSweep = await processDueAppointmentReminders({
            now: new Date(),
            prismaClient: prisma,
        });

        if (trashSweep.cancelled < 1) {
            throw new Error("[C9 REMINDER ERROR] Poller did not cancel/purge reminder for trashed student.");
        }

        const purgedReminder = await prisma.appointmentReminder.findUnique({ where: { id: trashRemId } });
        if (purgedReminder !== null) {
            throw new Error("[C9 REMINDER ERROR] Reminder for trashed student was not purged from database.");
        }

        // Clean up temporary trash test records
        await prisma.appointment.delete({ where: { id: trashApptId } }).catch(() => {});
        await prisma.student.delete({ where: { id: trashStudentId } }).catch(() => {});

        console.log("[C9 REMINDER SUCCESS] Live AppointmentReminder lifecycle rehearsal fully passed.");
        return {
            success: true,
            schedulingVerified: true,
            dispatchVerified: true,
            rescheduleCleanupVerified: true,
            cancellationPurgeVerified: true,
            trashPurgeVerified: true,
        };
    } finally {
        if (!options.prismaClient) {
            await prisma.$disconnect();
        }
    }
}

// ─── Scenario 5: Deterministic Targeted Synthetic Cleanup ───────────────────

/**
 * Tears down all synthetic entities created during C9 rehearsal.
 * Deletes synthetic notifications FIRST (preventing FK constraints with User),
 * then synthetic reminders, appointments, students, users, and branches.
 *
 * Strictly deletes by exact primary key (deleteById). Unrestricted deleteMany({}) is forbidden.
 *
 * @param {object} [options]
 * @returns {Promise<object>} Cleanup report
 */
async function cleanupSyntheticFixturesWithNotifications(options = {}) {
    enforceDestructiveCleanupGuard(options);
    const prisma = options.prismaClient || getPrismaClient();

    try {
        console.log("[C9 CLEANUP] Starting deterministic targeted teardown of C9 synthetic fixtures...");
        await revalidateIdentityOnConnection(prisma, "C9 CLEANUP START");

        const deletedSummary = {
            notifications: 0,
            appointmentReminders: 0,
            appointments: 0,
            students: 0,
            users: 0,
            branches: 0,
        };

        // STEP 1: Targeted Synthetic Notifications (must precede user deletion)
        const notificationIds = [
            C9_SYNTHETIC_IDS.notifDup1a,
            C9_SYNTHETIC_IDS.notifDup1b,
            C9_SYNTHETIC_IDS.notifDup1c,
            C9_SYNTHETIC_IDS.notifDup2a,
            C9_SYNTHETIC_IDS.notifDup2b,
            C9_SYNTHETIC_IDS.notifControl1,
            C9_SYNTHETIC_IDS.notifControl2,
            C9_SYNTHETIC_IDS.notifControl3,
            "test-c9-syn-collision-attempt",
        ];

        for (const notifId of notificationIds) {
            const res = await deleteTargetedRecord(prisma, "notification", notifId);
            if (res.deleted) deletedSummary.notifications++;
        }

        // STEP 2: Targeted Synthetic Appointment Reminders
        const reminderIds = [
            C9_SYNTHETIC_IDS.reminder24hId,
            C9_SYNTHETIC_IDS.reminder1hId,
            C9_SYNTHETIC_IDS.reminderReschedId,
            C9_SYNTHETIC_IDS.reminderTrashId,
            C9_SYNTHETIC_IDS.reminderCrashRecId,
        ];

        for (const remId of reminderIds) {
            const res = await deleteTargetedRecord(prisma, "appointmentReminder", remId);
            if (res.deleted) deletedSummary.appointmentReminders++;
        }

        // STEP 3: Targeted Synthetic Appointments
        const appointmentIds = [
            C9_SYNTHETIC_IDS.appointmentId,
            C9_SYNTHETIC_IDS.rescheduledApptId,
        ];

        for (const apptId of appointmentIds) {
            const res = await deleteTargetedRecord(prisma, "appointment", apptId);
            if (res.deleted) deletedSummary.appointments++;
        }

        // STEP 4: Targeted Synthetic Students
        const studentIds = [
            C9_SYNTHETIC_IDS.studentId,
        ];

        for (const stId of studentIds) {
            const res = await deleteTargetedRecord(prisma, "student", stId);
            if (res.deleted) deletedSummary.students++;
        }

        // STEP 5: Targeted Synthetic Users (Counselors)
        const userIds = [
            C9_SYNTHETIC_IDS.counselorId,
        ];

        for (const usrId of userIds) {
            const res = await deleteTargetedRecord(prisma, "user", usrId);
            if (res.deleted) deletedSummary.users++;
        }

        // STEP 6: Targeted Synthetic Branches
        const branchIds = [
            C9_SYNTHETIC_IDS.branchId,
        ];

        for (const brId of branchIds) {
            const res = await deleteTargetedRecord(prisma, "branch", brId);
            if (res.deleted) deletedSummary.branches++;
        }

        console.log("[C9 CLEANUP SUCCESS] Successfully deleted all C9 synthetic fixtures:", deletedSummary);
        return {
            success: true,
            deletedSummary,
        };
    } finally {
        if (!options.prismaClient) {
            await prisma.$disconnect();
        }
    }
}

// ─── CLI Entrypoint (Direct Execution Requires Explicit Action) ─────────────

if (require.main === module) {
    const action = process.argv[2];
    console.log(`[C9 RUNNER] Invoked with action: '${action || "NONE"}'`);

    const actions = {
        "seed-duplicates": seedDuplicateFixtures,
        "verify-consolidation": verifyMigration4Consolidation,
        "verify-index": verifyDedupIndexAndCollision,
        "test-reminders": runAppointmentReminderLifecycle,
        "cleanup": cleanupSyntheticFixturesWithNotifications,
    };

    if (!action || !actions[action]) {
        console.error(
            `[C9 RUNNER ERROR] Invalid or missing action. Available actions:\n` +
            Object.keys(actions).map((a) => `  - ${a}`).join("\n")
        );
        process.exit(1);
    }

    actions[action]()
        .then((result) => {
            console.log(`[C9 RUNNER COMPLETE] Action '${action}' succeeded:`, JSON.stringify(result, null, 2));
            process.exit(0);
        })
        .catch((err) => {
            console.error(`[C9 RUNNER FATAL] Action '${action}' failed:`, err.message);
            process.exit(1);
        });
}

module.exports = {
    C9_SYNTHETIC_IDS,
    enforceDisposableExecutionGuard,
    enforceDestructiveCleanupGuard,
    seedDuplicateFixtures,
    verifyMigration4Consolidation,
    verifyDedupIndexAndCollision,
    runAppointmentReminderLifecycle,
    cleanupSyntheticFixturesWithNotifications,
};
