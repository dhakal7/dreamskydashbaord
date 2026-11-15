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

const EXPECTED_MIGRATIONS = Object.freeze([
    "20260801090927_init",
    "20261024_add_appointment_reminder",
    "20261024_add_notification_dedup_index",
    "20261024_add_trash_reason",
    "20261025_add_document_versioning_and_review",
    "20261102_add_failed_to_reminder_status",
    "20261113_add_lead_stage",
]);

const MAX_PREFLIGHT_EVIDENCE_AGE_MS = 60 * 1000;
const PREFLIGHT_EVIDENCE_REGISTRY = new Map();

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

    // 3. Physical cluster data directory & effective server settings (PostgreSQL 16)
    const querySetting = async (sql, colName) => {
        if (typeof prismaOrClient.$queryRawUnsafe === "function") {
            const rows = await prismaOrClient.$queryRawUnsafe(sql);
            return rows[0] ? (rows[0][colName] ?? null) : null;
        }
        if (typeof prismaOrClient.query === "function") {
            const res = await prismaOrClient.query(sql);
            const row = res.rows ? res.rows[0] : (res[0] || {});
            return row ? (row[colName] ?? null) : null;
        }
        return null;
    };

    let dataDirectory = null;
    let dataDirectoryError = null;
    try {
        dataDirectory = await querySetting("SHOW data_directory", "data_directory");
    } catch (err) {
        dataDirectoryError = err.message;
    }

    let listenAddresses = null;
    let listenAddressesError = null;
    try {
        listenAddresses = await querySetting("SHOW listen_addresses", "listen_addresses");
    } catch (err) {
        listenAddressesError = err.message;
    }

    let unixSocketDirectories = null;
    let unixSocketDirectoriesError = null;
    try {
        unixSocketDirectories = await querySetting("SHOW unix_socket_directories", "unix_socket_directories");
    } catch (err) {
        unixSocketDirectoriesError = err.message;
    }

    let serverPortSetting = null;
    let serverPortSettingError = null;
    try {
        serverPortSetting = await querySetting("SHOW port", "port");
    } catch (err) {
        serverPortSettingError = err.message;
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
        listenAddresses,
        listenAddressesError,
        unixSocketDirectories,
        unixSocketDirectoriesError,
        serverPortSetting,
        serverPortSettingError,
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

function registerPreflightEvidence(evidence, mode = "REAL") {
    const frozen = Object.freeze({ ...evidence });
    PREFLIGHT_EVIDENCE_REGISTRY.set(frozen, {
        createdAtMs: Date.now(),
        consumed: false,
        mode,
    });
    return frozen;
}

function consumePreflightEvidence(evidence, expected, { allowTestMock = false } = {}) {
    validatePreflightEvidence(evidence, expected);

    const entry = PREFLIGHT_EVIDENCE_REGISTRY.get(evidence);
    if (!entry) {
        throw new Error(
            "[PREFLIGHT EVIDENCE INVALID] Preflight evidence was not generated by performOutOfBandPreflight() in this process."
        );
    }
    if (entry.consumed) {
        throw new Error(
            "[PREFLIGHT EVIDENCE INVALID] Preflight evidence has already been consumed (single-use only)."
        );
    }
    // Consume immediately before any subsequent checks or async I/O
    entry.consumed = true;

    if (Date.now() - entry.createdAtMs > MAX_PREFLIGHT_EVIDENCE_AGE_MS) {
        throw new Error(
            "[PREFLIGHT EVIDENCE EXPIRED] Preflight evidence has expired (>60s). Re-run out-of-band preflight."
        );
    }
    if (entry.mode !== "REAL" && (!allowTestMock || require.main === module)) {
        throw new Error(
            "[PREFLIGHT EVIDENCE INVALID] Test-mocked preflight evidence is forbidden in CLI execution."
        );
    }
    return true;
}

function parsePostgresqlConfSettings(confContent) {
    const settings = {};
    for (const rawLine of String(confContent || "").split(/\r?\n/)) {
        const line = rawLine.replace(/#.*$/, "").trim();
        if (!line) continue;
        const eqIdx = line.indexOf("=");
        if (eqIdx === -1) continue;
        const key = line.slice(0, eqIdx).trim();
        let val = line.slice(eqIdx + 1).trim();
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith("\"") && val.endsWith("\""))) {
            val = val.slice(1, -1);
        }
        settings[key] = val;
    }
    return settings;
}

/**
 * Performs out-of-band physical cluster preflight inspection for a Unix-socket-only cluster.
 * Cross-checks postmaster.pid, zero TCP listeners, Unix socket ownership (lsof -U),
 * process table (ps), postgresql.conf, and pg_controldata.
 * Fails closed if any evidence is missing, conflicting, or inconsistent.
 */
function performOutOfBandPreflight(options = {}) {
    const expected = options.expected || EXPECTED_CLUSTER_IDENTITY;
    const hasMocks = Boolean(
        options.execCommand ||
        options.readPostmaster ||
        options.readConfig ||
        options.lstatSync
    );
    const execCmd = options.execCommand || ((cmd, args) => {
        return child_process.execFileSync(cmd, args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    });
    const readPostmaster = options.readPostmaster || ((p) => fs.readFileSync(p, "utf8"));
    const readConfig = options.readConfig || ((p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null));
    const statFn = options.lstatSync || ((p) => fs.lstatSync(p));

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

    // 2. Enforce zero TCP listeners on the expected port (socket-only cluster required)
    let tcpLsofOut = "";
    try {
        tcpLsofOut = execCmd("lsof", ["-nP", `-iTCP:${expected.port}`, "-sTCP:LISTEN"]);
    } catch (err) {
        // lsof exits with status 1 when no matching TCP listener exists (expected for listen_addresses = '')
        const status = err && typeof err.status === "number" ? err.status : null;
        if (status !== 1) {
            throw new Error(`[PREFLIGHT ERROR] Failed to query TCP listeners on port ${expected.port}: ${err.message}`);
        }
        tcpLsofOut = err.stdout ? String(err.stdout) : "";
    }

    const rawTcpLines = String(tcpLsofOut || "").trim().split("\n").filter(Boolean);
    const tcpLines = rawTcpLines[0] && rawTcpLines[0].toLowerCase().includes("command")
        ? rawTcpLines.slice(1)
        : rawTcpLines;
    if (tcpLines.length > 0) {
        throw new Error(
            `[PREFLIGHT ERROR] Unexpected TCP listener detected on port ${expected.port}. ` +
            "Socket-only disposable PostgreSQL cluster (listen_addresses = '') is required."
        );
    }

    // 3. Verify Unix socket file exists and belongs to the verified PostgreSQL PID
    const expectedSocketPath = path.join(expected.socketDirectory, `.s.PGSQL.${expected.port}`);
    let sockStat;
    try {
        sockStat = statFn(expectedSocketPath);
    } catch (err) {
        throw new Error(
            `[PREFLIGHT ERROR] Expected Unix socket '${expectedSocketPath}' not found: ${err.message}.`
        );
    }
    if (!sockStat || typeof sockStat.isSocket !== "function" || !sockStat.isSocket()) {
        throw new Error(`[PREFLIGHT ERROR] Path '${expectedSocketPath}' is not a Unix domain socket.`);
    }

    let unixLsofOut;
    try {
        unixLsofOut = execCmd("lsof", ["-nP", "-U", "-a", "-p", String(pid), "-F", "n"]);
    } catch (err) {
        throw new Error(`[PREFLIGHT ERROR] Failed to query Unix sockets for PID ${pid}: ${err.message}`);
    }
    const unixSocketPaths = String(unixLsofOut || "")
        .split(/\r?\n/)
        .filter((l) => l.startsWith("n"))
        .map((l) => l.slice(1).trim());
    if (!unixSocketPaths.includes(expectedSocketPath)) {
        throw new Error(
            `[PREFLIGHT ERROR] PID ${pid} does not own expected Unix socket '${expectedSocketPath}'.`
        );
    }

    // 4. Inspect command-line arguments of PID
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
    if (processCmd.includes(" -k ") && expected.socketDirectory && !processCmd.includes(expected.socketDirectory)) {
        throw new Error(
            `[PREFLIGHT ERROR] Process arguments for PID ${pid} specify -k without expected socket directory '${expected.socketDirectory}'.`
        );
    }

    // 5. Cross-check postgresql.conf if present
    const confPath = path.join(expected.dataDirectory, "postgresql.conf");
    const confContent = readConfig(confPath);
    if (confContent !== null && confContent !== undefined) {
        const confSettings = parsePostgresqlConfSettings(confContent);
        if (confSettings.listen_addresses !== undefined && confSettings.listen_addresses !== "") {
            throw new Error(
                `[PREFLIGHT ERROR] postgresql.conf listen_addresses '${confSettings.listen_addresses}' must be empty ('') for socket-only isolation.`
            );
        }
        if (confSettings.unix_socket_directories !== undefined && confSettings.unix_socket_directories !== expected.socketDirectory) {
            throw new Error(
                `[PREFLIGHT ERROR] postgresql.conf unix_socket_directories '${confSettings.unix_socket_directories}' does not match '${expected.socketDirectory}'.`
            );
        }
        if (confSettings.port !== undefined && Number(confSettings.port) !== Number(expected.port)) {
            throw new Error(
                `[PREFLIGHT ERROR] postgresql.conf port '${confSettings.port}' does not match expected '${expected.port}'.`
            );
        }
    }

    // 6. Run pg_controldata against expected dataDirectory
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

    return registerPreflightEvidence({
        verified: true,
        source: "OUT_OF_BAND_PREFLIGHT",
        transport: "UNIX_SOCKET_ONLY",
        systemIdentifier: parsedSysId,
        dataDirectory: postmasterDataDir,
        socketDirectory: postmasterSocketDir,
        socketPath: expectedSocketPath,
        port: postmasterPort,
        pid,
        clusterState,
        verifiedAt: new Date().toISOString(),
    }, hasMocks ? "TEST_MOCK" : "REAL");
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

    // 4. Effective PostgreSQL configuration settings verification (fail closed on missing permission or mismatch)
    if (options.verifyServerSettings !== false) {
        if (actual.listenAddressesError || actual.listenAddresses === null || actual.listenAddresses === undefined) {
            throw new Error(
                `[CLUSTER IDENTITY ERROR] Cannot verify effective 'listen_addresses': ${actual.listenAddressesError || "no rows returned"}.`
            );
        }
        if (String(actual.listenAddresses).trim() !== "") {
            throw new Error(
                `[CLUSTER IDENTITY REJECTED] Server 'listen_addresses' is '${actual.listenAddresses}'; expected '' (socket-only).`
            );
        }

        if (actual.serverPortSettingError || actual.serverPortSetting === null || actual.serverPortSetting === undefined) {
            throw new Error(
                `[CLUSTER IDENTITY ERROR] Cannot verify effective 'port': ${actual.serverPortSettingError || "no rows returned"}.`
            );
        }
        if (Number(actual.serverPortSetting) !== Number(expected.port)) {
            throw new Error(
                `[CLUSTER IDENTITY MISMATCH] Server 'port' setting '${actual.serverPortSetting}' does not match expected '${expected.port}'.`
            );
        }

        if (actual.unixSocketDirectoriesError || !actual.unixSocketDirectories) {
            throw new Error(
                `[CLUSTER IDENTITY ERROR] Cannot verify effective 'unix_socket_directories': ${actual.unixSocketDirectoriesError || "no rows returned"}. ` +
                "Ensure role has 'pg_read_all_settings' privilege."
            );
        }
        const activeSocketDirs = String(actual.unixSocketDirectories).split(",").map((s) => s.trim()).filter(Boolean);
        if (activeSocketDirs.length !== 1 || activeSocketDirs[0] !== expected.socketDirectory) {
            throw new Error(
                `[CLUSTER IDENTITY MISMATCH] Server 'unix_socket_directories' ('${actual.unixSocketDirectories}') does not match expected '${expected.socketDirectory}'.`
            );
        }

        if (actual.dataDirectoryError || !actual.dataDirectory) {
            throw new Error(
                `[CLUSTER IDENTITY ERROR] Cannot verify effective 'data_directory': ${actual.dataDirectoryError || "no rows returned"}. ` +
                "Ensure role has 'pg_read_all_settings' privilege."
            );
        }
        if (actual.dataDirectory !== expected.dataDirectory) {
            throw new Error(
                `[CLUSTER IDENTITY MISMATCH] Server 'data_directory' ('${actual.dataDirectory}') does not match expected '${expected.dataDirectory}'.`
            );
        }
    }

    // 5. Physical cluster identity verification
    if (options.preflightEvidence) {
        // Validate and consume single-use out-of-band preflight evidence
        consumePreflightEvidence(options.preflightEvidence, expected, {
            allowTestMock: options.allowTestMock === true,
        });

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
 * Verifies that all expected Prisma migrations are cleanly applied with no rollbacks or missing entries.
 */
async function verifyMigrationReadiness(prismaOrClient, expectedMigrations = EXPECTED_MIGRATIONS) {
    let rows;
    if (typeof prismaOrClient.$queryRawUnsafe === "function") {
        rows = await prismaOrClient.$queryRawUnsafe(`
            SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
            FROM _prisma_migrations
            ORDER BY started_at ASC
        `);
    } else if (typeof prismaOrClient.query === "function") {
        const res = await prismaOrClient.query(`
            SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
            FROM _prisma_migrations
            ORDER BY started_at ASC
        `);
        rows = res.rows || [];
    } else {
        throw new Error("[MIGRATION READINESS ERROR] Database client does not support raw queries.");
    }

    const byName = new Map();
    for (const row of rows || []) {
        if (row.rolled_back_at !== null && row.rolled_back_at !== undefined) {
            throw new Error(`[MIGRATION READINESS ERROR] Migration '${row.migration_name}' has a non-null rolled_back_at.`);
        }
        if (!row.finished_at || Number(row.applied_steps_count) < 1) {
            throw new Error(`[MIGRATION READINESS ERROR] Migration '${row.migration_name}' is incomplete.`);
        }
        byName.set(row.migration_name, row);
    }

    for (const name of expectedMigrations) {
        if (!byName.has(name)) {
            throw new Error(`[MIGRATION READINESS ERROR] Expected migration '${name}' is missing from _prisma_migrations.`);
        }
    }

    if (byName.size !== expectedMigrations.length) {
        const extras = Array.from(byName.keys()).filter((n) => !expectedMigrations.includes(n));
        throw new Error(
            `[MIGRATION READINESS ERROR] Unexpected migration history count (${byName.size} != ${expectedMigrations.length}): [${extras.join(", ")}].`
        );
    }

    return { verified: true, count: byName.size };
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
 * Validates manifest destination path components, rejects any symlinks,
 * ensures parent dir is within an approved root (/tmp or backend root),
 * and ensures destination does not already exist.
 */
function validateAndResolveManifestPath(targetPath) {
    if (!targetPath || typeof targetPath !== "string" || !path.isAbsolute(targetPath)) {
        throw new Error(`[MANIFEST PATH ERROR] Manifest path must be an absolute path. Received: '${targetPath}'.`);
    }

    const os = require("os");
    const rawBackendRoot = path.resolve(__dirname, "..");
    const backendRoot = fs.realpathSync(rawBackendRoot);
    const tmpRoot = fs.realpathSync("/tmp");
    const osTmpRoot = fs.realpathSync(os.tmpdir());
    const approvedBases = Array.from(new Set([backendRoot, tmpRoot, osTmpRoot]));
    const rawBases = Array.from(new Set([rawBackendRoot, "/tmp", os.tmpdir(), ...approvedBases]));

    const resolvedParent = path.dirname(path.resolve(targetPath));
    if (!fs.existsSync(resolvedParent)) {
        throw new Error(`[MANIFEST PATH ERROR] Manifest parent directory does not exist: '${resolvedParent}'.`);
    }

    // Walk uncanonicalized path components from matching rawBase to resolvedParent to reject symlinked directories
    const matchingRawBase = rawBases.find((base) => resolvedParent === base || resolvedParent.startsWith(base + path.sep));
    if (matchingRawBase) {
        const rawRel = path.relative(matchingRawBase, resolvedParent);
        if (rawRel) {
            let curRaw = matchingRawBase;
            for (const seg of rawRel.split(path.sep)) {
                curRaw = path.join(curRaw, seg);
                const stRaw = fs.lstatSync(curRaw);
                if (stRaw.isSymbolicLink()) {
                    throw new Error(`[MANIFEST PATH ERROR] Symlinked path component rejected: '${curRaw}'.`);
                }
            }
        }
    }

    // Canonicalize and verify parent directory is within approved roots
    const canonicalParent = fs.realpathSync(resolvedParent);
    const matchingBase = approvedBases.find((base) => canonicalParent === base || canonicalParent.startsWith(base + path.sep));
    if (!matchingBase) {
        throw new Error(
            `[MANIFEST PATH ERROR] Manifest directory '${canonicalParent}' is outside approved roots (${approvedBases.join(", ")}).`
        );
    }

    const finalPath = path.join(canonicalParent, path.basename(targetPath));
    // Reject if target path already exists (including broken symlinks)
    let targetExists = true;
    try {
        fs.lstatSync(finalPath);
    } catch (err) {
        if (err && err.code === "ENOENT") targetExists = false;
        else throw err;
    }
    if (targetExists) {
        throw new Error(`[SEEDER BLOCKED - EXISTING MANIFEST] Manifest destination already exists: '${finalPath}'.`);
    }

    return finalPath;
}

/**
 * Exclusively opens and creates the PREPARING intent manifest, retaining the open file descriptor
 * and recording its (dev, ino) so subsequent updates never overwrite an unrelated file.
 */
function openExclusiveIntentManifest(targetManifestPath, testRunId, plannedRecords) {
    const safePath = validateAndResolveManifestPath(targetManifestPath);
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

    const flags = fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0);
    const fd = fs.openSync(safePath, flags, 0o600);
    try {
        const content = Buffer.from(JSON.stringify(intent, null, 2) + "\n", "utf8");
        fs.writeSync(fd, content, 0, content.length, 0);
        fs.fsyncSync(fd);
        const st = fs.fstatSync(fd);
        return {
            fd,
            path: safePath,
            dev: st.dev,
            ino: st.ino,
            intent,
        };
    } catch (err) {
        try { fs.closeSync(fd); } catch (_) {}
        throw err;
    }
}

/**
 * Updates the manifest strictly through the retained file descriptor after verifying
 * the pathname still references the exact same (dev, ino) before AND after writing.
 * Never uses renameSync over an existing manifest.
 */
function updateManifestThroughRetainedFd(handle, payload) {
    if (!handle || typeof handle.fd !== "number") {
        throw new Error("[MANIFEST UPDATE ERROR] Invalid retained manifest file handle.");
    }

    const prePathStat = fs.lstatSync(handle.path);
    if (prePathStat.isSymbolicLink() || prePathStat.dev !== handle.dev || prePathStat.ino !== handle.ino) {
        throw new Error(
            `[MANIFEST INTEGRITY ABORT] Target pathname '${handle.path}' no longer references the original manifest (dev/ino mismatch).`
        );
    }

    const fdStat = fs.fstatSync(handle.fd);
    if (fdStat.dev !== handle.dev || fdStat.ino !== handle.ino) {
        throw new Error("[MANIFEST INTEGRITY ABORT] Retained file descriptor identity mismatch.");
    }

    const content = Buffer.from(JSON.stringify(payload, null, 2) + "\n", "utf8");
    fs.ftruncateSync(handle.fd, 0);
    fs.writeSync(handle.fd, content, 0, content.length, 0);
    fs.fsyncSync(handle.fd);

    const postPathStat = fs.lstatSync(handle.path);
    if (postPathStat.isSymbolicLink() || postPathStat.dev !== handle.dev || postPathStat.ino !== handle.ino) {
        throw new Error(
            `[MANIFEST INTEGRITY ABORT] Post-write verification failed for '${handle.path}' (dev/ino changed).`
        );
    }
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
    if (options._cliInvocation === true) {
        const forbiddenCliOptions = [
            "skipTargetAssert",
            "skipClusterIdentityCheck",
            "skipOutOfBandPreflight",
            "skipMigrationReadinessCheck",
            "verifyServerSettings",
            "preflightEvidence",
            "prismaClient",
            "execCommand",
            "readPostmaster",
            "readConfig",
            "lstatSync",
            "clusterIdentityReference",
            "allowTestMock",
        ];
        for (const key of forbiddenCliOptions) {
            if (options[key] !== undefined) {
                throw new Error(`[CLI SECURITY ERROR] Test-only option '${key}' is strictly forbidden in CLI execution.`);
            }
        }
    }

    const rawManifestPath = options.manifestPath || process.env.DISPOSABLE_FIXTURE_MANIFEST_PATH || MANIFEST_PATH;

    console.log("[SEEDER] Initiating pre-flight target assertion...");

    // 1. Guard against non-disposable target before acquiring Prisma client
    if (!options.skipTargetAssert) {
        assertDisposableTarget(process.env.DATABASE_URL, process.env.ALLOW_DESTRUCTIVE_OPERATIONS);
        validateDatabaseUrl(process.env.DATABASE_URL, "test");
        validateSeederDatabaseUrl(process.env.DATABASE_URL);
    }

    // 2. Pre-flight filesystem & path security validation (fails closed if manifest, symlink, or temp artifact exists)
    validatePreflightFilesystem(rawManifestPath);
    const targetManifestPath = validateAndResolveManifestPath(rawManifestPath);

    // 3. Resolve password, plan, and validate fixtures before any DB write
    const rawPassword = options.password || resolveTestPassword();
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const fixtures = buildSyntheticFixtures({ passwordHash });
    const plannedRecords = buildPlannedRecords(fixtures);
    validateFixturePlan(fixtures, plannedRecords);

    const testRunId = options.testRunId || `syn-run-${Date.now()}`;

    let prisma = null;
    let manifestHandle = null;
    const createdRecords = [];
    let transactionStarted = false;

    try {
        // 4. Perform out-of-band physical cluster preflight BEFORE writing any PREPARING manifest or acquiring DB client
        let preflightEvidence = options.preflightEvidence || null;
        const expectedIdentity = options.clusterIdentityReference || EXPECTED_CLUSTER_IDENTITY;
        if (!options.skipClusterIdentityCheck && !preflightEvidence && !options.skipOutOfBandPreflight) {
            console.log("[SEEDER] Performing out-of-band physical cluster preflight...");
            preflightEvidence = performOutOfBandPreflight({
                expected: expectedIdentity,
                execCommand: options.execCommand,
                readPostmaster: options.readPostmaster,
                readConfig: options.readConfig,
                lstatSync: options.lstatSync,
                pgControlDataBin: options.pgControlDataBin,
            });
        }

        // 5. Acquire database client strictly configured for Unix domain socket
        prisma = options.prismaClient || createSeederPrismaClient(process.env.DATABASE_URL);

        // 6. Verify cluster identity, effective PostgreSQL settings, and all 7 Prisma migrations
        if (!options.skipClusterIdentityCheck) {
            console.log("[SEEDER] Verifying database session, effective settings, and cluster identity via Unix domain socket...");
            const identityResult = await verifyClusterIdentity(prisma, expectedIdentity, {
                preflightEvidence,
                requireUnixSocket: options.requireUnixSocket !== false,
                verifyServerSettings: options.verifyServerSettings !== false,
                allowTestMock: options.allowTestMock === true || Boolean(
                    options.execCommand || options.readPostmaster || options.readConfig || options.lstatSync
                ),
            });
            console.log(
                `[SEEDER] Cluster identity verified: transport=${identityResult.clusterIdentity.transport}, ` +
                `sys_id=${identityResult.clusterIdentity.systemIdentifier}, ` +
                `dir=${identityResult.clusterIdentity.dataDirectory}, source=${identityResult.clusterIdentity.evidenceSource}`
            );

            if (!options.skipMigrationReadinessCheck) {
                const migResult = await verifyMigrationReadiness(prisma);
                console.log(`[SEEDER] Migration readiness verified: ${migResult.count} migrations applied cleanly.`);
            }
        }

        // 7. Write PREPARING intent manifest exclusively and retain (fd, dev, ino) ONLY after preflight & identity pass
        console.log(`[SEEDER] Opening exclusive intent manifest ('PREPARING') at ${targetManifestPath}...`);
        manifestHandle = openExclusiveIntentManifest(targetManifestPath, testRunId, plannedRecords);

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

        // 6. Update manifest upon full success through the retained file descriptor (never renameSync)
        const completedManifest = buildFixtureManifest(testRunId, createdRecords);
        try {
            updateManifestThroughRetainedFd(manifestHandle, completedManifest);
            console.log(`[SEEDER SUCCESS] Successfully seeded ${createdRecords.length} synthetic fixtures in 1 transaction.`);
            console.log(`[SEEDER SUCCESS] Manifest updated to COMPLETED at ${manifestHandle.path}`);
            return completedManifest;
        } catch (manifestUpdateErr) {
            console.error(
                "[SEEDER CRITICAL] Database transaction committed successfully, but updating manifest to COMPLETED failed:",
                manifestUpdateErr.message
            );
            console.error(`[SEEDER CRITICAL] The original PREPARING intent manifest remains intact at '${manifestHandle.path}'.`);
            console.error("[SEEDER CRITICAL] Records may be present in 'dreamsky_test_disposable' while manifest status remains PREPARING.");
            throw new Error(
                `[SEEDER CRITICAL - MANIFEST UPDATE FAILED POST-COMMIT] Database transaction committed, but updating manifest to COMPLETED failed: ${manifestUpdateErr.message}. ` +
                `Original intent manifest remains at '${manifestHandle.path}' with status 'PREPARING'. Operator must manually verify and reconcile.`
            );
        }
    } catch (err) {
        // If the error was already our post-commit critical error, do not overwrite manifest
        if (err.message && err.message.includes("MANIFEST UPDATE FAILED POST-COMMIT")) {
            throw err;
        }

        console.error("[SEEDER FATAL] Error during fixture transaction:", err.message);
        // Only update manifest if PREPARING intent manifest was created (post-preflight).
        if (manifestHandle) {
            const failureReport = buildFailureReport(testRunId, err, createdRecords, plannedRecords, { transactionStarted });
            try {
                updateManifestThroughRetainedFd(manifestHandle, failureReport);
            } catch (manifestFailErr) {
                console.error("[SEEDER CRITICAL] Failed to record failure report to manifest:", manifestFailErr.message);
                console.error(`[SEEDER CRITICAL] Original PREPARING manifest remains intact at '${manifestHandle.path}'.`);
            }
        }
        throw err;
    } finally {
        if (manifestHandle && typeof manifestHandle.fd === "number") {
            try { fs.closeSync(manifestHandle.fd); } catch (_) {}
        }
        if (prisma && typeof prisma.$disconnect === "function") {
            await prisma.$disconnect();
        }
    }
}

if (require.main === module) {
    const manifestArg = process.argv.find((a) => a.startsWith("--manifest-path="));
    const cliManifestPath = manifestArg ? manifestArg.slice("--manifest-path=".length) : undefined;
    runSeeder({
        manifestPath: cliManifestPath,
        _cliInvocation: true,
    }).catch((err) => {
        console.error("[SEEDER EXIT]", err.message);
        process.exit(1);
    });
}

module.exports = {
    EXPECTED_CLUSTER_IDENTITY,
    EXPECTED_MIGRATIONS,
    MAX_PREFLIGHT_EVIDENCE_AGE_MS,
    validateSeederDatabaseUrl,
    createSeederPrismaClient,
    fetchClusterIdentity,
    verifyClusterIdentity,
    verifyMigrationReadiness,
    resolvePgControlDataBin,
    performOutOfBandPreflight,
    validatePreflightEvidence,
    consumePreflightEvidence,
    parsePostgresqlConfSettings,
    validateAndResolveManifestPath,
    openExclusiveIntentManifest,
    updateManifestThroughRetainedFd,
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
