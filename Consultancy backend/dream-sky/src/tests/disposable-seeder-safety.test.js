/**
 * disposable-seeder-safety.test.js
 *
 * Pure unit tests verifying the safety, planning, manifest recovery, and cluster identity logic of scripts/seed-disposable-fixtures.js.
 * Guarantees zero database connection, zero network calls, and zero external side effects.
 * Uses isolated temporary directories in os.tmpdir() and dependency injection for Prisma mocks.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const {
    EXPECTED_CLUSTER_IDENTITY,
    validateSeederDatabaseUrl,
    createSeederPrismaClient,
    fetchClusterIdentity,
    verifyClusterIdentity,
    performOutOfBandPreflight,
    validatePreflightEvidence,
    resolvePgControlDataBin,
    buildSyntheticFixtures,
    buildPlannedRecords,
    validateFixturePlan,
    validatePreflightFilesystem,
    writeDurableJson,
    writeIntentManifest,
    updateManifestAtomic,
    buildFixtureManifest,
    buildFailureReport,
    generateReverseCleanupPlan,
    getReverseDeletionOrder,
    resolveTestPassword,
    runSeeder,
} = require("../../scripts/seed-disposable-fixtures");

const {
    PERSISTENT_TEST_CLUSTER_DIR,
    PERSISTENT_TEST_SOCKET_DIR,
    PERSISTENT_TEST_UPLOAD_DIR,
} = require("../config");

const { pushDisposableSchema } = require("../../scripts/push-disposable-schema");

const MOCK_EXPECTED_CLUSTER_IDENTITY = {
    systemIdentifier: "7697854862051656675",
    dataDirectory: PERSISTENT_TEST_CLUSTER_DIR,
    socketDirectory: PERSISTENT_TEST_SOCKET_DIR,
    port: 5433,
    database: "dreamsky_test_disposable",
    role: "dreamsky_test_user",
};

const PENDING_EXPECTED_CLUSTER_IDENTITY = {
    ...MOCK_EXPECTED_CLUSTER_IDENTITY,
    systemIdentifier: "PENDING_INITIALIZATION",
};

const escapeRegex = (s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

// Helper to create an isolated temporary directory for filesystem testing
function withTempDir(fn) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamsky-seeder-test-"));
    try {
        return fn(tempDir);
    } finally {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (_) {}
    }
}

async function withTempDirAsync(fn) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamsky-seeder-test-"));
    try {
        return await fn(tempDir);
    } finally {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (_) {}
    }
}

// ── Baseline Planning & Synthetic ID Tests ───────────────────────────────────

test("Seeder safety - buildSyntheticFixtures fails closed when passwordHash is missing", () => {
    assert.throws(
        () => buildSyntheticFixtures({}),
        /passwordHash is required to build synthetic user fixtures/
    );
});

test("Seeder safety - buildSyntheticFixtures creates only test-syn- prefixed IDs", () => {
    const fixtures = buildSyntheticFixtures({ passwordHash: "mock-hash" });
    const records = Object.values(fixtures);

    assert.ok(records.length >= 7, "Expected at least 7 baseline fixtures");
    for (const record of records) {
        assert.ok(
            record.id.startsWith("test-syn-"),
            `Fixture ID '${record.id}' must start with 'test-syn-'`
        );
    }
});

test("Seeder safety - buildSyntheticFixtures enforces @example.com on all email addresses", () => {
    const fixtures = buildSyntheticFixtures({ passwordHash: "mock-hash" });
    const records = Object.values(fixtures);

    for (const record of records) {
        if (record.email) {
            assert.ok(
                record.email.endsWith("@example.com"),
                `Fixture email '${record.email}' must use '@example.com' domain`
            );
        }
    }
});

test("Seeder safety - validateFixturePlan passes valid synthetic plan", () => {
    const fixtures = buildSyntheticFixtures({ passwordHash: "mock-hash" });
    assert.doesNotThrow(() => validateFixturePlan(fixtures));
});

test("Seeder safety - validateFixturePlan rejects non-synthetic IDs", () => {
    const fixtures = buildSyntheticFixtures({ passwordHash: "mock-hash" });
    fixtures.adminUser.id = "user-12345"; // Corrupted ID

    assert.throws(
        () => validateFixturePlan(fixtures),
        /Record ID 'user-12345' must start with 'test-syn-/
    );
});

test("Seeder safety - validateFixturePlan rejects non-example.com email domains", () => {
    const fixtures = buildSyntheticFixtures({ passwordHash: "mock-hash" });
    fixtures.counselor1.email = "counselor@dreamsky.com"; // Real/external domain

    assert.throws(
        () => validateFixturePlan(fixtures),
        /Email 'counselor@dreamsky.com' must use '@example.com' domain/
    );
});

test("Seeder safety - getReverseDeletionOrder puts child models before parent models", () => {
    const order = getReverseDeletionOrder();

    const studentIdx = order.indexOf("Student");
    const userIdx = order.indexOf("User");
    const branchIdx = order.indexOf("Branch");
    const courseIdx = order.indexOf("Course");
    const uniIdx = order.indexOf("University");
    const countryIdx = order.indexOf("Country");

    assert.ok(studentIdx < userIdx, "Student must be deleted before User");
    assert.ok(userIdx < branchIdx, "User must be deleted before Branch");
    assert.ok(courseIdx < uniIdx, "Course must be deleted before University");
    assert.ok(uniIdx < countryIdx, "University must be deleted before Country");
});

test("Seeder safety - resolveTestPassword reads from DISPOSABLE_TEST_PASSWORD environment variable", () => {
    const original = process.env.DISPOSABLE_TEST_PASSWORD;
    try {
        process.env.DISPOSABLE_TEST_PASSWORD = "test-session-secret-pw";
        const pw = resolveTestPassword();
        assert.strictEqual(pw, "test-session-secret-pw");
    } finally {
        if (original === undefined) {
            delete process.env.DISPOSABLE_TEST_PASSWORD;
        } else {
            process.env.DISPOSABLE_TEST_PASSWORD = original;
        }
    }
});

// ── 10 Hardened Safety & Manifest Recovery Tests ─────────────────────────────

test("Coverage 1 - A new manifest is exclusively created with PREPARING before any database transaction begins", async () => {
    await withTempDirAsync(async (tempDir) => {
        const manifestPath = path.join(tempDir, ".disposable-fixture-manifest.json");
        let transactionStarted = false;
        let manifestStatusInsideTransaction = null;

        const mockTx = new Proxy({}, {
            get: () => ({
                create: async () => ({}),
            }),
        });

        const mockPrisma = {
            user: { count: async () => 0, findFirst: async () => null },
            student: { count: async () => 0, findFirst: async () => null },
            branch: { count: async () => 0, findFirst: async () => null },
            $transaction: async (fn) => {
                transactionStarted = true;
                // Verify the manifest already exists on disk BEFORE transaction writes begin
                assert.ok(fs.existsSync(manifestPath), "Manifest file must exist on disk before transaction runs");
                const current = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
                manifestStatusInsideTransaction = current.status;
                return fn(mockTx);
            },
            $disconnect: async () => {},
        };

        const result = await runSeeder({
            manifestPath,
            prismaClient: mockPrisma,
            password: "mock-test-password",
            skipTargetAssert: true,
            skipClusterIdentityCheck: true,
        });

        assert.strictEqual(transactionStarted, true);
        assert.strictEqual(manifestStatusInsideTransaction, "PREPARING", "Manifest must have PREPARING status inside transaction");
        assert.strictEqual(result.status, "COMPLETED", "Final manifest status should be COMPLETED upon success");
    });
});

test("Coverage 2 - An existing manifest prevents all database writes and is not overwritten", async () => {
    await withTempDirAsync(async (tempDir) => {
        const manifestPath = path.join(tempDir, ".disposable-fixture-manifest.json");
        const originalContent = { testRunId: "run-original", status: "COMPLETED", customMarker: 42 };
        fs.writeFileSync(manifestPath, JSON.stringify(originalContent, null, 2), "utf8");

        let transactionCalled = false;
        const mockPrisma = {
            user: { count: async () => 0 },
            student: { count: async () => 0 },
            branch: { count: async () => 0 },
            $transaction: async () => {
                transactionCalled = true;
            },
            $disconnect: async () => {},
        };

        await assert.rejects(
            () => runSeeder({
                manifestPath,
                prismaClient: mockPrisma,
                password: "mock-password",
                skipTargetAssert: true,
                skipClusterIdentityCheck: true,
            }),
            /SEEDER BLOCKED - EXISTING MANIFEST/
        );

        assert.strictEqual(transactionCalled, false, "Database transaction must not be invoked when manifest exists");
        const diskContent = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        assert.deepStrictEqual(diskContent, originalContent, "Existing manifest must remain completely un-overwritten");
    });
});

test("Coverage 3 - Invalid or duplicate fixture IDs prevent writes", () => {
    // 3a. Duplicate fixture ID
    const fixturesDup = buildSyntheticFixtures({ passwordHash: "hash" });
    const plannedRecordsDup = buildPlannedRecords(fixturesDup);
    plannedRecordsDup[1].id = plannedRecordsDup[0].id; // force duplicate ID

    assert.throws(
        () => validateFixturePlan(fixturesDup, plannedRecordsDup),
        /Duplicate fixture ID 'test-syn-r28a-br-1' detected/
    );

    // 3b. Missing dependency reference
    const fixturesDep = buildSyntheticFixtures({ passwordHash: "hash" });
    const plannedRecordsDep = buildPlannedRecords(fixturesDep);
    plannedRecordsDep[1].dependsOn = [{ model: "Branch", id: "test-syn-non-existent-branch" }];

    assert.throws(
        () => validateFixturePlan(fixturesDep, plannedRecordsDep),
        /FIXTURE DEPENDENCY ERROR.*depends on 'test-syn-non-existent-branch'/
    );
});

test("Coverage 4 - A transaction failure leaves a recoverable manifest with truthful status", async () => {
    await withTempDirAsync(async (tempDir) => {
        const manifestPath = path.join(tempDir, ".disposable-fixture-manifest.json");

        const mockPrisma = {
            user: { count: async () => 0, findFirst: async () => null },
            student: { count: async () => 0, findFirst: async () => null },
            branch: { count: async () => 0, findFirst: async () => null },
            $transaction: async () => {
                throw new Error("Simulated database constraint violation");
            },
            $disconnect: async () => {},
        };

        await assert.rejects(
            () => runSeeder({
                manifestPath,
                prismaClient: mockPrisma,
                password: "mock-password",
                skipTargetAssert: true,
                skipClusterIdentityCheck: true,
            }),
            /Simulated database constraint violation/
        );

        // Verify failure report written to manifest
        assert.ok(fs.existsSync(manifestPath), "Manifest must exist after transaction failure");
        const failureReport = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

        assert.strictEqual(failureReport.status, "FAILED_TRANSACTION_REJECTED");
        assert.strictEqual(failureReport.transactionBehavior, "ROLLBACK_EXPECTED_BY_CLIENT");
        assert.strictEqual(failureReport.rollbackConfirmed, false);
        assert.strictEqual(failureReport.finalDatabaseRecordCount, "UNKNOWN");
        assert.strictEqual(failureReport.error, "Simulated database constraint violation");
        assert.ok(Array.isArray(failureReport.plannedFixtures), "Planned fixtures must remain recoverable");
        assert.ok(Array.isArray(failureReport.cleanupPlan), "Cleanup plan must remain recorded");
    });
});

test("Coverage 5 - A successful transaction followed by a manifest-update failure preserves the original recovery manifest", async () => {
    await withTempDirAsync(async (tempDir) => {
        const manifestPath = path.join(tempDir, ".disposable-fixture-manifest.json");

        // We simulate a filesystem error during updateManifestAtomic by corrupting renameSync
        const originalRenameSync = fs.renameSync;
        fs.renameSync = () => {
            throw new Error("Simulated EACCES / atomic rename failure");
        };

        try {
            const mockTx = new Proxy({}, {
                get: () => ({
                    create: async () => ({}),
                }),
            });

            const mockPrisma = {
                user: { count: async () => 0, findFirst: async () => null },
                student: { count: async () => 0, findFirst: async () => null },
                branch: { count: async () => 0, findFirst: async () => null },
                $transaction: async (fn) => fn(mockTx),
                $disconnect: async () => {},
            };

            await assert.rejects(
                () => runSeeder({
                    manifestPath,
                    prismaClient: mockPrisma,
                    password: "mock-password",
                    skipTargetAssert: true,
                    skipClusterIdentityCheck: true,
                }),
                /MANIFEST UPDATE FAILED POST-COMMIT/
            );

            // Crucial verification: The original PREPARING intent manifest remains intact!
            assert.ok(fs.existsSync(manifestPath), "Original manifest must still exist");
            const preserved = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
            assert.strictEqual(preserved.status, "PREPARING", "Manifest must remain in PREPARING status when post-commit update fails");
            assert.ok(preserved.fixtures.length >= 7, "All planned fixture definitions must be preserved for manual recovery");
        } finally {
            fs.renameSync = originalRenameSync;
        }
    });
});

test("Coverage 6 - A stale PREPARING manifest blocks another seeder attempt before database writes", async () => {
    await withTempDirAsync(async (tempDir) => {
        const manifestPath = path.join(tempDir, ".disposable-fixture-manifest.json");
        const staleIntent = {
            testRunId: "stale-run-123",
            status: "PREPARING",
            createdAt: new Date().toISOString(),
        };
        fs.writeFileSync(manifestPath, JSON.stringify(staleIntent, null, 2), "utf8");

        let transactionCalled = false;
        const mockPrisma = {
            user: { count: async () => 0 },
            student: { count: async () => 0 },
            branch: { count: async () => 0 },
            $transaction: async () => {
                transactionCalled = true;
            },
            $disconnect: async () => {},
        };

        await assert.rejects(
            () => runSeeder({
                manifestPath,
                prismaClient: mockPrisma,
                password: "mock-password",
                skipTargetAssert: true,
                skipClusterIdentityCheck: true,
            }),
            /SEEDER BLOCKED - STALE INTENT MANIFEST/
        );

        assert.strictEqual(transactionCalled, false, "Must not execute database writes when stale PREPARING manifest is found");
        // Verify manifest was not touched
        const current = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        assert.strictEqual(current.testRunId, "stale-run-123");
    });
});

test("Coverage 7 - Temporary manifest files do not overwrite or destroy the original intent manifest", async () => {
    await withTempDirAsync(async (tempDir) => {
        const manifestPath = path.join(tempDir, ".disposable-fixture-manifest.json");
        const tmpPath = manifestPath + ".tmp";

        // Create both intent manifest and conflicting temp artifact
        fs.writeFileSync(manifestPath, JSON.stringify({ status: "PREPARING" }, null, 2), "utf8");
        fs.writeFileSync(tmpPath, JSON.stringify({ partial: "corrupted" }, null, 2), "utf8");

        assert.throws(
            () => validatePreflightFilesystem(manifestPath),
            /SEEDER BLOCKED/
        );

        // Verify original file is not corrupted or overwritten
        const original = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        assert.strictEqual(original.status, "PREPARING");
    });
});

test("Coverage 8 - Cleanup-plan generation uses exact IDs and never uses broad deleteMany", () => {
    const fixtures = buildSyntheticFixtures({ passwordHash: "mock-hash" });
    const plannedRecords = buildPlannedRecords(fixtures);
    const plan = generateReverseCleanupPlan(plannedRecords);

    assert.ok(plan.length >= 8);
    for (const step of plan) {
        assert.strictEqual(step.action, "deleteById");
        assert.ok(step.id.startsWith("test-syn-"));
        assert.ok(step.prismaCall.includes(`.delete({ where: { id: "${step.id}" } })`));
    }

    const planStr = JSON.stringify(plan);
    assert.strictEqual(planStr.includes("deleteMany"), false, "Broad deleteMany is strictly forbidden");
});

test("Coverage 9 - No automatic cleanup occurs on any failure path", async () => {
    await withTempDirAsync(async (tempDir) => {
        const manifestPath = path.join(tempDir, ".disposable-fixture-manifest.json");

        let deleteCalled = false;
        const mockPrisma = {
            user: {
                count: async () => 0,
                findFirst: async () => null,
                delete: async () => { deleteCalled = true; },
                deleteMany: async () => { deleteCalled = true; },
            },
            student: {
                count: async () => 0,
                findFirst: async () => null,
                delete: async () => { deleteCalled = true; },
                deleteMany: async () => { deleteCalled = true; },
            },
            branch: {
                count: async () => 0,
                findFirst: async () => null,
                delete: async () => { deleteCalled = true; },
                deleteMany: async () => { deleteCalled = true; },
            },
            $transaction: async () => {
                throw new Error("Failure triggering error flow");
            },
            $disconnect: async () => {},
        };

        await assert.rejects(
            () => runSeeder({
                manifestPath,
                prismaClient: mockPrisma,
                password: "mock-password",
                skipTargetAssert: true,
                skipClusterIdentityCheck: true,
            }),
            /Failure triggering error flow/
        );

        assert.strictEqual(deleteCalled, false, "No delete or deleteMany calls must occur on transaction failure");
    });
});

test("Coverage 10 - Manifest content contains no credentials or other secrets", () => {
    const fixtures = buildSyntheticFixtures({ passwordHash: "$2a$10$injectedPasswordHashString" });
    const plannedRecords = buildPlannedRecords(fixtures);

    const completed = buildFixtureManifest("test-run-sec", plannedRecords);
    const completedStr = JSON.stringify(completed);

    assert.strictEqual(completedStr.includes("password"), false);
    assert.strictEqual(completedStr.includes("$2a$10$injectedPasswordHashString"), false);
    assert.strictEqual(completedStr.includes("secret"), false);
    assert.strictEqual(completedStr.includes("token"), false);
    assert.strictEqual(completedStr.includes("DATABASE_URL"), false);

    const failed = buildFailureReport("test-run-sec", new Error("Generic error"), plannedRecords, plannedRecords);
    const failedStr = JSON.stringify(failed);

    assert.strictEqual(failedStr.includes("password"), false);
    assert.strictEqual(failedStr.includes("$2a$10$injectedPasswordHashString"), false);
    assert.strictEqual(failedStr.includes("secret"), false);
    assert.strictEqual(failedStr.includes("DATABASE_URL"), false);
});

// ── Cluster Identity Verification Guard Tests ────────────────────────────────

function createMockIdentityClient(overrides = {}) {
    return {
        $queryRawUnsafe: async (sql) => {
            if (sql.includes("current_database")) {
                return [{
                    db_name: overrides.database !== undefined ? overrides.database : "dreamsky_test_disposable",
                    role_name: overrides.role !== undefined ? overrides.role : "dreamsky_test_user",
                    server_port: overrides.port !== undefined ? overrides.port : 5433,
                }];
            }
            if (sql.includes("pg_control_system")) {
                if (overrides.systemIdentifierError) {
                    throw new Error(overrides.systemIdentifierError);
                }
                return [{
                    sys_id: overrides.systemIdentifier !== undefined ? overrides.systemIdentifier : "7697854862051656675",
                }];
            }
            if (sql.includes("data_directory")) {
                if (overrides.dataDirectoryError) {
                    throw new Error(overrides.dataDirectoryError);
                }
                return [{
                    data_directory: overrides.dataDirectory !== undefined ? overrides.dataDirectory : PERSISTENT_TEST_CLUSTER_DIR,
                }];
            }
            return [];
        },
    };
}

test("Cluster identity - successful verification when all 5 evidence items match", async () => {
    const mockClient = createMockIdentityClient();
    const result = await verifyClusterIdentity(mockClient, MOCK_EXPECTED_CLUSTER_IDENTITY);

    assert.strictEqual(result.verified, true);
    assert.strictEqual(result.clusterIdentity.database, "dreamsky_test_disposable");
    assert.strictEqual(result.clusterIdentity.role, "dreamsky_test_user");
    assert.strictEqual(result.clusterIdentity.port, 5433);
    assert.strictEqual(result.clusterIdentity.systemIdentifier, "7697854862051656675");
    assert.strictEqual(result.clusterIdentity.dataDirectory, PERSISTENT_TEST_CLUSTER_DIR);
});

test("Cluster identity - fails closed on mismatched system identifier", async () => {
    const mockClient = createMockIdentityClient({ systemIdentifier: "9999999999999999999" });

    await assert.rejects(
        () => verifyClusterIdentity(mockClient, MOCK_EXPECTED_CLUSTER_IDENTITY),
        /CLUSTER IDENTITY MISMATCH.*system identifier '9999999999999999999' does not match expected '7697854862051656675'/
    );
});

test("Cluster identity - fails closed on mismatched data directory", async () => {
    const mockClient = createMockIdentityClient({ dataDirectory: "/opt/homebrew/var/postgresql@16" });

    await assert.rejects(
        () => verifyClusterIdentity(mockClient, MOCK_EXPECTED_CLUSTER_IDENTITY),
        new RegExp(`CLUSTER IDENTITY MISMATCH.*data directory '\\/opt\\/homebrew\\/var\\/postgresql@16' does not match expected '${escapeRegex(PERSISTENT_TEST_CLUSTER_DIR)}'`)
    );
});

test("Cluster identity - fails closed when cluster system identifier is PENDING_INITIALIZATION", async () => {
    const mockClient = createMockIdentityClient();

    await assert.rejects(
        () => verifyClusterIdentity(mockClient, PENDING_EXPECTED_CLUSTER_IDENTITY),
        /Cluster system identifier is pending initialization and has not yet been established/
    );
});

test("Cluster identity - fails closed on wrong port, database, or role", async () => {
    // Wrong port (e.g. 5432)
    const mockWrongPort = createMockIdentityClient({ port: 5432 });
    await assert.rejects(
        () => verifyClusterIdentity(mockWrongPort, MOCK_EXPECTED_CLUSTER_IDENTITY),
        /CLUSTER IDENTITY MISMATCH.*Connected server port '5432' does not match expected disposable port '5433'/
    );

    // Wrong database (e.g. production database)
    const mockWrongDb = createMockIdentityClient({ database: "dreamsky_db" });
    await assert.rejects(
        () => verifyClusterIdentity(mockWrongDb, MOCK_EXPECTED_CLUSTER_IDENTITY),
        /CLUSTER IDENTITY MISMATCH.*Connected database 'dreamsky_db' does not match expected disposable database 'dreamsky_test_disposable'/
    );

    // Wrong role (e.g. superuser/postgres)
    const mockWrongRole = createMockIdentityClient({ role: "postgres" });
    await assert.rejects(
        () => verifyClusterIdentity(mockWrongRole, MOCK_EXPECTED_CLUSTER_IDENTITY),
        /CLUSTER IDENTITY MISMATCH.*Connected role 'postgres' does not match expected role 'dreamsky_test_user'/
    );
});

test("Cluster identity - fails closed when identity evidence is unavailable to non-superuser", async () => {
    // system_identifier restricted
    const mockRestrictedSysId = createMockIdentityClient({
        systemIdentifierError: "permission denied for function pg_control_system",
    });
    await assert.rejects(
        () => verifyClusterIdentity(mockRestrictedSysId, MOCK_EXPECTED_CLUSTER_IDENTITY),
        /CLUSTER IDENTITY ERROR.*system_identifier is unavailable.*permission denied for function pg_control_system.*Refusing to seed based on port and name alone/
    );

    // data_directory restricted
    const mockRestrictedDataDir = createMockIdentityClient({
        dataDirectoryError: 'permission denied to examine "data_directory"',
    });
    await assert.rejects(
        () => verifyClusterIdentity(mockRestrictedDataDir, MOCK_EXPECTED_CLUSTER_IDENTITY),
        /CLUSTER IDENTITY ERROR.*data_directory is unavailable.*permission denied to examine "data_directory".*Refusing to seed based on port and name alone/
    );
});

test("Cluster identity - guarantee that no fixture inserts occur before identity verification passes", async () => {
    await withTempDirAsync(async (tempDir) => {
        const manifestPath = path.join(tempDir, ".disposable-fixture-manifest.json");

        let transactionCalled = false;
        let createCalled = false;

        const mockPrisma = {
            ...createMockIdentityClient({ systemIdentifier: "WRONG_CLUSTER_SYSTEM_ID", port: null }),
            user: { count: async () => 0 },
            student: { count: async () => 0 },
            branch: {
                count: async () => 0,
                create: async () => { createCalled = true; },
            },
            $transaction: async () => {
                transactionCalled = true;
            },
            $disconnect: async () => {},
        };

        await assert.rejects(
            () => runSeeder({
                manifestPath,
                prismaClient: mockPrisma,
                password: "mock-password",
                skipTargetAssert: true,
                skipClusterIdentityCheck: false, // Enforced!
                skipOutOfBandPreflight: true, // Forces in-database check path
                clusterIdentityReference: MOCK_EXPECTED_CLUSTER_IDENTITY,
            }),
            /CLUSTER IDENTITY MISMATCH.*system identifier 'WRONG_CLUSTER_SYSTEM_ID'/
        );

        // Guarantees:
        assert.strictEqual(transactionCalled, false, "Transaction must not start if cluster identity fails");
        assert.strictEqual(createCalled, false, "No create operations must occur if cluster identity fails");

        // Verify manifest was recorded with FAILED_CLUSTER_IDENTITY_REJECTED
        assert.ok(fs.existsSync(manifestPath), "Manifest must exist");
        const failureReport = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        assert.strictEqual(failureReport.status, "FAILED_CLUSTER_IDENTITY_REJECTED");
        assert.strictEqual(failureReport.transactionBehavior, "NO_TRANSACTION_STARTED");
        assert.strictEqual(failureReport.finalDatabaseRecordCount, "0");
    });
});

// ── Out-of-Band Physical Cluster Identity Preflight Tests ────────────────────

function createValidMockPreflightInputs(overrides = {}) {
    const postmasterContent = overrides.postmasterContent !== undefined ? overrides.postmasterContent : [
        "29744",
        PERSISTENT_TEST_CLUSTER_DIR,
        "1792296542",
        "5433",
        PERSISTENT_TEST_SOCKET_DIR,
        "127.0.0.1",
        "221378556 327681",
        "ready",
    ].join("\n");

    const readPostmaster = (filePath) => {
        if (overrides.postmasterReadError) {
            throw new Error(overrides.postmasterReadError);
        }
        return postmasterContent;
    };

    const execCommand = (cmd, args) => {
        if (overrides.execError && overrides.execError[cmd]) {
            throw new Error(overrides.execError[cmd]);
        }
        if (cmd === "lsof") {
            if (overrides.lsofOutput !== undefined) return overrides.lsofOutput;
            return "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\npostgres 29744 testuser 6u IPv4 0x123 0t0 TCP 127.0.0.1:5433 (LISTEN)\n";
        }
        if (cmd === "ps") {
            if (overrides.psOutput !== undefined) return overrides.psOutput;
            return `29744 /opt/homebrew/Cellar/postgresql@16/16.14_1/bin/postgres -D ${PERSISTENT_TEST_CLUSTER_DIR} -p 5433 -h 127.0.0.1 -k ${PERSISTENT_TEST_SOCKET_DIR}\n`;
        }
        if (cmd.includes("pg_controldata")) {
            if (overrides.controldataOutput !== undefined) return overrides.controldataOutput;
            return "Database system identifier:           7697854862051656675\nDatabase cluster state:               in production\n";
        }
        return "";
    };

    return { readPostmaster, execCommand };
}

test("Preflight - matching system identifier, process arguments, port, data directory, and socket path", () => {
    const { readPostmaster, execCommand } = createValidMockPreflightInputs();
    const evidence = performOutOfBandPreflight({
        expected: MOCK_EXPECTED_CLUSTER_IDENTITY,
        readPostmaster,
        execCommand,
        pgControlDataBin: "pg_controldata",
    });

    assert.strictEqual(evidence.verified, true);
    assert.strictEqual(evidence.source, "OUT_OF_BAND_PREFLIGHT");
    assert.strictEqual(evidence.systemIdentifier, "7697854862051656675");
    assert.strictEqual(evidence.dataDirectory, PERSISTENT_TEST_CLUSTER_DIR);
    assert.strictEqual(evidence.socketDirectory, PERSISTENT_TEST_SOCKET_DIR);
    assert.strictEqual(evidence.port, 5433);
    assert.strictEqual(evidence.pid, 29744);
    assert.strictEqual(evidence.clusterState, "in production");
});

test("Preflight - fails closed when cluster system identifier is PENDING_INITIALIZATION", () => {
    const { readPostmaster, execCommand } = createValidMockPreflightInputs();
    assert.throws(
        () => performOutOfBandPreflight({
            expected: PENDING_EXPECTED_CLUSTER_IDENTITY,
            readPostmaster,
            execCommand,
            pgControlDataBin: "pg_controldata",
        }),
        /PREFLIGHT ERROR.*Cluster system identifier is pending initialization and has not yet been established/
    );
});

test("Preflight - fails closed on wrong system identifier", () => {
    const { readPostmaster, execCommand } = createValidMockPreflightInputs({
        controldataOutput: "Database system identifier: 9999999999999999999\nDatabase cluster state: in production\n",
    });

    assert.throws(
        () => performOutOfBandPreflight({
            expected: MOCK_EXPECTED_CLUSTER_IDENTITY,
            readPostmaster,
            execCommand,
            pgControlDataBin: "pg_controldata",
        }),
        /PREFLIGHT ERROR.*Physical cluster system identifier mismatch: observed '9999999999999999999', expected '7697854862051656675'/
    );
});

test("Preflight - fails closed on wrong or ambiguous listening process", () => {
    // A: No listener on port 5433
    const noListener = createValidMockPreflightInputs({
        lsofOutput: "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\n",
    });
    assert.throws(
        () => performOutOfBandPreflight({
            expected: MOCK_EXPECTED_CLUSTER_IDENTITY,
            readPostmaster: noListener.readPostmaster,
            execCommand: noListener.execCommand,
            pgControlDataBin: "pg_controldata",
        }),
        /PREFLIGHT ERROR.*No listening process found on TCP port 5433/
    );

    // B: Ambiguous listeners (multiple distinct PIDs)
    const ambiguousListeners = createValidMockPreflightInputs({
        lsofOutput: "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\npostgres 29744 testuser 6u IPv4 0x1 0t0 TCP 127.0.0.1:5433 (LISTEN)\nother 29745 testuser 7u IPv4 0x2 0t0 TCP 127.0.0.1:5433 (LISTEN)\n",
    });
    assert.throws(
        () => performOutOfBandPreflight({
            expected: MOCK_EXPECTED_CLUSTER_IDENTITY,
            readPostmaster: ambiguousListeners.readPostmaster,
            execCommand: ambiguousListeners.execCommand,
            pgControlDataBin: "pg_controldata",
        }),
        /PREFLIGHT ERROR.*Ambiguous listeners on port 5433/
    );

    // C: Listening PID mismatch with postmaster.pid
    const pidMismatch = createValidMockPreflightInputs({
        lsofOutput: "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\npostgres 88888 testuser 6u IPv4 0x1 0t0 TCP 127.0.0.1:5433 (LISTEN)\n",
    });
    assert.throws(
        () => performOutOfBandPreflight({
            expected: MOCK_EXPECTED_CLUSTER_IDENTITY,
            readPostmaster: pidMismatch.readPostmaster,
            execCommand: pidMismatch.execCommand,
            pgControlDataBin: "pg_controldata",
        }),
        /PREFLIGHT ERROR.*Process listening on port 5433 \(PID 88888\) does not match postmaster\.pid \(PID 29744\)/
    );

    // D: Non-postgres process running on PID
    const nonPostgres = createValidMockPreflightInputs({
        psOutput: "29744 node /usr/local/bin/malicious-server.js\n",
    });
    assert.throws(
        () => performOutOfBandPreflight({
            expected: MOCK_EXPECTED_CLUSTER_IDENTITY,
            readPostmaster: nonPostgres.readPostmaster,
            execCommand: nonPostgres.execCommand,
            pgControlDataBin: "pg_controldata",
        }),
        /PREFLIGHT ERROR.*PID 29744 is not a postgres process/
    );
});

test("Preflight - fails closed on missing or contradictory process/control-file evidence", () => {
    // A: postmaster.pid missing or unreadable
    const missingPostmaster = createValidMockPreflightInputs({
        postmasterReadError: "ENOENT: no such file or directory",
    });
    assert.throws(
        () => performOutOfBandPreflight({
            expected: MOCK_EXPECTED_CLUSTER_IDENTITY,
            readPostmaster: missingPostmaster.readPostmaster,
            execCommand: missingPostmaster.execCommand,
            pgControlDataBin: "pg_controldata",
        }),
        /PREFLIGHT ERROR.*Cannot read postmaster\.pid/
    );

    // B: postmaster.pid points to production data directory
    const wrongDataDir = createValidMockPreflightInputs({
        postmasterContent: `29744\n/opt/homebrew/var/postgresql@16\n1792296542\n5433\n${PERSISTENT_TEST_SOCKET_DIR}\n`,
    });
    assert.throws(
        () => performOutOfBandPreflight({
            expected: MOCK_EXPECTED_CLUSTER_IDENTITY,
            readPostmaster: wrongDataDir.readPostmaster,
            execCommand: wrongDataDir.execCommand,
            pgControlDataBin: "pg_controldata",
        }),
        new RegExp(`PREFLIGHT ERROR.*postmaster\\.pid data directory '\\/opt\\/homebrew\\/var\\/postgresql@16' does not match expected '${escapeRegex(PERSISTENT_TEST_CLUSTER_DIR)}'`)
    );

    // C: ps command line missing socket directory argument
    const missingSocketInPs = createValidMockPreflightInputs({
        psOutput: `29744 postgres -D ${PERSISTENT_TEST_CLUSTER_DIR} -p 5433\n`,
    });
    assert.throws(
        () => performOutOfBandPreflight({
            expected: MOCK_EXPECTED_CLUSTER_IDENTITY,
            readPostmaster: missingSocketInPs.readPostmaster,
            execCommand: missingSocketInPs.execCommand,
            pgControlDataBin: "pg_controldata",
        }),
        new RegExp(`PREFLIGHT ERROR.*Process arguments for PID 29744 do not contain expected socket directory '${escapeRegex(PERSISTENT_TEST_SOCKET_DIR)}'`)
    );

    // D: pg_controldata shows non-production state
    const badClusterState = createValidMockPreflightInputs({
        controldataOutput: "Database system identifier: 7697854862051656675\nDatabase cluster state: starting up\n",
    });
    assert.throws(
        () => performOutOfBandPreflight({
            expected: MOCK_EXPECTED_CLUSTER_IDENTITY,
            readPostmaster: badClusterState.readPostmaster,
            execCommand: badClusterState.execCommand,
            pgControlDataBin: "pg_controldata",
        }),
        /PREFLIGHT ERROR.*Invalid database cluster state 'starting up'/
    );
});

test("Preflight - evidence validation rejects contradictory in-session port", async () => {
    // In-session port is 5432, but preflight evidence specifies 5433
    const mockWrongSessionPort = createMockIdentityClient({ port: 5432 });
    const validEvidence = {
        verified: true,
        source: "OUT_OF_BAND_PREFLIGHT",
        systemIdentifier: "7697854862051656675",
        dataDirectory: PERSISTENT_TEST_CLUSTER_DIR,
        socketDirectory: PERSISTENT_TEST_SOCKET_DIR,
        port: 5433,
        pid: 29744,
        clusterState: "in production",
    };

    await assert.rejects(
        () => verifyClusterIdentity(mockWrongSessionPort, MOCK_EXPECTED_CLUSTER_IDENTITY, { preflightEvidence: validEvidence }),
        /CLUSTER IDENTITY MISMATCH.*Connected server port '5432' does not match expected disposable port '5433'/
    );
});

test("Preflight failure blocks Prisma initialization and fixture inserts", async () => {
    await withTempDirAsync(async (tempDir) => {
        const manifestPath = path.join(tempDir, ".disposable-fixture-manifest.json");

        let prismaAcquired = false;
        let transactionCalled = false;
        let createCalled = false;

        const mockPrisma = {
            ...createMockIdentityClient(),
            user: { count: async () => { prismaAcquired = true; return 0; } },
            student: { count: async () => 0 },
            branch: { count: async () => 0 },
            $transaction: async () => {
                transactionCalled = true;
            },
            branch: { create: async () => { createCalled = true; } },
            $disconnect: async () => {},
        };

        const failingPreflight = createValidMockPreflightInputs({
            controldataOutput: "Database system identifier: 1111111111111111111\nDatabase cluster state: in production\n",
        });

        await assert.rejects(
            () => runSeeder({
                manifestPath,
                prismaClient: mockPrisma,
                password: "mock-password",
                skipTargetAssert: true,
                skipClusterIdentityCheck: false,
                clusterIdentityReference: MOCK_EXPECTED_CLUSTER_IDENTITY,
                execCommand: failingPreflight.execCommand,
                readPostmaster: failingPreflight.readPostmaster,
                pgControlDataBin: "pg_controldata",
            }),
            /PREFLIGHT ERROR.*Physical cluster system identifier mismatch/
        );

        // Guarantees:
        assert.strictEqual(prismaAcquired, false, "Prisma queries must never run if preflight fails");
        assert.strictEqual(transactionCalled, false, "Transaction must never start if preflight fails");
        assert.strictEqual(createCalled, false, "No create operations must occur if preflight fails");

        // Verify manifest recorded with FAILED_CLUSTER_IDENTITY_REJECTED
        assert.ok(fs.existsSync(manifestPath), "Manifest must exist");
        const failureReport = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        assert.strictEqual(failureReport.status, "FAILED_CLUSTER_IDENTITY_REJECTED");
        assert.strictEqual(failureReport.transactionBehavior, "NO_TRANSACTION_STARTED");
        assert.strictEqual(failureReport.finalDatabaseRecordCount, "0");
        assert.strictEqual(failureReport.attemptedRecordsCount, 0);
    });
});

test("Pre-existing FAILED_CLUSTER_IDENTITY_REJECTED manifest prevents reseeding", async () => {
    await withTempDirAsync(async (tempDir) => {
        const manifestPath = path.join(tempDir, ".disposable-fixture-manifest.json");

        // Simulate pre-existing failure manifest
        fs.writeFileSync(manifestPath, JSON.stringify({
            testRunId: "syn-run-prev-failed",
            status: "FAILED_CLUSTER_IDENTITY_REJECTED",
            failedAt: new Date().toISOString(),
        }), "utf8");

        let transactionCalled = false;
        const mockPrisma = {
            ...createMockIdentityClient(),
            $transaction: async () => { transactionCalled = true; },
            $disconnect: async () => {},
        };

        await assert.rejects(
            () => runSeeder({
                manifestPath,
                prismaClient: mockPrisma,
                password: "mock-password",
                skipTargetAssert: true,
            }),
            /SEEDER BLOCKED - EXISTING MANIFEST.*status: FAILED_CLUSTER_IDENTITY_REJECTED/
        );

        assert.strictEqual(transactionCalled, false, "Transaction must never run when existing failure manifest exists");
        // Verify original failure manifest was preserved and not overwritten
        const manifestAfter = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        assert.strictEqual(manifestAfter.testRunId, "syn-run-prev-failed");
        assert.strictEqual(manifestAfter.status, "FAILED_CLUSTER_IDENTITY_REJECTED");
    });
});

test("No extra database permissions required when valid out-of-band preflight evidence is supplied", async () => {
    // Application role dreamsky_test_user has NO superuser or pg_read_all_settings
    // In-database queries for SHOW data_directory and pg_control_system() fail with 42501
    const mockUnprivilegedClient = createMockIdentityClient({
        systemIdentifierError: 'permission denied for function pg_control_system (SQLSTATE 42501)',
        dataDirectoryError: 'permission denied to examine "data_directory" (SQLSTATE 42501)',
    });

    const validEvidence = {
        verified: true,
        source: "OUT_OF_BAND_PREFLIGHT",
        systemIdentifier: "7697854862051656675",
        dataDirectory: PERSISTENT_TEST_CLUSTER_DIR,
        socketDirectory: PERSISTENT_TEST_SOCKET_DIR,
        port: 5433,
        pid: 29744,
        clusterState: "in production",
    };

    // With valid preflight evidence, verifyClusterIdentity succeeds completely
    const result = await verifyClusterIdentity(mockUnprivilegedClient, MOCK_EXPECTED_CLUSTER_IDENTITY, {
        preflightEvidence: validEvidence,
    });

    assert.strictEqual(result.verified, true);
    assert.strictEqual(result.clusterIdentity.database, "dreamsky_test_disposable");
    assert.strictEqual(result.clusterIdentity.role, "dreamsky_test_user");
    assert.strictEqual(result.clusterIdentity.port, 5433);
    assert.strictEqual(result.clusterIdentity.systemIdentifier, "7697854862051656675");
    assert.strictEqual(result.clusterIdentity.dataDirectory, PERSISTENT_TEST_CLUSTER_DIR);
    assert.strictEqual(result.clusterIdentity.evidenceSource, "OUT_OF_BAND_PREFLIGHT");
});

// ── Unix Domain Socket Hardening Tests (Phase 9D.2G2A.11) ───────────────────

test("Seeder socket guard - validateSeederDatabaseUrl accepts exact verified Unix socket URL", () => {
    const encodedSocket = encodeURIComponent(PERSISTENT_TEST_SOCKET_DIR);
    const validSocketUrl = `postgresql://dreamsky_test_user:my_secret_pw@${encodedSocket}:5433/dreamsky_test_disposable?schema=public`;
    const result = validateSeederDatabaseUrl(validSocketUrl, MOCK_EXPECTED_CLUSTER_IDENTITY);
    assert.strictEqual(result, validSocketUrl);
});

test("Seeder socket guard - validateSeederDatabaseUrl explicitly rejects TCP URLs and fallback", () => {
    // 127.0.0.1 TCP connection
    assert.throws(
        () => validateSeederDatabaseUrl("postgresql://dreamsky_test_user:pass@127.0.0.1:5433/dreamsky_test_disposable?schema=public", MOCK_EXPECTED_CLUSTER_IDENTITY),
        new RegExp(`\\[SEEDER CONNECTION ERROR\\] TCP connection to '127\\.0\\.0\\.1' is rejected\\. The disposable seeder strictly requires the Unix domain socket at '${escapeRegex(PERSISTENT_TEST_SOCKET_DIR)}'\\. TCP fallback is forbidden\\.`)
    );

    // localhost TCP connection
    assert.throws(
        () => validateSeederDatabaseUrl("postgresql://dreamsky_test_user:pass@localhost:5433/dreamsky_test_disposable?schema=public", MOCK_EXPECTED_CLUSTER_IDENTITY),
        new RegExp(`\\[SEEDER CONNECTION ERROR\\] TCP connection to 'localhost' is rejected\\. The disposable seeder strictly requires the Unix domain socket at '${escapeRegex(PERSISTENT_TEST_SOCKET_DIR)}'\\. TCP fallback is forbidden\\.`)
    );
});

test("Seeder socket guard - validateSeederDatabaseUrl rejects invalid socket directories", () => {
    assert.throws(
        () => validateSeederDatabaseUrl("postgresql://dreamsky_test_user:pass@%2Ftmp%2Fother_sock:5433/dreamsky_test_disposable", MOCK_EXPECTED_CLUSTER_IDENTITY),
        new RegExp(`\\[SEEDER CONNECTION ERROR\\] Socket directory '\\/tmp\\/other_sock' is rejected\\. The disposable seeder strictly requires '${escapeRegex(PERSISTENT_TEST_SOCKET_DIR)}'\\.`)
    );

    assert.throws(
        () => validateSeederDatabaseUrl("postgresql://dreamsky_test_user:pass@%2Fvar%2Frun%2Fpostgresql:5433/dreamsky_test_disposable", MOCK_EXPECTED_CLUSTER_IDENTITY),
        /\[SEEDER CONNECTION ERROR\] Socket directory '\/var\/run\/postgresql' is rejected/
    );
});

test("Seeder socket guard - validateSeederDatabaseUrl rejects wrong database or role", () => {
    const encodedSocket = encodeURIComponent(PERSISTENT_TEST_SOCKET_DIR);
    // Wrong database
    assert.throws(
        () => validateSeederDatabaseUrl(`postgresql://dreamsky_test_user:pass@${encodedSocket}:5433/dreamsky_db`, MOCK_EXPECTED_CLUSTER_IDENTITY),
        /\[SEEDER CONNECTION ERROR\] Database 'dreamsky_db' is rejected\. Expected 'dreamsky_test_disposable'\./
    );

    // Wrong role
    assert.throws(
        () => validateSeederDatabaseUrl(`postgresql://postgres:pass@${encodedSocket}:5433/dreamsky_test_disposable`, MOCK_EXPECTED_CLUSTER_IDENTITY),
        /\[SEEDER CONNECTION ERROR\] Database user 'postgres' is rejected\. Expected 'dreamsky_test_user'\./
    );

    assert.throws(
        () => validateSeederDatabaseUrl(`postgresql://dreamsky_test_runner:pass@${encodedSocket}:5433/dreamsky_test_disposable`, MOCK_EXPECTED_CLUSTER_IDENTITY),
        /\[SEEDER CONNECTION ERROR\] Database user 'dreamsky_test_runner' is rejected\. Expected 'dreamsky_test_user'\./
    );
});

test("Seeder socket guard - validateSeederDatabaseUrl rejects wrong port and parameter overrides", () => {
    const encodedSocket = encodeURIComponent(PERSISTENT_TEST_SOCKET_DIR);
    // Wrong port (e.g. 5432)
    assert.throws(
        () => validateSeederDatabaseUrl(`postgresql://dreamsky_test_user:pass@${encodedSocket}:5432/dreamsky_test_disposable`, MOCK_EXPECTED_CLUSTER_IDENTITY),
        /\[SEEDER CONNECTION ERROR\] Port '5432' is rejected\. Expected '5433'\./
    );

    // Dangerous parameter overrides
    assert.throws(
        () => validateSeederDatabaseUrl(`postgresql://dreamsky_test_user:pass@${encodedSocket}:5433/dreamsky_test_disposable?host=127.0.0.1`, MOCK_EXPECTED_CLUSTER_IDENTITY),
        /Dangerous connection parameter overrides/
    );

    assert.throws(
        () => validateSeederDatabaseUrl(`postgresql://dreamsky_test_user:pass@${encodedSocket}:5433/dreamsky_test_disposable?port=5432`, MOCK_EXPECTED_CLUSTER_IDENTITY),
        /Dangerous connection parameter overrides/
    );
});

test("Seeder socket guard - verifyClusterIdentity with requireUnixSocket rejects TCP connection", async () => {
    // Mock client connected over TCP (server_port is 5433)
    const mockTcpClient = createMockIdentityClient({ port: 5433 });
    const validEvidence = {
        verified: true,
        source: "OUT_OF_BAND_PREFLIGHT",
        systemIdentifier: "7697854862051656675",
        dataDirectory: PERSISTENT_TEST_CLUSTER_DIR,
        socketDirectory: PERSISTENT_TEST_SOCKET_DIR,
        port: 5433,
        pid: 29744,
        clusterState: "in production",
    };

    await assert.rejects(
        () => verifyClusterIdentity(mockTcpClient, MOCK_EXPECTED_CLUSTER_IDENTITY, {
            preflightEvidence: validEvidence,
            requireUnixSocket: true,
        }),
        /\[CLUSTER IDENTITY REJECTED\] Connection was established over TCP \(port 5433\)\. The disposable seeder strictly requires a Unix domain socket connection/
    );
});

test("Seeder socket guard - verifyClusterIdentity with requireUnixSocket accepts verified Unix socket connection", async () => {
    // Over Unix socket: inet_server_port() is null, inet_server_addr() is null
    const mockSocketClient = createMockIdentityClient({ port: null });
    const validEvidence = {
        verified: true,
        source: "OUT_OF_BAND_PREFLIGHT",
        systemIdentifier: "7697854862051656675",
        dataDirectory: PERSISTENT_TEST_CLUSTER_DIR,
        socketDirectory: PERSISTENT_TEST_SOCKET_DIR,
        port: 5433,
        pid: 29744,
        clusterState: "in production",
    };

    const result = await verifyClusterIdentity(mockSocketClient, MOCK_EXPECTED_CLUSTER_IDENTITY, {
        preflightEvidence: validEvidence,
        requireUnixSocket: true,
    });

    assert.strictEqual(result.verified, true);
    assert.strictEqual(result.clusterIdentity.transport, "UNIX_DOMAIN_SOCKET");
    assert.strictEqual(result.clusterIdentity.port, null);
    assert.strictEqual(result.clusterIdentity.database, "dreamsky_test_disposable");
    assert.strictEqual(result.clusterIdentity.role, "dreamsky_test_user");
    assert.strictEqual(result.clusterIdentity.systemIdentifier, "7697854862051656675");
});

test("Seeder socket guard - runSeeder fails before Prisma client acquisition if TCP URL is supplied", async () => {
    await withTempDirAsync(async (tempDir) => {
        const manifestPath = path.join(tempDir, ".disposable-fixture-manifest.json");
        const prevUrl = process.env.DATABASE_URL;
        const prevOptIn = process.env.ALLOW_INTEGRATION_TEST_DB;
        const prevDestructive = process.env.ALLOW_DESTRUCTIVE_OPERATIONS;

        process.env.DATABASE_URL = "postgresql://dreamsky_test_user:pass@127.0.0.1:5433/dreamsky_test_disposable";
        process.env.ALLOW_INTEGRATION_TEST_DB = "true";
        process.env.ALLOW_DESTRUCTIVE_OPERATIONS = "true";

        let prismaAcquired = false;
        const mockPrisma = {
            $transaction: async () => { prismaAcquired = true; },
            $disconnect: async () => {},
        };

        try {
            await assert.rejects(
                () => runSeeder({
                    manifestPath,
                    prismaClient: mockPrisma,
                    password: "mock-password",
                    skipTargetAssert: false,
                }),
                /\[SEEDER CONNECTION ERROR\] TCP connection to '127\.0\.0\.1' is rejected/
            );

            assert.strictEqual(prismaAcquired, false, "Prisma operations must not be initiated when TCP is supplied");
            assert.strictEqual(fs.existsSync(manifestPath), false, "Manifest must not be written if seeder URL validation fails");
        } finally {
            if (prevUrl !== undefined) process.env.DATABASE_URL = prevUrl;
            else delete process.env.DATABASE_URL;
            if (prevOptIn !== undefined) process.env.ALLOW_INTEGRATION_TEST_DB = prevOptIn;
            else delete process.env.ALLOW_INTEGRATION_TEST_DB;
            if (prevDestructive !== undefined) process.env.ALLOW_DESTRUCTIVE_OPERATIONS = prevDestructive;
            else delete process.env.ALLOW_DESTRUCTIVE_OPERATIONS;
        }
    });
});

// ── Guarded Schema Push Safety Tests ────────────────────────────────────────

test("Schema push guard - pushDisposableSchema fails closed when cluster identity is pending initialization", () => {
    withTempDir((tempDir) => {
        const validConfigPath = path.join(tempDir, "valid-disposable.env");
        fs.writeFileSync(
            validConfigPath,
            [
                "PORT=5001",
                "NODE_ENV=test",
                `DATABASE_URL=postgresql://dreamsky_test_user:pass@${encodeURIComponent(PERSISTENT_TEST_SOCKET_DIR)}:5433/dreamsky_test_disposable`,
                "DISPOSABLE_TEST_PASSWORD=mock_test_password_secret",
                "ALLOW_INTEGRATION_TEST_DB=true",
                "ALLOW_DESTRUCTIVE_OPERATIONS=true",
                "SUPPRESS_ALL_OUTBOUND_EMAILS=true",
                "DISPOSABLE_REHEARSAL_MODE=true",
                `UPLOAD_DIR=${PERSISTENT_TEST_UPLOAD_DIR}`,
            ].join("\n") + "\n"
        );

        assert.throws(
            () => pushDisposableSchema({
                configPath: validConfigPath,
                clusterIdentityReference: PENDING_EXPECTED_CLUSTER_IDENTITY,
            }),
            /\[PRISMA GUARD\] Cluster system identifier is pending initialization and has not yet been established/
        );
    });
});

test("Schema push guard - pushDisposableSchema fails closed when socket file is absent", () => {
    withTempDir((tempDir) => {
        const validConfigPath = path.join(tempDir, "valid-disposable.env");
        fs.writeFileSync(
            validConfigPath,
            [
                "PORT=5001",
                "NODE_ENV=test",
                `DATABASE_URL=postgresql://dreamsky_test_user:pass@${encodeURIComponent(PERSISTENT_TEST_SOCKET_DIR)}:5433/dreamsky_test_disposable`,
                "DISPOSABLE_TEST_PASSWORD=mock_test_password_secret",
                "ALLOW_INTEGRATION_TEST_DB=true",
                "ALLOW_DESTRUCTIVE_OPERATIONS=true",
                "SUPPRESS_ALL_OUTBOUND_EMAILS=true",
                "DISPOSABLE_REHEARSAL_MODE=true",
                `UPLOAD_DIR=${PERSISTENT_TEST_UPLOAD_DIR}`,
            ].join("\n") + "\n"
        );

        const { readPostmaster, execCommand } = createValidMockPreflightInputs();
        let prismaInvoked = false;
        const execPrisma = () => { prismaInvoked = true; };

        // If the socket file does not exist, schema push must fail closed before invoking Prisma
        const socketFile = path.join(PERSISTENT_TEST_SOCKET_DIR, ".s.PGSQL.5433");
        if (!fs.existsSync(socketFile)) {
            assert.throws(
                () => pushDisposableSchema({
                    configPath: validConfigPath,
                    clusterIdentityReference: MOCK_EXPECTED_CLUSTER_IDENTITY,
                    readPostmaster,
                    execCommand,
                    execPrisma,
                }),
                /\[PRISMA GUARD\] Required Unix domain socket file not found/
            );
            assert.strictEqual(prismaInvoked, false, "Prisma must NOT be invoked when socket file is absent");
        }
    });
});

test("Schema push guard - pushDisposableSchema rejects fabricated evidence in options", () => {
    withTempDir((tempDir) => {
        const validConfigPath = path.join(tempDir, "valid-disposable.env");
        fs.writeFileSync(
            validConfigPath,
            [
                "PORT=5001",
                "NODE_ENV=test",
                `DATABASE_URL=postgresql://dreamsky_test_user:pass@${encodeURIComponent(PERSISTENT_TEST_SOCKET_DIR)}:5433/dreamsky_test_disposable`,
                "DISPOSABLE_TEST_PASSWORD=mock_test_password_secret",
                "ALLOW_INTEGRATION_TEST_DB=true",
                "ALLOW_DESTRUCTIVE_OPERATIONS=true",
                "SUPPRESS_ALL_OUTBOUND_EMAILS=true",
                "DISPOSABLE_REHEARSAL_MODE=true",
                `UPLOAD_DIR=${PERSISTENT_TEST_UPLOAD_DIR}`,
            ].join("\n") + "\n"
        );

        let prismaInvoked = false;
        const execPrisma = () => { prismaInvoked = true; };

        assert.throws(
            () => pushDisposableSchema({
                configPath: validConfigPath,
                clusterIdentityReference: MOCK_EXPECTED_CLUSTER_IDENTITY,
                preflightEvidence: { verified: true, systemIdentifier: "7697854862051656675" },
                execPrisma,
            }),
            /\[PRISMA GUARD\] Supplying external preflight\/cluster evidence is forbidden/
        );

        assert.throws(
            () => pushDisposableSchema({
                configPath: validConfigPath,
                clusterIdentityReference: MOCK_EXPECTED_CLUSTER_IDENTITY,
                clusterEvidence: { verified: true },
                execPrisma,
            }),
            /\[PRISMA GUARD\] Supplying external preflight\/cluster evidence is forbidden/
        );

        assert.strictEqual(prismaInvoked, false, "Prisma must NOT be invoked when fabricated evidence is supplied");
    });
});

test("Schema push guard - pushDisposableSchema rejects preflight bypass flags in options", () => {
    withTempDir((tempDir) => {
        const validConfigPath = path.join(tempDir, "valid-disposable.env");
        fs.writeFileSync(
            validConfigPath,
            [
                "PORT=5001",
                "NODE_ENV=test",
                `DATABASE_URL=postgresql://dreamsky_test_user:pass@${encodeURIComponent(PERSISTENT_TEST_SOCKET_DIR)}:5433/dreamsky_test_disposable`,
                "DISPOSABLE_TEST_PASSWORD=mock_test_password_secret",
                "ALLOW_INTEGRATION_TEST_DB=true",
                "ALLOW_DESTRUCTIVE_OPERATIONS=true",
                "SUPPRESS_ALL_OUTBOUND_EMAILS=true",
                "DISPOSABLE_REHEARSAL_MODE=true",
                `UPLOAD_DIR=${PERSISTENT_TEST_UPLOAD_DIR}`,
            ].join("\n") + "\n"
        );

        let prismaInvoked = false;
        const execPrisma = () => { prismaInvoked = true; };

        assert.throws(
            () => pushDisposableSchema({
                configPath: validConfigPath,
                clusterIdentityReference: MOCK_EXPECTED_CLUSTER_IDENTITY,
                enforcePreflight: false,
                execPrisma,
            }),
            /\[PRISMA GUARD\] Bypassing out-of-band cluster preflight is strictly forbidden/
        );

        assert.throws(
            () => pushDisposableSchema({
                configPath: validConfigPath,
                clusterIdentityReference: MOCK_EXPECTED_CLUSTER_IDENTITY,
                skipPreflight: true,
                execPrisma,
            }),
            /\[PRISMA GUARD\] Bypassing out-of-band cluster preflight is strictly forbidden/
        );

        assert.throws(
            () => pushDisposableSchema({
                configPath: validConfigPath,
                clusterIdentityReference: MOCK_EXPECTED_CLUSTER_IDENTITY,
                skipOutOfBandPreflight: true,
                execPrisma,
            }),
            /\[PRISMA GUARD\] Bypassing out-of-band cluster preflight is strictly forbidden/
        );

        assert.throws(
            () => pushDisposableSchema({
                configPath: validConfigPath,
                clusterIdentityReference: MOCK_EXPECTED_CLUSTER_IDENTITY,
                skipClusterIdentityCheck: true,
                execPrisma,
            }),
            /\[PRISMA GUARD\] Bypassing out-of-band cluster preflight is strictly forbidden/
        );

        assert.strictEqual(prismaInvoked, false, "Prisma must NOT be invoked when bypass flags are supplied");
    });
});

test("Schema push guard - pushDisposableSchema fails closed on wrong port, socket, or data directory in expected identity", () => {
    withTempDir((tempDir) => {
        const validConfigPath = path.join(tempDir, "valid-disposable.env");
        fs.writeFileSync(
            validConfigPath,
            [
                "PORT=5001",
                "NODE_ENV=test",
                `DATABASE_URL=postgresql://dreamsky_test_user:pass@${encodeURIComponent(PERSISTENT_TEST_SOCKET_DIR)}:5433/dreamsky_test_disposable`,
                "DISPOSABLE_TEST_PASSWORD=mock_test_password_secret",
                "ALLOW_INTEGRATION_TEST_DB=true",
                "ALLOW_DESTRUCTIVE_OPERATIONS=true",
                "SUPPRESS_ALL_OUTBOUND_EMAILS=true",
                "DISPOSABLE_REHEARSAL_MODE=true",
                `UPLOAD_DIR=${PERSISTENT_TEST_UPLOAD_DIR}`,
            ].join("\n") + "\n"
        );

        let prismaInvoked = false;
        const execPrisma = () => { prismaInvoked = true; };

        // 1. Wrong port
        assert.throws(
            () => pushDisposableSchema({
                configPath: validConfigPath,
                clusterIdentityReference: { ...MOCK_EXPECTED_CLUSTER_IDENTITY, port: 5432 },
                execPrisma,
            }),
            /\[PRISMA GUARD\] Expected cluster port '5432' is rejected/
        );

        // 2. Wrong data directory
        assert.throws(
            () => pushDisposableSchema({
                configPath: validConfigPath,
                clusterIdentityReference: { ...MOCK_EXPECTED_CLUSTER_IDENTITY, dataDirectory: "/tmp/wrong_data_dir" },
                execPrisma,
            }),
            /\[PRISMA GUARD\] Expected cluster data directory '\/tmp\/wrong_data_dir' does not match/
        );

        // 3. Wrong socket directory
        assert.throws(
            () => pushDisposableSchema({
                configPath: validConfigPath,
                clusterIdentityReference: { ...MOCK_EXPECTED_CLUSTER_IDENTITY, socketDirectory: "/tmp/wrong_sock_dir" },
                execPrisma,
            }),
            /\[PRISMA GUARD\] Expected cluster socket directory '\/tmp\/wrong_sock_dir' does not match/
        );

        assert.strictEqual(prismaInvoked, false, "Prisma must NOT be invoked on invalid identity configuration");
    });
});

test("Schema push guard - pushDisposableSchema fails closed on missing out-of-band preflight evidence", () => {
    withTempDir((tempDir) => {
        const validConfigPath = path.join(tempDir, "valid-disposable.env");
        fs.writeFileSync(
            validConfigPath,
            [
                "PORT=5001",
                "NODE_ENV=test",
                `DATABASE_URL=postgresql://dreamsky_test_user:pass@${encodeURIComponent(PERSISTENT_TEST_SOCKET_DIR)}:5433/dreamsky_test_disposable`,
                "DISPOSABLE_TEST_PASSWORD=mock_test_password_secret",
                "ALLOW_INTEGRATION_TEST_DB=true",
                "ALLOW_DESTRUCTIVE_OPERATIONS=true",
                "SUPPRESS_ALL_OUTBOUND_EMAILS=true",
                "DISPOSABLE_REHEARSAL_MODE=true",
                `UPLOAD_DIR=${PERSISTENT_TEST_UPLOAD_DIR}`,
            ].join("\n") + "\n"
        );

        let prismaInvoked = false;
        const execPrisma = () => { prismaInvoked = true; };

        // 1. Missing postmaster.pid
        const missingPostmaster = createValidMockPreflightInputs({
            postmasterReadError: "ENOENT: no such file or directory",
        });
        assert.throws(
            () => pushDisposableSchema({
                configPath: validConfigPath,
                clusterIdentityReference: MOCK_EXPECTED_CLUSTER_IDENTITY,
                readPostmaster: missingPostmaster.readPostmaster,
                execCommand: missingPostmaster.execCommand,
                execPrisma,
            }),
            /\[PREFLIGHT ERROR\] Cannot read postmaster.pid/
        );

        // 2. Missing listening process on port 5433
        const noListener = createValidMockPreflightInputs({ lsofOutput: "" });
        assert.throws(
            () => pushDisposableSchema({
                configPath: validConfigPath,
                clusterIdentityReference: MOCK_EXPECTED_CLUSTER_IDENTITY,
                readPostmaster: noListener.readPostmaster,
                execCommand: noListener.execCommand,
                execPrisma,
            }),
            /\[PREFLIGHT ERROR\] No listening process found on TCP port 5433/
        );

        // 3. Missing PID in process table
        const missingProcess = createValidMockPreflightInputs({ psOutput: "" });
        assert.throws(
            () => pushDisposableSchema({
                configPath: validConfigPath,
                clusterIdentityReference: MOCK_EXPECTED_CLUSTER_IDENTITY,
                readPostmaster: missingProcess.readPostmaster,
                execCommand: missingProcess.execCommand,
                execPrisma,
            }),
            /\[PREFLIGHT ERROR\] PID 29744 not found in process table/
        );

        assert.strictEqual(prismaInvoked, false, "Prisma must NOT be invoked when preflight evidence is missing");
    });
});

test("Schema push guard - pushDisposableSchema fails closed on identity mismatch and prevents Prisma execution", () => {
    withTempDir((tempDir) => {
        const validConfigPath = path.join(tempDir, "valid-disposable.env");
        fs.writeFileSync(
            validConfigPath,
            [
                "PORT=5001",
                "NODE_ENV=test",
                `DATABASE_URL=postgresql://dreamsky_test_user:pass@${encodeURIComponent(PERSISTENT_TEST_SOCKET_DIR)}:5433/dreamsky_test_disposable`,
                "DISPOSABLE_TEST_PASSWORD=mock_test_password_secret",
                "ALLOW_INTEGRATION_TEST_DB=true",
                "ALLOW_DESTRUCTIVE_OPERATIONS=true",
                "SUPPRESS_ALL_OUTBOUND_EMAILS=true",
                "DISPOSABLE_REHEARSAL_MODE=true",
                `UPLOAD_DIR=${PERSISTENT_TEST_UPLOAD_DIR}`,
            ].join("\n") + "\n"
        );

        let prismaInvoked = false;
        const execPrisma = () => { prismaInvoked = true; };

        // Identity mismatch: pg_controldata reports different system identifier
        const mismatchedIdentity = createValidMockPreflightInputs({
            controldataOutput: "Database system identifier:           1111111111111111111\nDatabase cluster state:               in production\n",
        });

        assert.throws(
            () => pushDisposableSchema({
                configPath: validConfigPath,
                clusterIdentityReference: MOCK_EXPECTED_CLUSTER_IDENTITY,
                readPostmaster: mismatchedIdentity.readPostmaster,
                execCommand: mismatchedIdentity.execCommand,
                pgControlDataBin: "pg_controldata",
                execPrisma,
            }),
            /\[PREFLIGHT ERROR\] Physical cluster system identifier mismatch: observed '1111111111111111111', expected '7697854862051656675'/
        );

        assert.strictEqual(prismaInvoked, false, "Prisma must NOT be invoked on cluster identity mismatch");
    });
});

test("Schema push guard - pushDisposableSchema fails closed on process argument mismatch", () => {
    withTempDir((tempDir) => {
        const validConfigPath = path.join(tempDir, "valid-disposable.env");
        fs.writeFileSync(
            validConfigPath,
            [
                "PORT=5001",
                "NODE_ENV=test",
                `DATABASE_URL=postgresql://dreamsky_test_user:pass@${encodeURIComponent(PERSISTENT_TEST_SOCKET_DIR)}:5433/dreamsky_test_disposable`,
                "DISPOSABLE_TEST_PASSWORD=mock_test_password_secret",
                "ALLOW_INTEGRATION_TEST_DB=true",
                "ALLOW_DESTRUCTIVE_OPERATIONS=true",
                "SUPPRESS_ALL_OUTBOUND_EMAILS=true",
                "DISPOSABLE_REHEARSAL_MODE=true",
                `UPLOAD_DIR=${PERSISTENT_TEST_UPLOAD_DIR}`,
            ].join("\n") + "\n"
        );

        let prismaInvoked = false;
        const execPrisma = () => { prismaInvoked = true; };

        // Process arguments do not contain postgres
        const nonPostgres = createValidMockPreflightInputs({
            psOutput: "29744 /usr/bin/python3 -m http.server 5433\n",
        });

        assert.throws(
            () => pushDisposableSchema({
                configPath: validConfigPath,
                clusterIdentityReference: MOCK_EXPECTED_CLUSTER_IDENTITY,
                readPostmaster: nonPostgres.readPostmaster,
                execCommand: nonPostgres.execCommand,
                execPrisma,
            }),
            /\[PREFLIGHT ERROR\] PID 29744 is not a postgres process/
        );

        assert.strictEqual(prismaInvoked, false, "Prisma must NOT be invoked when process arguments are invalid");
    });
});

test("Schema push guard - pushDisposableSchema rejects dev database or non-test targets", () => {
    withTempDir((tempDir) => {
        const unsafeConfigPath = path.join(tempDir, "unsafe.env");
        fs.writeFileSync(
            unsafeConfigPath,
            [
                "PORT=5001",
                "NODE_ENV=test",
                "DATABASE_URL=postgresql://dreamsky_user:pass@127.0.0.1:5432/dreamsky_db",
                "DISPOSABLE_TEST_PASSWORD=mock_test_password_secret",
                "ALLOW_INTEGRATION_TEST_DB=true",
                "ALLOW_DESTRUCTIVE_OPERATIONS=true",
                "SUPPRESS_ALL_OUTBOUND_EMAILS=true",
                "DISPOSABLE_REHEARSAL_MODE=true",
                `UPLOAD_DIR=${PERSISTENT_TEST_CLUSTER_DIR}`,
            ].join("\n") + "\n"
        );

        let prismaInvoked = false;
        const execPrisma = () => { prismaInvoked = true; };

        assert.throws(
            () => pushDisposableSchema({
                configPath: unsafeConfigPath,
                clusterIdentityReference: MOCK_EXPECTED_CLUSTER_IDENTITY,
                execPrisma,
            }),
            /\[DATABASE CONFIG ERROR\]|\[TEST LAUNCHER ERROR\]|\[PRISMA GUARD\]/
        );

        assert.strictEqual(prismaInvoked, false, "Prisma must NOT be invoked when unsafe dev targets are specified");
    });
});

test("Storage isolation - storage.util enforces persistent upload directory in test mode", () => {
    const { resolveUploadDir, DISPOSABLE_TEST_UPLOAD_DIR } = require("../../src/utils/storage.util");
    assert.strictEqual(DISPOSABLE_TEST_UPLOAD_DIR, PERSISTENT_TEST_UPLOAD_DIR);

    const prevEnv = process.env.NODE_ENV;
    const prevUpload = process.env.UPLOAD_DIR;

    try {
        process.env.NODE_ENV = "test";
        process.env.UPLOAD_DIR = PERSISTENT_TEST_UPLOAD_DIR;
        assert.strictEqual(resolveUploadDir(), PERSISTENT_TEST_UPLOAD_DIR);

        // Reject non-persistent upload dir
        process.env.UPLOAD_DIR = "/tmp/arbitrary_uploads";
        assert.throws(
            () => resolveUploadDir(),
            /\[STORAGE SECURITY ERROR\]/
        );
    } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevUpload !== undefined) process.env.UPLOAD_DIR = prevUpload;
        else delete process.env.UPLOAD_DIR;
    }
});

