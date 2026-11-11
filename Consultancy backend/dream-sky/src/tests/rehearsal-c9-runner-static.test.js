/**
 * rehearsal-c9-runner-static.test.js — Static Validation of Phase 28.25C.9 Rehearsal Runner
 *
 * Verifies the exported API, synthetic ID inventory, and fail-closed safety guards
 * of scripts/rehearsal-c9-runner.js without connecting to any database.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

test("rehearsal-c9-runner static verification suite", async (t) => {
    // 1. Module Import & Zero-Side-Effect Verification
    await t.test("can be imported without initiating database connections or throwing", () => {
        const runner = require("../../scripts/rehearsal-c9-runner");
        assert.ok(runner, "Module should export an object");
        assert.equal(typeof runner.seedDuplicateFixtures, "function");
        assert.equal(typeof runner.verifyMigration4Consolidation, "function");
        assert.equal(typeof runner.verifyDedupIndexAndCollision, "function");
        assert.equal(typeof runner.runAppointmentReminderLifecycle, "function");
        assert.equal(typeof runner.cleanupSyntheticFixturesWithNotifications, "function");
        assert.equal(typeof runner.enforceDisposableExecutionGuard, "function");
        assert.equal(typeof runner.enforceDestructiveCleanupGuard, "function");
        assert.ok(runner.C9_SYNTHETIC_IDS, "C9_SYNTHETIC_IDS must be exported");
    });

    // 2. Synthetic Identity Structure Verification
    await t.test("C9_SYNTHETIC_IDS contains all required synthetic keys and is immutable", () => {
        const { C9_SYNTHETIC_IDS } = require("../../scripts/rehearsal-c9-runner");
        assert.ok(Object.isFrozen(C9_SYNTHETIC_IDS), "C9_SYNTHETIC_IDS must be Object.freeze'd");

        const requiredKeys = [
            "branchId",
            "counselorId",
            "studentId",
            "appointmentId",
            "rescheduledApptId",
            "reminder24hId",
            "reminder1hId",
            "notifDup1a",
            "notifDup1b",
            "notifDup1c",
            "notifDup2a",
            "notifDup2b",
            "notifControl1",
            "notifControl2",
            "notifControl3",
        ];

        for (const key of requiredKeys) {
            assert.ok(C9_SYNTHETIC_IDS[key], `C9_SYNTHETIC_IDS.${key} must be defined`);
            assert.ok(
                C9_SYNTHETIC_IDS[key].startsWith("test-c9-syn-"),
                `C9_SYNTHETIC_IDS.${key} must start with 'test-c9-syn-' prefix`
            );
        }
    });

    // 3. Execution Guard Fail-Closed Verification
    await t.test("enforceDisposableExecutionGuard fails closed when ALLOW_INTEGRATION_TEST_DB is missing", () => {
        const { enforceDisposableExecutionGuard } = require("../../scripts/rehearsal-c9-runner");
        const prevFlag = process.env.ALLOW_INTEGRATION_TEST_DB;
        const prevEnv = process.env.NODE_ENV;

        try {
            delete process.env.ALLOW_INTEGRATION_TEST_DB;
            process.env.NODE_ENV = "test";

            assert.throws(
                () => {
                    enforceDisposableExecutionGuard();
                },
                (err) => {
                    return (
                        err.message.includes("ALLOW_INTEGRATION_TEST_DB") ||
                        err.message.includes("TEST LAUNCHER ERROR") ||
                        err.message.includes("DATABASE CONFIG ERROR")
                    );
                }
            );
        } finally {
            if (prevFlag !== undefined) process.env.ALLOW_INTEGRATION_TEST_DB = prevFlag;
            else delete process.env.ALLOW_INTEGRATION_TEST_DB;
            process.env.NODE_ENV = prevEnv;
        }
    });

    // 4. Destructive Guard Fail-Closed Verification
    await t.test("enforceDestructiveCleanupGuard fails closed when ALLOW_DESTRUCTIVE_OPERATIONS is missing", () => {
        const { enforceDestructiveCleanupGuard } = require("../../scripts/rehearsal-c9-runner");
        const prevDestruct = process.env.ALLOW_DESTRUCTIVE_OPERATIONS;

        try {
            delete process.env.ALLOW_DESTRUCTIVE_OPERATIONS;

            assert.throws(
                () => {
                    enforceDestructiveCleanupGuard();
                },
                (err) => {
                    return (
                        err.message.includes("ALLOW_DESTRUCTIVE_OPERATIONS") ||
                        err.message.includes("DESTRUCTIVE GUARD") ||
                        err.message.includes("TEST LAUNCHER ERROR")
                    );
                }
            );
        } finally {
            if (prevDestruct !== undefined) process.env.ALLOW_DESTRUCTIVE_OPERATIONS = prevDestruct;
            else delete process.env.ALLOW_DESTRUCTIVE_OPERATIONS;
        }
    });
});
