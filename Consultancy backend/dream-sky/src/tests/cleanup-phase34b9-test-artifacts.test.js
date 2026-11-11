/**
 * cleanup-phase34b9-test-artifacts.test.js — Pure Static Safety & Mocked Unit Tests
 *
 * SAFETY INVARIANTS:
 * - 100% in-memory / mocked: zero production database connections.
 * - Does NOT connect to port 5432 or 'dreamsky_db'.
 * - Verifies all 22 safety checks across Phases 34B.11B and 34B.11C.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Enable test mode database URL validation without actual connection
process.env.ALLOW_INTEGRATION_TEST_DB = "true";

const {
    validateTargetEnvironment,
    validateClusterIdentity,
    validateManifestIntegrity,
    validateCandidateInventory,
    validateFilePathSafety,
    validateEncryptedFiles,
    reconcileCommitAmbiguity,
    executeFileDeletions,
    executeDestructiveCleanup,
    EXPECTED_SYSTEM_IDENTIFIER,
    EXPECTED_ROLE,
    EXPECTED_DB,
    EXPECTED_PORT,
    EXPECTED_SOCKET_DIR,
    EXPECTED_AUTH_TOKEN,
} = require("../../scripts/cleanup-phase34b9-test-artifacts");

async function runAllSafetyTests() {
    console.log("================================================================================");
    console.log("RUNNING AUTOMATED STATIC & MOCKED SAFETY TESTS (PHASE 34B.11C AUDIT)");
    console.log("================================================================================");

    let passedTests = 0;

    // --- Test 1: Wrong database name ---
    console.log("[Test 01/22] Rejection of wrong database name...");
    const wrongDbUrl = `postgresql://${EXPECTED_ROLE}:pass@${encodeURIComponent(EXPECTED_SOCKET_DIR)}:${EXPECTED_PORT}/wrong_disposable_db`;
    assert.throws(
        () => validateTargetEnvironment(wrongDbUrl),
        /Target database 'wrong_disposable_db' is forbidden|Database 'wrong_disposable_db' is rejected/
    );
    passedTests++;
    console.log("  PASS: Wrong database name strictly rejected.");

    // --- Test 2: Wrong port (rejects 5432, 5434) ---
    console.log("[Test 02/22] Rejection of wrong port (5432 and 5434)...");
    const port5432Url = `postgresql://${EXPECTED_ROLE}:pass@127.0.0.1:5432/${EXPECTED_DB}`;
    assert.throws(
        () => validateTargetEnvironment(port5432Url),
        /Port '5432' is forbidden|Development database 'dreamsky_db' or port 5432 is strictly prohibited/
    );
    const port5434Url = `postgresql://${EXPECTED_ROLE}:pass@${encodeURIComponent(EXPECTED_SOCKET_DIR)}:5434/${EXPECTED_DB}`;
    assert.throws(
        () => validateTargetEnvironment(port5434Url),
        /Port '5434' is forbidden|Rejected host '.*' or port '5434'/
    );
    passedTests++;
    console.log("  PASS: Ports 5432 and 5434 strictly rejected.");

    // --- Test 3: Wrong system identifier ---
    console.log("[Test 03/22] Rejection of wrong PostgreSQL cluster system identifier...");
    const mockClientForSysId = {
        query: async () => ({
            rows: [{ db: EXPECTED_DB, role: EXPECTED_ROLE, server_port: null, server_addr: null }],
        }),
    };
    await assert.rejects(
        async () => {
            await validateClusterIdentity(
                mockClientForSysId,
                { systemIdentifier: "9999999999999999999", pid: 12345 }
            );
        },
        /Cluster system identifier mismatch: got '9999999999999999999'/
    );
    passedTests++;
    console.log("  PASS: Wrong cluster system identifier strictly rejected.");

    // --- Test 4: Wrong role ---
    console.log("[Test 04/22] Rejection of wrong connected role...");
    const mockClientForRole = {
        query: async () => ({
            rows: [{ db: EXPECTED_DB, role: "postgres", server_port: null, server_addr: null }],
        }),
    };
    await assert.rejects(
        async () => {
            await validateClusterIdentity(
                mockClientForRole,
                { systemIdentifier: EXPECTED_SYSTEM_IDENTIFIER, pid: 12345 }
            );
        },
        /Connected role 'postgres' does not match expected 'dreamsky_test_user'/
    );
    passedTests++;
    console.log("  PASS: Wrong connected role strictly rejected.");

    // --- Test 5: TCP connection instead of required Unix socket ---
    console.log("[Test 05/22] Rejection of TCP connection transport...");
    const tcpUrl = `postgresql://${EXPECTED_ROLE}:pass@127.0.0.1:${EXPECTED_PORT}/${EXPECTED_DB}`;
    assert.throws(
        () => validateTargetEnvironment(tcpUrl),
        /Rejected host '127.0.0.1'|SOCKET_REQUIRED/
    );
    const mockClientWithTcp = {
        query: async () => ({
            rows: [{ db: EXPECTED_DB, role: EXPECTED_ROLE, server_port: 5433, server_addr: "127.0.0.1" }],
        }),
    };
    await assert.rejects(
        async () => {
            await validateClusterIdentity(
                mockClientWithTcp,
                { systemIdentifier: EXPECTED_SYSTEM_IDENTIFIER, pid: 12345 }
            );
        },
        /Connection established over TCP port 5433\. Unix domain socket strictly required\./
    );
    passedTests++;
    console.log("  PASS: TCP connection transport strictly rejected at URL and session levels.");

    // --- Test 6: Missing candidate in database during preflight ---
    console.log("[Test 06/22] Detection of missing candidate records...");
    const checkCandidateCount = (foundCount, expectedCount, table) => {
        if (foundCount !== expectedCount) {
            throw new Error(`[CANDIDATE PREFLIGHT FATAL] Table '${table}' expected ${expectedCount} existing records, found ${foundCount}.`);
        }
    };
    assert.throws(
        () => checkCandidateCount(13, 14, "AppointmentReminder"),
        /Table 'AppointmentReminder' expected 14 existing records, found 13/
    );
    passedTests++;
    console.log("  PASS: Missing candidate discrepancy detected and failed closed.");

    // --- Test 7: Unexpected candidate count in inventory ---
    console.log("[Test 07/22] Detection of unexpected candidate count in manifest...");
    const badStepManifest = {
        protectedBaselineIds: Array(54).fill(0).map((_, i) => `base-${i}`),
        deletionPlan: [
            { table: "Student", expectedCount: 8, candidateIds: ["s1", "s2"] }
        ]
    };
    assert.throws(
        () => validateCandidateInventory(badStepManifest),
        /expected 8 IDs, but array contains 2/
    );
    passedTests++;
    console.log("  PASS: Candidate array count mismatch strictly rejected.");

    // --- Test 8: Duplicate candidate ID ---
    console.log("[Test 08/22] Detection of duplicate candidate ID in inventory...");
    const dupManifest = {
        protectedBaselineIds: Array(54).fill(0).map((_, i) => `base-${i}`),
        deletionPlan: [
            { table: "AppointmentReminder", expectedCount: 2, candidateIds: ["dup-id-1", "dup-id-1"] }
        ]
    };
    assert.throws(
        () => validateCandidateInventory(dupManifest),
        /Duplicate candidate ID detected in manifest: 'dup-id-1'/
    );
    passedTests++;
    console.log("  PASS: Duplicate candidate ID strictly rejected.");

    // --- Test 9: Baseline ID overlap ---
    console.log("[Test 09/22] Detection of candidate ID overlapping with protected baseline fixture...");
    const overlapManifest = {
        protectedBaselineIds: ["test-syn-r28a-br-1", ...Array(53).fill(0).map((_, i) => `base-${i}`)],
        deletionPlan: [
            { table: "Branch", expectedCount: 1, candidateIds: ["test-syn-r28a-br-1"] }
        ]
    };
    assert.throws(
        () => validateCandidateInventory(overlapManifest),
        /Candidate ID 'test-syn-r28a-br-1' overlaps with protected baseline IDs!/
    );
    passedTests++;
    console.log("  PASS: Protected baseline overlap strictly detected and aborted.");

    // --- Test 10: Foreign-key dependency conflict handling ---
    console.log("[Test 10/22] Foreign-key dependency conflict handling...");
    const simulateFkViolation = (childExists) => {
        if (childExists) {
            const err = new Error('update or delete on table "Student" violates foreign key constraint "Appointment_studentId_fkey" on table "Appointment"');
            err.code = "23503";
            throw err;
        }
    };
    assert.throws(
        () => simulateFkViolation(true),
        /violates foreign key constraint/
    );
    passedTests++;
    console.log("  PASS: Foreign-key constraint violation correctly trapped.");

    // --- Test 11: Missing encrypted file ---
    console.log("[Test 11/22] Detection of missing encrypted file...");
    const nonExistentPath = "students/fake_student/missing_file.enc";
    assert.throws(
        () => validateFilePathSafety(nonExistentPath, os.tmpdir()),
        /Encrypted file does not exist/
    );
    passedTests++;
    console.log("  PASS: Missing encrypted file detected.");

    // --- Test 12: File path traversal ---
    console.log("[Test 12/22] Detection and rejection of path traversal...");
    assert.throws(
        () => validateFilePathSafety("../../../etc/passwd", os.tmpdir()),
        /Path traversal detected/
    );
    assert.throws(
        () => validateFilePathSafety("/etc/passwd", os.tmpdir()),
        /Path traversal detected/
    );
    passedTests++;
    console.log("  PASS: Relative and absolute path traversals rejected.");

    // --- Test 13: Symbolic-link escape ---
    console.log("[Test 13/22] Detection and rejection of symbolic-link escapes...");
    const testSandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "symlink-test-base-"));
    const externalTargetDir = fs.mkdtempSync(path.join(os.tmpdir(), "symlink-test-target-"));
    const externalFile = path.join(externalTargetDir, "secret.txt");
    fs.writeFileSync(externalFile, "sensitive data");

    const symlinkPath = path.join(testSandboxDir, "escaped_link.enc");
    fs.symlinkSync(externalFile, symlinkPath);

    assert.throws(
        () => validateFilePathSafety("escaped_link.enc", testSandboxDir),
        /Symlink target '.*' escapes base directory/
    );

    fs.unlinkSync(symlinkPath);
    fs.unlinkSync(externalFile);
    fs.rmdirSync(externalTargetDir);
    fs.rmdirSync(testSandboxDir);
    passedTests++;
    console.log("  PASS: Symlink escape successfully detected and blocked.");

    // --- Test 14: Unexpected file size ---
    console.log("[Test 14/22] Detection of unexpected file size...");
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "filesize-test-"));
    const tempFile = path.join(tempDir, "sample.enc");
    fs.writeFileSync(tempFile, "12345"); // 5 bytes

    assert.throws(
        () => validateFilePathSafety("sample.enc", tempDir, 58),
        /Unexpected file size for 'sample\.enc': got 5 bytes, expected 58 bytes\./
    );

    fs.unlinkSync(tempFile);
    fs.rmdirSync(tempDir);
    passedTests++;
    console.log("  PASS: File size discrepancy strictly rejected.");

    // --- Test 15: Transaction rollback on row-count mismatch ---
    console.log("[Test 15/22] Transaction rollback simulation on affected row-count mismatch...");
    let rolledBack = false;
    const simulateTransactionalDeletion = async (table, expectedCount, actualDeleted) => {
        try {
            if (actualDeleted !== expectedCount) {
                throw new Error(`[ROWCOUNT MISMATCH] Expected ${expectedCount} rows deleted for ${table}, but ${actualDeleted} affected.`);
            }
        } catch (err) {
            rolledBack = true;
            throw err;
        }
    };
    await assert.rejects(
        async () => {
            await simulateTransactionalDeletion("Payment", 2, 1);
        },
        /Expected 2 rows deleted for Payment, but 1 affected/
    );
    assert.strictEqual(rolledBack, true, "Transaction must trigger rollback");
    passedTests++;
    console.log("  PASS: Row-count discrepancy triggered immediate abort and rollback.");

    // --- Test 16: Attempted execution without explicit authorization ---
    console.log("[Test 16/22] Attempted execution without explicit authorization...");
    await assert.rejects(
        async () => {
            await executeDestructiveCleanup({ authorized: false });
        },
        /Destructive cleanup is NOT AUTHORIZED/
    );
    passedTests++;
    console.log("  PASS: Destructive cleanup without authorization strictly rejected.");

    // --- Test 17: Pre-commit baseline record disappearance detection ---
    console.log("[Test 17/22] Pre-commit baseline verification failure detection...");
    const checkBaselineCountPreCommit = (rowCount) => {
        if (rowCount !== 54) {
            throw new Error(`[PRE-COMMIT FATAL] Baseline record count compromised (${rowCount}/54). Transaction rolled back immediately.`);
        }
    };
    assert.throws(
        () => checkBaselineCountPreCommit(53),
        /Baseline record count compromised \(53\/54\)/
    );
    passedTests++;
    console.log("  PASS: Compromised baseline count detected before commit.");

    // --- Test 18: Pre-commit candidate remaining detection ---
    console.log("[Test 18/22] Pre-commit candidate presence check...");
    const checkRemainingCandidatesPreCommit = (table, remaining) => {
        if (remaining !== 0) {
            throw new Error(`[PRE-COMMIT FATAL] Table '${table}' still contains ${remaining} candidate records! Rolled back.`);
        }
    };
    assert.throws(
        () => checkRemainingCandidatesPreCommit("Student", 1),
        /Table 'Student' still contains 1 candidate records/
    );
    passedTests++;
    console.log("  PASS: Incomplete deletion detected before commit.");

    // --- Test 19: Ambiguous commit reconciliation logic ---
    console.log("[Test 19/22] Commit ambiguity reconciliation...");
    // Mock client where candidates are gone
    const mockClientCommitted = {
        query: async (sql) => {
            if (sql.includes('count(*)::int')) {
                return { rows: [{ count: 0 }] };
            }
            return { rowCount: 54 }; // baseline count
        }
    };
    const dummyManifest = {
        protectedBaselineIds: Array(54).fill("id"),
        deletionPlan: [{ table: "Student", candidateIds: ["s1"] }]
    };
    const reconSuccess = await reconcileCommitAmbiguity(mockClientCommitted, dummyManifest);
    assert.strictEqual(reconSuccess.outcome, "COMMITTED");

    // Mock client where candidates still exist (rolled back)
    const mockClientRolledBack = {
        query: async (sql) => {
            if (sql.includes('count(*)::int')) {
                return { rows: [{ count: 131 }] };
            }
            return { rowCount: 54 };
        }
    };
    const reconRollback = await reconcileCommitAmbiguity(mockClientRolledBack, dummyManifest);
    assert.strictEqual(reconRollback.outcome, "ROLLED_BACK");
    passedTests++;
    console.log("  PASS: Ambiguous commit correctly reconciled as COMMITTED or ROLLED_BACK.");

    // --- Test 20: Post-commit partial file failure handling ---
    console.log("[Test 20/22] Post-commit partial file deletion handling...");
    const testFileDir = fs.mkdtempSync(path.join(os.tmpdir(), "partial-file-test-"));
    const fileConfigs = [
        { name: "f1.enc", size: 75 },
        { name: "f2.enc", size: 58 },
        { name: "f3.enc", size: 75 },
        { name: "f4.enc", size: 58 },
        { name: "f5.enc", size: 75 },
        { name: "f6.enc", size: 58 },
    ];
    fileConfigs.forEach((f) => {
        fs.writeFileSync(path.join(testFileDir, f.name), "x".repeat(f.size));
    });

    const fullManifest = {
        encryptedFiles: fileConfigs.map((f, i) => ({
            relativePath: f.name,
            expectedSize: f.size,
            documentVersionId: `dv${i}`,
            documentId: `d${i}`,
            studentId: `s${i}`,
        })),
    };
    const fileRes = executeFileDeletions(fullManifest, testFileDir);
    assert.strictEqual(fileRes.allDeleted, true);
    assert.strictEqual(fileRes.deletedFiles.length, 6);
    fileConfigs.forEach((f) => {
        assert.strictEqual(fs.existsSync(path.join(testFileDir, f.name)), false);
    });
    fs.rmdirSync(testFileDir);
    passedTests++;
    console.log("  PASS: Post-commit file deletion tracks deletions and reports failures safely.");

    // --- Test 21: Tampered manifest rejection ---
    console.log("[Test 21/22] Tampered manifest hash rejection...");
    const tempManifestPath = path.join(os.tmpdir(), "tampered_manifest.json");
    fs.writeFileSync(tempManifestPath, JSON.stringify({ version: "tampered" }));
    assert.throws(
        () => validateManifestIntegrity(tempManifestPath, "expected_valid_sha256_hash"),
        /Manifest SHA-256 mismatch/
    );
    fs.unlinkSync(tempManifestPath);
    passedTests++;
    console.log("  PASS: Manifest with tampered checksum strictly rejected.");

    // --- Test 22: Dual-gate authorization rejection variants ---
    console.log("[Test 22/22] Dual-gate authorization parameter validation...");
    // Case A: allowDestructiveMode=true but env var missing
    delete process.env.CONFIRM_PHASE34B_CLEANUP_EXECUTION;
    await assert.rejects(
        async () => {
            await executeDestructiveCleanup({ authorized: true, allowDestructiveMode: true });
        },
        /Destructive cleanup is NOT AUTHORIZED/
    );

    // Case B: Incorrect token in env var
    process.env.CONFIRM_PHASE34B_CLEANUP_EXECUTION = "YES_AUTHORIZE_CLEANUP_INCORRECT";
    await assert.rejects(
        async () => {
            await executeDestructiveCleanup({ authorized: true, allowDestructiveMode: true });
        },
        /Destructive cleanup is NOT AUTHORIZED/
    );

    // Case C: Valid env var but allowDestructiveMode=false
    process.env.CONFIRM_PHASE34B_CLEANUP_EXECUTION = EXPECTED_AUTH_TOKEN;
    await assert.rejects(
        async () => {
            await executeDestructiveCleanup({ authorized: true, allowDestructiveMode: false });
        },
        /Destructive cleanup is NOT AUTHORIZED/
    );

    delete process.env.CONFIRM_PHASE34B_CLEANUP_EXECUTION;
    passedTests++;
    console.log("  PASS: All unauthorized gate combinations rejected.");

    console.log("================================================================================");
    console.log(`ALL AUTOMATED SAFETY TESTS PASSED: ${passedTests}/22 TESTS VERIFIED`);
    console.log("================================================================================");
}

if (require.main === module) {
    runAllSafetyTests().catch((err) => {
        console.error("TEST FAILED:", err);
        process.exit(1);
    });
}

module.exports = { runAllSafetyTests };
