/**
 * seed-disposable-fixtures.js — Deterministic Synthetic Fixture Seeder
 *
 * Dedicated fixture provisioning for backend integration testing against the
 * isolated disposable PostgreSQL database (port 5433 / dreamsky_test_disposable).
 *
 * SAFETY RESTRICTIONS:
 * - Uses centralized Prisma client and fail-closed disposable target guards.
 * - Enforces ALLOW_INTEGRATION_TEST_DB=true and ALLOW_DESTRUCTIVE_OPERATIONS=true.
 * - Creates strictly synthetic records prefixed with 'test-syn-'.
 * - Uses strictly '@example.com' domains to trigger email suppression.
 * - Writes a durable PREPARING intent manifest before any database writes.
 * - Uses atomic rename to update manifest post-commit.
 * - Preserves intent manifest if post-commit manifest update fails.
 * - Refuses to seed if any manifest or conflicting temp artifact exists.
 * - Never imports or calls the production auto-seeder.
 */

require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH || ".env.test.disposable", override: false });
const {
    assertDisposableTarget,
    validateDatabaseUrl,
    PERSISTENT_TEST_CLUSTER_DIR,
    PERSISTENT_TEST_SOCKET_DIR,
} = require("../src/config");

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const child_process = require("child_process");

const MANIFEST_PATH = path.resolve(__dirname, "../.disposable-fixture-manifest.json");
const MANIFEST_TMP_PATH = path.resolve(__dirname, "../.disposable-fixture-manifest.json.tmp");

/**
 * Expected reference identity for the verified disposable PostgreSQL cluster.
 * Cross-checked with .disposable-cluster-ref.json.
 *
 * System identifier is explicitly pending until replacement cluster initialization is authorized and executed.
 */
const EXPECTED_CLUSTER_IDENTITY = {
    systemIdentifier: process.env.DISPOSABLE_CLUSTER_SYSTEM_IDENTIFIER || "PENDING_INITIALIZATION",
    dataDirectory: PERSISTENT_TEST_CLUSTER_DIR,
    socketDirectory: PERSISTENT_TEST_SOCKET_DIR,
    port: 5433,
    database: "dreamsky_test_disposable",
    role: "dreamsky_test_user",
};

/**
 * Validates that the database URL strictly targets the verified Unix domain socket
 * for the disposable test cluster. Explicitly rejects TCP connections, fallback hosts,
 * wrong socket directories, wrong databases, and wrong roles.
 *
 * @param {string|undefined} [rawUrl] - Defaults to process.env.DATABASE_URL
 * @param {object} [expected] - Expected cluster reference
 * @returns {string} The validated URL
 */
function validateSeederDatabaseUrl(rawUrl, expected = EXPECTED_CLUSTER_IDENTITY) {
    const activeUrl = rawUrl !== undefined ? rawUrl : process.env.DATABASE_URL;
    if (!activeUrl || typeof activeUrl !== "string" || !activeUrl.trim()) {
        throw new Error("[SEEDER CONNECTION ERROR] DATABASE_URL is required for disposable fixture seeder.");
    }

    const trimmedUrl = activeUrl.trim();
    let parsed;
    try {
        parsed = new URL(trimmedUrl);
    } catch {
        throw new Error("[SEEDER CONNECTION ERROR] DATABASE_URL is not a valid URL.");
    }

    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
        throw new Error(`[SEEDER CONNECTION ERROR] Invalid protocol '${parsed.protocol}'. Only PostgreSQL is supported.`);
    }

    // Explicitly reject TCP connections for the disposable seeder
    const rawHostname = parsed.hostname.toLowerCase();
    if (rawHostname === "127.0.0.1" || rawHostname === "localhost") {
        throw new Error(
            `[SEEDER CONNECTION ERROR] TCP connection to '${rawHostname}' is rejected. ` +
            `The disposable seeder strictly requires the Unix domain socket at '${expected.socketDirectory}'. ` +
            "TCP fallback is forbidden."
        );
    }

    // Verify exact socket directory
    const decodedHost = decodeURIComponent(parsed.hostname);
    if (decodedHost !== expected.socketDirectory) {
        throw new Error(
            `[SEEDER CONNECTION ERROR] Socket directory '${decodedHost}' is rejected. ` +
            `The disposable seeder strictly requires '${expected.socketDirectory}'.`
        );
    }

    // Verify exact port (5433)
    if (!parsed.port) {
        throw new Error(
            `[SEEDER CONNECTION ERROR] Disposable seeder must explicitly specify port ${expected.port}.`
        );
    }
    if (String(parsed.port) !== String(expected.port)) {
        throw new Error(
            `[SEEDER CONNECTION ERROR] Port '${parsed.port}' is rejected. Expected '${expected.port}'.`
        );
    }

    // Verify exact database name
    const rawPath = parsed.pathname.replace(/^\//, "");
    const dbName = rawPath.split("?")[0];
    if (dbName !== expected.database) {
        throw new Error(
            `[SEEDER CONNECTION ERROR] Database '${dbName}' is rejected. Expected '${expected.database}'.`
        );
    }

    // Verify exact role
    if (parsed.username !== expected.role) {
        throw new Error(
            `[SEEDER CONNECTION ERROR] Database user '${parsed.username}' is rejected. Expected '${expected.role}'.`
        );
    }

    // Rejection of dangerous connection parameter overrides in query string
    if (parsed.searchParams.has("host") || parsed.searchParams.has("port")) {
        throw new Error(
            "[SEEDER CONNECTION ERROR] Dangerous connection parameter overrides ('host' or 'port') are forbidden in seeder URL."
        );
    }

    return trimmedUrl;
}

/**
 * Constructs a PrismaClient configured strictly for the validated Unix domain socket.
 * Fails closed before any connection is attempted if URL validation fails.
 *
 * @param {string} [databaseUrl]
 * @returns {object} PrismaClient instance
 */
function createSeederPrismaClient(databaseUrl) {
    const validatedUrl = validateSeederDatabaseUrl(databaseUrl);
    const { Pool } = require("pg");
    const { PrismaPg } = require("@prisma/adapter-pg");
    const { PrismaClient } = require("@prisma/client");

    const pool = new Pool({
        connectionString: validatedUrl,
        ssl: false,
    });

    const adapter = new PrismaPg(pool);
    return new PrismaClient({
        adapter,
        log: ["error"],
    });
}

/**
 * Fetches identity evidence from the connected PostgreSQL instance using read-only checks.
 *
 * @param {object} prismaOrClient - Prisma client or pg query client
 * @returns {Promise<object>}
 */
async function fetchClusterIdentity(prismaOrClient) {
    if (!prismaOrClient) {
        throw new Error("[CLUSTER IDENTITY ERROR] No database client provided to fetchClusterIdentity.");
    }

    // 1. Connection metadata (always accessible to all unprivileged roles)
    let connectionMeta = {};
    if (typeof prismaOrClient.$queryRawUnsafe === "function") {
        const rows = await prismaOrClient.$queryRawUnsafe(`
            SELECT 
                current_database() AS db_name,
                current_user AS role_name,
                inet_server_port() AS server_port,
                inet_server_addr()::text AS server_addr
        `);
        connectionMeta = rows[0] || {};
    } else if (typeof prismaOrClient.query === "function") {
        const res = await prismaOrClient.query(`
            SELECT 
                current_database() AS db_name,
                current_user AS role_name,
                inet_server_port() AS server_port,
                inet_server_addr()::text AS server_addr
        `);
        connectionMeta = res.rows ? res.rows[0] : (res[0] || {});
    }

    const database = connectionMeta.db_name;
    const role = connectionMeta.role_name;
    const port = connectionMeta.server_port;
    const serverAddr = connectionMeta.server_addr;

    // 2. Physical cluster system identifier (restricted in PostgreSQL 16)
    let systemIdentifier = null;
    let systemIdentifierError = null;
    try {
        if (typeof prismaOrClient.$queryRawUnsafe === "function") {
            const rows = await prismaOrClient.$queryRawUnsafe(`SELECT system_identifier::text AS sys_id FROM pg_control_system()`);
            systemIdentifier = rows[0] ? rows[0].sys_id : null;
        } else if (typeof prismaOrClient.query === "function") {
            const res = await prismaOrClient.query(`SELECT system_identifier::text AS sys_id FROM pg_control_system()`);
            const row = res.rows ? res.rows[0] : (res[0] || {});
            systemIdentifier = row ? row.sys_id : null;
        }
    } catch (err) {
        systemIdentifierError = err.message;
    }

    // 3. Physical cluster data directory (restricted in PostgreSQL 16)
    let dataDirectory = null;
    let dataDirectoryError = null;
    try {
        if (typeof prismaOrClient.$queryRawUnsafe === "function") {
            const rows = await prismaOrClient.$queryRawUnsafe(`SHOW data_directory`);
            dataDirectory = rows[0] ? (rows[0].data_directory || rows[0]["data_directory"]) : null;
        } else if (typeof prismaOrClient.query === "function") {
            const res = await prismaOrClient.query(`SHOW data_directory`);
            const row = res.rows ? res.rows[0] : (res[0] || {});
            dataDirectory = row ? (row.data_directory || row["data_directory"]) : null;
        }
    } catch (err) {
        dataDirectoryError = err.message;
    }

    return {
        database,
        role,
        port: port !== null && port !== undefined ? Number(port) : null,
        serverAddr: serverAddr || null,
        systemIdentifier,
        systemIdentifierError,
        dataDirectory,
        dataDirectoryError,
    };
}

/**
 * Resolves the path to the pg_controldata binary.
 * @param {string} [explicitBin]
 * @returns {string}
 */
function resolvePgControlDataBin(explicitBin) {
    if (explicitBin && fs.existsSync(explicitBin)) return explicitBin;
    const candidates = [
        "/opt/homebrew/opt/postgresql@16/bin/pg_controldata",
        "/opt/homebrew/bin/pg_controldata",
        "/usr/local/opt/postgresql@16/bin/pg_controldata",
        "/usr/local/bin/pg_controldata",
    ];
    for (const cand of candidates) {
        if (fs.existsSync(cand)) return cand;
    }
    return "pg_controldata";
}

/**
 * Validates preflight evidence object against expected reference.
 * Rejects booleans, plain strings, partial objects, or mismatched values.
 *
 * @param {any} evidence
 * @param {object} expected
 * @returns {boolean}
 */
function validatePreflightEvidence(evidence, expected) {
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
        throw new Error("[PREFLIGHT EVIDENCE INVALID] Evidence must be a non-null object.");
    }
    if (evidence.verified !== true) {
        throw new Error("[PREFLIGHT EVIDENCE INVALID] Evidence 'verified' flag must be strictly true.");
    }
    if (evidence.source !== "OUT_OF_BAND_PREFLIGHT") {
        throw new Error(`[PREFLIGHT EVIDENCE INVALID] Unexpected evidence source '${evidence.source}'.`);
    }
    if (!expected.systemIdentifier || expected.systemIdentifier === "PENDING_INITIALIZATION") {
        throw new Error(
            "[PREFLIGHT EVIDENCE INVALID] Cluster system identifier is pending initialization and has not yet been established. " +
            "Run authorized initialization and record the verified system identifier."
        );
    }
    if (String(evidence.systemIdentifier) !== String(expected.systemIdentifier)) {
        throw new Error(
            `[PREFLIGHT EVIDENCE INVALID] System identifier '${evidence.systemIdentifier}' does not match expected '${expected.systemIdentifier}'.`
        );
    }
    if (evidence.dataDirectory !== expected.dataDirectory) {
        throw new Error(
            `[PREFLIGHT EVIDENCE INVALID] Data directory '${evidence.dataDirectory}' does not match expected '${expected.dataDirectory}'.`
        );
    }
    if (Number(evidence.port) !== Number(expected.port)) {
        throw new Error(
            `[PREFLIGHT EVIDENCE INVALID] Port '${evidence.port}' does not match expected '${expected.port}'.`
        );
    }
    if (expected.socketDirectory && evidence.socketDirectory !== expected.socketDirectory) {
        throw new Error(
            `[PREFLIGHT EVIDENCE INVALID] Socket directory '${evidence.socketDirectory}' does not match expected '${expected.socketDirectory}'.`
        );
    }
    if (typeof evidence.pid !== "number" || isNaN(evidence.pid) || evidence.pid <= 0) {
        throw new Error(`[PREFLIGHT EVIDENCE INVALID] Invalid PID '${evidence.pid}' in evidence.`);
    }
    return true;
}

/**
 * Performs out-of-band physical cluster preflight inspection.
 * Cross-checks OS process table (via lsof and ps), postmaster.pid, and pg_controldata.
 * Fails closed if any evidence is missing, conflicting, or inconsistent.
 *
 * @param {object} [options]
 * @param {object} [options.expected] - Expected cluster identity reference
 * @param {function} [options.execCommand] - Pluggable command executor: (cmd, args) => string
 * @param {function} [options.readPostmaster] - Pluggable postmaster reader: (filePath) => string
 * @param {string} [options.pgControlDataBin] - Override binary path
 * @returns {object} Validated physical cluster evidence
 */
function performOutOfBandPreflight(options = {}) {
    const expected = options.expected || EXPECTED_CLUSTER_IDENTITY;
    const execCmd = options.execCommand || ((cmd, args) => {
        return child_process.execFileSync(cmd, args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    });
    const readPostmaster = options.readPostmaster || ((p) => fs.readFileSync(p, "utf8"));

    // 1. Inspect postmaster.pid in expected dataDirectory
    const postmasterPath = path.join(expected.dataDirectory, "postmaster.pid");
    let postmasterContent;
    try {
        postmasterContent = readPostmaster(postmasterPath);
    } catch (err) {
        throw new Error(
            `[PREFLIGHT ERROR] Cannot read postmaster.pid at '${postmasterPath}': ${err.message}. ` +
            "Ensure the disposable PostgreSQL cluster is running."
        );
    }

    const lines = postmasterContent.split("\n").map((l) => l.trim());
    if (lines.length < 6) {
        throw new Error(`[PREFLIGHT ERROR] Invalid postmaster.pid at '${postmasterPath}': insufficient lines.`);
    }

    const pid = parseInt(lines[0], 10);
    const postmasterDataDir = lines[1];
    const postmasterPort = parseInt(lines[3], 10);
    const postmasterSocketDir = lines[4];

    if (!pid || isNaN(pid) || pid <= 0) {
        throw new Error(`[PREFLIGHT ERROR] Invalid PID '${lines[0]}' in postmaster.pid.`);
    }
    if (postmasterDataDir !== expected.dataDirectory) {
        throw new Error(
            `[PREFLIGHT ERROR] postmaster.pid data directory '${postmasterDataDir}' does not match expected '${expected.dataDirectory}'.`
        );
    }
    if (postmasterPort !== Number(expected.port)) {
        throw new Error(
            `[PREFLIGHT ERROR] postmaster.pid port '${postmasterPort}' does not match expected '${expected.port}'.`
        );
    }
    if (expected.socketDirectory && postmasterSocketDir !== expected.socketDirectory) {
        throw new Error(
            `[PREFLIGHT ERROR] postmaster.pid socket directory '${postmasterSocketDir}' does not match expected '${expected.socketDirectory}'.`
        );
    }

    // 2. Verify process via lsof on the expected port
    let lsofOut;
    try {
        lsofOut = execCmd("lsof", ["-nP", `-iTCP:${expected.port}`, "-sTCP:LISTEN"]);
    } catch (err) {
        throw new Error(`[PREFLIGHT ERROR] Failed to query listening TCP process on port ${expected.port}: ${err.message}`);
    }

    const rawLsofLines = lsofOut.trim().split("\n").filter(Boolean);
    const lsofLines = rawLsofLines[0] && rawLsofLines[0].toLowerCase().includes("command")
        ? rawLsofLines.slice(1)
        : rawLsofLines;
    if (lsofLines.length === 0) {
        throw new Error(`[PREFLIGHT ERROR] No listening process found on TCP port ${expected.port}.`);
    }

    const listeningPids = new Set();
    for (const line of lsofLines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
            const parsedPid = parseInt(parts[1], 10);
            if (!isNaN(parsedPid)) listeningPids.add(parsedPid);
        }
    }

    if (listeningPids.size !== 1) {
        throw new Error(
            `[PREFLIGHT ERROR] Ambiguous listeners on port ${expected.port}: expected 1 distinct PID, found [${Array.from(listeningPids).join(", ")}].`
        );
    }

    const listeningPid = Array.from(listeningPids)[0];
    if (listeningPid !== pid) {
        throw new Error(
            `[PREFLIGHT ERROR] Process listening on port ${expected.port} (PID ${listeningPid}) does not match postmaster.pid (PID ${pid}).`
        );
    }

    // 3. Inspect command-line arguments of PID
    let psOut;
    try {
        psOut = execCmd("ps", ["-ww", "-p", String(pid), "-o", "pid,command"]);
    } catch (err) {
        throw new Error(`[PREFLIGHT ERROR] Failed to inspect process arguments for PID ${pid}: ${err.message}`);
    }

    const rawPsLines = psOut.trim().split("\n").filter(Boolean);
    const psLines = rawPsLines[0] && rawPsLines[0].toLowerCase().includes("pid")
        ? rawPsLines.slice(1)
        : rawPsLines;
    if (psLines.length === 0) {
        throw new Error(`[PREFLIGHT ERROR] PID ${pid} not found in process table.`);
    }

    const processCmd = psLines[0];
    if (!processCmd.includes("postgres")) {
        throw new Error(`[PREFLIGHT ERROR] PID ${pid} is not a postgres process: '${processCmd}'.`);
    }
    if (!processCmd.includes(expected.dataDirectory)) {
        throw new Error(
            `[PREFLIGHT ERROR] Process arguments for PID ${pid} do not contain expected data directory '${expected.dataDirectory}'.`
        );
    }
    if (expected.socketDirectory && !processCmd.includes(expected.socketDirectory)) {
        throw new Error(
            `[PREFLIGHT ERROR] Process arguments for PID ${pid} do not contain expected socket directory '${expected.socketDirectory}'.`
        );
    }

    // 4. Run pg_controldata against expected dataDirectory
    const controldataBin = resolvePgControlDataBin(options.pgControlDataBin);
    let controldataOut;
    try {
        controldataOut = execCmd(controldataBin, [expected.dataDirectory]);
    } catch (err) {
        throw new Error(
            `[PREFLIGHT ERROR] Failed to execute '${controldataBin} ${expected.dataDirectory}': ${err.message}`
        );
    }

    const sysIdMatch = controldataOut.match(/Database system identifier:\s+(\d+)/);
    if (!sysIdMatch) {
        throw new Error(`[PREFLIGHT ERROR] Could not parse 'Database system identifier' from pg_controldata output.`);
    }
    const parsedSysId = sysIdMatch[1];
    if (!expected.systemIdentifier || expected.systemIdentifier === "PENDING_INITIALIZATION") {
        throw new Error(
            "[PREFLIGHT ERROR] Cluster system identifier is pending initialization and has not yet been established. " +
            "Run authorized initialization and record the verified system identifier."
        );
    }
    if (parsedSysId !== String(expected.systemIdentifier)) {
        throw new Error(
            `[PREFLIGHT ERROR] Physical cluster system identifier mismatch: observed '${parsedSysId}', expected '${expected.systemIdentifier}'.`
        );
    }

    const stateMatch = controldataOut.match(/Database cluster state:\s+([^\n\r]+)/);
    const clusterState = stateMatch ? stateMatch[1].trim() : "unknown";
    if (clusterState !== "in production" && clusterState !== "shut down") {
        throw new Error(
            `[PREFLIGHT ERROR] Invalid database cluster state '${clusterState}'. Expected 'in production' or 'shut down'.`
        );
    }

    return Object.freeze({
        verified: true,
        source: "OUT_OF_BAND_PREFLIGHT",
        systemIdentifier: parsedSysId,
        dataDirectory: postmasterDataDir,
        socketDirectory: postmasterSocketDir,
        port: postmasterPort,
        pid,
        clusterState,
        verifiedAt: new Date().toISOString(),
    });
}

/**
 * Verifies that the connected database instance matches the intended disposable cluster.
 * 
 * In-database session verification:
 * - Always verifies current_database(), current_user, and inet_server_port() (accessible to unprivileged roles).
 * 
 * Physical cluster identity:
 * - If options.preflightEvidence is provided, validates it via validatePreflightEvidence() and cross-checks with session port.
 * - If options.preflightEvidence is omitted, falls back to in-database physical queries (which fail closed for unprivileged roles).
 *
 * @param {object} prismaOrClient
 * @param {object} [expected]
 * @param {object} [options]
 * @param {object} [options.preflightEvidence]
 * @returns {Promise<{verified: boolean, clusterIdentity: object}>}
 */
async function verifyClusterIdentity(prismaOrClient, expected = EXPECTED_CLUSTER_IDENTITY, options = {}) {
    const actual = await fetchClusterIdentity(prismaOrClient);

    // 1. Verify connection database
    if (actual.database !== expected.database) {
        throw new Error(
            `[CLUSTER IDENTITY MISMATCH] Connected database '${actual.database}' does not match expected disposable database '${expected.database}'.`
        );
    }

    // 2. Verify connection role
    if (actual.role !== expected.role) {
        throw new Error(
            `[CLUSTER IDENTITY MISMATCH] Connected role '${actual.role}' does not match expected role '${expected.role}'.`
        );
    }

    // 3. Verify connection transport (Unix socket vs TCP)
    const requireUnixSocket = options.requireUnixSocket === true;
    if (requireUnixSocket) {
        // Over a Unix domain socket, PostgreSQL returns NULL for inet_server_port() and inet_server_addr().
        // If server_port or server_addr is present, the connection was established over TCP/IP, which is strictly forbidden.
        if (actual.port !== null && actual.port !== undefined) {
            throw new Error(
                `[CLUSTER IDENTITY REJECTED] Connection was established over TCP (port ${actual.port}). ` +
                `The disposable seeder strictly requires a Unix domain socket connection ('${expected.socketDirectory}'). ` +
                "TCP fallback is forbidden."
            );
        }
        if (actual.serverAddr !== null && actual.serverAddr !== undefined) {
            throw new Error(
                `[CLUSTER IDENTITY REJECTED] Connection was established over IP network (${actual.serverAddr}). ` +
                `The disposable seeder strictly requires a Unix domain socket connection ('${expected.socketDirectory}'). ` +
                "TCP fallback is forbidden."
            );
        }
    } else {
        // Fallback verification for TCP connections (e.g. legacy/testing)
        if (Number(actual.port) !== Number(expected.port)) {
            throw new Error(
                `[CLUSTER IDENTITY MISMATCH] Connected server port '${actual.port}' does not match expected disposable port '${expected.port}'.`
            );
        }
    }

    // 4. Physical cluster identity verification
    if (options.preflightEvidence) {
        // Validate the out-of-band preflight evidence object
        validatePreflightEvidence(options.preflightEvidence, expected);

        // If not connected via Unix socket, cross-check in-session port with preflight evidence port
        if (!requireUnixSocket && Number(actual.port) !== Number(options.preflightEvidence.port)) {
            throw new Error(
                `[CLUSTER IDENTITY MISMATCH] Connected session port '${actual.port}' contradicts preflight evidence port '${options.preflightEvidence.port}'.`
            );
        }

        return {
            verified: true,
            clusterIdentity: {
                database: actual.database,
                role: actual.role,
                port: actual.port,
                systemIdentifier: options.preflightEvidence.systemIdentifier,
                dataDirectory: options.preflightEvidence.dataDirectory,
                socketDirectory: options.preflightEvidence.socketDirectory,
                pid: options.preflightEvidence.pid,
                transport: requireUnixSocket ? "UNIX_DOMAIN_SOCKET" : "TCP",
                evidenceSource: "OUT_OF_BAND_PREFLIGHT",
            },
        };
    }

    // Fallback: If no preflight evidence was provided, require in-database physical evidence.
    // Fails closed if restricted in PostgreSQL (protects against assuming identity without evidence).
    if (!actual.systemIdentifier) {
        throw new Error(
            `[CLUSTER IDENTITY ERROR] Cannot verify physical cluster identity: system_identifier is unavailable from database server ` +
            `(${actual.systemIdentifierError || "no rows returned"}). ` +
            "In PostgreSQL, pg_control_system() is restricted to superuser or pg_read_all_settings. " +
            "The current test role cannot access this evidence. Refusing to seed based on port and name alone. " +
            "An out-of-band preflight evidence object must be provided."
        );
    }

    if (!actual.dataDirectory) {
        throw new Error(
            `[CLUSTER IDENTITY ERROR] Cannot verify physical cluster identity: data_directory is unavailable from database server ` +
            `(${actual.dataDirectoryError || "no rows returned"}). ` +
            "In PostgreSQL, SHOW data_directory is restricted to superuser or pg_read_all_settings. " +
            "The current test role cannot access this evidence. Refusing to seed based on port and name alone. " +
            "An out-of-band preflight evidence object must be provided."
        );
    }

    // 5. Verify system identifier match
    if (!expected.systemIdentifier || expected.systemIdentifier === "PENDING_INITIALIZATION") {
        throw new Error(
            "[CLUSTER IDENTITY MISMATCH] Cluster system identifier is pending initialization and has not yet been established. " +
            "Run authorized initialization and record the verified system identifier."
        );
    }
    if (String(actual.systemIdentifier) !== String(expected.systemIdentifier)) {
        throw new Error(
            `[CLUSTER IDENTITY MISMATCH] Connected cluster system identifier '${actual.systemIdentifier}' does not match expected '${expected.systemIdentifier}'. ` +
            "Connection does NOT target the verified disposable cluster."
        );
    }

    // 6. Verify data directory match
    if (actual.dataDirectory !== expected.dataDirectory) {
        throw new Error(
            `[CLUSTER IDENTITY MISMATCH] Connected cluster data directory '${actual.dataDirectory}' does not match expected '${expected.dataDirectory}'. ` +
            "Connection does NOT target the verified disposable cluster."
        );
    }

    return {
        verified: true,
        clusterIdentity: {
            ...actual,
            evidenceSource: "IN_DATABASE_QUERIES",
        },
    };
}

/**
 * Builds the canonical list of synthetic fixtures needed for authenticated testing.
 * Pure planning function (no database calls).
 * Uses the designated 'test-syn-r28a-' namespace across all 16 models.
 *
 * @param {object} options
 * @param {string} options.passwordHash - Pre-hashed password for test users
 * @returns {object} Fixture definitions grouped by model
 */
function buildSyntheticFixtures(options = {}) {
    const hash = options.passwordHash;
    if (!hash) {
        throw new Error("[FIXTURE ERROR] passwordHash is required to build synthetic user fixtures.");
    }

    // 1. Branches (2 distinct branches for cross-branch isolation testing)
    const branch1 = {
        id: "test-syn-r28a-br-1",
        name: "Test Synthetic Branch 1 (Alpha)",
        address: "100 Alpha St, Kathmandu",
        phone: "+977-9800000001",
        email: "branch1.syn@example.com",
        isActive: true,
    };

    const branch2 = {
        id: "test-syn-r28a-br-2",
        name: "Test Synthetic Branch 2 (Beta)",
        address: "200 Beta St, Pokhara",
        phone: "+977-9800000002",
        email: "branch2.syn@example.com",
        isActive: true,
    };

    // 2. Users (Super Admin, 2 Branch Admins, 2 Counselors)
    const adminUser = {
        id: "test-syn-r28a-usr-sa",
        email: "sa.syn@example.com",
        passwordHash: hash,
        firstName: "Synthetic",
        lastName: "SuperAdmin",
        phone: "+977-9800000011",
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        branchId: branch1.id,
        mustChangePassword: false,
    };

    const branchAdmin1 = {
        id: "test-syn-r28a-usr-ba1",
        email: "ba1.syn@example.com",
        passwordHash: hash,
        firstName: "Synthetic",
        lastName: "BranchAdmin1",
        phone: "+977-9800000012",
        role: "BRANCH_ADMIN",
        status: "ACTIVE",
        branchId: branch1.id,
        mustChangePassword: false,
    };

    const branchAdmin2 = {
        id: "test-syn-r28a-usr-ba2",
        email: "ba2.syn@example.com",
        passwordHash: hash,
        firstName: "Synthetic",
        lastName: "BranchAdmin2",
        phone: "+977-9800000013",
        role: "BRANCH_ADMIN",
        status: "ACTIVE",
        branchId: branch2.id,
        mustChangePassword: false,
    };

    const counselor1 = {
        id: "test-syn-r28a-usr-cn1",
        email: "cn1.syn@example.com",
        passwordHash: hash,
        firstName: "Synthetic",
        lastName: "Counselor1",
        phone: "+977-9800000014",
        role: "COUNSELOR",
        status: "ACTIVE",
        branchId: branch1.id,
        mustChangePassword: false,
    };

    const counselor2 = {
        id: "test-syn-r28a-usr-cn2",
        email: "cn2.syn@example.com",
        passwordHash: hash,
        firstName: "Synthetic",
        lastName: "Counselor2",
        phone: "+977-9800000015",
        role: "COUNSELOR",
        status: "ACTIVE",
        branchId: branch2.id,
        mustChangePassword: false,
    };

    // 3. Counselor Profiles (for Counselor 1 and Counselor 2)
    const counselorProfile1 = {
        id: "test-syn-r28a-prf-cn1",
        userId: counselor1.id,
        specialization: "General Overseas Studies",
        targetQuota: 10,
    };

    const counselorProfile2 = {
        id: "test-syn-r28a-prf-cn2",
        userId: counselor2.id,
        specialization: "General Overseas Studies",
        targetQuota: 10,
    };

    // 4. Country, University, Course
    const country = {
        id: "test-syn-r28a-cry-1",
        name: "Synthetic Testland Australia",
        code: "S1",
    };

    const university = {
        id: "test-syn-r28a-uni-1",
        name: "Synthetic Sydney Test University",
        countryId: country.id,
        city: "Sydney",
        website: "https://testuni1.example.com",
        isActive: true,
    };

    const course = {
        id: "test-syn-r28a-crs-1",
        universityId: university.id,
        name: "Synthetic Bachelor of Information Technology",
        level: "BACHELOR",
        fieldOfStudy: "IT_COMPUTING",
        durationMonths: 36,
        tuitionFee: 25000,
        currency: "USD",
        isActive: true,
    };

    // 5. Students (Student 1 & 2 in Branch 1, Unassigned Student, Branch 2 Student)
    // Pipeline stage verified strictly as APPLIED
    const student1 = {
        id: "test-syn-r28a-st-1",
        firstName: "SynStudent",
        lastName: "One",
        email: "st1.syn@example.com",
        phone: "+977-9800000021",
        currentStage: "APPLIED",
        assignedCounselorId: counselor1.id,
        processingType: "SELF",
        isActive: true,
    };

    const student2 = {
        id: "test-syn-r28a-st-2",
        firstName: "SynStudent",
        lastName: "Two",
        email: "st2.syn@example.com",
        phone: "+977-9800000022",
        currentStage: "APPLIED",
        assignedCounselorId: counselor1.id,
        processingType: "SELF",
        isActive: true,
    };

    const studentUnassigned = {
        id: "test-syn-r28a-st-unassigned",
        firstName: "SynStudent",
        lastName: "Unassigned",
        email: "stunassigned.syn@example.com",
        phone: "+977-9800000023",
        currentStage: "APPLIED",
        assignedCounselorId: null,
        processingType: "SELF",
        isActive: true,
    };

    const studentBranch2 = {
        id: "test-syn-r28a-st-br2",
        firstName: "SynStudent",
        lastName: "BranchTwo",
        email: "stbr2.syn@example.com",
        phone: "+977-9800000024",
        currentStage: "APPLIED",
        assignedCounselorId: counselor2.id,
        processingType: "SELF",
        isActive: false,
    };

    // 6. Pre-seeded Operational Child Records (Attached to student1)
    const application1 = {
        id: "test-syn-r28a-app-1",
        studentId: student1.id,
        universityId: university.id,
        courseId: course.id,
        status: "DRAFT",
        intake: "2026-Fall",
    };

    const visa1 = {
        id: "test-syn-r28a-visa-1",
        applicationId: application1.id,
        status: "NOT_APPLIED",
        visaType: "Student Visa 500",
    };

    const document1 = {
        id: "test-syn-r28a-doc-1",
        studentId: student1.id,
        category: "ACADEMIC",
        type: "TRANSCRIPT",
        customName: "Transcript.pdf",
        status: "UPLOADED",
        fileUrl: "synthetic://doc-1",
        originalName: "Transcript.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
        currentVersion: 1,
        uploadedById: counselor1.id,
    };

    const documentVersion1 = {
        id: "test-syn-r28a-docv-1",
        documentId: document1.id,
        versionNumber: 1,
        fileUrl: "synthetic://doc-1",
        originalName: "Transcript.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
        uploadedById: counselor1.id,
        status: "UPLOADED",
    };

    const payment1 = {
        id: "test-syn-r28a-pay-1",
        studentId: student1.id,
        feeType: "TUITION",
        totalAmount: 5000,
        currency: "USD",
        status: "PENDING",
    };

    const transaction1 = {
        id: "test-syn-r28a-tx-1",
        paymentId: payment1.id,
        amount: 5000,
        method: "BANK_TRANSFER",
        receiptNumber: "test-syn-r28a-rcpt-1",
    };

    const appointment1 = {
        id: "test-syn-r28a-apt-1",
        studentId: student1.id,
        counselorId: counselor1.id,
        datetime: new Date("2026-11-01T10:00:00.000Z"),
        type: "INITIAL_CONSULTATION",
        status: "SCHEDULED",
    };

    const communicationLog1 = {
        id: "test-syn-r28a-log-1",
        studentId: student1.id,
        authorId: counselor1.id,
        channel: "EMAIL",
        direction: "OUTBOUND",
        content: "Synthetic initial consultation communication log",
    };

    return {
        branch1,
        branch2,
        adminUser,
        branchAdmin1,
        branchAdmin2,
        counselor1,
        counselor2,
        counselorProfile1,
        counselorProfile2,
        country,
        university,
        course,
        student1,
        student2,
        studentUnassigned,
        studentBranch2,
        application1,
        visa1,
        document1,
        documentVersion1,
        payment1,
        transaction1,
        appointment1,
        communicationLog1,
    };
}

/**
 * Transforms grouped fixtures into an ordered list with explicit dependency metadata.
 * Pure planning function.
 *
 * @param {object} fixtures
 * @returns {Array<{model: string, id: string, data: object, dependsOn: Array<{model: string, id: string}>}>}
 */
function buildPlannedRecords(fixtures) {
    if (!fixtures || typeof fixtures !== "object") {
        throw new Error("[FIXTURE ERROR] Valid fixtures object required to build planned records.");
    }
    return [
        // 1. Branches
        { model: "Branch", id: fixtures.branch1.id, data: fixtures.branch1, dependsOn: [] },
        { model: "Branch", id: fixtures.branch2.id, data: fixtures.branch2, dependsOn: [] },

        // 2. Users
        { model: "User", id: fixtures.adminUser.id, data: fixtures.adminUser, dependsOn: [{ model: "Branch", id: fixtures.branch1.id }] },
        { model: "User", id: fixtures.branchAdmin1.id, data: fixtures.branchAdmin1, dependsOn: [{ model: "Branch", id: fixtures.branch1.id }] },
        { model: "User", id: fixtures.branchAdmin2.id, data: fixtures.branchAdmin2, dependsOn: [{ model: "Branch", id: fixtures.branch2.id }] },
        { model: "User", id: fixtures.counselor1.id, data: fixtures.counselor1, dependsOn: [{ model: "Branch", id: fixtures.branch1.id }] },
        { model: "User", id: fixtures.counselor2.id, data: fixtures.counselor2, dependsOn: [{ model: "Branch", id: fixtures.branch2.id }] },

        // 3. Counselor Profiles
        { model: "CounselorProfile", id: fixtures.counselorProfile1.id, data: fixtures.counselorProfile1, dependsOn: [{ model: "User", id: fixtures.counselor1.id }] },
        { model: "CounselorProfile", id: fixtures.counselorProfile2.id, data: fixtures.counselorProfile2, dependsOn: [{ model: "User", id: fixtures.counselor2.id }] },

        // 4. Country, University, Course
        { model: "Country", id: fixtures.country.id, data: fixtures.country, dependsOn: [] },
        { model: "University", id: fixtures.university.id, data: fixtures.university, dependsOn: [{ model: "Country", id: fixtures.country.id }] },
        { model: "Course", id: fixtures.course.id, data: fixtures.course, dependsOn: [{ model: "University", id: fixtures.university.id }] },

        // 5. Students
        { model: "Student", id: fixtures.student1.id, data: fixtures.student1, dependsOn: [{ model: "User", id: fixtures.counselor1.id }] },
        { model: "Student", id: fixtures.student2.id, data: fixtures.student2, dependsOn: [{ model: "User", id: fixtures.counselor1.id }] },
        { model: "Student", id: fixtures.studentUnassigned.id, data: fixtures.studentUnassigned, dependsOn: [] },
        { model: "Student", id: fixtures.studentBranch2.id, data: fixtures.studentBranch2, dependsOn: [{ model: "User", id: fixtures.counselor2.id }] },

        // 6. Pre-seeded Operational Records
        { model: "Application", id: fixtures.application1.id, data: fixtures.application1, dependsOn: [{ model: "Student", id: fixtures.student1.id }, { model: "University", id: fixtures.university.id }, { model: "Course", id: fixtures.course.id }] },
        { model: "VisaCase", id: fixtures.visa1.id, data: fixtures.visa1, dependsOn: [{ model: "Application", id: fixtures.application1.id }] },
        { model: "Document", id: fixtures.document1.id, data: fixtures.document1, dependsOn: [{ model: "Student", id: fixtures.student1.id }, { model: "User", id: fixtures.counselor1.id }] },
        { model: "DocumentVersion", id: fixtures.documentVersion1.id, data: fixtures.documentVersion1, dependsOn: [{ model: "Document", id: fixtures.document1.id }, { model: "User", id: fixtures.counselor1.id }] },
        { model: "Payment", id: fixtures.payment1.id, data: fixtures.payment1, dependsOn: [{ model: "Student", id: fixtures.student1.id }] },
        { model: "Transaction", id: fixtures.transaction1.id, data: fixtures.transaction1, dependsOn: [{ model: "Payment", id: fixtures.payment1.id }] },
        { model: "Appointment", id: fixtures.appointment1.id, data: fixtures.appointment1, dependsOn: [{ model: "Student", id: fixtures.student1.id }, { model: "User", id: fixtures.counselor1.id }] },
        { model: "CommunicationLog", id: fixtures.communicationLog1.id, data: fixtures.communicationLog1, dependsOn: [{ model: "Student", id: fixtures.student1.id }, { model: "User", id: fixtures.counselor1.id }] },
    ];
}

/**
 * Validates that all planned fixtures conform to synthetic safety standards and have valid dependencies.
 * Pure validation function (no database calls).
 *
 * @param {object} fixtures
 * @param {Array<object>} [plannedRecords]
 */
function validateFixturePlan(fixtures, plannedRecords) {
    if (!fixtures || typeof fixtures !== "object") {
        throw new Error("[FIXTURE ERROR] Invalid fixtures object provided.");
    }

    const records = plannedRecords || buildPlannedRecords(fixtures);
    const seenIds = new Set();

    for (const record of records) {
        if (!record.id || !String(record.id).startsWith("test-syn-r28a-")) {
            throw new Error(`[FIXTURE SAFETY ERROR] Record ID '${record.id}' must start with 'test-syn-r28a-'.`);
        }
        if (seenIds.has(record.id)) {
            throw new Error(`[FIXTURE SAFETY ERROR] Duplicate fixture ID '${record.id}' detected.`);
        }
        seenIds.add(record.id);

        const data = record.data || record;
        if (data.email && !data.email.endsWith("@example.com")) {
            throw new Error(`[FIXTURE SAFETY ERROR] Email '${data.email}' must use '@example.com' domain.`);
        }
    }

    // Verify all declared dependencies exist in the planned fixture set
    for (const record of records) {
        if (Array.isArray(record.dependsOn)) {
            for (const dep of record.dependsOn) {
                if (!seenIds.has(dep.id)) {
                    throw new Error(
                        `[FIXTURE DEPENDENCY ERROR] Fixture '${record.id}' depends on '${dep.id}' (${dep.model}), which is missing from planned fixtures.`
                    );
                }
            }
        }
    }

    // Verify cleanup plan does not contain deleteMany
    const cleanup = generateReverseCleanupPlan(records);
    for (const step of cleanup) {
        if (step.action !== "deleteById" || !step.id) {
            throw new Error(`[FIXTURE CLEANUP ERROR] Cleanup plan step must use targeted deleteById with an exact ID.`);
        }
    }
}

/**
 * Pre-flight validation of the filesystem environment.
 * Ensures the manifest directory exists and is writable, and no prior manifest or temp artifact exists.
 *
 * @param {string} targetManifestPath
 */
function validatePreflightFilesystem(targetManifestPath = MANIFEST_PATH) {
    const parentDir = path.dirname(path.resolve(targetManifestPath));
    if (!fs.existsSync(parentDir)) {
        throw new Error(`[SEEDER BLOCKED] Manifest parent directory does not exist: '${parentDir}'`);
    }

    try {
        fs.accessSync(parentDir, fs.constants.W_OK);
    } catch (err) {
        throw new Error(`[SEEDER BLOCKED] Manifest directory is not writable: '${parentDir}' (${err.message})`);
    }

    // Check if manifest already exists
    if (fs.existsSync(targetManifestPath)) {
        let existingStatus = "UNKNOWN";
        try {
            const content = JSON.parse(fs.readFileSync(targetManifestPath, "utf8"));
            existingStatus = content.status || "UNKNOWN";
        } catch (_) {}

        if (existingStatus === "PREPARING") {
            throw new Error(
                `[SEEDER BLOCKED - STALE INTENT MANIFEST] An existing manifest in 'PREPARING' status was found at '${targetManifestPath}'. ` +
                "A previous seeder attempt may have crashed during or after a database transaction. " +
                "Database records may exist in 'dreamsky_test_disposable'. " +
                "An authorized operator must manually inspect the disposable database and reconcile synthetic records before retrying. " +
                "Never overwrite or blindly delete this manifest."
            );
        }

        throw new Error(
            `[SEEDER BLOCKED - EXISTING MANIFEST] Existing fixture manifest found at '${targetManifestPath}' (status: ${existingStatus}). ` +
            "A previous test run has already seeded fixtures. Run a clean manual teardown before re-seeding."
        );
    }

    // Check if conflicting temp artifact exists
    const tmpPath = targetManifestPath + ".tmp";
    if (fs.existsSync(tmpPath)) {
        throw new Error(
            `[SEEDER BLOCKED - CONFLICTING TEMP ARTIFACT] Conflicting temporary file found at '${tmpPath}'. ` +
            "An authorized operator must inspect and remove any stale temp files before seeding."
        );
    }
}

/**
 * Defines the strict reverse foreign-key dependency order for future targeted cleanups.
 * @returns {string[]} Model names in reverse dependency order
 */
function getReverseDeletionOrder() {
    return [
        "AuditLog",
        "DocumentVersion",
        "Document",
        "VisaCase",
        "Application",
        "Transaction",
        "Payment",
        "Appointment",
        "CommunicationLog",
        "Student",
        "Course",
        "University",
        "Country",
        "CounselorProfile",
        "User",
        "Branch",
    ];
}

/**
 * Generates an exact, targeted reverse cleanup plan from the actual list of created fixtures.
 * Strictly uses deleteById; never uses broad deleteMany({}).
 *
 * @param {Array<{model: string, id: string}>} createdRecords
 * @returns {Array<{step: number, model: string, id: string, action: string, prismaCall: string}>}
 */
function generateReverseCleanupPlan(createdRecords = []) {
    return [...createdRecords].reverse().map((record, index) => ({
        step: index + 1,
        model: record.model,
        id: record.id,
        action: "deleteById",
        prismaCall: `prisma.${record.model.charAt(0).toLowerCase() + record.model.slice(1)}.delete({ where: { id: "${record.id}" } })`,
    }));
}

/**
 * Writes data synchronously and durably to disk using fsync.
 * Supports exclusive creation ('wx') to prevent accidental overwrites.
 *
 * @param {string} filePath
 * @param {object} data
 * @param {object} options
 * @param {boolean} options.exclusive - If true, fails if file already exists
 */
function writeDurableJson(filePath, data, { exclusive = false } = {}) {
    const flag = exclusive ? "wx" : "w";
    const fd = fs.openSync(filePath, flag, 0o600);
    try {
        const content = Buffer.from(JSON.stringify(data, null, 2) + "\n", "utf8");
        fs.writeSync(fd, content, 0, content.length);
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
}

/**
 * Constructs and writes the PREPARING intent manifest before any database writes occur.
 * Uses exclusive file creation to guarantee no existing file is overwritten.
 *
 * @param {string} targetManifestPath
 * @param {string} testRunId
 * @param {Array<object>} plannedRecords
 * @returns {object} Manifest payload
 */
function writeIntentManifest(targetManifestPath, testRunId, plannedRecords) {
    const intent = {
        testRunId,
        status: "PREPARING",
        createdAt: new Date().toISOString(),
        targetDatabase: "dreamsky_test_disposable",
        targetPort: "5433",
        cleanupPlanVersion: "1.0.0",
        fixtureCount: plannedRecords.length,
        fixtures: plannedRecords.map((r) => ({
            model: r.model,
            id: r.id,
            dependsOn: r.dependsOn || [],
        })),
        reverseDeletionOrder: getReverseDeletionOrder(),
        cleanupPlan: generateReverseCleanupPlan(plannedRecords),
    };

    writeDurableJson(targetManifestPath, intent, { exclusive: true });
    return intent;
}

/**
 * Updates a manifest safely using temporary file creation and atomic rename.
 * Guarantees the original manifest is not destroyed if the replacement preparation fails.
 *
 * @param {string} targetManifestPath
 * @param {object} payload
 */
function updateManifestAtomic(targetManifestPath, payload) {
    const tmpPath = targetManifestPath + ".tmp";
    // 1. Write replacement to temporary file with durability
    writeDurableJson(tmpPath, payload, { exclusive: false });

    // 2. Atomically rename temporary file over target
    try {
        fs.renameSync(tmpPath, targetManifestPath);
    } catch (err) {
        // Clean up temporary artifact on failure
        try {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch (_) {}
        throw err;
    }
}

/**
 * Constructs the completed fixture manifest object.
 * Contains ZERO secrets, hashes, credentials, or connection strings.
 *
 * @param {string} testRunId
 * @param {Array<{model: string, id: string, dependsOn?: Array<{model: string, id: string}>}>} createdRecords
 * @returns {object} Manifest payload
 */
function buildFixtureManifest(testRunId, createdRecords = []) {
    return {
        testRunId,
        createdAt: new Date().toISOString(),
        targetDatabase: "dreamsky_test_disposable",
        targetPort: "5433",
        status: "COMPLETED",
        fixtureCount: createdRecords.length,
        fixtures: createdRecords.map((r) => ({
            model: r.model,
            id: r.id,
            dependsOn: r.dependsOn || [],
        })),
        reverseDeletionOrder: getReverseDeletionOrder(),
        cleanupPlan: generateReverseCleanupPlan(createdRecords),
    };
}

/**
 * Constructs a fail-safe, secret-free failure report when a transaction aborts.
 * Distinguishes between expected client transaction rollback and verified DB state.
 * Never falsely claims a 0 count without independent verification.
 *
 * @param {string} testRunId
 * @param {Error} error
 * @param {Array<{model: string, id: string}>} attemptedRecords
 * @param {Array<{model: string, id: string}>} [plannedRecords]
 * @returns {object}
 */
function buildFailureReport(testRunId, error, attemptedRecords = [], plannedRecords = [], options = {}) {
    const isIdentityFailure = error && error.message && (
        error.message.includes("CLUSTER IDENTITY") ||
        error.message.includes("PREFLIGHT")
    );
    const status = isIdentityFailure ? "FAILED_CLUSTER_IDENTITY_REJECTED" : "FAILED_TRANSACTION_REJECTED";
    const transactionBehavior = options.transactionStarted || attemptedRecords.length > 0
        ? "ROLLBACK_EXPECTED_BY_CLIENT"
        : "NO_TRANSACTION_STARTED";
    const finalDatabaseRecordCount = (!options.transactionStarted && attemptedRecords.length === 0)
        ? "0"
        : "UNKNOWN";

    return {
        testRunId,
        status,
        failedAt: new Date().toISOString(),
        error: error ? error.message : "Unknown error",
        transactionBehavior,
        rollbackConfirmed: false,
        finalDatabaseRecordCount,
        attemptedRecordsCount: attemptedRecords.length,
        attemptedRecords: attemptedRecords.map((r) => ({ model: r.model, id: r.id })),
        plannedFixtures: plannedRecords.map((r) => ({
            model: r.model,
            id: r.id,
            dependsOn: r.dependsOn || [],
        })),
        reverseDeletionOrder: getReverseDeletionOrder(),
        cleanupPlan: generateReverseCleanupPlan(plannedRecords.length > 0 ? plannedRecords : attemptedRecords),
    };
}

/**
 * Resolves the test password from secure sources without hardcoding secrets in code.
 * @returns {string}
 */
function resolveTestPassword() {
    if (process.env.DISPOSABLE_TEST_PASSWORD && process.env.DISPOSABLE_TEST_PASSWORD.trim()) {
        return process.env.DISPOSABLE_TEST_PASSWORD.trim();
    }

    const appPwPath = path.join(PERSISTENT_TEST_CLUSTER_DIR, ".app_pw");
    if (fs.existsSync(appPwPath)) {
        return fs.readFileSync(appPwPath, "utf8").trim();
    }

    throw new Error(
        "[SEEDER CONFIG ERROR] No test password source found. " +
        `Set DISPOSABLE_TEST_PASSWORD in environment or ensure '${appPwPath}' exists.`
    );
}

/**
 * Main execution function.
 * Supports dependency injection via options for unit testing without database/network access.
 *
 * @param {object} [options]
 * @param {string} [options.manifestPath] - Override manifest path for isolated testing
 * @param {object} [options.prismaClient] - Inject mock Prisma client
 * @param {string} [options.password] - Inject test password
 * @param {string} [options.testRunId] - Inject test run ID
 * @param {boolean} [options.skipTargetAssert] - Skip network target assertion in tests
 * @param {boolean} [options.skipClusterIdentityCheck] - Skip identity verification in filesystem-only tests
 * @param {object} [options.clusterIdentityReference] - Override expected identity for tests
 */
async function runSeeder(options = {}) {
    const targetManifestPath = options.manifestPath || MANIFEST_PATH;

    console.log("[SEEDER] Initiating pre-flight target assertion...");

    // 1. Guard against non-disposable target before acquiring Prisma client
    if (!options.skipTargetAssert) {
        assertDisposableTarget(process.env.DATABASE_URL, process.env.ALLOW_DESTRUCTIVE_OPERATIONS);
        validateDatabaseUrl(process.env.DATABASE_URL, "test");
        validateSeederDatabaseUrl(process.env.DATABASE_URL);
    }

    // 2. Pre-flight filesystem validation (fails closed if manifest or temp artifact exists)
    validatePreflightFilesystem(targetManifestPath);

    // 3. Resolve password, plan, and validate fixtures before any DB write
    const rawPassword = options.password || resolveTestPassword();
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const fixtures = buildSyntheticFixtures({ passwordHash });
    const plannedRecords = buildPlannedRecords(fixtures);
    validateFixturePlan(fixtures, plannedRecords);

    const testRunId = options.testRunId || `syn-run-${Date.now()}`;

    // 4. Write PREPARING intent manifest before any database operations occur
    console.log(`[SEEDER] Writing intent manifest ('PREPARING') to ${targetManifestPath}...`);
    writeIntentManifest(targetManifestPath, testRunId, plannedRecords);

    let prisma = null;
    const createdRecords = [];
    let transactionStarted = false;

    try {
        // 5. Perform out-of-band physical cluster preflight before acquiring database client
        let preflightEvidence = options.preflightEvidence || null;
        const expectedIdentity = options.clusterIdentityReference || EXPECTED_CLUSTER_IDENTITY;
        if (!options.skipClusterIdentityCheck && !preflightEvidence && !options.skipOutOfBandPreflight) {
            console.log("[SEEDER] Performing out-of-band physical cluster preflight...");
            preflightEvidence = performOutOfBandPreflight({
                expected: expectedIdentity,
                execCommand: options.execCommand,
                readPostmaster: options.readPostmaster,
                pgControlDataBin: options.pgControlDataBin,
            });
        }

        // 6. Acquire database client strictly configured for Unix domain socket
        prisma = options.prismaClient || createSeederPrismaClient(process.env.DATABASE_URL);

        // 7. Verify cluster identity (in-session connection + preflight evidence validation)
        if (!options.skipClusterIdentityCheck) {
            console.log("[SEEDER] Verifying database session and cluster identity via Unix domain socket...");
            const identityResult = await verifyClusterIdentity(prisma, expectedIdentity, {
                preflightEvidence,
                requireUnixSocket: options.requireUnixSocket !== false,
            });
            console.log(
                `[SEEDER] Cluster identity verified: transport=${identityResult.clusterIdentity.transport}, ` +
                `sys_id=${identityResult.clusterIdentity.systemIdentifier}, ` +
                `dir=${identityResult.clusterIdentity.dataDirectory}, source=${identityResult.clusterIdentity.evidenceSource}`
            );
        }

        // 6. Check for existing synthetic records matching planned fixture IDs to prevent duplicate creation and collision
        const plannedIds = plannedRecords.map((r) => r.id);
        const [existingUsers, existingStudents, existingBranches] = await Promise.all([
            prisma.user.findFirst({ where: { id: { in: plannedIds } }, select: { id: true } }),
            prisma.student.findFirst({ where: { id: { in: plannedIds } }, select: { id: true } }),
            prisma.branch.findFirst({ where: { id: { in: plannedIds } }, select: { id: true } }),
        ]);

        if (existingUsers || existingStudents || existingBranches) {
            const collidedId = (existingUsers || existingStudents || existingBranches).id;
            throw new Error(
                `[SEEDER BLOCKED] Database already contains conflicting synthetic record '${collidedId}'. ` +
                "Refusing to seed duplicate fixtures. Run cleanup before re-seeding."
            );
        }

        console.log(`[SEEDER] Provisioning synthetic fixtures for test run '${testRunId}' in atomic transaction...`);

        // 7. Execute all fixture insertions inside a single Prisma interactive transaction.
        // If ANY insertion fails, PostgreSQL rolls back the entire batch automatically.
        transactionStarted = true;
        await prisma.$transaction(async (tx) => {
            // 1. Branches (Root dependency for users)
            await tx.branch.create({ data: fixtures.branch1 });
            createdRecords.push({ model: "Branch", id: fixtures.branch1.id, dependsOn: [] });

            await tx.branch.create({ data: fixtures.branch2 });
            createdRecords.push({ model: "Branch", id: fixtures.branch2.id, dependsOn: [] });

            // 2. Users (Depends on Branch)
            await tx.user.create({ data: fixtures.adminUser });
            createdRecords.push({ model: "User", id: fixtures.adminUser.id, dependsOn: [{ model: "Branch", id: fixtures.branch1.id }] });

            await tx.user.create({ data: fixtures.branchAdmin1 });
            createdRecords.push({ model: "User", id: fixtures.branchAdmin1.id, dependsOn: [{ model: "Branch", id: fixtures.branch1.id }] });

            await tx.user.create({ data: fixtures.branchAdmin2 });
            createdRecords.push({ model: "User", id: fixtures.branchAdmin2.id, dependsOn: [{ model: "Branch", id: fixtures.branch2.id }] });

            await tx.user.create({ data: fixtures.counselor1 });
            createdRecords.push({ model: "User", id: fixtures.counselor1.id, dependsOn: [{ model: "Branch", id: fixtures.branch1.id }] });

            await tx.user.create({ data: fixtures.counselor2 });
            createdRecords.push({ model: "User", id: fixtures.counselor2.id, dependsOn: [{ model: "Branch", id: fixtures.branch2.id }] });

            // 3. Counselor Profiles (Depends on Counselor Users)
            await tx.counselorProfile.create({ data: fixtures.counselorProfile1 });
            createdRecords.push({ model: "CounselorProfile", id: fixtures.counselorProfile1.id, dependsOn: [{ model: "User", id: fixtures.counselor1.id }] });

            await tx.counselorProfile.create({ data: fixtures.counselorProfile2 });
            createdRecords.push({ model: "CounselorProfile", id: fixtures.counselorProfile2.id, dependsOn: [{ model: "User", id: fixtures.counselor2.id }] });

            // 4. Country, University, Course
            await tx.country.create({ data: fixtures.country });
            createdRecords.push({ model: "Country", id: fixtures.country.id, dependsOn: [] });

            await tx.university.create({ data: fixtures.university });
            createdRecords.push({ model: "University", id: fixtures.university.id, dependsOn: [{ model: "Country", id: fixtures.country.id }] });

            await tx.course.create({ data: fixtures.course });
            createdRecords.push({ model: "Course", id: fixtures.course.id, dependsOn: [{ model: "University", id: fixtures.university.id }] });

            // 5. Students
            await tx.student.create({ data: fixtures.student1 });
            createdRecords.push({ model: "Student", id: fixtures.student1.id, dependsOn: [{ model: "User", id: fixtures.counselor1.id }] });

            await tx.student.create({ data: fixtures.student2 });
            createdRecords.push({ model: "Student", id: fixtures.student2.id, dependsOn: [{ model: "User", id: fixtures.counselor1.id }] });

            await tx.student.create({ data: fixtures.studentUnassigned });
            createdRecords.push({ model: "Student", id: fixtures.studentUnassigned.id, dependsOn: [] });

            await tx.student.create({ data: fixtures.studentBranch2 });
            createdRecords.push({ model: "Student", id: fixtures.studentBranch2.id, dependsOn: [{ model: "User", id: fixtures.counselor2.id }] });

            // 6. Pre-seeded Operational Records
            await tx.application.create({ data: fixtures.application1 });
            createdRecords.push({
                model: "Application",
                id: fixtures.application1.id,
                dependsOn: [
                    { model: "Student", id: fixtures.student1.id },
                    { model: "University", id: fixtures.university.id },
                    { model: "Course", id: fixtures.course.id },
                ],
            });

            await tx.visaCase.create({ data: fixtures.visa1 });
            createdRecords.push({
                model: "VisaCase",
                id: fixtures.visa1.id,
                dependsOn: [{ model: "Application", id: fixtures.application1.id }],
            });

            await tx.document.create({ data: fixtures.document1 });
            createdRecords.push({
                model: "Document",
                id: fixtures.document1.id,
                dependsOn: [
                    { model: "Student", id: fixtures.student1.id },
                    { model: "User", id: fixtures.counselor1.id },
                ],
            });

            await tx.documentVersion.create({ data: fixtures.documentVersion1 });
            createdRecords.push({
                model: "DocumentVersion",
                id: fixtures.documentVersion1.id,
                dependsOn: [
                    { model: "Document", id: fixtures.document1.id },
                    { model: "User", id: fixtures.counselor1.id },
                ],
            });

            await tx.payment.create({ data: fixtures.payment1 });
            createdRecords.push({
                model: "Payment",
                id: fixtures.payment1.id,
                dependsOn: [{ model: "Student", id: fixtures.student1.id }],
            });

            await tx.transaction.create({ data: fixtures.transaction1 });
            createdRecords.push({
                model: "Transaction",
                id: fixtures.transaction1.id,
                dependsOn: [{ model: "Payment", id: fixtures.payment1.id }],
            });

            await tx.appointment.create({ data: fixtures.appointment1 });
            createdRecords.push({
                model: "Appointment",
                id: fixtures.appointment1.id,
                dependsOn: [
                    { model: "Student", id: fixtures.student1.id },
                    { model: "User", id: fixtures.counselor1.id },
                ],
            });

            await tx.communicationLog.create({ data: fixtures.communicationLog1 });
            createdRecords.push({
                model: "CommunicationLog",
                id: fixtures.communicationLog1.id,
                dependsOn: [
                    { model: "Student", id: fixtures.student1.id },
                    { model: "User", id: fixtures.counselor1.id },
                ],
            });
        });

        // 6. Update manifest upon full success (only reached after transaction commits)
        const completedManifest = buildFixtureManifest(testRunId, createdRecords);
        try {
            updateManifestAtomic(targetManifestPath, completedManifest);
            console.log(`[SEEDER SUCCESS] Successfully seeded ${createdRecords.length} synthetic fixtures in 1 transaction.`);
            console.log(`[SEEDER SUCCESS] Manifest updated to COMPLETED at ${targetManifestPath}`);
            return completedManifest;
        } catch (manifestUpdateErr) {
            console.error(
                "[SEEDER CRITICAL] Database transaction committed successfully, but updating manifest to COMPLETED failed:",
                manifestUpdateErr.message
            );
            console.error(`[SEEDER CRITICAL] The original PREPARING intent manifest remains intact at '${targetManifestPath}'.`);
            console.error("[SEEDER CRITICAL] Records may be present in 'dreamsky_test_disposable' while manifest status remains PREPARING.");
            throw new Error(
                `[SEEDER CRITICAL - MANIFEST UPDATE FAILED POST-COMMIT] Database transaction committed, but updating manifest to COMPLETED failed: ${manifestUpdateErr.message}. ` +
                `Original intent manifest remains at '${targetManifestPath}' with status 'PREPARING'. Operator must manually verify and reconcile.`
            );
        }
    } catch (err) {
        // If the error was already our post-commit critical error, do not overwrite manifest
        if (err.message && err.message.includes("MANIFEST UPDATE FAILED POST-COMMIT")) {
            throw err;
        }

        console.error("[SEEDER FATAL] Error during fixture transaction:", err.message);
        // Distinguishes expected client rollback from unverified DB count.
        const failureReport = buildFailureReport(testRunId, err, createdRecords, plannedRecords, { transactionStarted });
        try {
            updateManifestAtomic(targetManifestPath, failureReport);
        } catch (manifestFailErr) {
            console.error("[SEEDER CRITICAL] Failed to record failure report to manifest:", manifestFailErr.message);
            console.error(`[SEEDER CRITICAL] Original PREPARING manifest remains intact at '${targetManifestPath}'.`);
        }
        throw err;
    } finally {
        if (prisma && typeof prisma.$disconnect === "function") {
            await prisma.$disconnect();
        }
    }
}

if (require.main === module) {
    runSeeder().catch((err) => {
        console.error("[SEEDER EXIT]", err.message);
        process.exit(1);
    });
}

module.exports = {
    EXPECTED_CLUSTER_IDENTITY,
    validateSeederDatabaseUrl,
    createSeederPrismaClient,
    fetchClusterIdentity,
    verifyClusterIdentity,
    resolvePgControlDataBin,
    performOutOfBandPreflight,
    validatePreflightEvidence,
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
    MANIFEST_PATH,
    MANIFEST_TMP_PATH,
};
