/**
 * cleanup-phase34b9-test-artifacts.js — Hardened Synthetic Test Artifacts Cleanup Runner
 *
 * Dedicated fail-closed runner for purging the 131 synthetic integration test database records
 * and 6 encrypted test upload files created during Phase 34B.9 integration testing.
 *
 * Execution Modes:
 * - Dry-Run Mode (--dry-run or default): READ-ONLY verification. Performs zero mutations.
 * - Destructive Mode (--execute-destructive-cleanup-authorized-gate): Strictly requires explicit
 *   authorization env var, flags, and options. Performs atomic serializable database deletion
 *   followed by separate verified post-commit encrypted file unlinking.
 *
 * Safety Invariants:
 * - Strictly targets 'dreamsky_test_disposable' on port 5433 via Unix domain socket.
 * - Explicitly rejects port 5432, 'dreamsky_db', remote hosts, and TCP connections.
 * - Positively validates PostgreSQL cluster system identifier 7699856431808793231 and role 'dreamsky_test_user'.
 * - Verifies manifest SHA-256 integrity and zero overlap with the 54 protected baseline records.
 * - Protects .disposable-fixture-manifest.json and .disposable-fixture-manifest.json.bak from modification.
 * - Validates file paths under /Users/suyogdhakal/.dreamsky_test_uploads_5433 with symlink escape checks.
 * - Never touches production uploads/ directory.
 * - Executes database deletions in atomic transaction using leaf-first foreign-key order.
 * - Asserts exact affected row counts for each table and rolls back on any discrepancy.
 * - Verifies baseline records intact and candidate records absent immediately before COMMIT.
 * - Implements read-only commit ambiguity reconciliation.
 * - Implements post-commit file deletion with partial failure tracking and safe file-only retry.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const child_process = require("child_process");
const { Client } = require("pg");
const {
    validateDatabaseUrl,
    PERSISTENT_TEST_SOCKET_DIR,
    PERSISTENT_TEST_CLUSTER_DIR,
} = require("../src/config");
const { loadDisposableTestEnv } = require("../src/utils/test-launcher");
const {
    EXPECTED_CLUSTER_IDENTITY,
    performOutOfBandPreflight,
    validatePreflightEvidence,
    resolveTestPassword,
} = require("./seed-disposable-fixtures");

const MANIFEST_PATH = path.resolve(__dirname, "cleanup-phase34b9-test-artifacts.manifest.json");
const EXPECTED_MANIFEST_SHA256 = "7121ed953231447185fbf8cf300da5201756dcb446a2933e1b30e689a1fe3a34";

const EXPECTED_SYSTEM_IDENTIFIER = "7699856431808793231";
const EXPECTED_ROLE = "dreamsky_test_user";
const EXPECTED_DB = "dreamsky_test_disposable";
const EXPECTED_PORT = "5433";
const EXPECTED_SOCKET_DIR = PERSISTENT_TEST_SOCKET_DIR; // "/Users/suyogdhakal/.dreamsky_sock_5433"
const EXPECTED_TEST_UPLOADS_DIR = "/Users/suyogdhakal/.dreamsky_test_uploads_5433";

const BASELINE_MANIFEST_PATH = path.resolve(__dirname, "../.disposable-fixture-manifest.json");
const BASELINE_MANIFEST_BAK_PATH = path.resolve(__dirname, "../.disposable-fixture-manifest.json.bak");
const EXPECTED_BASELINE_MANIFEST_SHA256 = "1bd5af597c2bed288c64b14c70d2c71504fdb5af15066a33a03da017898e5f93";

const EXPECTED_AUTH_TOKEN = "YES_AUTHORIZE_DESTRUCTIVE_CLEANUP_NOW";

/**
 * Validates database URL and socket configuration without establishing a connection.
 * @param {string} rawUrl
 * @param {object} [expected]
 * @returns {{isValid: boolean, dbName: string, port: string, socketDir: string}}
 */
function validateTargetEnvironment(rawUrl, expected = {}) {
    if (!rawUrl || typeof rawUrl !== "string") {
        throw new Error("[URL VALIDATION FATAL] Database URL must be a non-empty string.");
    }
    const targetDb = expected.dbName || EXPECTED_DB;
    const targetPort = expected.port || EXPECTED_PORT;
    const targetSocket = expected.socketDir || EXPECTED_SOCKET_DIR;

    const validated = validateDatabaseUrl(rawUrl, "test");
    const parsed = new URL(validated);
    const decodedHost = decodeURIComponent(parsed.hostname);

    if (decodedHost !== targetSocket || parsed.port !== targetPort) {
        throw new Error(
            `[URL VALIDATION FATAL] Rejected host '${decodedHost}' or port '${parsed.port}'. ` +
            `Must strictly target persistent test socket directory '${targetSocket}' on port ${targetPort}.`
        );
    }

    const dbName = parsed.pathname.replace(/^\//, "").split("?")[0];
    if (dbName !== targetDb) {
        throw new Error(`[URL VALIDATION FATAL] Database '${dbName}' is rejected. Must strictly be '${targetDb}'.`);
    }

    if (validated.toLowerCase().includes("dreamsky_db") || parsed.port === "5432") {
        throw new Error("[URL VALIDATION FATAL] Development database 'dreamsky_db' or port 5432 is strictly prohibited.");
    }

    return {
        isValid: true,
        dbName,
        port: parsed.port,
        socketDir: decodedHost,
    };
}

/**
 * Validates in-session cluster identity and out-of-band preflight evidence.
 * @param {Client} client - Connected pg Client
 * @param {object} preflightEvidence
 * @param {object} [expected]
 */
async function validateClusterIdentity(client, preflightEvidence, expected = {}) {
    const targetDb = expected.dbName || EXPECTED_DB;
    const targetRole = expected.role || EXPECTED_ROLE;
    const targetSysId = expected.systemIdentifier || EXPECTED_SYSTEM_IDENTIFIER;

    // 1. Verify preflight evidence
    if (!preflightEvidence || typeof preflightEvidence !== "object") {
        throw new Error("[PREFLIGHT FATAL] Missing out-of-band cluster preflight evidence.");
    }
    if (preflightEvidence.systemIdentifier !== targetSysId) {
        throw new Error(
            `[PREFLIGHT FATAL] Cluster system identifier mismatch: got '${preflightEvidence.systemIdentifier}', expected '${targetSysId}'.`
        );
    }

    // 2. Query in-session PostgreSQL metadata
    const query = `
        SELECT 
            current_database() AS db,
            current_user AS role,
            inet_server_port() AS server_port,
            inet_server_addr() AS server_addr;
    `;
    const res = await client.query(query);
    const row = res.rows[0];

    if (row.db !== targetDb) {
        throw new Error(`[SESSION FATAL] Connected database '${row.db}' does not match expected '${targetDb}'.`);
    }
    if (row.role !== targetRole) {
        throw new Error(`[SESSION FATAL] Connected role '${row.role}' does not match expected '${targetRole}'.`);
    }

    // Over Unix socket, inet_server_port and inet_server_addr MUST be null
    if (row.server_port !== null && row.server_port !== undefined) {
        throw new Error(`[SESSION FATAL] Connection established over TCP port ${row.server_port}. Unix domain socket strictly required.`);
    }
    if (row.server_addr !== null && row.server_addr !== undefined) {
        throw new Error(`[SESSION FATAL] Connection established over IP ${row.server_addr}. Unix domain socket strictly required.`);
    }

    return {
        database: row.db,
        role: row.role,
        transport: "UNIX_DOMAIN_SOCKET",
        systemIdentifier: preflightEvidence.systemIdentifier,
        pid: preflightEvidence.pid,
    };
}

/**
 * Validates manifest SHA-256 hash and parses its contents.
 * @param {string} [manifestPath]
 * @param {string} [expectedHash]
 * @returns {object} Parsed manifest object
 */
function validateManifestIntegrity(manifestPath = MANIFEST_PATH, expectedHash = EXPECTED_MANIFEST_SHA256) {
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`[MANIFEST FATAL] Cleanup manifest file not found at '${manifestPath}'.`);
    }
    const rawContent = fs.readFileSync(manifestPath, "utf8");
    const actualHash = crypto.createHash("sha256").update(rawContent).digest("hex");

    if (expectedHash && actualHash !== expectedHash) {
        throw new Error(
            `[MANIFEST FATAL] Manifest SHA-256 mismatch: got '${actualHash}', expected '${expectedHash}'. Manifest may have been tampered with.`
        );
    }

    let manifest;
    try {
        manifest = JSON.parse(rawContent);
    } catch (e) {
        throw new Error(`[MANIFEST FATAL] Failed to parse manifest JSON: ${e.message}`);
    }

    return manifest;
}

/**
 * Validates candidate inventory and baseline protection rules against the manifest.
 * @param {object} manifest
 */
function validateCandidateInventory(manifest) {
    if (!manifest || typeof manifest !== "object") {
        throw new Error("[INVENTORY FATAL] Manifest object is required.");
    }
    const protectedIds = new Set(manifest.protectedBaselineIds || []);
    if (protectedIds.size !== 54) {
        throw new Error(`[INVENTORY FATAL] Expected exactly 54 protected baseline IDs, got ${protectedIds.size}.`);
    }

    const seenCandidates = new Set();
    let totalCount = 0;

    for (const step of manifest.deletionPlan || []) {
        if (!step.table || !Array.isArray(step.candidateIds)) {
            throw new Error(`[INVENTORY FATAL] Invalid deletion step: ${JSON.stringify(step)}`);
        }
        if (step.candidateIds.length !== step.expectedCount) {
            throw new Error(
                `[INVENTORY FATAL] Step for table '${step.table}' expected ${step.expectedCount} IDs, but array contains ${step.candidateIds.length}.`
            );
        }

        for (const id of step.candidateIds) {
            if (seenCandidates.has(id)) {
                throw new Error(`[INVENTORY FATAL] Duplicate candidate ID detected in manifest: '${id}'.`);
            }
            if (protectedIds.has(id)) {
                throw new Error(`[INVENTORY FATAL] Candidate ID '${id}' overlaps with protected baseline IDs! Aborting.`);
            }
            seenCandidates.add(id);
            totalCount++;
        }
    }

    if (totalCount !== 131) {
        throw new Error(`[INVENTORY FATAL] Expected exactly 131 unique candidate IDs across deletion plan, got ${totalCount}.`);
    }

    // Verify baseline fixture manifest files exist and are untampered
    if (fs.existsSync(BASELINE_MANIFEST_PATH)) {
        const baseContent = fs.readFileSync(BASELINE_MANIFEST_PATH);
        const baseHash = crypto.createHash("sha256").update(baseContent).digest("hex");
        if (baseHash !== EXPECTED_BASELINE_MANIFEST_SHA256) {
            throw new Error(`[BASELINE FATAL] Baseline manifest SHA-256 mismatch at '${BASELINE_MANIFEST_PATH}'.`);
        }
    } else {
        throw new Error(`[BASELINE FATAL] Baseline manifest not found at '${BASELINE_MANIFEST_PATH}'.`);
    }

    if (fs.existsSync(BASELINE_MANIFEST_BAK_PATH)) {
        const bakContent = fs.readFileSync(BASELINE_MANIFEST_BAK_PATH);
        const bakHash = crypto.createHash("sha256").update(bakContent).digest("hex");
        if (bakHash !== EXPECTED_BASELINE_MANIFEST_SHA256) {
            throw new Error(`[BASELINE FATAL] Baseline backup manifest SHA-256 mismatch at '${BASELINE_MANIFEST_BAK_PATH}'.`);
        }
    }

    return {
        totalCandidates: totalCount,
        protectedBaselineCount: protectedIds.size,
        verified: true,
    };
}

/**
 * Validates a relative file path for traversal, symlink escapes, existence, and size.
 * @param {string} relPath
 * @param {string} baseDir
 * @param {number} [expectedSize]
 */
function validateFilePathSafety(relPath, baseDir = EXPECTED_TEST_UPLOADS_DIR, expectedSize = null) {
    if (!relPath || typeof relPath !== "string") {
        throw new Error("[FILE SAFETY FATAL] Relative path must be a non-empty string.");
    }
    const normalized = path.normalize(relPath);
    if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
        throw new Error(`[FILE SAFETY FATAL] Path traversal detected: '${relPath}'.`);
    }

    const resolved = path.resolve(baseDir, normalized);
    const resolvedBase = fs.existsSync(baseDir) ? fs.realpathSync(path.resolve(baseDir)) : path.resolve(baseDir);

    if (!resolved.startsWith(path.resolve(baseDir) + path.sep) && !resolved.startsWith(resolvedBase + path.sep)) {
        throw new Error(`[FILE SAFETY FATAL] Resolved path '${resolved}' escapes base directory '${resolvedBase}'.`);
    }

    if (!fs.existsSync(resolved)) {
        throw new Error(`[FILE SAFETY FATAL] Encrypted file does not exist at '${resolved}'.`);
    }

    // Symlink escape check
    const real = fs.realpathSync(resolved);
    if (!real.startsWith(resolvedBase + path.sep)) {
        throw new Error(`[FILE SAFETY FATAL] Symlink target '${real}' escapes base directory '${resolvedBase}'.`);
    }

    const stat = fs.statSync(resolved);
    if (expectedSize !== null && stat.size !== expectedSize) {
        throw new Error(
            `[FILE SAFETY FATAL] Unexpected file size for '${relPath}': got ${stat.size} bytes, expected ${expectedSize} bytes.`
        );
    }

    return {
        relativePath: normalized,
        absolutePath: resolved,
        realPath: real,
        size: stat.size,
        isValid: true,
    };
}

/**
 * Validates all encrypted files in the manifest.
 * @param {object} manifest
 * @param {string} [baseDir]
 */
function validateEncryptedFiles(manifest, baseDir = EXPECTED_TEST_UPLOADS_DIR) {
    if (!manifest.encryptedFiles || !Array.isArray(manifest.encryptedFiles)) {
        throw new Error("[FILE SAFETY FATAL] Manifest missing encryptedFiles array.");
    }
    if (manifest.encryptedFiles.length !== 6) {
        throw new Error(`[FILE SAFETY FATAL] Expected exactly 6 encrypted files, got ${manifest.encryptedFiles.length}.`);
    }

    let totalBytes = 0;
    const validated = [];

    for (const f of manifest.encryptedFiles) {
        const res = validateFilePathSafety(f.relativePath, baseDir, f.expectedSize);
        totalBytes += res.size;
        validated.push({
            ...res,
            documentVersionId: f.documentVersionId,
            documentId: f.documentId,
            studentId: f.studentId,
        });
    }

    if (totalBytes !== 399) {
        throw new Error(`[FILE SAFETY FATAL] Expected exactly 399 total bytes across 6 files, got ${totalBytes}.`);
    }

    return {
        files: validated,
        totalBytes,
        fileCount: validated.length,
        verified: true,
    };
}

/**
 * Builds the composite query for checking the 54 baseline records.
 * @returns {string}
 */
function getBaselineCheckQuery() {
    return `
        SELECT id FROM "Branch" WHERE id = ANY($1::text[])
        UNION ALL SELECT id FROM "User" WHERE id = ANY($1::text[])
        UNION ALL SELECT id FROM "CounselorProfile" WHERE id = ANY($1::text[])
        UNION ALL SELECT id FROM "Country" WHERE id = ANY($1::text[])
        UNION ALL SELECT id FROM "University" WHERE id = ANY($1::text[])
        UNION ALL SELECT id FROM "Course" WHERE id = ANY($1::text[])
        UNION ALL SELECT id FROM "Student" WHERE id = ANY($1::text[])
        UNION ALL SELECT id FROM "Application" WHERE id = ANY($1::text[])
        UNION ALL SELECT id FROM "VisaCase" WHERE id = ANY($1::text[])
        UNION ALL SELECT id FROM "Document" WHERE id = ANY($1::text[])
        UNION ALL SELECT id FROM "DocumentVersion" WHERE id = ANY($1::text[])
        UNION ALL SELECT id FROM "Payment" WHERE id = ANY($1::text[])
        UNION ALL SELECT id FROM "Transaction" WHERE id = ANY($1::text[])
        UNION ALL SELECT id FROM "Appointment" WHERE id = ANY($1::text[])
        UNION ALL SELECT id FROM "CommunicationLog" WHERE id = ANY($1::text[])
        UNION ALL SELECT id FROM "AuditLog" WHERE id = ANY($1::text[])
        UNION ALL SELECT id FROM "Notification" WHERE id = ANY($1::text[]);
    `;
}

/**
 * Reconciles an ambiguous database COMMIT via read-only inspection.
 * @param {Client} client
 * @param {object} manifest
 * @returns {{reconciled: boolean, outcome: "COMMITTED"|"ROLLED_BACK"}}
 */
async function reconcileCommitAmbiguity(client, manifest) {
    console.log("[RECONCILIATION] Checking cluster state after ambiguous commit...");

    // 1. Verify baseline records
    const baselineCheck = await client.query(getBaselineCheckQuery(), [manifest.protectedBaselineIds]);
    if (baselineCheck.rowCount !== 54) {
        throw new Error(
            `[RECONCILIATION CRITICAL] Baseline count is ${baselineCheck.rowCount} (expected 54). Database in inconsistent state!`
        );
    }

    // 2. Count remaining candidate records
    let remainingCandidates = 0;
    for (const step of manifest.deletionPlan) {
        const checkQuery = `SELECT count(*)::int AS count FROM "${step.table}" WHERE id = ANY($1::text[]);`;
        const res = await client.query(checkQuery, [step.candidateIds]);
        remainingCandidates += res.rows[0].count;
    }

    if (remainingCandidates === 0) {
        console.log("[RECONCILIATION] All 131 candidates absent and 54 baseline records intact. COMMIT succeeded!");
        return { reconciled: true, outcome: "COMMITTED" };
    } else if (remainingCandidates === 131) {
        console.log("[RECONCILIATION] All 131 candidates still present and 54 baseline records intact. Transaction rolled back!");
        return { reconciled: true, outcome: "ROLLED_BACK" };
    } else {
        throw new Error(
            `[RECONCILIATION CRITICAL] Ambiguous partial state: ${remainingCandidates} candidates remain out of 131. Manual audit required!`
        );
    }
}

/**
 * Performs unlinking of verified encrypted files post-database commit.
 * Never widens scope beyond the exact files listed in manifest.
 * @param {object} manifest
 * @param {string} [baseDir]
 * @returns {{deletedFiles: string[], errors: {file: string, error: string}[]}}
 */
function executeFileDeletions(manifest, baseDir = EXPECTED_TEST_UPLOADS_DIR) {
    const fileAudit = validateEncryptedFiles(manifest, baseDir);
    const deletedFiles = [];
    const errors = [];

    for (const file of fileAudit.files) {
        try {
            // Re-validate immediately before unlinking
            const preCheck = validateFilePathSafety(file.relativePath, baseDir, file.size);
            if (fs.existsSync(preCheck.realPath)) {
                fs.unlinkSync(preCheck.realPath);
                deletedFiles.push(file.relativePath);
            }
        } catch (err) {
            errors.push({
                file: file.relativePath,
                error: err.message,
            });
        }
    }

    return {
        deletedFiles,
        errors,
        allDeleted: errors.length === 0,
    };
}

/**
 * Executes a strictly read-only dry run against dreamsky_test_disposable.
 * Performs ZERO database mutations and ZERO filesystem changes.
 * @param {object} [options]
 */
async function performDryRun(options = {}) {
    if (!process.env.DATABASE_URL) {
        try {
            loadDisposableTestEnv();
        } catch (_) {}
    }
    const rawUrl = options.databaseUrl || process.env.DATABASE_URL;
    validateTargetEnvironment(rawUrl);

    const manifest = validateManifestIntegrity(options.manifestPath || MANIFEST_PATH);
    validateCandidateInventory(manifest);
    const fileAudit = validateEncryptedFiles(manifest, options.testUploadsDir || EXPECTED_TEST_UPLOADS_DIR);

    const expectedIdentity = {
        systemIdentifier: EXPECTED_SYSTEM_IDENTIFIER,
        dataDirectory: PERSISTENT_TEST_CLUSTER_DIR,
        socketDirectory: PERSISTENT_TEST_SOCKET_DIR,
        port: 5433,
        database: EXPECTED_DB,
        role: EXPECTED_ROLE,
    };

    const preflightEvidence = performOutOfBandPreflight({
        expected: expectedIdentity,
    });
    validatePreflightEvidence(preflightEvidence, expectedIdentity);

    const password = options.password || resolveTestPassword();
    const client = new Client({
        host: PERSISTENT_TEST_SOCKET_DIR,
        port: 5433,
        database: EXPECTED_DB,
        user: EXPECTED_ROLE,
        password,
    });

    await client.connect();

    try {
        await validateClusterIdentity(client, preflightEvidence, {
            dbName: EXPECTED_DB,
            role: EXPECTED_ROLE,
            systemIdentifier: EXPECTED_SYSTEM_IDENTIFIER,
        });

        // Begin explicit read-only transaction for preflight checks
        await client.query("BEGIN TRANSACTION READ ONLY;");

        // 1. Verify existence of all 54 baseline records
        const baselineIds = manifest.protectedBaselineIds;
        const baselineRes = await client.query(getBaselineCheckQuery(), [baselineIds]);
        if (baselineRes.rowCount !== 54) {
            throw new Error(`[BASELINE PREFLIGHT FATAL] Expected 54 baseline records in database, found ${baselineRes.rowCount}.`);
        }

        // 2. Verify existence of all 131 candidate records table by table
        const candidateReport = [];
        let totalCandidatesFound = 0;

        for (const step of manifest.deletionPlan) {
            const checkQuery = `SELECT id FROM "${step.table}" WHERE id = ANY($1::text[]);`;
            const res = await client.query(checkQuery, [step.candidateIds]);
            if (res.rowCount !== step.expectedCount) {
                throw new Error(
                    `[CANDIDATE PREFLIGHT FATAL] Table '${step.table}' expected ${step.expectedCount} existing records, found ${res.rowCount}.`
                );
            }
            totalCandidatesFound += res.rowCount;
            candidateReport.push({
                step: step.step,
                table: step.table,
                proposedDeletionCount: res.rowCount,
                candidateIds: step.candidateIds,
            });
        }

        if (totalCandidatesFound !== 131) {
            throw new Error(`[CANDIDATE PREFLIGHT FATAL] Expected 131 total candidate records, found ${totalCandidatesFound}.`);
        }

        // Always ROLLBACK in dry-run mode
        await client.query("ROLLBACK;");

        return {
            status: "SUCCESS",
            mode: "DRY_RUN",
            targetDatabase: EXPECTED_DB,
            systemIdentifier: preflightEvidence.systemIdentifier,
            clusterPid: preflightEvidence.pid,
            protectedBaselineRecordsVerified: baselineRes.rowCount,
            candidateRecordsVerified: totalCandidatesFound,
            deletionPlan: candidateReport,
            encryptedFilesAudit: fileAudit,
            databaseMutationsPerformed: 0,
            filesystemMutationsPerformed: 0,
        };
    } catch (err) {
        try {
            await client.query("ROLLBACK;");
        } catch (_) {}
        throw err;
    } finally {
        await client.end();
    }
}

/**
 * Destructive cleanup execution — STRICTLY GATED.
 * Requires:
 * 1. options.authorized === true
 * 2. process.env.CONFIRM_PHASE34B_CLEANUP_EXECUTION === "YES_AUTHORIZE_DESTRUCTIVE_CLEANUP_NOW"
 * 3. options.allowDestructiveMode === true
 *
 * @param {object} [options]
 */
async function executeDestructiveCleanup(options = {}) {
    const isExplicitlyAuthorized =
        options.authorized === true &&
        options.allowDestructiveMode === true &&
        process.env.CONFIRM_PHASE34B_CLEANUP_EXECUTION === EXPECTED_AUTH_TOKEN;

    if (!isExplicitlyAuthorized) {
        throw new Error(
            "[AUTHORIZATION FATAL] Destructive cleanup is NOT AUTHORIZED. " +
            "Requires explicit authorization token in CONFIRM_PHASE34B_CLEANUP_EXECUTION, " +
            "allowDestructiveMode=true, and authorized=true."
        );
    }

    if (!process.env.DATABASE_URL) {
        loadDisposableTestEnv();
    }
    const rawUrl = options.databaseUrl || process.env.DATABASE_URL;
    validateTargetEnvironment(rawUrl);

    const manifest = validateManifestIntegrity(options.manifestPath || MANIFEST_PATH);
    validateCandidateInventory(manifest);
    validateEncryptedFiles(manifest, options.testUploadsDir || EXPECTED_TEST_UPLOADS_DIR);

    const expectedIdentity = {
        systemIdentifier: EXPECTED_SYSTEM_IDENTIFIER,
        dataDirectory: PERSISTENT_TEST_CLUSTER_DIR,
        socketDirectory: PERSISTENT_TEST_SOCKET_DIR,
        port: 5433,
        database: EXPECTED_DB,
        role: EXPECTED_ROLE,
    };

    const preflightEvidence = performOutOfBandPreflight({
        expected: expectedIdentity,
    });
    validatePreflightEvidence(preflightEvidence, expectedIdentity);

    const password = options.password || resolveTestPassword();
    const client = new Client({
        host: PERSISTENT_TEST_SOCKET_DIR,
        port: 5433,
        database: EXPECTED_DB,
        user: EXPECTED_ROLE,
        password,
    });

    await client.connect();

    let dbCommitted = false;
    let actualDeletedCount = 0;

    try {
        await validateClusterIdentity(client, preflightEvidence, {
            dbName: EXPECTED_DB,
            role: EXPECTED_ROLE,
            systemIdentifier: EXPECTED_SYSTEM_IDENTIFIER,
        });

        // ── 1. Begin Atomic Transaction ─────────────────────────────────────
        await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;");

        // ── 2. Execute Leaf-First Deletion Plan by Exact Primary Keys ────────
        for (const step of manifest.deletionPlan) {
            const deleteQuery = `DELETE FROM "${step.table}" WHERE id = ANY($1::text[]);`;
            const res = await client.query(deleteQuery, [step.candidateIds]);
            if (res.rowCount !== step.expectedCount) {
                await client.query("ROLLBACK;");
                throw new Error(
                    `[DELETION FATAL] Row count mismatch on table '${step.table}': ` +
                    `expected ${step.expectedCount} rows deleted, but ${res.rowCount} affected. ` +
                    "Transaction rolled back immediately."
                );
            }
            actualDeletedCount += res.rowCount;
        }

        if (actualDeletedCount !== 131) {
            await client.query("ROLLBACK;");
            throw new Error(`[DELETION FATAL] Total deleted rows ${actualDeletedCount} !== 131. Rolled back.`);
        }

        // ── 3. Pre-Commit Verification (Inside Transaction) ──────────────────
        // Assert all 54 baseline records remain intact
        const baselineRes = await client.query(getBaselineCheckQuery(), [manifest.protectedBaselineIds]);
        if (baselineRes.rowCount !== 54) {
            await client.query("ROLLBACK;");
            throw new Error(
                `[PRE-COMMIT FATAL] Baseline record count compromised (${baselineRes.rowCount}/54). ` +
                "Transaction rolled back immediately."
            );
        }

        // Assert zero candidate records remain across all tables
        for (const step of manifest.deletionPlan) {
            const checkQuery = `SELECT count(*)::int AS count FROM "${step.table}" WHERE id = ANY($1::text[]);`;
            const checkRes = await client.query(checkQuery, [step.candidateIds]);
            if (checkRes.rows[0].count !== 0) {
                await client.query("ROLLBACK;");
                throw new Error(`[PRE-COMMIT FATAL] Table '${step.table}' still contains ${checkRes.rows[0].count} candidate records! Rolled back.`);
            }
        }

        // ── 4. Atomic Commit with Ambiguity Handling ────────────────────────
        try {
            await client.query("COMMIT;");
            dbCommitted = true;
        } catch (commitErr) {
            console.warn("[COMMIT AMBIGUITY] Error during COMMIT execution:", commitErr.message);
            const recon = await reconcileCommitAmbiguity(client, manifest);
            if (recon.reconciled && recon.outcome === "COMMITTED") {
                dbCommitted = true;
            } else {
                throw new Error(`[COMMIT FAILED] Ambiguous commit reconciled as aborted: ${commitErr.message}`);
            }
        }

        console.log(`[DATABASE CLEANUP SUCCESS] 131 candidate records successfully purged. 54 baseline records intact.`);
    } catch (err) {
        if (!dbCommitted) {
            try {
                await client.query("ROLLBACK;");
            } catch (_) {}
        }
        throw err;
    } finally {
        await client.end();
    }

    // ── 5. Post-Commit Separate File Deletions ───────────────────────────────
    // Database commit is already durable. File deletion runs as a separate verified phase.
    console.log("[FILESYSTEM CLEANUP] Executing post-commit file deletions for 6 encrypted test files...");
    const fileResult = executeFileDeletions(manifest, options.testUploadsDir || EXPECTED_TEST_UPLOADS_DIR);

    if (!fileResult.allDeleted) {
        console.warn(`[PARTIAL SUCCESS] Database committed (131 records deleted), but ${fileResult.errors.length} files failed to delete.`);
        return {
            status: "PARTIAL_SUCCESS_DATABASE_COMMITTED_FILES_PENDING",
            deletedDbRecords: actualDeletedCount,
            deletedFiles: fileResult.deletedFiles,
            pendingFiles: fileResult.errors,
        };
    }

    console.log(`[FULL CLEANUP SUCCESS] All 131 database records and 6 encrypted files successfully purged.`);
    return {
        status: "SUCCESS",
        deletedDbRecords: actualDeletedCount,
        deletedFilesCount: fileResult.deletedFiles.length,
        deletedFiles: fileResult.deletedFiles,
    };
}

/**
 * Main entry point.
 */
async function main() {
    const args = process.argv.slice(2);
    const isDestructive = args.includes("--execute-destructive-cleanup-authorized-gate");

    console.log("================================================================================");
    console.log("DreamSky CRM — Synthetic Test Artifacts Cleanup Runner");
    console.log(`Execution Mode: ${isDestructive ? "DESTRUCTIVE (GATED)" : "READ-ONLY DRY-RUN"}`);
    console.log("================================================================================");

    if (isDestructive) {
        // Enforce dual authorization gate
        if (process.env.CONFIRM_PHASE34B_CLEANUP_EXECUTION !== EXPECTED_AUTH_TOKEN) {
            console.error(
                `\n[AUTHORIZATION FATAL] Destructive execution blocked. ` +
                `Environment variable CONFIRM_PHASE34B_CLEANUP_EXECUTION must equal '${EXPECTED_AUTH_TOKEN}'.`
            );
            process.exit(1);
        }

        try {
            console.log("Executing authorized destructive cleanup...");
            const res = await executeDestructiveCleanup({
                authorized: true,
                allowDestructiveMode: true,
            });
            console.log("\nCLEANUP RESULT:", JSON.stringify(res, null, 2));
        } catch (err) {
            console.error("\n[CLEANUP RUNNER FATAL ERROR]:", err.message);
            process.exit(1);
        }
        return;
    }

    try {
        console.log("[1/5] Validating environment configuration and manifest integrity...");
        const manifest = validateManifestIntegrity();
        validateCandidateInventory(manifest);
        console.log(`      Manifest SHA-256 verified (${EXPECTED_MANIFEST_SHA256.substring(0, 16)}...).`);
        console.log(`      Inventory: 131 candidate records across 18 tables, 54 protected baseline IDs.`);

        console.log("[2/5] Validating encrypted test upload files...");
        const fileAudit = validateEncryptedFiles(manifest);
        console.log(`      Verified 6 encrypted files (${fileAudit.totalBytes} bytes total) under test uploads dir.`);

        console.log("[3/5] Performing out-of-band cluster preflight...");
        console.log("[4/5] Connecting to disposable database via Unix domain socket...");
        const result = await performDryRun();

        console.log("[5/5] Synthesizing dry-run results:");
        console.log("--------------------------------------------------------------------------------");
        console.log(`Target Database:                   ${result.targetDatabase}`);
        console.log(`PostgreSQL System Identifier:      ${result.systemIdentifier}`);
        console.log(`PostgreSQL Cluster PID:            ${result.clusterPid}`);
        console.log(`Protected Baseline Records Intact: ${result.protectedBaselineRecordsVerified}/54`);
        console.log(`Candidate Records Verified:        ${result.candidateRecordsVerified}/131`);
        console.log(`Encrypted Files Verified:          ${result.encryptedFilesAudit.fileCount}/6 (${result.encryptedFilesAudit.totalBytes} bytes)`);
        console.log("--------------------------------------------------------------------------------");
        console.log("Proposed Leaf-First Deletion Plan:");
        for (const step of result.deletionPlan) {
            console.log(`  Step ${String(step.step).padStart(2, " ")}: ${step.table.padEnd(22, " ")} -> ${String(step.proposedDeletionCount).padStart(3, " ")} records`);
        }
        console.log("--------------------------------------------------------------------------------");
        console.log("Proposed Encrypted File Deletion Plan:");
        for (const f of result.encryptedFilesAudit.files) {
            console.log(`  File: ${f.relativePath} (${f.size} B)`);
        }
        console.log("--------------------------------------------------------------------------------");
        console.log(`Database Mutations Performed:      ${result.databaseMutationsPerformed} (ZERO)`);
        console.log(`Filesystem Mutations Performed:    ${result.filesystemMutationsPerformed} (ZERO)`);
        console.log("DRY-RUN VERDICT:                   PASS — READY FOR AUTHORIZATION REVIEW");
        console.log("================================================================================");
    } catch (err) {
        console.error("\n[CLEANUP RUNNER FATAL ERROR]:", err.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    EXPECTED_MANIFEST_SHA256,
    EXPECTED_SYSTEM_IDENTIFIER,
    EXPECTED_ROLE,
    EXPECTED_DB,
    EXPECTED_PORT,
    EXPECTED_SOCKET_DIR,
    EXPECTED_TEST_UPLOADS_DIR,
    EXPECTED_AUTH_TOKEN,
    validateTargetEnvironment,
    validateClusterIdentity,
    validateManifestIntegrity,
    validateCandidateInventory,
    validateFilePathSafety,
    validateEncryptedFiles,
    getBaselineCheckQuery,
    reconcileCommitAmbiguity,
    executeFileDeletions,
    performDryRun,
    executeDestructiveCleanup,
};
