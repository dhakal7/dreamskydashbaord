require("dotenv").config();
const fs = require("fs");
const os = require("os");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const globalForPrisma = global;

/**
 * Validates whether a host is an IPv4 loopback (127.0.0.0/8), IPv6 loopback (::1),
 * or standard localhost name.
 */
const isLoopbackHost = (host) => {
    if (!host) return false;
    const cleanHost = host.replace(/^\[|\]$/g, "").toLowerCase();
    if (cleanHost === "localhost" || cleanHost === "::1") {
        return true;
    }
    // Match 127.0.0.0/8 IPv4 loopback block
    if (/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/.test(cleanHost)) {
        return true;
    }
    return false;
};

/**
 * Accurately determines if a parsed database URL targets a Unix domain socket.
 * Handles %2F encoded socket paths, query parameter host paths, or empty hostname with socket directory.
 */
const isUnixSocket = (parsed) => {
    const rawHost = parsed.hostname;
    const decodedHost = decodeURIComponent(rawHost || "");
    const hostParam = parsed.searchParams.get("host");

    if (decodedHost.startsWith("/") || decodedHost.startsWith(".")) {
        return true;
    }
    if (hostParam && (hostParam.startsWith("/") || hostParam.startsWith("."))) {
        return true;
    }
    if (!rawHost) {
        return true;
    }
    return false;
};

/**
 * Safely parses the database URL and determines the required SSL configuration.
 *
 * Rules:
 * 1. Safely parses DATABASE_URL with new URL(). Throws on malformed URL.
 * 2. Remote hosts reject sslmode=disable, ssl=false, and ssl=0; local connections may disable SSL.
 * 3. Local connections (IPv4 loopback, IPv6 ::1, localhost, Unix sockets) default to false.
 * 4. Local connections enable TLS only if explicitly requested (DB_USE_SSL=true or sslmode in ['require', 'verify-ca', 'verify-full']).
 * 5. Arbitrary remote hosts (cloud or on-prem) REQUIRE TLS with rejectUnauthorized: true by default.
 * 6. Custom CA certificates can be provided via DB_CA_CERT, DB_CA_CERT_PATH, or PGSSLROOTCERT.
 * 7. If a CA certificate path is specified but does not exist, throws a clear configuration error.
 */
const getSslConfig = (dbUrl) => {
    if (!dbUrl || typeof dbUrl !== "string" || !dbUrl.trim()) {
        throw new Error("[CONFIG ERROR] DATABASE_URL is missing or empty.");
    }

    let parsed;
    try {
        parsed = new URL(dbUrl.trim());
    } catch (err) {
        throw new Error(`[CONFIG ERROR] Malformed DATABASE_URL: ${err.message}`);
    }

    if (!["postgresql:", "postgres:"].includes(parsed.protocol)) {
        throw new Error(
            `[CONFIG ERROR] Invalid protocol in DATABASE_URL: expected 'postgresql:' or 'postgres:', got '${parsed.protocol}'`
        );
    }

    const sslmode = parsed.searchParams.get("sslmode")?.toLowerCase();
    const sslParam = parsed.searchParams.get("ssl")?.toLowerCase();
    const isLocal = isLoopbackHost(parsed.hostname) || isUnixSocket(parsed);
    const sslDisabledRequested = sslmode === "disable" || sslParam === "false" || sslParam === "0";

    if (sslDisabledRequested) {
        if (!isLocal) {
            throw new Error(
                "[SECURITY CONFIG ERROR] Disabling TLS (sslmode=disable, ssl=false, or ssl=0) is not permitted for remote PostgreSQL hosts."
            );
        }
        return false;
    }

    const sslExplicitlyRequested = process.env.DB_USE_SSL === "true" ||
        Boolean(sslmode && ["require", "verify-ca", "verify-full"].includes(sslmode)) ||
        sslParam === "true" || sslParam === "1";

    // Local connection defaults to false unless explicitly requested
    if (isLocal && !sslExplicitlyRequested) {
        return false;
    }

    // Remote hosts require TLS by default; local hosts enable it when explicitly requested
    const sslConfig = {
        rejectUnauthorized: true,
    };

    const directCa = process.env.DB_CA_CERT?.trim();
    const caPath = (process.env.DB_CA_CERT_PATH || process.env.PGSSLROOTCERT)?.trim();

    if (directCa) {
        sslConfig.ca = directCa;
    } else if (caPath) {
        if (fs.existsSync(caPath)) {
            sslConfig.ca = fs.readFileSync(caPath, "utf8");
        } else {
            throw new Error(
                `[CONFIG ERROR] Database CA certificate file specified in environment does not exist at: ${caPath}`
            );
        }
    }

    return sslConfig;
};

const APPROVED_TEST_SOCKET_DIR = path.join(os.homedir(), ".dreamsky_sock_5433");
const DISPOSABLE_TEST_DB_NAME = "dreamsky_test_disposable";
const DISPOSABLE_TEST_DB_PORT = "5433";

/**
 * Enforces the disposable integration database safety guard before creating a Pool.
 *
 * When NODE_ENV=test, ALLOW_INTEGRATION_TEST_DB=true, ALLOW_DESTRUCTIVE_OPERATIONS=true,
 * or the URL targets the disposable database/socket, connections are permitted ONLY if:
 *   - NODE_ENV === "test"
 *   - ALLOW_INTEGRATION_TEST_DB === "true" (ALLOW_DESTRUCTIVE_OPERATIONS alone is rejected)
 *   - DATABASE_URL is a valid postgresql:/postgres: URL
 *   - Database name is exactly "dreamsky_test_disposable"
 *   - Port is exactly "5433"
 *   - Host is the approved Unix socket directory (path.join(os.homedir(), ".dreamsky_sock_5433"))
 *   - No alternate host or connection override (query params or PG* env vars) is supplied
 */
const assertSafeDatabaseConnection = (dbUrl, env = process.env) => {
    if (!dbUrl || typeof dbUrl !== "string" || !dbUrl.trim()) {
        throw new Error("[CONFIG ERROR] DATABASE_URL is missing or empty.");
    }

    let parsed;
    try {
        parsed = new URL(dbUrl.trim());
    } catch (err) {
        throw new Error(`[CONFIG ERROR] Malformed DATABASE_URL: ${err.message}`);
    }

    if (!["postgresql:", "postgres:"].includes(parsed.protocol)) {
        throw new Error(
            `[CONFIG ERROR] Invalid protocol in DATABASE_URL: expected 'postgresql:' or 'postgres:', got '${parsed.protocol}'`
        );
    }

    const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    let decodedHost = "";
    try {
        decodedHost = decodeURIComponent(parsed.hostname || "");
    } catch {
        throw new Error("[DB SAFETY GUARD] Malformed host encoding in DATABASE_URL.");
    }
    const hostParams = parsed.searchParams.getAll("host");

    const isDisposableTarget =
        dbName === DISPOSABLE_TEST_DB_NAME ||
        decodedHost === APPROVED_TEST_SOCKET_DIR ||
        hostParams.includes(APPROVED_TEST_SOCKET_DIR);

    const isTestOrFlagged =
        env.NODE_ENV === "test" ||
        env.ALLOW_INTEGRATION_TEST_DB === "true" ||
        env.ALLOW_DESTRUCTIVE_OPERATIONS === "true";

    if (!isTestOrFlagged && !isDisposableTarget) {
        return;
    }

    if (env.NODE_ENV !== "test") {
        throw new Error(
            `[DB SAFETY GUARD] Disposable/test database access requires NODE_ENV=test (got '${env.NODE_ENV || ""}').`
        );
    }

    if (env.ALLOW_INTEGRATION_TEST_DB !== "true") {
        throw new Error(
            "[DB SAFETY GUARD] Integration test database connection requires ALLOW_INTEGRATION_TEST_DB=true (ALLOW_DESTRUCTIVE_OPERATIONS=true alone is not sufficient)."
        );
    }

    if (dbName !== DISPOSABLE_TEST_DB_NAME) {
        throw new Error(
            `[DB SAFETY GUARD] Rejected database '${dbName || "(empty)"}': only '${DISPOSABLE_TEST_DB_NAME}' is permitted in test mode.`
        );
    }

    if (parsed.port !== DISPOSABLE_TEST_DB_PORT) {
        throw new Error(
            `[DB SAFETY GUARD] Rejected port '${parsed.port || "(default)"}': only port ${DISPOSABLE_TEST_DB_PORT} is permitted in test mode.`
        );
    }

    if (
        parsed.searchParams.has("hostaddr") ||
        parsed.searchParams.has("port") ||
        parsed.searchParams.has("dbname") ||
        hostParams.length > 1 ||
        (decodedHost && hostParams.length > 0)
    ) {
        throw new Error(
            "[DB SAFETY GUARD] Rejected DATABASE_URL: alternate host or connection override query parameter is not permitted."
        );
    }

    for (const overrideVar of ["PGHOST", "PGHOSTADDR", "PGPORT", "PGDATABASE", "PGSERVICE"]) {
        if (env[overrideVar] && String(env[overrideVar]).trim() !== "") {
            throw new Error(
                `[DB SAFETY GUARD] Rejected connection override environment variable '${overrideVar}'.`
            );
        }
    }

    const effectiveSocket = decodedHost || hostParams[0] || "";
    if (effectiveSocket !== APPROVED_TEST_SOCKET_DIR) {
        throw new Error(
            `[DB SAFETY GUARD] Rejected host '${effectiveSocket || "(empty)"}': only approved Unix socket directory '${APPROVED_TEST_SOCKET_DIR}' is permitted in test mode.`
        );
    }
};

const getClient = () => {
    const dbUrl = process.env.DATABASE_URL?.trim();
    if (!dbUrl) {
        throw new Error(
            "[CONFIG ERROR] DATABASE_URL environment variable is missing or empty. Please configure DATABASE_URL in your environment or .env file before running the application."
        );
    }

    assertSafeDatabaseConnection(dbUrl, process.env);

    const ssl = getSslConfig(dbUrl);

    const pool = new Pool({
        connectionString: dbUrl,
        ssl,
    });

    const adapter = new PrismaPg(pool);
    return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
};

let prismaInstance = null;

const getPrisma = () => {
    if (!prismaInstance) {
        prismaInstance = globalForPrisma.prisma ?? getClient();
        if (process.env.NODE_ENV !== "production") {
            globalForPrisma.prisma = prismaInstance;
        }
    }
    return prismaInstance;
};

const prisma = new Proxy({}, {
    get(target, prop, receiver) {
        if (prop === "getSslConfig") return getSslConfig;
        if (prop === "getClient") return getClient;
        if (prop === "isLoopbackHost") return isLoopbackHost;
        if (prop === "isUnixSocket") return isUnixSocket;
        if (prop === "assertSafeDatabaseConnection") return assertSafeDatabaseConnection;
        if (prop === "APPROVED_TEST_SOCKET_DIR") return APPROVED_TEST_SOCKET_DIR;
        if (prop === "then") return undefined;
        const client = getPrisma();
        const value = Reflect.get(client, prop, receiver);
        if (typeof value === "function") {
            return value.bind(client);
        }
        return value;
    },
    has(target, prop) {
        if (["getSslConfig", "getClient", "isLoopbackHost", "isUnixSocket", "assertSafeDatabaseConnection", "APPROVED_TEST_SOCKET_DIR"].includes(prop)) {
            return true;
        }
        return Reflect.has(getPrisma(), prop);
    },
    ownKeys(target) {
        return Reflect.ownKeys(getPrisma());
    },
    getOwnPropertyDescriptor(target, prop) {
        if (["getSslConfig", "getClient", "isLoopbackHost", "isUnixSocket", "assertSafeDatabaseConnection", "APPROVED_TEST_SOCKET_DIR", "then"].includes(prop)) {
            return Object.getOwnPropertyDescriptor(target, prop);
        }
        const client = getPrisma();
        const descriptor = Object.getOwnPropertyDescriptor(client, prop);
        if (descriptor) return descriptor;
        return Reflect.getOwnPropertyDescriptor(client, prop);
    }
});

module.exports = prisma;
module.exports.getSslConfig = getSslConfig;
module.exports.getClient = getClient;
module.exports.isLoopbackHost = isLoopbackHost;
module.exports.isUnixSocket = isUnixSocket;

module.exports.assertSafeDatabaseConnection = assertSafeDatabaseConnection;
module.exports.APPROVED_TEST_SOCKET_DIR = APPROVED_TEST_SOCKET_DIR;
