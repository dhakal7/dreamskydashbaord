/**
 * cleanup-disposable-fixtures.js — Deterministic, Dependency-Aware Synthetic Teardown
 *
 * Dedicated fail-closed cleanup runner for disposable database integration testing
 * against the isolated disposable PostgreSQL cluster (port 5433 / dreamsky_test_disposable).
 *
 * SAFETY INVARIANTS:
 * - ZERO deleteMany({}) or unrestricted table-wide deletions.
 * - Every deletion is a targeted deleteById with an exact, verified synthetic primary key.
 * - Strict persistent Unix-socket enforcement and database identity validation.
 * - Revalidates database identity on the active connection before every destructive phase.
 * - Fails closed and halts immediately on the first error to prevent deleting parent records
 *   when child records fail to delete.
 * - Treats Prisma P2025 as an idempotent no-op only for explicitly targeted records.
 * - Records full failure manifests without exposing secrets or connection strings.
 * - Never executes without explicit runtime invocation.
 */

require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH || ".env.test.disposable", override: false });
const fs = require("fs");
const path = require("path");
const { assertDisposableTarget, validateDatabaseUrl } = require("../src/config");
const {
    EXPECTED_CLUSTER_IDENTITY,
    validateSeederDatabaseUrl,
    createSeederPrismaClient,
    verifyClusterIdentity,
    performOutOfBandPreflight,
    MANIFEST_PATH,
} = require("./seed-disposable-fixtures");

const CLEANUP_FAILURE_LOG_PATH = path.resolve(__dirname, "../rehearsal-cleanup-failure.json");

const SYNTHETIC_STUDENT_IDS = Object.freeze([
    "test-syn-r28a-st-1",
    "test-syn-r28a-st-2",
    "test-syn-r28a-st-unassigned",
    "test-syn-r28a-st-br2",
]);

const SYNTHETIC_USER_IDS = Object.freeze([
    "test-syn-r28a-usr-sa",
    "test-syn-r28a-usr-ba1",
    "test-syn-r28a-usr-ba2",
    "test-syn-r28a-usr-cn1",
    "test-syn-r28a-usr-cn2",
]);

const SYNTHETIC_BRANCH_IDS = Object.freeze([
    "test-syn-r28a-br-1",
    "test-syn-r28a-br-2",
]);

const PRESEEDED_OPERATIONAL_IDS = Object.freeze({
    visaCase: "test-syn-r28a-visa-1",
    application: "test-syn-r28a-app-1",
    transaction: "test-syn-r28a-tx-1",
    payment: "test-syn-r28a-pay-1",
    documentVersion: "test-syn-r28a-docv-1",
    document: "test-syn-r28a-doc-1",
    appointment: "test-syn-r28a-apt-1",
    communicationLog: "test-syn-r28a-log-1",
    course: "test-syn-r28a-crs-1",
    university: "test-syn-r28a-uni-1",
    country: "test-syn-r28a-cry-1",
    counselorProfiles: ["test-syn-r28a-prf-cn1", "test-syn-r28a-prf-cn2"],
});

const ALL_SYNTHETIC_ENTITY_IDS = Object.freeze([
    ...SYNTHETIC_STUDENT_IDS,
    ...SYNTHETIC_USER_IDS,
    ...SYNTHETIC_BRANCH_IDS,
    PRESEEDED_OPERATIONAL_IDS.visaCase,
    PRESEEDED_OPERATIONAL_IDS.application,
    PRESEEDED_OPERATIONAL_IDS.transaction,
    PRESEEDED_OPERATIONAL_IDS.payment,
    PRESEEDED_OPERATIONAL_IDS.documentVersion,
    PRESEEDED_OPERATIONAL_IDS.document,
    PRESEEDED_OPERATIONAL_IDS.appointment,
    PRESEEDED_OPERATIONAL_IDS.communicationLog,
    PRESEEDED_OPERATIONAL_IDS.course,
    PRESEEDED_OPERATIONAL_IDS.university,
    PRESEEDED_OPERATIONAL_IDS.country,
    ...PRESEEDED_OPERATIONAL_IDS.counselorProfiles,
]);

/**
 * Validates the synthetic test run identifier format.
 *
 * @param {string} testRunId
 */
function validateTestRunId(testRunId) {
    if (!testRunId || typeof testRunId !== "string" || !testRunId.trim()) {
        throw new Error("[CLEANUP SAFETY ERROR] testRunId is required for synthetic cleanup.");
    }
    const trimmed = testRunId.trim();
    if (!trimmed.startsWith("syn-run-") && !trimmed.startsWith("test-syn-r28a-")) {
        throw new Error(`[CLEANUP SAFETY ERROR] Invalid testRunId format '${trimmed}'. Must begin with 'syn-run-' or 'test-syn-r28a-'.`);
    }
    return trimmed;
}

/**
 * Revalidates database identity on the same active connection before a destructive phase.
 * Halts immediately if the connection is lost, changed, or does not match disposable cluster.
 *
 * @param {object} prisma
 * @param {string} phaseName
 * @param {object} [expected]
 */
async function revalidateIdentityOnConnection(prisma, phaseName, expected = EXPECTED_CLUSTER_IDENTITY) {
    try {
        const rows = await prisma.$queryRawUnsafe(`
            SELECT 
                current_database() AS db_name,
                current_user AS role_name,
                inet_server_port() AS server_port,
                inet_server_addr()::text AS server_addr
        `);
        const meta = rows[0] || {};
        if (meta.db_name !== expected.database) {
            throw new Error(`Connected database changed to '${meta.db_name}'. Expected '${expected.database}'.`);
        }
        if (meta.role_name !== expected.role) {
            throw new Error(`Connected role changed to '${meta.role_name}'. Expected '${expected.role}'.`);
        }
        if (meta.server_port !== null && meta.server_port !== undefined) {
            throw new Error(`Connection reverted to TCP (port ${meta.server_port}). Unix socket required.`);
        }
    } catch (err) {
        throw new Error(`[CLEANUP ABORT - IDENTITY CHECK FAILED BEFORE ${phaseName}] ${err.message}`);
    }
}

/**
 * Executes a single targeted record deletion by exact primary key.
 * Treats Prisma P2025 ("Record to delete does not exist") as an idempotent no-op.
 * Aborts on any other database error.
 *
 * @param {object} prisma
 * @param {string} modelDelegate - e.g. "student", "user", "auditLog"
 * @param {string} id - Exact primary key
 * @returns {Promise<{id: string, deleted: boolean, alreadyAbsent: boolean}>}
 */
async function deleteTargetedRecord(prisma, modelDelegate, id) {
    if (!id || typeof id !== "string") {
        throw new Error(`[CLEANUP ERROR] Invalid ID provided for ${modelDelegate} deletion.`);
    }

    try {
        await prisma[modelDelegate].delete({ where: { id } });
        return { id, deleted: true, alreadyAbsent: false };
    } catch (err) {
        if (err.code === "P2025") {
            // Prisma error code P2025: An operation failed because it depends on one or more records that were required but not found.
            // Safe idempotent no-op: targeted synthetic record is already absent.
            return { id, deleted: false, alreadyAbsent: true };
        }
        // Fail closed on every other unexpected error
        throw err;
    }
}

/**
 * Sanitizes error messages by removing connection strings, tokens, and system paths.
 *
 * @param {string} message
 * @returns {string}
 */
function sanitizeErrorMessage(message) {
    if (!message) return "Unknown error";
    return String(message)
        .replace(/postgresql:\/\/[^@\s]+@/g, "postgresql://[REDACTED]@")
        .replace(/\/Users\/[^\s/]+/g, "/[REDACTED_USER_PATH]");
}

/**
 * Writes an unrecoverable failure manifest when cleanup encounters an error.
 *
 * @param {object} failureDetails
 */
function writeCleanupFailureManifest(failureDetails) {
    try {
        const payload = {
            ...failureDetails,
            failedAt: new Date().toISOString(),
            error: sanitizeErrorMessage(failureDetails.error),
        };
        fs.writeFileSync(CLEANUP_FAILURE_LOG_PATH, JSON.stringify(payload, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
        console.error(`[CLEANUP FAILURE MANIFEST WRITTEN] ${CLEANUP_FAILURE_LOG_PATH}`);
    } catch (err) {
        console.error("[CLEANUP FAILURE MANIFEST FAILED TO WRITE]", err.message);
    }
}

/**
 * Discovers dynamically created child records linked to synthetic entities.
 * Uses explicit parent relationships and safe, narrow selectors.
 *
 * @param {object} prisma
 * @returns {Promise<object>} Map of discovered dynamic record IDs grouped by entity
 */
async function discoverDynamicRecords(prisma) {
    // 1. Dynamic AuditLogs (where actor is synthetic user OR entityId is any synthetic entity)
    const auditLogs = await prisma.auditLog.findMany({
        where: {
            OR: [
                { actorId: { in: [...SYNTHETIC_USER_IDS] } },
                { entityId: { in: [...ALL_SYNTHETIC_ENTITY_IDS] } },
            ],
        },
        select: { id: true },
    });

    // 2. Dynamic Portal Users (where user.studentId is one of synthetic students)
    const portalUsers = await prisma.user.findMany({
        where: {
            studentId: { in: [...SYNTHETIC_STUDENT_IDS] },
            id: { notIn: [...SYNTHETIC_USER_IDS] },
        },
        select: { id: true },
    });

    // 3. Dynamic PipelineStageHistory (where changedById is synthetic user OR studentId is synthetic student)
    const stageHistories = await prisma.pipelineStageHistory.findMany({
        where: {
            OR: [
                { changedById: { in: [...SYNTHETIC_USER_IDS] } },
                { studentId: { in: [...SYNTHETIC_STUDENT_IDS] } },
            ],
        },
        select: { id: true },
    });

    // 4. Dynamic DocumentVersions (attached to documents of synthetic students, excluding pre-seeded docv)
    const docVersions = await prisma.documentVersion.findMany({
        where: {
            document: { studentId: { in: [...SYNTHETIC_STUDENT_IDS] } },
            id: { not: PRESEEDED_OPERATIONAL_IDS.documentVersion },
        },
        select: { id: true },
    });

    // 5. Dynamic Documents (for synthetic students, excluding pre-seeded document)
    const documents = await prisma.document.findMany({
        where: {
            studentId: { in: [...SYNTHETIC_STUDENT_IDS] },
            id: { not: PRESEEDED_OPERATIONAL_IDS.document },
        },
        select: { id: true },
    });

    // 6. Dynamic VisaCases (attached to applications of synthetic students, excluding pre-seeded visa)
    const visaCases = await prisma.visaCase.findMany({
        where: {
            application: { studentId: { in: [...SYNTHETIC_STUDENT_IDS] } },
            id: { not: PRESEEDED_OPERATIONAL_IDS.visaCase },
        },
        select: { id: true },
    });

    // 7. Dynamic Applications (for synthetic students, excluding pre-seeded application)
    const applications = await prisma.application.findMany({
        where: {
            studentId: { in: [...SYNTHETIC_STUDENT_IDS] },
            id: { not: PRESEEDED_OPERATIONAL_IDS.application },
        },
        select: { id: true },
    });

    // 8. Dynamic Transactions (for payments of synthetic students, excluding pre-seeded tx)
    const transactions = await prisma.transaction.findMany({
        where: {
            payment: { studentId: { in: [...SYNTHETIC_STUDENT_IDS] } },
            id: { not: PRESEEDED_OPERATIONAL_IDS.transaction },
        },
        select: { id: true },
    });

    // 9. Dynamic Payments (for synthetic students, excluding pre-seeded payment)
    const payments = await prisma.payment.findMany({
        where: {
            studentId: { in: [...SYNTHETIC_STUDENT_IDS] },
            id: { not: PRESEEDED_OPERATIONAL_IDS.payment },
        },
        select: { id: true },
    });

    // 10. Dynamic Appointments (for synthetic students, excluding pre-seeded appointment)
    const appointments = await prisma.appointment.findMany({
        where: {
            studentId: { in: [...SYNTHETIC_STUDENT_IDS] },
            id: { not: PRESEEDED_OPERATIONAL_IDS.appointment },
        },
        select: { id: true },
    });

    // 11. Dynamic CommunicationLogs (for synthetic students, excluding pre-seeded log)
    const communicationLogs = await prisma.communicationLog.findMany({
        where: {
            studentId: { in: [...SYNTHETIC_STUDENT_IDS] },
            id: { not: PRESEEDED_OPERATIONAL_IDS.communicationLog },
        },
        select: { id: true },
    });

    return {
        auditLogIds: auditLogs.map((r) => r.id),
        portalUserIds: portalUsers.map((r) => r.id),
        pipelineStageHistoryIds: stageHistories.map((r) => r.id),
        documentVersionIds: docVersions.map((r) => r.id),
        documentIds: documents.map((r) => r.id),
        visaCaseIds: visaCases.map((r) => r.id),
        applicationIds: applications.map((r) => r.id),
        transactionIds: transactions.map((r) => r.id),
        paymentIds: payments.map((r) => r.id),
        appointmentIds: appointments.map((r) => r.id),
        communicationLogIds: communicationLogs.map((r) => r.id),
    };
}

/**
 * Main cleanup execution function.
 * Executes the exact 24-step dependency-aware reverse sequence.
 *
 * @param {object} [options]
 * @param {string} [options.testRunId]
 * @param {object} [options.prismaClient]
 * @param {boolean} [options.skipTargetAssert]
 * @param {boolean} [options.skipClusterIdentityCheck]
 */
async function runCleanup(options = {}) {
    const rawRunId = options.testRunId || (fs.existsSync(MANIFEST_PATH) ? JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")).testRunId : null);
    const testRunId = validateTestRunId(rawRunId);

    console.log(`[CLEANUP] Initiating targeted synthetic teardown for test run '${testRunId}'...`);

    // 1. Guard against non-disposable targets before acquiring Prisma client
    if (!options.skipTargetAssert) {
        assertDisposableTarget(process.env.DATABASE_URL, process.env.ALLOW_DESTRUCTIVE_OPERATIONS);
        validateDatabaseUrl(process.env.DATABASE_URL, "test");
        validateSeederDatabaseUrl(process.env.DATABASE_URL);
    }

    let prisma = options.prismaClient || null;
    let currentStep = 0;
    let currentModel = "";
    let currentTargetId = "";

    try {
        // 2. Perform out-of-band physical cluster preflight if live check required
        let preflightEvidence = options.preflightEvidence || null;
        const expectedIdentity = options.clusterIdentityReference || EXPECTED_CLUSTER_IDENTITY;
        if (!options.skipClusterIdentityCheck && !preflightEvidence && !options.skipOutOfBandPreflight) {
            console.log("[CLEANUP] Performing out-of-band physical cluster preflight...");
            preflightEvidence = performOutOfBandPreflight({ expected: expectedIdentity });
        }

        // 3. Acquire database client strictly configured for Unix domain socket
        if (!prisma) {
            prisma = createSeederPrismaClient(process.env.DATABASE_URL);
        }

        // 4. Verify initial cluster identity
        if (!options.skipClusterIdentityCheck) {
            console.log("[CLEANUP] Verifying initial session and cluster identity via Unix domain socket...");
            await verifyClusterIdentity(prisma, expectedIdentity, {
                preflightEvidence,
                requireUnixSocket: options.requireUnixSocket !== false,
            });
        }

        // 5. Discover dynamic records created during rehearsal mutations
        console.log("[CLEANUP] Discovering dynamic child records linked to synthetic entities...");
        const dynamic = await discoverDynamicRecords(prisma);

        // ─────────────────────────────────────────────────────────────────────────
        // PHASE 1: DYNAMIC RECORDS (Steps 1 to 11)
        // ─────────────────────────────────────────────────────────────────────────
        await revalidateIdentityOnConnection(prisma, "PHASE 1: DYNAMIC RECORDS");

        // Step 1: Dynamic AuditLogs
        currentStep = 1;
        currentModel = "AuditLog";
        for (const id of dynamic.auditLogIds) {
            currentTargetId = id;
            await deleteTargetedRecord(prisma, "auditLog", id);
        }

        // Step 2: Dynamic Portal Users
        currentStep = 2;
        currentModel = "User (Portal)";
        for (const id of dynamic.portalUserIds) {
            currentTargetId = id;
            await deleteTargetedRecord(prisma, "user", id);
        }

        // Step 3: Dynamic PipelineStageHistory
        currentStep = 3;
        currentModel = "PipelineStageHistory (Dynamic)";
        for (const id of dynamic.pipelineStageHistoryIds) {
            currentTargetId = id;
            await deleteTargetedRecord(prisma, "pipelineStageHistory", id);
        }

        // Step 4: Dynamic DocumentVersions
        currentStep = 4;
        currentModel = "DocumentVersion (Dynamic)";
        for (const id of dynamic.documentVersionIds) {
            currentTargetId = id;
            await deleteTargetedRecord(prisma, "documentVersion", id);
        }

        // Step 5: Dynamic Documents
        currentStep = 5;
        currentModel = "Document (Dynamic)";
        for (const id of dynamic.documentIds) {
            currentTargetId = id;
            await deleteTargetedRecord(prisma, "document", id);
        }

        // Step 6: Dynamic VisaCases
        currentStep = 6;
        currentModel = "VisaCase (Dynamic)";
        for (const id of dynamic.visaCaseIds) {
            currentTargetId = id;
            await deleteTargetedRecord(prisma, "visaCase", id);
        }

        // Step 7: Dynamic Applications
        currentStep = 7;
        currentModel = "Application (Dynamic)";
        for (const id of dynamic.applicationIds) {
            currentTargetId = id;
            await deleteTargetedRecord(prisma, "application", id);
        }

        // Step 8: Dynamic Transactions
        currentStep = 8;
        currentModel = "Transaction (Dynamic)";
        for (const id of dynamic.transactionIds) {
            currentTargetId = id;
            await deleteTargetedRecord(prisma, "transaction", id);
        }

        // Step 9: Dynamic Payments
        currentStep = 9;
        currentModel = "Payment (Dynamic)";
        for (const id of dynamic.paymentIds) {
            currentTargetId = id;
            await deleteTargetedRecord(prisma, "payment", id);
        }

        // Step 10: Dynamic Appointments
        currentStep = 10;
        currentModel = "Appointment (Dynamic)";
        for (const id of dynamic.appointmentIds) {
            currentTargetId = id;
            await deleteTargetedRecord(prisma, "appointment", id);
        }

        // Step 11: Dynamic CommunicationLogs
        currentStep = 11;
        currentModel = "CommunicationLog (Dynamic)";
        for (const id of dynamic.communicationLogIds) {
            currentTargetId = id;
            await deleteTargetedRecord(prisma, "communicationLog", id);
        }

        // ─────────────────────────────────────────────────────────────────────────
        // PHASE 2: PRE-SEEDED OPERATIONAL RECORDS (Steps 12 to 19)
        // ─────────────────────────────────────────────────────────────────────────
        await revalidateIdentityOnConnection(prisma, "PHASE 2: PRE-SEEDED OPERATIONAL RECORDS");

        // Step 12: Pre-seeded VisaCase
        currentStep = 12;
        currentModel = "VisaCase (Pre-seeded)";
        currentTargetId = PRESEEDED_OPERATIONAL_IDS.visaCase;
        await deleteTargetedRecord(prisma, "visaCase", PRESEEDED_OPERATIONAL_IDS.visaCase);

        // Step 13: Pre-seeded Application
        currentStep = 13;
        currentModel = "Application (Pre-seeded)";
        currentTargetId = PRESEEDED_OPERATIONAL_IDS.application;
        await deleteTargetedRecord(prisma, "application", PRESEEDED_OPERATIONAL_IDS.application);

        // Step 14: Pre-seeded Transaction
        currentStep = 14;
        currentModel = "Transaction (Pre-seeded)";
        currentTargetId = PRESEEDED_OPERATIONAL_IDS.transaction;
        await deleteTargetedRecord(prisma, "transaction", PRESEEDED_OPERATIONAL_IDS.transaction);

        // Step 15: Pre-seeded Payment
        currentStep = 15;
        currentModel = "Payment (Pre-seeded)";
        currentTargetId = PRESEEDED_OPERATIONAL_IDS.payment;
        await deleteTargetedRecord(prisma, "payment", PRESEEDED_OPERATIONAL_IDS.payment);

        // Step 16: Pre-seeded DocumentVersion
        currentStep = 16;
        currentModel = "DocumentVersion (Pre-seeded)";
        currentTargetId = PRESEEDED_OPERATIONAL_IDS.documentVersion;
        await deleteTargetedRecord(prisma, "documentVersion", PRESEEDED_OPERATIONAL_IDS.documentVersion);

        // Step 17: Pre-seeded Document
        currentStep = 17;
        currentModel = "Document (Pre-seeded)";
        currentTargetId = PRESEEDED_OPERATIONAL_IDS.document;
        await deleteTargetedRecord(prisma, "document", PRESEEDED_OPERATIONAL_IDS.document);

        // Step 18: Pre-seeded Appointment
        currentStep = 18;
        currentModel = "Appointment (Pre-seeded)";
        currentTargetId = PRESEEDED_OPERATIONAL_IDS.appointment;
        await deleteTargetedRecord(prisma, "appointment", PRESEEDED_OPERATIONAL_IDS.appointment);

        // Step 19: Pre-seeded CommunicationLog
        currentStep = 19;
        currentModel = "CommunicationLog (Pre-seeded)";
        currentTargetId = PRESEEDED_OPERATIONAL_IDS.communicationLog;
        await deleteTargetedRecord(prisma, "communicationLog", PRESEEDED_OPERATIONAL_IDS.communicationLog);

        // ─────────────────────────────────────────────────────────────────────────
        // PHASE 3: STUDENT PIPELINE RECORDS (Step 20)
        // ─────────────────────────────────────────────────────────────────────────
        await revalidateIdentityOnConnection(prisma, "PHASE 3: STUDENT PIPELINE RECORDS");

        // Step 20: Synthetic Students
        currentStep = 20;
        currentModel = "Student";
        for (const stId of SYNTHETIC_STUDENT_IDS) {
            currentTargetId = stId;
            await deleteTargetedRecord(prisma, "student", stId);
        }

        // ─────────────────────────────────────────────────────────────────────────
        // PHASE 4: ACADEMIC CATALOG RECORDS (Steps 21 to 23)
        // ─────────────────────────────────────────────────────────────────────────
        await revalidateIdentityOnConnection(prisma, "PHASE 4: ACADEMIC CATALOG RECORDS");

        // Step 21: Course
        currentStep = 21;
        currentModel = "Course";
        currentTargetId = PRESEEDED_OPERATIONAL_IDS.course;
        await deleteTargetedRecord(prisma, "course", PRESEEDED_OPERATIONAL_IDS.course);

        // Step 22: University
        currentStep = 22;
        currentModel = "University";
        currentTargetId = PRESEEDED_OPERATIONAL_IDS.university;
        await deleteTargetedRecord(prisma, "university", PRESEEDED_OPERATIONAL_IDS.university);

        // Step 23: Country
        currentStep = 23;
        currentModel = "Country";
        currentTargetId = PRESEEDED_OPERATIONAL_IDS.country;
        await deleteTargetedRecord(prisma, "country", PRESEEDED_OPERATIONAL_IDS.country);

        // ─────────────────────────────────────────────────────────────────────────
        // PHASE 5: ORGANIZATIONAL & ROOT RECORDS (Steps 24 to 26)
        // ─────────────────────────────────────────────────────────────────────────
        await revalidateIdentityOnConnection(prisma, "PHASE 5: ORGANIZATIONAL & ROOT RECORDS");

        // Step 24: CounselorProfiles
        currentStep = 24;
        currentModel = "CounselorProfile";
        for (const prfId of PRESEEDED_OPERATIONAL_IDS.counselorProfiles) {
            currentTargetId = prfId;
            await deleteTargetedRecord(prisma, "counselorProfile", prfId);
        }

        // Step 25: Users
        currentStep = 25;
        currentModel = "User";
        for (const usrId of SYNTHETIC_USER_IDS) {
            currentTargetId = usrId;
            await deleteTargetedRecord(prisma, "user", usrId);
        }

        // Step 26: Branches
        currentStep = 26;
        currentModel = "Branch";
        for (const brId of SYNTHETIC_BRANCH_IDS) {
            currentTargetId = brId;
            await deleteTargetedRecord(prisma, "branch", brId);
        }

        console.log(`[CLEANUP SUCCESS] Successfully executed all 26 teardown steps for test run '${testRunId}'.`);

        // Remove manifest upon verified full completion
        if (fs.existsSync(MANIFEST_PATH)) {
            try {
                fs.unlinkSync(MANIFEST_PATH);
                console.log(`[CLEANUP SUCCESS] Removed fixture manifest at ${MANIFEST_PATH}`);
            } catch (_) {}
        }

        return {
            success: true,
            testRunId,
            stepsCompleted: 26,
            dynamicDiscovered: {
                auditLogs: dynamic.auditLogIds.length,
                portalUsers: dynamic.portalUserIds.length,
                pipelineStageHistories: dynamic.pipelineStageHistoryIds.length,
                docVersions: dynamic.documentVersionIds.length,
                documents: dynamic.documentIds.length,
                visaCases: dynamic.visaCaseIds.length,
                applications: dynamic.applicationIds.length,
                transactions: dynamic.transactionIds.length,
                payments: dynamic.paymentIds.length,
                appointments: dynamic.appointmentIds.length,
                communicationLogs: dynamic.communicationLogIds.length,
            },
        };
    } catch (err) {
        console.error(`[CLEANUP FATAL] Teardown aborted at step ${currentStep} (${currentModel}, ID: ${currentTargetId}): ${err.message}`);
        writeCleanupFailureManifest({
            testRunId,
            stepNumber: currentStep,
            model: currentModel,
            targetId: currentTargetId,
            errorCode: err.code || "UNKNOWN",
            error: err.message,
        });
        throw err;
    } finally {
        if (prisma && typeof prisma.$disconnect === "function") {
            await prisma.$disconnect();
        }
    }
}

if (require.main === module) {
    runCleanup().catch((err) => {
        console.error("[CLEANUP EXIT]", err.message);
        process.exit(1);
    });
}

module.exports = {
    runCleanup,
    discoverDynamicRecords,
    deleteTargetedRecord,
    revalidateIdentityOnConnection,
    validateTestRunId,
    SYNTHETIC_STUDENT_IDS,
    SYNTHETIC_USER_IDS,
    SYNTHETIC_BRANCH_IDS,
    PRESEEDED_OPERATIONAL_IDS,
    ALL_SYNTHETIC_ENTITY_IDS,
    CLEANUP_FAILURE_LOG_PATH,
};
