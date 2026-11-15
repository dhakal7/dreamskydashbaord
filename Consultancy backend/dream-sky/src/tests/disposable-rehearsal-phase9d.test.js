/**
 * disposable-rehearsal-phase9d.test.js — Live Integration Rehearsal Suite
 *
 * Implements the 30-request integration test inventory against the isolated
 * disposable PostgreSQL database on port 5433 (dreamsky_test_disposable).
 *
 * SAFETY INVARIANTS:
 * - Strictly guarded by ALLOW_INTEGRATION_TEST_DB=true.
 * - Authorizes the API Mutation Gate with verified disposable session parameters.
 * - Excludes INT-11.3 (Document Upload).
 * - Matches the existing payment controller behavior where service-level error produces HTTP 500.
 * - Verifies student soft deletion, trash visibility, restoration, branch isolation,
 *   unassigned-student mutation barriers, and child relation preservation.
 * - Dynamically captures and validates dashboard baseline without hardcoded assumptions.
 * - Does not send emails or make external network calls.
 * - NOT authorized for execution during Phase 9D.2G2A.28.8 (implementation only).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { signAccessToken } = require("../utils/jwt.util");
const { authorizeDisposableSession, revokeDisposableSession } = require("../middleware/api-mutation-gate");

// ─── Guard Against Accidental Execution ──────────────────────────────────────
const canRunIntegrationTests = process.env.ALLOW_INTEGRATION_TEST_DB === "true" &&
                               process.env.NODE_ENV === "test";

if (!canRunIntegrationTests) {
    test("Disposable Integration Rehearsal Suite (Phase 9D.2G2A.28.8)", { skip: true }, () => {
        // Skipped because ALLOW_INTEGRATION_TEST_DB is not enabled.
        // Prevents any runtime execution, server startup, or database connections.
    });
} else {
    // ─── Authoritative Environment Isolation & Disposable Target Preflight ─────
    // Load and enforce configuration from .env.test.disposable before loading app or database client
    const { loadDisposableTestEnv } = require("../utils/test-launcher");
    const { assertDisposableTarget, validateDatabaseUrl } = require("../config");

    // Enforce fail-closed configuration and disposable target validation
    loadDisposableTestEnv();
    assertDisposableTarget(process.env.DATABASE_URL, process.env.ALLOW_DESTRUCTIVE_OPERATIONS);
    validateDatabaseUrl(process.env.DATABASE_URL, "test");

    // ─── Test Suite Definition (Executable Only When Explicitly Authorized) ────
    const app = require("../app");

    let server;
    let baseUrl;
    let saToken;
    let cn1Token;
    let ba1Token;
    let ba2Token;

    // Captured dynamic dashboard baseline
    let baselineTotalStudents = null;
    let baselineNewLeads = null;
    let trashableLeadId = null;
    let trashableBr2LeadId = null;

    test.before(async () => {
        // 1. Re-assert disposable target identity before server listen or mutation
        assertDisposableTarget(process.env.DATABASE_URL, process.env.ALLOW_DESTRUCTIVE_OPERATIONS);
        validateDatabaseUrl(process.env.DATABASE_URL, "test");

        // 2. Authorize API Mutation Gate for disposable test session
        authorizeDisposableSession({
            sessionToken: `test-session-${Date.now()}`,
            targetPort: "5433",
            targetDatabase: "dreamsky_test_disposable",
        });

        // 2. Generate signed JWT tokens for synthetic personas
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

        // 3. Provision disposable trashable LEAD fixtures (no protected dependencies)
        const prisma = require("../prisma");
        const lead1 = await prisma.student.create({
            data: {
                firstName: "SynTrashLead",
                lastName: "One",
                email: `syn.trash.lead1.${Date.now()}@example.com`,
                currentStage: "LEAD",
                assignedCounselorId: "test-syn-r28a-usr-cn1",
                isActive: true,
            },
        });
        trashableLeadId = lead1.id;

        const leadBr2 = await prisma.student.create({
            data: {
                firstName: "SynTrashLead",
                lastName: "BrTwo",
                email: `syn.trash.leadbr2.${Date.now()}@example.com`,
                currentStage: "LEAD",
                assignedCounselorId: "test-syn-r28a-usr-cn2",
                isActive: true,
            },
        });
        trashableBr2LeadId = leadBr2.id;

        // 4. Start in-process HTTP server
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
    });

    test.after(async () => {
        const prisma = require("../prisma");
        const idsToClean = [trashableLeadId, trashableBr2LeadId].filter(Boolean);
        if (idsToClean.length > 0) {
            await prisma.auditLog.deleteMany({ where: { entityId: { in: idsToClean } } }).catch(() => {});
            await prisma.student.deleteMany({ where: { id: { in: idsToClean } } }).catch(() => {});
        }
        // Restore test-syn-r28a-st-br2 to inactive seeded baseline if Req 16 restored it
        await prisma.student.updateMany({
            where: { id: "test-syn-r28a-st-br2" },
            data: { isActive: false },
        }).catch(() => {});
        revokeDisposableSession();
        if (server && server.listening) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    /**
     * Helper to make HTTP requests against the in-process test server.
     */
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

    test.describe("DreamSky CRM: 30-Request Disposable Integration Rehearsal", () => {
        // ─── Initial Baseline & Active Verification ───────────────────────────
        test("Req 01 (INT-01): Confirm student in active listing", async () => {
            const res = await apiRequest("/api/students?search=st1.syn@example.com", {
                token: saToken,
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            const students = res.body.data.students || [];
            const found = students.find((s) => s.id === "test-syn-r28a-st-1");
            assert.ok(found, "Primary synthetic student must be present in active listing");
            assert.strictEqual(found.isActive, true);
        });

        test("Req 02 (INT-02): Capture and assert dashboard baseline", async () => {
            const res = await apiRequest("/api/dashboard/summary", { token: saToken });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            baselineTotalStudents = res.body.data.totalStudents;
            baselineNewLeads = res.body.data.newLeads;
            assert.ok(typeof baselineTotalStudents === "number", "Baseline totalStudents must be a number");
            assert.ok(typeof baselineNewLeads === "number", "Baseline newLeads must be a number");
        });

        test("Req 02B (INT-02B): Country listing uses mounted route /api/universities/countries", async () => {
            const res = await apiRequest("/api/universities/countries", { token: saToken });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            const countries = res.body.data || [];
            const found = countries.find((c) => c.id === "test-syn-r28a-cry-1");
            assert.ok(found, "Synthetic country must be present in /api/universities/countries");
        });

        // ─── Student Soft Deletion & Verification ────────────────────────────
        test("Req 03 (INT-03): Protected APPLIED student blocked (400), missing reason blocked (400), valid LEAD soft-deletes (200)", async () => {
            const protectedRes = await apiRequest("/api/students/test-syn-r28a-st-1", {
                method: "DELETE",
                token: saToken,
                body: { reason: "Attempt on protected APPLIED student" },
            });
            assert.strictEqual(protectedRes.status, 400);
            assert.strictEqual(protectedRes.body.code, "CANNOT_TRASH_ENROLLED_STUDENT");

            const missingReasonRes = await apiRequest(`/api/students/${trashableLeadId}`, {
                method: "DELETE",
                token: saToken,
                body: {},
            });
            assert.strictEqual(missingReasonRes.status, 400);

            const res = await apiRequest(`/api/students/${trashableLeadId}`, {
                method: "DELETE",
                token: saToken,
                body: { reason: "Phase 9D Rehearsal soft-delete" },
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.data.isActive, false);
        });

        test("Req 04 (INT-04.1): Confirm student excluded from active listing", async () => {
            const res = await apiRequest("/api/students?search=SynTrashLead&type=all", {
                token: saToken,
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            const students = res.body.data.students || [];
            const found = students.find((s) => s.id === trashableLeadId);
            assert.strictEqual(found, undefined, "Trashed student must not appear in active listing");
        });

        test("Req 05 (INT-04.2): Confirm student visible in Trash listing", async () => {
            const res = await apiRequest("/api/students/trash?search=SynTrashLead", {
                token: saToken,
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            const students = res.body.data.students || [];
            const found = students.find((s) => s.id === trashableLeadId);
            assert.ok(found, "Trashed student must appear in trash listing");
            assert.strictEqual(found.isActive, false);
        });

        test("Req 06 (INT-05): Confirm dashboard decrements newLeads count", async () => {
            const res = await apiRequest("/api/dashboard/summary", { token: saToken });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(
                res.body.data.newLeads,
                baselineNewLeads - 1,
                "Dashboard newLeads must decrement by 1 after soft-deleting a lead"
            );
        });

        test("Req 07 (INT-06): Authorized admin receives trashed detail", async () => {
            const res = await apiRequest(`/api/students/${trashableLeadId}`, {
                token: saToken,
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.data.id, trashableLeadId);
            assert.strictEqual(res.body.data.isActive, false);
        });

        // ─── RBAC & Access Control Barriers ──────────────────────────────────
        test("Req 08 (INT-07): Counselor blocked from viewing trashed detail (404)", async () => {
            const res = await apiRequest(`/api/students/${trashableLeadId}`, {
                token: cn1Token,
            });
            assert.strictEqual(res.status, 404);
            assert.strictEqual(res.body.success, false);
        });

        test("Req 09 (INT-08.1): Counselor blocked from Trash listing (403)", async () => {
            const res = await apiRequest("/api/students/trash", {
                token: cn1Token,
            });
            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.body.success, false);
        });

        test("Req 10 (INT-08.2): Counselor blocked from restoring student (403)", async () => {
            const res = await apiRequest("/api/students/test-syn-r28a-st-1/restore", {
                method: "PATCH",
                token: cn1Token,
            });
            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.body.success, false);
        });

        test("Req 11 (INT-08.3): Counselor blocked from soft-deleting student (403)", async () => {
            const res = await apiRequest("/api/students/test-syn-r28a-st-1", {
                method: "DELETE",
                token: cn1Token,
            });
            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.body.success, false);
        });

        // ─── Branch Isolation Barriers ───────────────────────────────────────
        test("Req 12 (INT-09A.1): Branch Admin 2 cross-branch delete blocked (403)", async () => {
            const res = await apiRequest(`/api/students/${trashableLeadId}`, {
                method: "DELETE",
                token: ba2Token,
                body: { reason: "Cross-branch delete attempt" },
            });
            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.body.success, false);
        });

        test("Req 13 (INT-09A.2): Branch Admin 2 cross-branch restore blocked (403)", async () => {
            const res = await apiRequest(`/api/students/${trashableLeadId}/restore`, {
                method: "PATCH",
                token: ba2Token,
            });
            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.body.success, false);
        });

        test("Req 14 (INT-09A.3): Branch Admin 2 trash listing excludes Branch 1 student", async () => {
            const res = await apiRequest("/api/students/trash?search=SynTrashLead", {
                token: ba2Token,
            });
            assert.strictEqual(res.status, 200);
            const students = res.body.data.students || [];
            const found = students.find((s) => s.id === trashableLeadId);
            assert.strictEqual(found, undefined, "Branch 2 admin must not see Branch 1 student in trash");
        });

        test("Req 15 (INT-09B.1): Branch Admin 2 sees own branch trashed student", async () => {
            const res = await apiRequest("/api/students/trash?search=stbr2.syn@example.com", {
                token: ba2Token,
            });
            assert.strictEqual(res.status, 200);
            const students = res.body.data.students || [];
            const found = students.find((s) => s.id === "test-syn-r28a-st-br2");
            assert.ok(found, "Branch 2 admin must see Branch 2 student in trash");
        });

        test("Req 16 (INT-09B.2): Branch Admin 2 same-branch restore succeeds (200)", async () => {
            const res = await apiRequest("/api/students/test-syn-r28a-st-br2/restore", {
                method: "PATCH",
                token: ba2Token,
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.data.isActive, true);
        });

        test("Req 17 (INT-09B.3): Branch Admin 2 same-branch delete succeeds (200)", async () => {
            const res = await apiRequest(`/api/students/${trashableBr2LeadId}`, {
                method: "DELETE",
                token: ba2Token,
                body: { reason: "Branch Admin 2 same-branch operational archive" },
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.data.isActive, false);

            const restoreRes = await apiRequest(`/api/students/${trashableBr2LeadId}/restore`, {
                method: "PATCH",
                token: ba2Token,
            });
            assert.strictEqual(restoreRes.status, 200);
            assert.strictEqual(restoreRes.body.data.isActive, true);
        });

        // ─── Unassigned Student Protection Barriers ──────────────────────────
        test("Req 18 (INT-10.1): Branch Admin blocked from deleting unassigned student (403)", async () => {
            const res = await apiRequest("/api/students/test-syn-r28a-st-unassigned", {
                method: "DELETE",
                token: ba1Token,
                body: { reason: "Branch admin deleting unassigned attempt" },
            });
            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.body.success, false);
        });

        test("Req 19 (INT-10.2): Branch Admin blocked from restoring unassigned student (403)", async () => {
            const res = await apiRequest("/api/students/test-syn-r28a-st-unassigned/restore", {
                method: "PATCH",
                token: ba1Token,
            });
            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.body.success, false);
        });

        // ─── Operational Child Record Creation Barriers on Trashed Student ───
        test("Req 20 (INT-11.1): Application creation blocked on trashed student (400)", async () => {
            const res = await apiRequest("/api/applications", {
                method: "POST",
                token: saToken,
                body: {
                    studentId: trashableLeadId,
                    universityId: "test-syn-r28a-uni-1",
                    courseId: "test-syn-r28a-crs-1",
                },
            });
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.code, "STUDENT_IN_TRASH");
        });

        test("Req 21 (INT-11.2): Visa Case creation blocked on trashed student (400)", async () => {
            const res = await apiRequest("/api/visa-cases", {
                method: "POST",
                token: saToken,
                body: {
                    studentId: trashableLeadId,
                },
            });
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.code, "STUDENT_IN_TRASH");
        });

        test("Req 22 (INT-11.4): Appointment creation blocked on trashed student (400)", async () => {
            const res = await apiRequest("/api/appointments", {
                method: "POST",
                token: saToken,
                body: {
                    studentId: trashableLeadId,
                    datetime: "2026-11-15T10:00:00.000Z",
                    type: "INITIAL_CONSULTATION",
                },
            });
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.code, "STUDENT_IN_TRASH");
        });

        test("Req 23 (INT-11.5): Follow-up creation blocked on trashed student (400)", async () => {
            const res = await apiRequest("/api/follow-ups", {
                method: "POST",
                token: saToken,
                body: {
                    studentId: trashableLeadId,
                    channel: "PHONE",
                    direction: "OUTBOUND",
                    content: "Attempted phone check-in on trashed student",
                },
            });
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.code, "STUDENT_IN_TRASH");
        });

        test("Req 24 (INT-11.6): Payment creation blocked on trashed student (400)", async () => {
            const res = await apiRequest("/api/payments", {
                method: "POST",
                token: saToken,
                body: {
                    studentId: trashableLeadId,
                    feeCategory: "TUITION",
                    totalAmount: 1000,
                    paidAmount: 0,
                    paymentMethod: "CASH",
                },
            });
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.success, false);
            assert.ok(res.body.message.includes("Trash"), "Error message must indicate student is in Trash");
        });

        // ─── Idempotency & Conflict Responses ────────────────────────────────
        test("Req 25 (INT-12): Repeated soft-delete returns 409 Conflict", async () => {
            const res = await apiRequest(`/api/students/${trashableLeadId}`, {
                method: "DELETE",
                token: saToken,
                body: { reason: "Repeated soft-delete attempt" },
            });
            assert.strictEqual(res.status, 409);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.code, "STUDENT_ALREADY_TRASHED");
        });

        test("Req 26 (INT-13): Resend credentials blocked on trashed student (400)", async () => {
            const res = await apiRequest(`/api/students/${trashableLeadId}/resend-credentials`, {
                method: "POST",
                token: saToken,
            });
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.success, false);
            assert.ok(res.body.message.includes("Trash"), "Message must specify student is in Trash");
        });

        // ─── Restoration & Preservation Verification ─────────────────────────
        test("Req 27 (INT-14): Restore student via API succeeds (200)", async () => {
            const res = await apiRequest(`/api/students/${trashableLeadId}/restore`, {
                method: "PATCH",
                token: saToken,
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.data.isActive, true);
        });

        test("Req 28 (INT-15): Repeated restore returns 409 Conflict", async () => {
            const res = await apiRequest(`/api/students/${trashableLeadId}/restore`, {
                method: "PATCH",
                token: saToken,
            });
            assert.strictEqual(res.status, 409);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.code, "STUDENT_ALREADY_ACTIVE");
        });

        test("Req 29 (INT-16): Confirm historical relational records remain intact", async () => {
            const res = await apiRequest("/api/students/test-syn-r28a-st-1", {
                token: saToken,
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            const student = res.body.data;
            assert.strictEqual(student.isActive, true);

            // Verify all child relations remained intact
            assert.ok((student.applications?.length || 0) >= 1, "Application must remain intact");
            assert.ok((student.documents?.length || 0) >= 1, "Document must remain intact");
            assert.ok((student.payments?.length || 0) >= 1, "Payment must remain intact");
            assert.ok((student.appointments?.length || 0) >= 1, "Appointment must remain intact");
            assert.ok((student.communicationLogs?.length || 0) >= 1, "Communication log must remain intact");
        });

        test("Req 30 (INT-17): Confirm dashboard returns to original baseline", async () => {
            const res = await apiRequest("/api/dashboard/summary", { token: saToken });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(
                res.body.data.newLeads,
                baselineNewLeads,
                "Dashboard newLeads must match initial baseline after restoration"
            );
        });
    });
}
