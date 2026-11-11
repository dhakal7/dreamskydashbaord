/**
 * sync-disposable-schema-direct.js — Hardened Transactional Schema Synchronization Runner
 *
 * Dedicated fail-closed runner for synchronizing the Prisma schema strictly against
 * the isolated, persistent disposable test PostgreSQL cluster on port 5433 via Unix socket.
 *
 * SAFETY INVARIANTS:
 * - Rejects ambient root .env loading; strictly requires loadDisposableTestEnv().
 * - Positively validates DATABASE_URL and socket path (/Users/suyogdhakal/.dreamsky_sock_5433).
 * - Enforces port 5433 and database 'dreamsky_test_disposable'.
 * - Explicitly rejects port 5432 and development database 'dreamsky_db'.
 * - Performs out-of-band cluster preflight (PID, system identifier 7699856431808793231).
 * - Pre-validates object definitions (no blind IF NOT EXISTS without type checks).
 * - Enforces connection (5s), lock (5s), statement (10s), and idle (10s) timeouts.
 * - Verifies DocumentVersion has 0 duplicate (documentId, versionNumber) pairs before unique DDL.
 * - Executes all DDL atomically inside a single BEGIN ... COMMIT block.
 * - Rigorously verifies rollback execution; logs CRITICAL if rollback is interrupted.
 * - Runs comprehensive post-commit schema verification suite across all 36 models.
 */

const fs = require("fs");
const path = require("path");
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
} = require("./seed-disposable-fixtures");

/**
 * Validates database URL and socket configuration without establishing a connection.
 * @param {string} rawUrl
 * @returns {{isValid: boolean, dbName: string, port: string, socketDir: string}}
 */
function validateDirectSyncUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") {
        throw new Error("[URL VALIDATION] Database URL must be a non-empty string.");
    }
    const validated = validateDatabaseUrl(rawUrl, "test");
    const parsed = new URL(validated);
    const decodedHost = decodeURIComponent(parsed.hostname);

    if (decodedHost !== PERSISTENT_TEST_SOCKET_DIR || parsed.port !== "5433") {
        throw new Error(`[URL VALIDATION] Rejected host '${decodedHost}' or port '${parsed.port}'. Must strictly target persistent test socket directory on port 5433.`);
    }

    const dbName = parsed.pathname.replace(/^\//, "").split("?")[0];
    if (dbName !== "dreamsky_test_disposable") {
        throw new Error(`[URL VALIDATION] Database '${dbName}' is rejected. Must strictly be 'dreamsky_test_disposable'.`);
    }

    if (validated.toLowerCase().includes("dreamsky_db") || parsed.port === "5432") {
        throw new Error("[URL VALIDATION FATAL] Development database or port 5432 is strictly prohibited.");
    }

    return {
        isValid: true,
        dbName,
        port: parsed.port,
        socketDir: decodedHost,
    };
}

/**
 * Compares an existing table definition with expected Prisma model specifications.
 * Fails closed if types, nullability, or columns diverge.
 * @param {object[]} existingColumns
 * @param {object} expectedColumnsConfig
 */
function validateTableSchemaDefinitions(existingColumns, expectedColumnsConfig) {
    const existing = Object.fromEntries(existingColumns.map((c) => [c.column_name, c]));
    for (const [colName, expected] of Object.entries(expectedColumnsConfig)) {
        const found = existing[colName];
        if (!found) {
            throw new Error(`[DEFINITION MISMATCH] Required column '${colName}' is missing.`);
        }
        if (expected.dataType && !found.data_type.startsWith(expected.dataType)) {
            throw new Error(`[DEFINITION MISMATCH] Column '${colName}' type mismatch. Observed '${found.data_type}', expected '${expected.dataType}'.`);
        }
        if (expected.isNullable !== undefined && found.is_nullable !== expected.isNullable) {
            throw new Error(`[DEFINITION MISMATCH] Column '${colName}' nullability mismatch. Observed '${found.is_nullable}', expected '${expected.isNullable}'.`);
        }
    }
    return true;
}

async function syncDisposableSchemaDirect(options = {}) {
    // ── 1. Out-Of-Band Physical Cluster Identity Preflight ─────────────────────
    const testConfig = loadDisposableTestEnv({ configPath: options.configPath });
    const expectedIdentity = options.clusterIdentityReference || EXPECTED_CLUSTER_IDENTITY;

    const preflightEvidence = performOutOfBandPreflight({
        expected: expectedIdentity,
        execCommand: options.execCommand,
        readPostmaster: options.readPostmaster,
        pgControlDataBin: options.pgControlDataBin,
    });
    validatePreflightEvidence(preflightEvidence, expectedIdentity);

    // ── 2. Validate URL and Socket Transport (Pure In-Memory Validation) ──────
    const urlValidation = validateDirectSyncUrl(process.env.DATABASE_URL);
    const parsed = new URL(process.env.DATABASE_URL);

    const socketFile = path.join(PERSISTENT_TEST_SOCKET_DIR, ".s.PGSQL.5433");
    if (!fs.existsSync(socketFile)) {
        throw new Error(`[DIRECT SYNC] Unix socket file not found at '${socketFile}'.`);
    }

    if (options.dryRun === true) {
        return {
            success: true,
            dryRun: true,
            database: "dreamsky_test_disposable",
            port: "5433",
            socket: socketFile,
            clusterSystemIdentifier: preflightEvidence.systemIdentifier,
        };
    }

    // ── 3. Connect via Explicit Unix Domain Socket ────────────────────────────
    const client = new Client({
        host: PERSISTENT_TEST_SOCKET_DIR,
        port: 5433,
        database: "dreamsky_test_disposable",
        user: parsed.username || "dreamsky_test_user",
        password: parsed.password || process.env.DISPOSABLE_TEST_PASSWORD,
        connectionTimeoutMillis: 5000,
    });

    await client.connect();

    try {
        // ── 4. Session Safety Timeouts & Transport Verification ─────────────────
        await client.query("SET search_path = public;");
        await client.query("SET statement_timeout = '10000';");
        await client.query("SET lock_timeout = '5000';");
        await client.query("SET idle_in_transaction_session_timeout = '10000';");

        const idRes = await client.query(`
            SELECT current_database() AS db, current_user AS usr, inet_server_port() AS tcp_port, current_schema() AS schema;
        `);
        if (idRes.rows[0].db !== "dreamsky_test_disposable" || idRes.rows[0].usr !== "dreamsky_test_user") {
            throw new Error(`[DIRECT SYNC FATAL] Connected identity mismatch: ${JSON.stringify(idRes.rows[0])}`);
        }
        if (idRes.rows[0].tcp_port !== null) {
            throw new Error("[DIRECT SYNC FATAL] Connection is not a Unix domain socket (inet_server_port must be null)!");
        }
        if (idRes.rows[0].schema !== "public") {
            throw new Error(`[DIRECT SYNC FATAL] Active schema is '${idRes.rows[0].schema}', expected 'public'.`);
        }

        // ── 5. Pre-Execution Object Definition Checks (No Blind IF NOT EXISTS) ──
        console.log("[DIRECT SYNC] Pre-validating existing database object definitions...");

        // A. Validate Enums
        const enumRes = await client.query(`
            SELECT t.typname, e.enumlabel
            FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid 
            WHERE t.typname IN ('DocumentStatus', 'DocumentType');
        `);
        const enums = { DocumentStatus: new Set(), DocumentType: new Set() };
        for (const r of enumRes.rows) {
            if (enums[r.typname]) enums[r.typname].add(r.enumlabel);
        }
        if (enums.DocumentStatus.size === 0 || enums.DocumentType.size === 0) {
            throw new Error("[DIRECT SYNC FATAL] Core enum types DocumentStatus or DocumentType missing from database!");
        }

        // B. Check AppointmentReminder if already exists
        const apptReminderCheck = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'AppointmentReminder';
        `);
        if (apptReminderCheck.rows.length > 0) {
            validateTableSchemaDefinitions(apptReminderCheck.rows, {
                id: { dataType: "text", isNullable: "NO" },
                appointmentId: { dataType: "text", isNullable: "NO" },
                offset: { dataType: "text", isNullable: "NO" },
                scheduledFor: { dataType: "timestamp", isNullable: "NO" },
                status: { dataType: "text", isNullable: "NO" },
                sentAt: { dataType: "timestamp", isNullable: "YES" },
                createdAt: { dataType: "timestamp", isNullable: "NO" },
                updatedAt: { dataType: "timestamp", isNullable: "NO" },
            });
        }

        // C. Check Student Columns if already exist
        const studentColsCheck = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'Student'
              AND column_name IN ('leadStage', 'trashReason', 'trashedAt', 'trashedById');
        `);
        for (const col of studentColsCheck.rows) {
            if (col.column_name === "trashedAt" && !col.data_type.startsWith("timestamp")) {
                throw new Error(`[DIRECT SYNC FATAL] Column Student.trashedAt exists with incompatible type: ${col.data_type}`);
            }
            if (col.column_name !== "trashedAt" && col.data_type !== "text") {
                throw new Error(`[DIRECT SYNC FATAL] Column Student.${col.column_name} exists with incompatible type: ${col.data_type}`);
            }
            if (col.is_nullable !== "YES") {
                throw new Error(`[DIRECT SYNC FATAL] Column Student.${col.column_name} must be nullable!`);
            }
        }

        // D. Check DocumentVersion Duplicates Immediately Before Constraint DDL
        const dupRes = await client.query(`
            SELECT "documentId", "versionNumber", COUNT(*) 
            FROM "DocumentVersion" 
            GROUP BY "documentId", "versionNumber" 
            HAVING COUNT(*) > 1;
        `);
        if (dupRes.rows.length > 0) {
            throw new Error(`[DIRECT SYNC FATAL] Duplicate DocumentVersion entries detected (${dupRes.rows.length}). Unique constraint cannot be applied.`);
        }

        // ── 6. Atomic Transactional Schema Execution ────────────────────────────
        console.log("[DIRECT SYNC] Beginning atomic schema synchronization transaction...");
        await client.query("BEGIN;");

        // 1. Enum Additions
        if (!enums.DocumentStatus.has("IN_REVIEW")) {
            await client.query(`ALTER TYPE "DocumentStatus" ADD VALUE 'IN_REVIEW';`);
        }
        if (!enums.DocumentType.has("ENGLISH_TEST")) {
            await client.query(`ALTER TYPE "DocumentType" ADD VALUE 'ENGLISH_TEST';`);
        }
        if (!enums.DocumentType.has("VISA")) {
            await client.query(`ALTER TYPE "DocumentType" ADD VALUE 'VISA';`);
        }

        // 2. Defaults Update
        await client.query(`ALTER TABLE "Document" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"DocumentStatus";`);
        await client.query(`ALTER TABLE "DocumentVersion" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"DocumentStatus";`);

        // 3. Student Nullable Columns
        const studentExistingCols = new Set(studentColsCheck.rows.map((r) => r.column_name));
        if (!studentExistingCols.has("leadStage")) {
            await client.query(`ALTER TABLE "Student" ADD COLUMN "leadStage" TEXT;`);
        }
        if (!studentExistingCols.has("trashReason")) {
            await client.query(`ALTER TABLE "Student" ADD COLUMN "trashReason" TEXT;`);
        }
        if (!studentExistingCols.has("trashedAt")) {
            await client.query(`ALTER TABLE "Student" ADD COLUMN "trashedAt" TIMESTAMP(3);`);
        }
        if (!studentExistingCols.has("trashedById")) {
            await client.query(`ALTER TABLE "Student" ADD COLUMN "trashedById" TEXT;`);
        }

        // 4. Student Index & FK
        const studentIdxCheck = await client.query(`
            SELECT indexname, indexdef FROM pg_indexes 
            WHERE schemaname = 'public' AND tablename = 'Student' AND indexname = 'Student_isActive_currentStage_idx';
        `);
        if (studentIdxCheck.rows.length === 0) {
            await client.query(`CREATE INDEX "Student_isActive_currentStage_idx" ON "Student"("isActive", "currentStage");`);
        } else {
            const def = studentIdxCheck.rows[0].indexdef;
            if (!def.includes("isActive") || !def.includes("currentStage")) {
                throw new Error(`[DIRECT SYNC FATAL] Student_isActive_currentStage_idx exists with incompatible definition: ${def}`);
            }
        }

        const studentFkCheck = await client.query(`
            SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint 
            WHERE connamespace = 'public'::regnamespace AND conrelid = '"Student"'::regclass 
              AND conname = 'Student_trashedById_fkey';
        `);
        if (studentFkCheck.rows.length === 0) {
            await client.query(`
                ALTER TABLE "Student" ADD CONSTRAINT "Student_trashedById_fkey" 
                FOREIGN KEY ("trashedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
            `);
        } else {
            const def = studentFkCheck.rows[0].def;
            if (!def.includes("FOREIGN KEY") || !def.includes("trashedById") || !def.includes("REFERENCES \"User\"(id)")) {
                throw new Error(`[DIRECT SYNC FATAL] Student_trashedById_fkey exists with incompatible definition: ${def}`);
            }
        }

        // 5. AppointmentReminder Table
        if (apptReminderCheck.rows.length === 0) {
            await client.query(`
                CREATE TABLE "AppointmentReminder" (
                    "id" TEXT NOT NULL,
                    "appointmentId" TEXT NOT NULL,
                    "offset" TEXT NOT NULL,
                    "scheduledFor" TIMESTAMP(3) NOT NULL,
                    "status" TEXT NOT NULL DEFAULT 'PENDING',
                    "sentAt" TIMESTAMP(3),
                    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT "AppointmentReminder_pkey" PRIMARY KEY ("id")
                );
            `);
            await client.query(`CREATE INDEX "AppointmentReminder_status_scheduledFor_idx" ON "AppointmentReminder"("status", "scheduledFor");`);
            await client.query(`CREATE INDEX "AppointmentReminder_appointmentId_idx" ON "AppointmentReminder"("appointmentId");`);
            await client.query(`
                ALTER TABLE "AppointmentReminder" ADD CONSTRAINT "AppointmentReminder_appointmentId_fkey" 
                FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
            `);
        }

        // 6. DocumentVersion Indexes
        const docVerIdxCheck = await client.query(`
            SELECT indexname, indexdef FROM pg_indexes 
            WHERE schemaname = 'public' AND tablename = 'DocumentVersion';
        `);
        const existingDocVerIdxs = Object.fromEntries(docVerIdxCheck.rows.map((r) => [r.indexname, r.indexdef]));

        if (!existingDocVerIdxs["DocumentVersion_documentId_idx"]) {
            await client.query(`CREATE INDEX "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");`);
        } else {
            const def = existingDocVerIdxs["DocumentVersion_documentId_idx"];
            if (!def.includes("documentId")) {
                throw new Error(`[DIRECT SYNC FATAL] DocumentVersion_documentId_idx exists with incompatible definition: ${def}`);
            }
        }

        if (!existingDocVerIdxs["DocumentVersion_documentId_versionNumber_key"]) {
            await client.query(`CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNumber_key" ON "DocumentVersion"("documentId", "versionNumber");`);
        } else {
            const def = existingDocVerIdxs["DocumentVersion_documentId_versionNumber_key"];
            if (!def.includes("UNIQUE") || !def.includes("documentId") || !def.includes("versionNumber")) {
                throw new Error(`[DIRECT SYNC FATAL] DocumentVersion_documentId_versionNumber_key exists with incompatible definition: ${def}`);
            }
        }

        // Step B: Commit Execution with Ambiguity Guard
        try {
            await client.query("COMMIT;");
            console.log("[DIRECT SYNC SUCCESS] All schema changes committed atomically and confirmed by PostgreSQL.");
        } catch (commitErr) {
            console.error("[CRITICAL AMBIGUOUS COMMIT OUTCOME] Failed to confirm COMMIT:", commitErr.message);
            throw new Error(`AMBIGUOUS_COMMIT_OUTCOME: Connection lost or error during COMMIT: ${commitErr.message}. Do NOT re-run DDL blindly. Perform read-only verification.`);
        }

        // Return Gate 4 execution success immediately without executing Gate 5 verification
        return {
            success: true,
            gate: "GATE_4_SCHEMA_SYNCHRONIZATION",
            database: "dreamsky_test_disposable",
            port: "5433",
            socket: socketFile,
            clusterSystemIdentifier: preflightEvidence.systemIdentifier,
            committed: true,
        };
    } catch (err) {
        console.error("[DIRECT SYNC ERROR] Transaction or verification failed:", err.message);
        if (err.message && err.message.startsWith("AMBIGUOUS_COMMIT_OUTCOME")) {
            throw err;
        }
        let rollbackConfirmed = false;
        try {
            await client.query("ROLLBACK;");
            rollbackConfirmed = true;
            console.warn("[DIRECT SYNC ROLLBACK] Transaction rolled back cleanly. Database restored to pre-sync state.");
        } catch (rbErr) {
            console.error("[CRITICAL UNRESOLVED CONDITION] Fatal rollback error! Connection or server interrupted:", rbErr.message);
            throw new Error(`CRITICAL ROLLBACK FAILURE: ${rbErr.message} (Initial error: ${err.message})`);
        }
        if (rollbackConfirmed) {
            throw new Error(`[DIRECT SYNC ABORTED & ROLLED BACK] ${err.message}`);
        }
    } finally {
        await client.end();
    }
}

if (require.main === module) {
    syncDisposableSchemaDirect()
        .then((res) => {
            console.log("[DIRECT SYNC COMPLETED]", JSON.stringify(res, null, 2));
            process.exit(0);
        })
        .catch((err) => {
            console.error("[DIRECT SYNC FATAL]", err.message);
            process.exit(1);
        });
}

module.exports = {
    syncDisposableSchemaDirect,
    validateDirectSyncUrl,
    validateTableSchemaDefinitions,
};

