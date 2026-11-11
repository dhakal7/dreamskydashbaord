/**
 * disposable-persistence-verification.test.js — Phase 28.25C.9D.18 Isolated Integration Verification
 *
 * Dedicated fail-closed persistence verification test suite targeting exclusively
 * the disposable PostgreSQL database on port 5433 (dreamsky_test_disposable).
 *
 * Explicitly verifies direct database row persistence for:
 * 1. Lead creation and FOLLOW_UP scheduling.
 * 2. Appointment and CommunicationLog synchronization.
 * 3. Rescheduling without duplicate records.
 * 4. Trash with a mandatory reason.
 * 5. Restore with pipeline-stage preservation.
 * 6. Counselor and branch authorization boundaries.
 *
 * Safety Invariants:
 * - Refuses execution unless ALLOW_INTEGRATION_TEST_DB === "true" and NODE_ENV === "test".
 * - Refuses execution if DATABASE_URL points to 5432 or production database names.
 * - Enforces port 5433 and dreamsky_test_disposable.
 */

const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const { Client } = require("pg");
const { signAccessToken } = require("../utils/jwt.util");
const { authorizeDisposableSession, revokeDisposableSession } = require("../middleware/api-mutation-gate");

const OPERATOR_OPT_IN = process.env.ALLOW_INTEGRATION_TEST_DB === "true";
const IS_TEST_ENV = process.env.NODE_ENV === "test";

if (!OPERATOR_OPT_IN || !IS_TEST_ENV) {
    test("Disposable Persistence Verification Suite", { skip: true }, () => {
        // Skipped because ALLOW_INTEGRATION_TEST_DB is not enabled.
    });
} else {
    const { loadDisposableTestEnv } = require("../utils/test-launcher");
    const { assertDisposableTarget, validateDatabaseUrl } = require("../config");

    loadDisposableTestEnv();
    assertDisposableTarget(process.env.DATABASE_URL, process.env.ALLOW_DESTRUCTIVE_OPERATIONS);
    validateDatabaseUrl(process.env.DATABASE_URL, "test");

    const app = require("../app");

    let server;
    let baseUrl;
    let pgClient;
    let saToken;
    let cn1Token;
    let ba1Token;
    let ba2Token;

    const TEST_LEAD_EMAIL = "persist.lead.r28@example.com";
    let testLeadId = null;
    let initialAppointmentId = null;

    test.before(async () => {
        assertDisposableTarget(process.env.DATABASE_URL, process.env.ALLOW_DESTRUCTIVE_OPERATIONS);
        validateDatabaseUrl(process.env.DATABASE_URL, "test");

        authorizeDisposableSession({
            sessionToken: `persist-session-${Date.now()}`,
            targetPort: "5433",
            targetDatabase: "dreamsky_test_disposable",
        });

        // Initialize PG direct connection to disposable target
        pgClient = new Client({
            connectionString: process.env.DATABASE_URL,
        });
        await pgClient.connect();

        // Verify cluster identity directly
        const idRes = await pgClient.query("SELECT current_database(), current_user, current_setting('port') AS port");
        assert.strictEqual(idRes.rows[0].current_database, "dreamsky_test_disposable");
        assert.strictEqual(Number(idRes.rows[0].port), 5433);

        saToken = signAccessToken({
            id: "test-syn-r28a-usr-sa",
            userId: "test-syn-r28a-usr-sa",
            role: "SUPER_ADMIN",
            branchId: "test-syn-r28a-br-1",
            mustChangePassword: false,
        });

        cn1Token = signAccessToken({
            id: "test-syn-r28a-usr-cn1",
            userId: "test-syn-r28a-usr-cn1",
            role: "COUNSELOR",
            branchId: "test-syn-r28a-br-1",
            mustChangePassword: false,
        });

        ba1Token = signAccessToken({
            id: "test-syn-r28a-usr-ba1",
            userId: "test-syn-r28a-usr-ba1",
            role: "BRANCH_ADMIN",
            branchId: "test-syn-r28a-br-1",
            mustChangePassword: false,
        });

        ba2Token = signAccessToken({
            id: "test-syn-r28a-usr-ba2",
            userId: "test-syn-r28a-usr-ba2",
            role: "BRANCH_ADMIN",
            branchId: "test-syn-r28a-br-2",
            mustChangePassword: false,
        });

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
    });

    test.after(async () => {
        // Targeted cleanup of our test lead if created
        if (testLeadId && pgClient) {
            try {
                await pgClient.query('DELETE FROM "CommunicationLog" WHERE "studentId" = $1', [testLeadId]);
                await pgClient.query('DELETE FROM "Appointment" WHERE "studentId" = $1', [testLeadId]);
                await pgClient.query('DELETE FROM "AuditLog" WHERE "entity" = \'Student\' AND "entityId" = $1', [testLeadId]);
                await pgClient.query('DELETE FROM "Student" WHERE id = $1', [testLeadId]);
            } catch (_) {}
        }
        if (pgClient) {
            await pgClient.end();
        }
        revokeDisposableSession();
        if (server && server.listening) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    async function apiRequest(endpoint, { method = "GET", token, body } = {}) {
        const headers = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`${baseUrl}${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        let json = null;
        try {
            json = await res.json();
        } catch (_) {}

        return { status: res.status, body: json };
    }

    test.describe("Phase 28.25C.9D.18: Database Persistence Verification (Port 5433)", () => {
        test("1. Lead creation persists student record in database", async () => {
            const createRes = await apiRequest("/api/students", {
                method: "POST",
                token: saToken,
                body: {
                    firstName: "Persist",
                    lastName: "VerificationLead",
                    email: TEST_LEAD_EMAIL,
                    phone: "+977-9800000099",
                    currentStage: "LEAD",
                    leadStage: "NEW",
                    branchId: "test-syn-r28a-br-1",
                    assignedCounselorId: "test-syn-r28a-usr-cn1",
                },
            });
            assert.strictEqual(createRes.status, 201, `Lead creation failed: ${JSON.stringify(createRes.body)}`);
            testLeadId = createRes.body.data.id;
            assert.ok(testLeadId, "Created lead must return an ID");

            // Direct DB Query verification
            const dbRow = await pgClient.query('SELECT id, "firstName", "lastName", email, "currentStage", "isActive" FROM "Student" WHERE id = $1', [testLeadId]);
            assert.strictEqual(dbRow.rows.length, 1, "Student row must physically exist in database");
            assert.strictEqual(dbRow.rows[0].email, TEST_LEAD_EMAIL);
            assert.strictEqual(dbRow.rows[0].currentStage, "LEAD");
            assert.strictEqual(dbRow.rows[0].isActive, true);
        });

        test("2. Pipeline update to FOLLOW_UP schedules appointment and synchronizes CommunicationLog in DB", async () => {
            assert.ok(testLeadId, "Test lead ID required");
            const updateRes = await apiRequest(`/api/students/${testLeadId}/pipeline`, {
                method: "PATCH",
                token: saToken,
                body: {
                    stage: "LEAD",
                    leadStage: "FOLLOW_UP",
                    followUpDate: "2026-11-20",
                    followUpTime: "14:30",
                    notes: "Initial consultation follow-up requested",
                },
            });
            assert.strictEqual(updateRes.status, 200, `Pipeline update failed: ${JSON.stringify(updateRes.body)}`);

            // Direct DB Query: Student table
            const studentRow = await pgClient.query('SELECT "currentStage", "academicBackground" FROM "Student" WHERE id = $1', [testLeadId]);
            assert.strictEqual(studentRow.rows[0].currentStage, "LEAD");
            assert.strictEqual(studentRow.rows[0].academicBackground.leadStage, "FOLLOW_UP");

            // Direct DB Query: Appointment table
            const apptRows = await pgClient.query('SELECT id, type, datetime, status, "studentId" FROM "Appointment" WHERE "studentId" = $1', [testLeadId]);
            assert.strictEqual(apptRows.rows.length, 1, "Exactly one Appointment row must be created in DB");
            assert.strictEqual(apptRows.rows[0].type, "FOLLOW_UP");
            initialAppointmentId = apptRows.rows[0].id;
            assert.ok(initialAppointmentId, "Appointment must have persistent ID");

            // Direct DB Query: CommunicationLog table
            const commRows = await pgClient.query('SELECT id, channel, content, "studentId" FROM "CommunicationLog" WHERE "studentId" = $1', [testLeadId]);
            assert.strictEqual(commRows.rows.length, 1, "Exactly one CommunicationLog row must be created in DB");
            assert.ok(
                commRows.rows[0].content.includes(`[followup-appt:${initialAppointmentId}]`),
                "CommunicationLog content must contain synchronized [followup-appt:<id>] marker"
            );
        });

        test("3. Rescheduling updates existing appointment and log without duplicate records", async () => {
            assert.ok(testLeadId, "Test lead ID required");
            assert.ok(initialAppointmentId, "Initial appointment ID required");

            const reschedRes = await apiRequest(`/api/students/${testLeadId}/pipeline`, {
                method: "PATCH",
                token: saToken,
                body: {
                    stage: "LEAD",
                    leadStage: "FOLLOW_UP",
                    followUpDate: "2026-11-25",
                    followUpTime: "16:00",
                    notes: "Rescheduled upon student request",
                },
            });
            assert.strictEqual(reschedRes.status, 200, `Reschedule failed: ${JSON.stringify(reschedRes.body)}`);

            // Direct DB Query: Assert NO duplicate appointments
            const apptRows = await pgClient.query('SELECT id, datetime FROM "Appointment" WHERE "studentId" = $1', [testLeadId]);
            assert.strictEqual(apptRows.rows.length, 1, "Appointment count must remain 1 after rescheduling (no duplicates)");
            assert.strictEqual(apptRows.rows[0].id, initialAppointmentId, "Same Appointment record must be updated in-place");

            // Direct DB Query: Assert NO duplicate communication logs
            const commRows = await pgClient.query('SELECT id, content FROM "CommunicationLog" WHERE "studentId" = $1', [testLeadId]);
            assert.strictEqual(commRows.rows.length, 1, "CommunicationLog count must remain 1 after rescheduling (no duplicates)");
            assert.ok(
                commRows.rows[0].content.includes(`[followup-appt:${initialAppointmentId}]`),
                "CommunicationLog must maintain synchronization with the updated appointment"
            );
        });

        test("4. Trash requires mandatory reason and persists trash status in database", async () => {
            assert.ok(testLeadId, "Test lead ID required");

            // Attempt deletion without reason -> Must fail with 400
            const missingReasonRes = await apiRequest(`/api/students/${testLeadId}`, {
                method: "DELETE",
                token: saToken,
            });
            assert.strictEqual(missingReasonRes.status, 400, "Deletion without reason must return HTTP 400");
            assert.strictEqual(missingReasonRes.body.code, "MISSING_TRASH_REASON");

            // Direct DB Query: verify record was NOT trashed
            const preCheck = await pgClient.query('SELECT "isActive" FROM "Student" WHERE id = $1', [testLeadId]);
            assert.strictEqual(preCheck.rows[0].isActive, true, "Student must remain active in DB when reason is missing");

            // Attempt deletion with valid reason -> Must succeed
            const TRASH_REASON = "Duplicate test lead created for verification";
            const trashRes = await apiRequest(`/api/students/${testLeadId}`, {
                method: "DELETE",
                token: saToken,
                body: { reason: TRASH_REASON },
            });
            assert.strictEqual(trashRes.status, 200, `Trash with reason failed: ${JSON.stringify(trashRes.body)}`);

            // Direct DB Query: verify actual database persistence of trash state
            const trashedRow = await pgClient.query('SELECT "isActive", "academicBackground" FROM "Student" WHERE id = $1', [testLeadId]);
            assert.strictEqual(trashedRow.rows[0].isActive, false, "Student isActive must be false in DB");
            assert.strictEqual(trashedRow.rows[0].academicBackground.trashReason, TRASH_REASON, "trashReason must persist in academicBackground JSONB");
            assert.ok(trashedRow.rows[0].academicBackground.trashedAt, "trashedAt timestamp must persist in DB");

            // Verify AuditLog record in DB
            const auditRow = await pgClient.query('SELECT field, "oldValue", "newValue" FROM "AuditLog" WHERE entity = \'Student\' AND "entityId" = $1 AND field = \'trashReason\'', [testLeadId]);
            assert.strictEqual(auditRow.rows.length, 1, "AuditLog for trashReason must exist in DB");
            assert.strictEqual(auditRow.rows[0].newValue, TRASH_REASON);
        });

        test("5. Restore from trash preserves pipeline stage in database", async () => {
            assert.ok(testLeadId, "Test lead ID required");

            const restoreRes = await apiRequest(`/api/students/${testLeadId}/restore`, {
                method: "PATCH",
                token: saToken,
            });
            assert.strictEqual(restoreRes.status, 200, `Restore failed: ${JSON.stringify(restoreRes.body)}`);

            // Direct DB Query: verify pipeline stage preservation
            const restoredRow = await pgClient.query('SELECT "isActive", "currentStage", "academicBackground" FROM "Student" WHERE id = $1', [testLeadId]);
            assert.strictEqual(restoredRow.rows[0].isActive, true, "Student isActive must be restored to true in DB");
            assert.strictEqual(restoredRow.rows[0].currentStage, "LEAD", "currentStage must be preserved as LEAD");
            assert.strictEqual(
                restoredRow.rows[0].academicBackground.leadStage,
                "FOLLOW_UP",
                "Sub-stage leadStage must be preserved as FOLLOW_UP after restore"
            );
            assert.strictEqual(restoredRow.rows[0].academicBackground.trashReason, undefined, "trashReason must be cleared from active fields");
            assert.ok(restoredRow.rows[0].academicBackground.lastTrashReason, "lastTrashReason must be preserved in history");
        });

        test("6. Counselor and branch authorization boundaries strictly enforced", async () => {
            // Counselor 1 trying to access student not assigned to them (unassigned student)
            const counselorAccessRes = await apiRequest("/api/students/test-syn-r28a-st-unassigned", {
                token: cn1Token,
            });
            assert.ok(
                counselorAccessRes.status === 403 || counselorAccessRes.status === 404,
                `Counselor access across boundaries must return 403 or 404. Got: ${counselorAccessRes.status}`
            );

            // Counselor blocked from Trash listing
            const counselorTrashRes = await apiRequest("/api/students/trash", {
                token: cn1Token,
            });
            assert.strictEqual(counselorTrashRes.status, 403, "Counselor access to Trash must return 403 Forbidden");

            // Branch Admin 1 trying to delete student in Branch 2
            const crossBranchDelRes = await apiRequest("/api/students/test-syn-r28a-st-br2", {
                method: "DELETE",
                token: ba1Token,
                body: { reason: "Cross-branch delete attempt" },
            });
            assert.strictEqual(crossBranchDelRes.status, 403, "Cross-branch delete must return 403 Forbidden");

            // Branch Admin 1 trying to delete unassigned student
            const unassignedDelRes = await apiRequest("/api/students/test-syn-r28a-st-unassigned", {
                method: "DELETE",
                token: ba1Token,
                body: { reason: "Deleting unassigned student attempt" },
            });
            assert.strictEqual(unassignedDelRes.status, 403, "Branch Admin deleting unassigned student must return 403 Forbidden");
        });
    });
}
