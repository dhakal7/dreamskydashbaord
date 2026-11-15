require("dotenv").config({ override: false });

const path = require("path");
const os = require("os");

const DEFAULT_PERSISTENT_TEST_SOCKET_DIR = path.resolve(os.homedir(), ".dreamsky_sock_5433");
const DEFAULT_PERSISTENT_TEST_CLUSTER_DIR = path.resolve(os.homedir(), ".dreamsky_disposable_cluster_5433");
const CLEAN_PERSISTENT_TEST_SOCKET_DIR = "/Users/suyogdhakal/.dreamsky_sock_5433_clean";
const CLEAN_PERSISTENT_TEST_CLUSTER_DIR = "/Users/suyogdhakal/.dreamsky_disposable_cluster_5433_clean";

const APPROVED_TEST_SOCKET_DIRS = Object.freeze([
    DEFAULT_PERSISTENT_TEST_SOCKET_DIR,
    CLEAN_PERSISTENT_TEST_SOCKET_DIR,
]);

const APPROVED_TEST_CLUSTER_DIRS = Object.freeze([
    DEFAULT_PERSISTENT_TEST_CLUSTER_DIR,
    CLEAN_PERSISTENT_TEST_CLUSTER_DIR,
]);

/**
 * Resolves and validates test-only disposable cluster and socket directories.
 * Preserves original hardcoded defaults when no override is provided.
 * Rejects any override outside NODE_ENV=test and rejects any path not in the approved allowlist.
 *
 * @param {string} [env]
 * @returns {{ socketDir: string, clusterDir: string }}
 */
function resolveApprovedTestDirs(env = process.env.NODE_ENV || "development") {
    const socketOverride = process.env.PERSISTENT_TEST_SOCKET_DIR;
    const clusterOverride = process.env.PERSISTENT_TEST_CLUSTER_DIR;
    const hasSocketOverride = typeof socketOverride === "string" && socketOverride.trim().length > 0;
    const hasClusterOverride = typeof clusterOverride === "string" && clusterOverride.trim().length > 0;

    if ((hasSocketOverride || hasClusterOverride) && env !== "test") {
        throw new Error(
            `[DATABASE CONFIG ERROR] Disposable test directory overrides (PERSISTENT_TEST_SOCKET_DIR / PERSISTENT_TEST_CLUSTER_DIR) are strictly forbidden in '${env}' mode.`
        );
    }

    let socketDir = DEFAULT_PERSISTENT_TEST_SOCKET_DIR;
    if (hasSocketOverride) {
        const resolvedSocket = path.resolve(socketOverride.trim());
        if (!APPROVED_TEST_SOCKET_DIRS.includes(resolvedSocket)) {
            throw new Error(
                `[DATABASE CONFIG ERROR] Unauthorized test socket directory '${resolvedSocket}'. Only approved disposable socket directories are allowed.`
            );
        }
        socketDir = resolvedSocket;
    }

    let clusterDir = DEFAULT_PERSISTENT_TEST_CLUSTER_DIR;
    if (hasClusterOverride) {
        const resolvedCluster = path.resolve(clusterOverride.trim());
        if (!APPROVED_TEST_CLUSTER_DIRS.includes(resolvedCluster)) {
            throw new Error(
                `[DATABASE CONFIG ERROR] Unauthorized test cluster directory '${resolvedCluster}'. Only approved disposable cluster directories are allowed.`
            );
        }
        clusterDir = resolvedCluster;
    }

    return { socketDir, clusterDir };
}

const initialTestDirs = (process.env.NODE_ENV || "development") === "test"
    ? resolveApprovedTestDirs("test")
    : { socketDir: DEFAULT_PERSISTENT_TEST_SOCKET_DIR, clusterDir: DEFAULT_PERSISTENT_TEST_CLUSTER_DIR };

const PERSISTENT_TEST_SOCKET_DIR = initialTestDirs.socketDir;
const PERSISTENT_TEST_CLUSTER_DIR = initialTestDirs.clusterDir;
const PERSISTENT_TEST_UPLOAD_DIR = path.resolve(os.homedir(), ".dreamsky_test_uploads_5433");

const nodeEnv = process.env.NODE_ENV || "development";
const port = parseInt(process.env.PORT, 10) || 5000;

/**
 * Validates a PostgreSQL database URL according to strict fail-closed safety rules.
 * Throws an Error before any connection pool or Prisma client is constructed if
 * the configuration is absent, malformed, or violates isolation constraints.
 *
 * @param {string|undefined} [rawUrl] - Explicit database URL. Defaults to process.env.DATABASE_URL if omitted.
 * @param {string} [env] - Runtime environment. Defaults to process.env.NODE_ENV || "development" if omitted.
 * @param {object} [options] - Additional validation options (e.g. allowedHosts override).
 * @returns {string} The validated, trimmed database URL.
 */
function validateDatabaseUrl(rawUrl, env, options = {}) {
    const activeEnv = env !== undefined ? env : (process.env.NODE_ENV || "development");
    const activeUrl = arguments.length > 0 ? rawUrl : process.env.DATABASE_URL;

    if (!activeUrl || typeof activeUrl !== "string" || !activeUrl.trim()) {
        if (activeEnv === "test") {
            throw new Error(
                "[DATABASE CONFIG ERROR] In test mode (NODE_ENV=test), real database initialization is disabled by default. " +
                "Unit tests must mock the Prisma client in require.cache. For disposable integration testing, set " +
                "ALLOW_INTEGRATION_TEST_DB=true and supply a dedicated disposable test URL."
            );
        }
        throw new Error(
            "[DATABASE CONFIG ERROR] DATABASE_URL environment variable is required but missing. " +
            "Silently falling back to a hardcoded or production database is strictly forbidden."
        );
    }

    const trimmedUrl = activeUrl.trim();
    let parsed;
    try {
        parsed = new URL(trimmedUrl);
    } catch {
        throw new Error("[DATABASE CONFIG ERROR] DATABASE_URL is not a valid, parseable URL.");
    }

    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
        throw new Error(
            `[DATABASE CONFIG ERROR] Invalid database protocol '${parsed.protocol}'. Only 'postgresql:' and 'postgres:' are supported.`
        );
    }

    const rawHostname = parsed.hostname;
    if (!rawHostname || !rawHostname.trim()) {
        throw new Error("[DATABASE CONFIG ERROR] DATABASE_URL must specify a valid host.");
    }

    const hostname = rawHostname.trim().toLowerCase();
    const rawPath = parsed.pathname.replace(/^\//, "");
    const dbName = rawPath.split("?")[0];

    if (!dbName) {
        throw new Error("[DATABASE CONFIG ERROR] DATABASE_URL must specify a target database name in its path.");
    }

    // Fail-closed staging mode isolation rules (Phase 2.8.2)
    if (activeEnv === "staging") {
        // 1. Target database name must be exactly 'dreamsky_staging_db'
        const lowerDbName = dbName.toLowerCase();
        if (lowerDbName === "dreamsky_db" || lowerDbName === "dreamsky_dreamsky" || trimmedUrl.toLowerCase().includes("dreamsky_db") || trimmedUrl.toLowerCase().includes("dreamsky_dreamsky")) {
            throw new Error(
                "[DATABASE CONFIG ERROR] Production database targets ('dreamsky_db', 'dreamsky_dreamsky') are strictly forbidden in staging mode."
            );
        }
        if (lowerDbName === "dreamsky_test_disposable") {
            throw new Error(
                "[DATABASE CONFIG ERROR] Test database targets ('dreamsky_test_disposable') are strictly forbidden in staging mode."
            );
        }
        const STAGING_DB_NAME = "dreamsky_staging_db";
        if (dbName !== STAGING_DB_NAME) {
            throw new Error(
                `[DATABASE CONFIG ERROR] Staging database name must be exactly '${STAGING_DB_NAME}'. Target database '${dbName}' is strictly forbidden.`
            );
        }

        // 2. Canonicalize hostname: lowercase and strip trailing dots
        const canonicalHost = hostname.replace(/\.+$/, "");

        // 3. Reject localhost and loopback targets
        const isLoopback =
            canonicalHost === "localhost" ||
            canonicalHost === "127.0.0.1" ||
            canonicalHost === "::1" ||
            canonicalHost === "[::1]" ||
            canonicalHost === "0.0.0.0";
        if (isLoopback) {
            throw new Error(
                `[DATABASE CONFIG ERROR] Staging database host cannot be localhost or loopback ('${canonicalHost}'). Staging requires an isolated, dedicated staging database host.`
            );
        }

        // 4. Require an explicitly configured approved staging hostname allowlist
        const allowedHostsEnv = (options && options.allowedHosts) || process.env.STAGING_DB_ALLOWED_HOSTS;
        if (!allowedHostsEnv || typeof allowedHostsEnv !== "string" || !allowedHostsEnv.trim()) {
            throw new Error(
                "[DATABASE CONFIG ERROR] STAGING_DB_ALLOWED_HOSTS environment variable is required when NODE_ENV=staging. An explicit approved staging database host allowlist must be configured."
            );
        }

        const allowedHosts = allowedHostsEnv
            .split(",")
            .map((h) => h.trim().toLowerCase().replace(/\.+$/, ""))
            .filter(Boolean);

        if (allowedHosts.length === 0) {
            throw new Error(
                "[DATABASE CONFIG ERROR] STAGING_DB_ALLOWED_HOSTS contains no valid hostnames."
            );
        }

        if (!allowedHosts.includes(canonicalHost)) {
            throw new Error(
                `[DATABASE CONFIG ERROR] Staging database host '${canonicalHost}' is not in the approved STAGING_DB_ALLOWED_HOSTS allowlist.`
            );
        }

        // 5. Rejection of dangerous connection parameter overrides in query string
        if (parsed.searchParams.has("host") || parsed.searchParams.has("port")) {
            throw new Error(
                "[DATABASE CONFIG ERROR] URL search parameters 'host' and 'port' are forbidden in staging mode."
            );
        }
    }

    // Reject disposable test directory overrides outside test mode
    const { socketDir: activeTestSocketDir } = resolveApprovedTestDirs(activeEnv);

    // Fail-closed test mode isolation rules
    if (activeEnv === "test") {
        if (process.env.ALLOW_INTEGRATION_TEST_DB !== "true") {
            throw new Error(
                "[DATABASE CONFIG ERROR] Real database connection blocked in test mode. " +
                "Unit tests must use mocks. To run integration tests against disposable PostgreSQL, " +
                "set ALLOW_INTEGRATION_TEST_DB=true explicitly."
            );
        }

        // Test mode must strictly target localhost, 127.0.0.1, or the verified persistent Unix socket path
        const decodedHost = decodeURIComponent(parsed.hostname);
        const isLoopback = hostname === "127.0.0.1" || hostname === "localhost";
        const isSocket = decodedHost === activeTestSocketDir;
        if (!isLoopback && !isSocket) {
            throw new Error(
                `[DATABASE CONFIG ERROR] Integration test database host '${hostname}' is rejected. ` +
                `Tests may only connect to '127.0.0.1', 'localhost', or persistent Unix domain socket '${activeTestSocketDir}'.`
            );
        }

        // Test mode must explicitly require port 5433 (prevent collision with port 5432)
        if (!parsed.port) {
            throw new Error(
                "[DATABASE CONFIG ERROR] Integration test database must explicitly specify port 5433. " +
                "Default or missing port is strictly forbidden to protect existing PostgreSQL instances."
            );
        }
        if (parsed.port !== "5433") {
            throw new Error(
                `[DATABASE CONFIG ERROR] Integration test database must strictly target port 5433. ` +
                `Port '${parsed.port}' is forbidden.`
            );
        }

        // Rejection of dangerous connection parameter overrides in query string
        if (parsed.searchParams.has("host") || parsed.searchParams.has("port")) {
            throw new Error(
                "[DATABASE CONFIG ERROR] URL search parameters 'host' and 'port' are forbidden in test mode."
            );
        }

        // Dedicated disposable database name must be enforced exactly
        const DISPOSABLE_TEST_DB = "dreamsky_test_disposable";
        if (dbName !== DISPOSABLE_TEST_DB) {
            throw new Error(
                `[DATABASE CONFIG ERROR] Integration test database name must be exactly '${DISPOSABLE_TEST_DB}'. ` +
                `Target database '${dbName}' is forbidden.`
            );
        }

        // Explicit blacklisting of production indicators
        const forbiddenNames = ["dreamsky_db", "dreamsky_dreamsky"];
        if (forbiddenNames.includes(dbName.toLowerCase()) || trimmedUrl.toLowerCase().includes("dreamsky_dreamsky")) {
            throw new Error(
                "[DATABASE CONFIG ERROR] Production database targets are strictly forbidden in test mode."
            );
        }
    }

    return trimmedUrl;
}

/**
 * Positively asserts that the target database is strictly the dedicated disposable test database.
 * Blocks all destructive operations on production, staging, development, or shared databases.
 *
 * Requirements:
 * 1. Explicit authorization flag (ALLOW_DESTRUCTIVE_OPERATIONS=true).
 * 2. Protocol must be postgresql: or postgres:
 * 3. Hostname must be strictly 127.0.0.1 or localhost
 * 4. Port must be explicitly 5433 (rejects 5432 or missing port)
 * 5. Database name must be exactly 'dreamsky_test_disposable'
 * 6. Rejects any production indicators, parameter overrides, or other database names.
 *
 * @param {string|undefined} [rawUrl] - Database URL to inspect. Defaults to process.env.DATABASE_URL.
 * @param {string} [authFlag] - Authorization flag. Defaults to process.env.ALLOW_DESTRUCTIVE_OPERATIONS.
 * @returns {boolean} Returns true if positively verified.
 */
function assertDisposableTarget(rawUrl, authFlag) {
    const activeFlag = authFlag !== undefined ? authFlag : process.env.ALLOW_DESTRUCTIVE_OPERATIONS;
    if (activeFlag !== "true") {
        throw new Error(
            "[DESTRUCTIVE GUARD] Destructive operations are blocked by default. " +
            "Set ALLOW_DESTRUCTIVE_OPERATIONS=true to authorize, and ensure the target is the dedicated disposable test database."
        );
    }

    const activeUrl = rawUrl !== undefined ? rawUrl : process.env.DATABASE_URL;
    if (!activeUrl || typeof activeUrl !== "string" || !activeUrl.trim()) {
        throw new Error("[DESTRUCTIVE GUARD] DATABASE_URL is required to verify the target database.");
    }

    let parsed;
    try {
        parsed = new URL(activeUrl.trim());
    } catch {
        throw new Error("[DESTRUCTIVE GUARD] DATABASE_URL is not a valid URL.");
    }

    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
        throw new Error(`[DESTRUCTIVE GUARD] Invalid protocol '${parsed.protocol}'. Only PostgreSQL is supported.`);
    }

    const hostname = parsed.hostname.toLowerCase();
    const decodedHost = decodeURIComponent(parsed.hostname);
    const isLoopback = hostname === "127.0.0.1" || hostname === "localhost";
    const isSocket = decodedHost === PERSISTENT_TEST_SOCKET_DIR;
    if (!isLoopback && !isSocket) {
        throw new Error(
            `[DESTRUCTIVE GUARD] Destructive operations are strictly forbidden on remote host '${hostname}'. ` +
            `Only local loopback hosts ('127.0.0.1' or 'localhost') or persistent Unix domain socket '${PERSISTENT_TEST_SOCKET_DIR}' are permitted.`
        );
    }

    // Explicit port 5433 requirement (prevent collision with port 5432)
    if (!parsed.port) {
        throw new Error(
            "[DESTRUCTIVE GUARD] Disposable database target must explicitly specify port 5433. " +
            "Default or missing port is strictly forbidden to protect existing PostgreSQL instances."
        );
    }
    if (parsed.port !== "5433") {
        throw new Error(
            `[DESTRUCTIVE GUARD] Destructive operations are strictly restricted to isolated port 5433. ` +
            `Port '${parsed.port}' is rejected.`
        );
    }

    // Rejection of dangerous connection parameter overrides in query string
    if (parsed.searchParams.has("host") || parsed.searchParams.has("port")) {
        throw new Error(
            "[DESTRUCTIVE GUARD] URL search parameters 'host' and 'port' are forbidden."
        );
    }

    const rawPath = parsed.pathname.replace(/^\//, "");
    const dbName = rawPath.split("?")[0];
    const DISPOSABLE_TEST_DB = "dreamsky_test_disposable";

    if (dbName !== DISPOSABLE_TEST_DB) {
        throw new Error(
            `[DESTRUCTIVE GUARD] Destructive operations are strictly forbidden on database '${dbName}'. ` +
            `Target must be positively verified as the dedicated disposable database '${DISPOSABLE_TEST_DB}'.`
        );
    }

    const lowerUrl = activeUrl.toLowerCase();
    if (lowerUrl.includes("dreamsky_db") || lowerUrl.includes("dreamsky_dreamsky")) {
        throw new Error(
            "[DESTRUCTIVE GUARD] Production database targets are strictly forbidden from destructive operations."
        );
    }

    return true;
}

const config = {
    port,
    nodeEnv,
    databaseUrl: process.env.DATABASE_URL,
    validateDatabaseUrl,
    assertDisposableTarget,
    resolveApprovedTestDirs,
    DEFAULT_PERSISTENT_TEST_SOCKET_DIR,
    DEFAULT_PERSISTENT_TEST_CLUSTER_DIR,
    APPROVED_TEST_SOCKET_DIRS,
    APPROVED_TEST_CLUSTER_DIRS,
    PERSISTENT_TEST_SOCKET_DIR,
    PERSISTENT_TEST_CLUSTER_DIR,
    PERSISTENT_TEST_UPLOAD_DIR,
};

module.exports = config;
