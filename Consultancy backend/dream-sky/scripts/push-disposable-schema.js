/**
 * push-disposable-schema.js — Guarded Prisma Schema Synchronization
 *
 * Dedicated fail-closed wrapper for synchronizing the Prisma schema strictly against
 * the isolated, persistent disposable test PostgreSQL cluster on port 5433.
 *
 * SAFETY INVARIANTS:
 * - Rejects ambient root .env loading; strictly requires loadDisposableTestEnv().
 * - Positively validates that DATABASE_URL targets the verified persistent Unix socket.
 * - Enforces port 5433 and database 'dreamsky_test_disposable'.
 * - Explicitly rejects port 5432 and development database 'dreamsky_db'.
 * - Verifies the physical presence of socket file .s.PGSQL.5433 before invoking Prisma.
 * - Never runs automatically; requires explicit operator execution.
 */

const fs = require("fs");
const path = require("path");
const child_process = require("child_process");
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
} = require("./seed-disposable-fixtures");

/**
 * Validates disposable test environment and executes prisma db push with isolated configuration.
 *
 * SAFETY INVARIANTS:
 * - Unconditionally executes trusted out-of-band physical cluster preflight before invoking Prisma.
 * - Inspects postmaster.pid, lsof listener, ps process arguments, and pg_controldata system identifier.
 * - Missing, incomplete, mismatched, or pending cluster identity immediately fails closed.
 * - External preflightEvidence objects and preflight bypass flags are strictly forbidden.
 * - Unit tests must use the narrow dependency-injection seam (execCommand, readPostmaster, execPrisma).
 * - Prisma is never invoked or executed until every safety check succeeds.
 *
 * @param {object} [options]
 * @param {string} [options.configPath] - Optional path to .env.test.disposable
 * @param {boolean} [options.dryRun=false] - If true, validates guards without running prisma
 * @param {object} [options.clusterIdentityReference] - Override expected identity for verification
 * @param {function} [options.execCommand] - Pluggable command executor for mocked testing
 * @param {function} [options.readPostmaster] - Pluggable postmaster reader for mocked testing
 * @param {string} [options.pgControlDataBin] - Override pg_controldata binary path for testing
 * @param {function} [options.execPrisma] - Pluggable Prisma command executor for mocked testing
 * @returns {{success: boolean, targetDatabase: string, targetPort: string, socketPath: string, clusterSystemIdentifier: string}}
 */
function pushDisposableSchema(options = {}) {
    if (!options || typeof options !== "object" || Array.isArray(options)) {
        throw new Error("[PRISMA GUARD] Options must be a valid object.");
    }

    // 1. Block any attempt to supply fabricated evidence or bypass preflight
    if ("preflightEvidence" in options || "clusterEvidence" in options || "identityEvidence" in options) {
        throw new Error(
            "[PRISMA GUARD] Supplying external preflight/cluster evidence is forbidden. " +
            "Out-of-band physical cluster preflight must be executed directly by the schema runner."
        );
    }
    if (
        options.enforcePreflight === false ||
        options.skipPreflight === true ||
        options.skipOutOfBandPreflight === true ||
        options.skipClusterIdentityCheck === true ||
        options.skipTargetAssert === true ||
        options.skipSafetyChecks === true ||
        options.skipGuards === true
    ) {
        throw new Error(
            "[PRISMA GUARD] Bypassing out-of-band cluster preflight is strictly forbidden."
        );
    }

    // 2. Force fail-closed test environment loading (overrides ambient root .env)
    const testConfig = loadDisposableTestEnv({ configPath: options.configPath });

    // 3. Cluster identity readiness check — strictly fails closed if uninitialized, pending, or non-matching
    const expectedIdentity = options.clusterIdentityReference || EXPECTED_CLUSTER_IDENTITY;
    if (!expectedIdentity || typeof expectedIdentity !== "object") {
        throw new Error("[PRISMA GUARD] Expected cluster identity reference must be a valid object.");
    }
    if (!expectedIdentity.systemIdentifier || expectedIdentity.systemIdentifier === "PENDING_INITIALIZATION") {
        throw new Error(
            "[PRISMA GUARD] Cluster system identifier is pending initialization and has not yet been established. " +
            "Disposable schema push cannot run against an unverified cluster."
        );
    }
    if (expectedIdentity.dataDirectory !== PERSISTENT_TEST_CLUSTER_DIR) {
        throw new Error(
            `[PRISMA GUARD] Expected cluster data directory '${expectedIdentity.dataDirectory}' does not match ` +
            `authorized persistent cluster directory '${PERSISTENT_TEST_CLUSTER_DIR}'.`
        );
    }
    if (Number(expectedIdentity.port) !== 5433) {
        throw new Error(
            `[PRISMA GUARD] Expected cluster port '${expectedIdentity.port}' is rejected. ` +
            "Disposable schema push must strictly target port 5433."
        );
    }
    if (expectedIdentity.socketDirectory && expectedIdentity.socketDirectory !== PERSISTENT_TEST_SOCKET_DIR) {
        throw new Error(
            `[PRISMA GUARD] Expected cluster socket directory '${expectedIdentity.socketDirectory}' does not match ` +
            `authorized persistent socket directory '${PERSISTENT_TEST_SOCKET_DIR}'.`
        );
    }

    // 4. Mandatory trusted out-of-band physical cluster identity preflight:
    // Inspects postmaster.pid, lsof listening PID, ps process command arguments, and pg_controldata system identifier.
    // In production, uses live system tools; for unit testing, accepts dependency-injected mock readers.
    const preflightEvidence = performOutOfBandPreflight({
        expected: expectedIdentity,
        execCommand: options.execCommand,
        readPostmaster: options.readPostmaster,
        pgControlDataBin: options.pgControlDataBin,
    });
    validatePreflightEvidence(preflightEvidence, expectedIdentity);

    // 5. Validate database URL through authoritative test isolation rules
    const validatedUrl = validateDatabaseUrl(process.env.DATABASE_URL, "test");

    // 6. Parse and verify URL components strictly
    const parsed = new URL(validatedUrl);
    const decodedHost = decodeURIComponent(parsed.hostname);

    if (decodedHost !== PERSISTENT_TEST_SOCKET_DIR) {
        throw new Error(
            `[PRISMA GUARD] Socket path '${decodedHost}' is rejected. ` +
            `Must strictly match persistent test socket directory '${PERSISTENT_TEST_SOCKET_DIR}'.`
        );
    }

    if (parsed.port !== "5433") {
        throw new Error(
            `[PRISMA GUARD] Port '${parsed.port}' is rejected. ` +
            "Disposable schema push must strictly target port 5433."
        );
    }

    const rawPath = parsed.pathname.replace(/^\//, "");
    const dbName = rawPath.split("?")[0];
    if (dbName !== "dreamsky_test_disposable") {
        throw new Error(
            `[PRISMA GUARD] Database '${dbName}' is rejected. ` +
            "Disposable schema push must strictly target 'dreamsky_test_disposable'."
        );
    }

    // Explicit blacklisting of development and production indicators
    const lowerUrl = validatedUrl.toLowerCase();
    if (lowerUrl.includes("dreamsky_db") || lowerUrl.includes("dreamsky_dreamsky") || parsed.port === "5432") {
        throw new Error(
            "[PRISMA GUARD] Development or production database targets are strictly forbidden from schema push."
        );
    }

    // 7. Verify physical Unix socket file exists before invoking Prisma
    const socketFile = path.join(PERSISTENT_TEST_SOCKET_DIR, ".s.PGSQL.5433");
    if (!fs.existsSync(socketFile)) {
        throw new Error(
            `[PRISMA GUARD] Required Unix domain socket file not found at '${socketFile}'. ` +
            "The disposable PostgreSQL cluster must be running on port 5433 before synchronizing schema."
        );
    }

    if (options.dryRun === true) {
        return {
            success: true,
            dryRun: true,
            targetDatabase: dbName,
            targetPort: parsed.port,
            socketPath: socketFile,
            clusterSystemIdentifier: preflightEvidence.systemIdentifier,
        };
    }

    // 8. Execute prisma db push strictly using validated environment
    const schemaPath = path.resolve(__dirname, "../prisma/schema.prisma");
    if (!fs.existsSync(schemaPath)) {
        throw new Error(`[PRISMA GUARD] Prisma schema not found at '${schemaPath}'.`);
    }

    const prismaBin = path.resolve(__dirname, "../node_modules/.bin/prisma");
    const prismaCmd = fs.existsSync(prismaBin) ? prismaBin : "npx";
    const prismaArgs = fs.existsSync(prismaBin)
        ? ["db", "push", `--schema=${schemaPath}`]
        : ["prisma", "db", "push", `--schema=${schemaPath}`];

    console.log(`[PRISMA GUARD] Pushing schema to '${dbName}' via socket '${socketFile}' (port 5433)...`);

    const execPrisma = options.execPrisma || child_process.execFileSync;

    // Construct verified Unix socket URL format required by Prisma engine
    const prismaSocketUrl = `postgresql://${parsed.username}:${parsed.password}@localhost:5433/${dbName}?host=${PERSISTENT_TEST_SOCKET_DIR}`;

    try {
        execPrisma(prismaCmd, prismaArgs, {
            stdio: "inherit",
            env: {
                ...process.env,
                DATABASE_URL: prismaSocketUrl,
                DOTENV_CONFIG_PATH: testConfig.configPath,
            },
        });
        console.log("[PRISMA GUARD] Schema synchronization completed successfully.");
        return {
            success: true,
            targetDatabase: dbName,
            targetPort: parsed.port,
            socketPath: socketFile,
            clusterSystemIdentifier: preflightEvidence.systemIdentifier,
        };
    } catch (err) {
        throw new Error(`[PRISMA GUARD] prisma db push failed: ${err.message}`);
    }
}

if (require.main === module) {
    try {
        const isDryRun = process.argv.includes("--dryRun") || process.argv.includes("--dry-run");
        const result = pushDisposableSchema({ dryRun: isDryRun });
        if (isDryRun) {
            console.log("[PRISMA GUARD] Dry-run safety validation successful:", JSON.stringify(result, null, 2));
        }
    } catch (err) {
        console.error("[PRISMA GUARD FATAL]", err.message);
        process.exit(1);
    }
}

module.exports = {
    pushDisposableSchema,
};
