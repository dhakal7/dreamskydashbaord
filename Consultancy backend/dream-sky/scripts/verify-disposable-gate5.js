/**
 * verify-disposable-gate5.js — Gate 5: Read-Only Post-Synchronization Verification
 *
 * Strict read-only verification runner for DreamSky CRM disposable database.
 * Confirms that all schema changes committed in Gate 4 match prisma/schema.prisma,
 * all baseline records are intact, manifests match their SHA-256 hashes, and
 * zero database mutations are performed.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
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

const EXPECTED_MANIFEST_SHA256 = "1bd5af597c2bed288c64b14c70d2c71504fdb5af15066a33a03da017898e5f93";

const EXPECTED_36_MODELS = [
    "PartnerConsultancy", "Branch", "User", "CounselorProfile",
    "TeacherProfile", "ReferralAgentProfile", "Student", "PipelineStageHistory",
    "TestScore", "Document", "DocumentVersion", "CommunicationLog",
    "Appointment", "AppointmentReminder", "Payment", "Transaction",
    "Application", "Offer", "VisaCase", "Country",
    "University", "Course", "RecommendationResult", "CommissionRule",
    "Commission", "Class", "Enrollment", "AttendanceRecord",
    "ClassContent", "Event", "EventReminder", "NotificationTemplate",
    "Notification", "PublicInquiry", "AuditLog", "RefreshToken"
];

function computeFileSha256(filePath) {
    const data = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(data).digest("hex");
}

async function runGate5Verification() {
    const report = {
        timestamp: new Date().toISOString(),
        verdict: "PENDING",
        identity: {},
        manifests: {},
        schema: {},
        student: {},
        appointmentReminder: {},
        documentAndVersion: {},
        prismaDiff: {},
        baselineData: {},
        safetyAttestation: {}
    };

    console.log("==================================================================");
    console.log("DreamSky CRM — Phase 34B.8F.6: Gate 5 Read-Only Verification");
    console.log("==================================================================");

    // ── 1. Out-of-band preflight check ───────────────────────────────────────
    console.log("[STEP 1] Validating Physical Cluster Identity...");
    loadDisposableTestEnv();
    const preflight = performOutOfBandPreflight({
        expected: EXPECTED_CLUSTER_IDENTITY,
    });
    validatePreflightEvidence(preflight, EXPECTED_CLUSTER_IDENTITY);

    report.identity.clusterDirectory = PERSISTENT_TEST_CLUSTER_DIR;
    report.identity.systemIdentifier = preflight.systemIdentifier;
    report.identity.pid = preflight.pid;
    report.identity.socketDirectory = PERSISTENT_TEST_SOCKET_DIR;

    const socketFile = path.join(PERSISTENT_TEST_SOCKET_DIR, ".s.PGSQL.5433");
    if (!fs.existsSync(socketFile)) {
        throw new Error(`Socket file missing at ${socketFile}`);
    }
    report.identity.socketFileExists = true;
    console.log(`[PASS] Physical cluster verified: ID=${preflight.systemIdentifier}, PID=${preflight.pid}`);

    // ── 2. Manifest Hash Integrity ───────────────────────────────────────────
    console.log("[STEP 2] Verifying Manifest Hashes...");
    const manifestPath = path.resolve(__dirname, "../.disposable-fixture-manifest.json");
    const manifestBakPath = path.resolve(__dirname, "../.disposable-fixture-manifest.json.bak");

    const manifestSha = computeFileSha256(manifestPath);
    const manifestBakSha = computeFileSha256(manifestBakPath);

    report.manifests.manifestSha = manifestSha;
    report.manifests.manifestBakSha = manifestBakSha;
    report.manifests.expectedSha = EXPECTED_MANIFEST_SHA256;
    report.manifests.match = (manifestSha === EXPECTED_MANIFEST_SHA256 && manifestBakSha === EXPECTED_MANIFEST_SHA256);

    if (!report.manifests.match) {
        throw new Error(`Manifest hash mismatch! Observed: ${manifestSha}, Expected: ${EXPECTED_MANIFEST_SHA256}`);
    }
    console.log(`[PASS] Both manifests match SHA-256: ${EXPECTED_MANIFEST_SHA256}`);

    // ── 3. Database Connection & Transport Identity ──────────────────────────
    console.log("[STEP 3] Connecting strictly via Unix Domain Socket to dreamsky_test_disposable...");
    const parsed = new URL(process.env.DATABASE_URL);
    if (parsed.port === "5432" || process.env.DATABASE_URL.toLowerCase().includes("dreamsky_db")) {
        throw new Error("FATAL: Port 5432 or dreamsky_db is strictly prohibited!");
    }

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
        // Enforce statement timeout and session parameters
        await client.query("SET search_path = public;");
        await client.query("SET statement_timeout = '10000';");

        const idQuery = await client.query(`
            SELECT current_database() AS db, current_user AS usr, current_setting('port') AS port, inet_server_port() AS tcp_port;
        `);
        const idRow = idQuery.rows[0];
        report.identity.db = idRow.db;
        report.identity.user = idRow.usr;
        report.identity.portSetting = idRow.port;
        report.identity.tcpPort = idRow.tcp_port;

        if (idRow.db !== "dreamsky_test_disposable" || idRow.usr !== "dreamsky_test_user" || idRow.port !== "5433" || idRow.tcp_port !== null) {
            throw new Error(`Connected identity check failed: ${JSON.stringify(idRow)}`);
        }
        console.log(`[PASS] DB Identity verified: db=${idRow.db}, user=${idRow.usr}, port=${idRow.port}, inet_server_port=NULL (Socket connection confirmed)`);

        // ── 4. Read-Only Transaction Schema Verification ─────────────────────
        console.log("[STEP 4] Opening explicit READ ONLY transaction...");
        await client.query("BEGIN TRANSACTION READ ONLY;");

        // 4A. Table Inventory
        const tablesRes = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        `);
        const existingTables = new Set(tablesRes.rows.map(r => r.table_name));
        report.schema.totalTables = existingTables.size;
        report.schema.tableList = Array.from(existingTables);

        const missingModels = EXPECTED_36_MODELS.filter(m => !existingTables.has(m));
        report.schema.missingModels = missingModels;
        if (missingModels.length > 0) {
            throw new Error(`Missing expected Prisma tables: ${missingModels.join(", ")}`);
        }
        console.log(`[PASS] All 36 Prisma base tables exist in database (Total base tables: ${existingTables.size})`);

        // 4B. Enum Verification
        const enumRes = await client.query(`
            SELECT t.typname, ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder) AS labels
            FROM pg_type t 
            JOIN pg_enum e ON t.oid = e.enumtypid 
            JOIN pg_namespace n ON t.typnamespace = n.oid
            WHERE n.nspname = 'public'
            GROUP BY t.typname
            ORDER BY t.typname;
        `);
        const enums = Object.fromEntries(enumRes.rows.map(r => [r.typname, r.labels]));
        report.schema.enums = enums;

        // Check required enums and new values
        if (!enums.DocumentStatus || !enums.DocumentStatus.includes("IN_REVIEW")) {
            throw new Error("DocumentStatus enum missing IN_REVIEW");
        }
        if (!enums.DocumentType || !enums.DocumentType.includes("ENGLISH_TEST") || !enums.DocumentType.includes("VISA")) {
            throw new Error("DocumentType enum missing ENGLISH_TEST or VISA");
        }
        console.log("[PASS] Enums verified: DocumentStatus has IN_REVIEW; DocumentType has ENGLISH_TEST and VISA.");

        // 4C. Student Column & Index & FK Verification
        console.log("[STEP 4C] Verifying Student table additions...");
        const studentColsRes = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'Student'
              AND column_name IN ('leadStage', 'trashReason', 'trashedAt', 'trashedById');
        `);
        report.student.columns = studentColsRes.rows;
        if (studentColsRes.rows.length !== 4) {
            throw new Error(`Expected 4 target Student columns, found ${studentColsRes.rows.length}`);
        }
        for (const col of studentColsRes.rows) {
            if (col.column_name === "trashedAt") {
                if (!col.data_type.startsWith("timestamp")) throw new Error(`Student.trashedAt type mismatch: ${col.data_type}`);
            } else {
                if (col.data_type !== "text") throw new Error(`Student.${col.column_name} type mismatch: ${col.data_type}`);
            }
            if (col.is_nullable !== "YES") throw new Error(`Student.${col.column_name} is not nullable!`);
        }

        const studentIdxRes = await client.query(`
            SELECT indexname, indexdef FROM pg_indexes 
            WHERE schemaname = 'public' AND tablename = 'Student' AND indexname = 'Student_isActive_currentStage_idx';
        `);
        if (studentIdxRes.rows.length === 0) throw new Error("Index Student_isActive_currentStage_idx missing!");
        report.student.index = studentIdxRes.rows[0];

        const studentFkRes = await client.query(`
            SELECT conname, pg_get_constraintdef(oid) AS def 
            FROM pg_constraint 
            WHERE connamespace = 'public'::regnamespace AND conrelid = '"Student"'::regclass 
              AND conname = 'Student_trashedById_fkey';
        `);
        if (studentFkRes.rows.length === 0) throw new Error("Foreign key Student_trashedById_fkey missing!");
        report.student.foreignKey = studentFkRes.rows[0];
        console.log("[PASS] Student columns, index, and foreign key verified.");

        // 4D. AppointmentReminder Table Verification
        console.log("[STEP 4D] Verifying AppointmentReminder complete definition...");
        const apptColsRes = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'AppointmentReminder'
            ORDER BY ordinal_position;
        `);
        report.appointmentReminder.columns = apptColsRes.rows;
        if (apptColsRes.rows.length !== 8) {
            throw new Error(`AppointmentReminder expected 8 columns, found ${apptColsRes.rows.length}`);
        }

        const apptPkRes = await client.query(`
            SELECT conname, pg_get_constraintdef(oid) AS def 
            FROM pg_constraint 
            WHERE connamespace = 'public'::regnamespace AND conrelid = '"AppointmentReminder"'::regclass 
              AND contype = 'p';
        `);
        report.appointmentReminder.pk = apptPkRes.rows[0];
        if (!apptPkRes.rows[0] || !apptPkRes.rows[0].def.includes("(id)")) {
            throw new Error("AppointmentReminder PK constraint missing or invalid!");
        }

        const apptIdxRes = await client.query(`
            SELECT indexname, indexdef FROM pg_indexes 
            WHERE schemaname = 'public' AND tablename = 'AppointmentReminder';
        `);
        report.appointmentReminder.indexes = apptIdxRes.rows;
        const apptIdxMap = Object.fromEntries(apptIdxRes.rows.map(r => [r.indexname, r.indexdef]));
        if (!apptIdxMap["AppointmentReminder_status_scheduledFor_idx"] || !apptIdxMap["AppointmentReminder_appointmentId_idx"]) {
            throw new Error("AppointmentReminder indexes missing!");
        }

        const apptFkRes = await client.query(`
            SELECT conname, pg_get_constraintdef(oid) AS def 
            FROM pg_constraint 
            WHERE connamespace = 'public'::regnamespace AND conrelid = '"AppointmentReminder"'::regclass 
              AND conname = 'AppointmentReminder_appointmentId_fkey';
        `);
        report.appointmentReminder.foreignKey = apptFkRes.rows[0];
        if (!apptFkRes.rows[0] || !apptFkRes.rows[0].def.includes("CASCADE")) {
            throw new Error("AppointmentReminder foreign key missing or lacks CASCADE!");
        }
        console.log("[PASS] AppointmentReminder complete table definition, PK, indexes, and FK verified.");

        // 4E. Document & DocumentVersion Verification
        console.log("[STEP 4E] Verifying Document and DocumentVersion defaults and indexes...");
        const docDefaultsRes = await client.query(`
            SELECT table_name, column_name, column_default 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name IN ('Document', 'DocumentVersion') AND column_name = 'status';
        `);
        report.documentAndVersion.defaults = docDefaultsRes.rows;
        for (const row of docDefaultsRes.rows) {
            if (!row.column_default || !row.column_default.includes("'PENDING'::\"DocumentStatus\"")) {
                throw new Error(`${row.table_name}.status default is '${row.column_default}', expected 'PENDING'::"DocumentStatus"`);
            }
        }

        const docVerIdxRes = await client.query(`
            SELECT indexname, indexdef FROM pg_indexes 
            WHERE schemaname = 'public' AND tablename = 'DocumentVersion';
        `);
        report.documentAndVersion.indexes = docVerIdxRes.rows;
        const docVerIdxMap = Object.fromEntries(docVerIdxRes.rows.map(r => [r.indexname, r.indexdef]));
        if (!docVerIdxMap["DocumentVersion_documentId_idx"]) {
            throw new Error("Index DocumentVersion_documentId_idx missing!");
        }
        if (!docVerIdxMap["DocumentVersion_documentId_versionNumber_key"] || !docVerIdxMap["DocumentVersion_documentId_versionNumber_key"].includes("UNIQUE")) {
            throw new Error("Unique index DocumentVersion_documentId_versionNumber_key missing or not unique!");
        }
        console.log("[PASS] Document and DocumentVersion defaults and unique constraints verified.");

        // ── 5. Baseline Data Integrity ───────────────────────────────────────
        console.log("[STEP 5] Checking baseline synthetic records integrity...");
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        const rawFixtures = manifest.fixtures || manifest.records || [];

        // Group fixtures by model/table
        const fixturesByModel = {};
        if (Array.isArray(rawFixtures)) {
            for (const item of rawFixtures) {
                const model = item.model || item.table;
                if (!fixturesByModel[model]) fixturesByModel[model] = [];
                fixturesByModel[model].push(item.id);
            }
        } else if (typeof rawFixtures === "object") {
            for (const [model, recs] of Object.entries(rawFixtures)) {
                if (Array.isArray(recs)) {
                    fixturesByModel[model] = recs.map(r => typeof r === "object" ? r.id : r);
                }
            }
        }

        let verifiedFixturesCount = 0;
        const fixtureBreakdown = {};

        for (const [table, ids] of Object.entries(fixturesByModel)) {
            fixtureBreakdown[table] = ids.length;
            const res = await client.query(`
                SELECT count(*)::int AS cnt FROM "${table}" WHERE "id" = ANY($1::text[]);
            `, [ids]);
            if (res.rows[0].cnt !== ids.length) {
                throw new Error(`Data mismatch in table ${table}: expected ${ids.length}, found ${res.rows[0].cnt}`);
            }
            verifiedFixturesCount += res.rows[0].cnt;
        }

        const auditLogRes = await client.query(`SELECT count(*)::int AS cnt FROM "AuditLog";`);
        const notificationRes = await client.query(`SELECT count(*)::int AS cnt FROM "Notification";`);

        const totalAuditLogs = auditLogRes.rows[0].cnt;
        const totalNotifications = notificationRes.rows[0].cnt;
        const grandTotalBaseline = verifiedFixturesCount + totalAuditLogs + totalNotifications;

        report.baselineData = {
            verifiedFixturesCount,
            fixtureBreakdown,
            totalAuditLogs,
            totalNotifications,
            grandTotalBaseline,
            expectedTotal: 54,
            intact: (verifiedFixturesCount === 24 && totalAuditLogs === 24 && totalNotifications === 6 && grandTotalBaseline === 54)
        };

        if (!report.baselineData.intact) {
            throw new Error(`Baseline record count mismatch! Observed ${grandTotalBaseline}, expected 54`);
        }
        console.log(`[PASS] Baseline records intact: 24 manifest fixtures, 24 AuditLogs, 6 Notifications (Total: ${grandTotalBaseline}/54)`);

        // Roll back the read-only transaction cleanly
        await client.query("ROLLBACK;");
        console.log("[PASS] Read-only transaction rolled back cleanly. 0 database mutations performed.");

    } finally {
        await client.end();
    }

    // ── 6. Prisma Migrate Diff ───────────────────────────────────────────────
    console.log("[STEP 6] Executing Prisma migrate diff comparison...");
    const prismaSocketUrl = `postgresql://${parsed.username}:${parsed.password}@localhost:5433/dreamsky_test_disposable?host=${PERSISTENT_TEST_SOCKET_DIR}`;
    let diffStdout = "";
    let diffExitCode = -1;

    try {
        diffStdout = execFileSync("./node_modules/.bin/prisma", [
            "migrate", "diff",
            "--from-config-datasource",
            "--to-schema", "prisma/schema.prisma",
            "--exit-code"
        ], {
            env: {
                ...process.env,
                DATABASE_URL: prismaSocketUrl,
            },
            encoding: "utf8"
        });
        diffExitCode = 0;
    } catch (diffErr) {
        diffExitCode = diffErr.status !== undefined ? diffErr.status : 1;
        diffStdout = (diffErr.stdout || "") + "\n" + (diffErr.stderr || "");
    }

    report.prismaDiff = {
        exitCode: diffExitCode,
        output: diffStdout.trim(),
        zeroDrift: (diffExitCode === 0 && diffStdout.includes("No difference detected"))
    };

    if (!report.prismaDiff.zeroDrift) {
        throw new Error(`Prisma migrate diff reported differences or failed: exitCode=${diffExitCode}, output=${diffStdout}`);
    }
    console.log(`[PASS] Prisma migrate diff exit code: 0 ("No difference detected.")`);

    // ── 7. Overall Verdict & Attestation ──────────────────────────────────────
    report.verdict = "PASS";
    report.safetyAttestation = {
        readOnlyEnforced: true,
        zeroMutations: true,
        port5432Protected: true,
        dreamskyDbUntouched: true,
        baselinePreserved: true,
        manifestHashesVerified: true,
    };

    console.log("==================================================================");
    console.log("GATE 5 VERIFICATION: PASS");
    console.log("==================================================================");

    return report;
}

if (require.main === module) {
    runGate5Verification()
        .then((report) => {
            fs.writeFileSync(
                path.resolve(__dirname, "gate5-verification-result.json"),
                JSON.stringify(report, null, 2)
            );
            console.log("[GATE 5 COMPLETED] Result saved to scripts/gate5-verification-result.json");
            process.exit(0);
        })
        .catch((err) => {
            console.error("[GATE 5 FATAL ERROR]", err.message);
            process.exit(1);
        });
}

module.exports = {
    runGate5Verification,
};
