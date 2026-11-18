/**
 * Phase 5: Remaining Access-Control Audit tests.
 *
 * Tests direct Express route/middleware/controller dispatch with signed JWTs
 * and an in-memory Prisma mock — zero database connections.
 */
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// ─── In-memory Prisma mock ────────────────────────────────────────────────────
const C1 = "counselor-1";
const C2 = "counselor-2";
const RA1 = "referral-1";

const students = {
    s1: { id: "s1", firstName: "A", lastName: "One", email: "a@x.io", assignedCounselorId: C1, currentStage: "ENROLLED" },
    s2: { id: "s2", firstName: "B", lastName: "Two", email: "b@x.io", assignedCounselorId: C2, currentStage: "ENROLLED" },
};
const followUps = {
    f1: { id: "f1", studentId: "s1", authorId: C1, channel: "PHONE", direction: "OUTBOUND", content: "hi", student: students.s1 },
    f2: { id: "f2", studentId: "s2", authorId: C2, channel: "PHONE", direction: "OUTBOUND", content: "hi", student: students.s2 },
};
const commissions = {
    cm1: { id: "cm1", recipientId: C1, studentId: "s1", amount: 5000, currency: "NPR", status: "PENDING" },
    cm2: { id: "cm2", recipientId: C2, studentId: "s2", amount: 8000, currency: "NPR", status: "PENDING" },
    cm3: { id: "cm3", recipientId: RA1, studentId: "s2", amount: 3000, currency: "NPR", status: "PENDING" },
};
const appointments = {
    ap1: { id: "ap1", studentId: "s1", counselorId: C1, status: "SCHEDULED", datetime: new Date("2026-12-01T10:00:00Z"), durationMin: 30, student: students.s1 },
    ap2: { id: "ap2", studentId: "s2", counselorId: C2, status: "SCHEDULED", datetime: new Date("2026-12-01T11:00:00Z"), durationMin: 30, student: students.s2 },
};
const recommendations = {
    s1: { id: "rec1", recordId: "s1", results: [] },
    s2: { id: "rec2", recordId: "s2", results: [] },
};

const calls = { findMany: [], count: [], create: [], update: [], delete: [] };
const table = (rows, name) => ({
    findUnique: async ({ where }) => rows[where.id] || null,
    findFirst: async ({ where }) => (where?.recordId ? recommendations[where.recordId] || null : null),
    findMany: async (args = {}) => { calls.findMany.push({ model: name, ...args }); return []; },
    count: async (args = {}) => { calls.count.push({ model: name, ...args }); return 0; },
    create: async (args) => { calls.create.push({ model: name, ...args }); return { id: `${name}-new`, ...args.data }; },
    update: async (args) => { calls.update.push({ model: name, ...args }); return { ...rows[args.where.id], ...args.data }; },
    delete: async (args) => { calls.delete.push({ model: name, ...args }); return rows[args.where.id]; },
});

const fakePrisma = {
    student: table(students, "student"),
    communicationLog: table(followUps, "communicationLog"),
    commission: table(commissions, "commission"),
    appointment: table(appointments, "appointment"),
    recommendationResult: table(recommendations, "recommendationResult"),
    application: table({}, "application"),
    visaCase: table({}, "visaCase"),
    country: { findMany: async () => [{ id: "country-1" }] },
    course: { findMany: async () => [] },
    user: { findUnique: async ({ where }) => ({ id: where.id, email: "u@x.io", firstName: "U", lastName: "X" }), findMany: async () => [] },
    auditLog: { create: async () => ({}) },
    $transaction: async (fn) => (typeof fn === "function" ? fn(fakePrisma) : Promise.all(fn)),
};

const prismaPath = require.resolve(path.join(__dirname, "../src/prisma"));
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };

const { signAccessToken } = require("../src/utils/jwt.util");
const followupRouter = require("../src/routes/followup.routes");
const commissionRouter = require("../src/routes/commission.routes");
const recommendationRouter = require("../src/routes/recommendation.routes");
const appointmentRouter = require("../src/routes/appointment.routes");
const dashboardRouter = require("../src/routes/dashboard.routes");
const applicationRouter = require("../src/routes/application.routes");
const visaRouter = require("../src/routes/visa.routes");
const appointmentService = require("../src/services/appointment.service");
const followupController = require("../src/controllers/followup.controller");

// ─── Direct Express router dispatcher (runs router.use + route middlewares + controller) ──
const tokens = {
    c1: signAccessToken({ userId: C1, role: "COUNSELOR", branchId: "b1", mustChangePassword: false }),
    ra1: signAccessToken({ userId: RA1, role: "REFERRAL_AGENT", branchId: "b1", mustChangePassword: false }),
    admin: signAccessToken({ userId: "admin-1", role: "SUPER_ADMIN", branchId: "b1", mustChangePassword: false }),
    desk: signAccessToken({ userId: "desk-1", role: "FRONT_DESK", branchId: "b1", mustChangePassword: false }),
    teacher: signAccessToken({ userId: "t-1", role: "TEACHER", branchId: "b1", mustChangePassword: false }),
    studentS1: signAccessToken({ userId: "u-s1", role: "STUDENT", studentId: "s1", mustChangePassword: false }),
};

const dispatch = async (router, { method, path: reqPath, token, query = {}, body = {} }) => {
    const req = {
        method: method.toUpperCase(),
        url: reqPath,
        originalUrl: reqPath,
        path: reqPath,
        headers: token ? { authorization: `Bearer ${token}` } : {},
        query,
        body,
        params: {},
    };
    const res = {
        statusCode: 200,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
        send(b) { this.body = b; return this; },
    };

    let err = null;
    await new Promise((resolve) => {
        router.handle(req, res, (e) => {
            err = e || null;
            resolve();
        });
        // Express 5 route handlers that call res.json without calling next()
        const origJson = res.json.bind(res);
        res.json = (b) => { origJson(b); resolve(); return res; };
    });

    const status = err ? (err.statusCode || 500) : res.statusCode;
    return { status, body: res.body, err };
};

const lastCall = (bucket, model) => [...calls[bucket]].reverse().find((c) => c.model === model);

beforeEach(() => {
    for (const k of Object.keys(calls)) calls[k].length = 0;
});

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("Phase 5: Remaining Access-Control Audit", () => {
    describe("1. Follow-ups and communication logs", () => {
        test("COUNSELOR can read follow-up for own student", async () => {
            const r = await dispatch(followupRouter, { method: "GET", path: "/f1", token: tokens.c1 });
            assert.equal(r.status, 200);
        });

        test("COUNSELOR reading another counselor's follow-up → 403", async () => {
            const r = await dispatch(followupRouter, { method: "GET", path: "/f2", token: tokens.c1 });
            assert.equal(r.status, 403);
        });

        test("TEACHER reading follow-up → 403 (role guard added)", async () => {
            const r = await dispatch(followupRouter, { method: "GET", path: "/f1", token: tokens.teacher });
            assert.equal(r.status, 403);
        });

        test("COUNSELOR reading another's student timeline → 403", async () => {
            const r = await dispatch(followupRouter, { method: "GET", path: "/student/s2", token: tokens.c1 });
            assert.equal(r.status, 403);
        });

        test("COUNSELOR creating follow-up for another's student → 403, no insert", async () => {
            const r = await dispatch(followupRouter, {
                method: "POST",
                path: "/",
                token: tokens.c1,
                body: { studentId: "s2", channel: "PHONE", direction: "OUTBOUND", content: "test" },
            });
            assert.equal(r.status, 403);
            assert.equal(calls.create.length, 0);
        });

        test("COUNSELOR creating follow-up for own student → 201", async () => {
            const r = await dispatch(followupRouter, {
                method: "POST",
                path: "/",
                token: tokens.c1,
                body: { studentId: "s1", channel: "PHONE", direction: "OUTBOUND", content: "called" },
            });
            assert.equal(r.status, 201);
        });

        test("COUNSELOR updating another's follow-up → 403, no write", async () => {
            const r = await dispatch(followupRouter, {
                method: "PUT",
                path: "/f2",
                token: tokens.c1,
                body: { content: "hijack" },
            });
            assert.equal(r.status, 403);
            assert.equal(calls.update.length, 0);
        });

        test("Follow-up list is scoped to assigned students for COUNSELOR", async () => {
            await dispatch(followupRouter, { method: "GET", path: "/", token: tokens.c1 });
            assert.deepEqual(lastCall("findMany", "communicationLog").where.student, { assignedCounselorId: C1 });
        });

        test("FRONT_DESK retains follow-up list and delete access", async () => {
            const r = await dispatch(followupRouter, { method: "DELETE", path: "/f2", token: tokens.desk });
            assert.equal(r.status, 200);
            assert.equal(calls.delete.length, 1);
        });
    });

    describe("2. Commissions", () => {
        test("COUNSELOR list ignores spoofed recipientId and scopes to self", async () => {
            await dispatch(commissionRouter, {
                method: "GET",
                path: "/",
                token: tokens.c1,
                query: { recipientId: C2 },
            });
            assert.equal(lastCall("findMany", "commission").where.recipientId, C1);
        });

        test("REFERRAL_AGENT list scopes to self", async () => {
            await dispatch(commissionRouter, { method: "GET", path: "/", token: tokens.ra1 });
            assert.equal(lastCall("findMany", "commission").where.recipientId, RA1);
        });

        test("SUPER_ADMIN retains full commission oversight and filter", async () => {
            await dispatch(commissionRouter, {
                method: "GET",
                path: "/",
                token: tokens.admin,
                query: { recipientId: C2 },
            });
            assert.equal(lastCall("findMany", "commission").where.recipientId, C2);
        });

        test("COUNSELOR can view own commission, blocked from another's → 403", async () => {
            const ok = await dispatch(commissionRouter, { method: "GET", path: "/cm1", token: tokens.c1 });
            assert.equal(ok.status, 200);
            const denied = await dispatch(commissionRouter, { method: "GET", path: "/cm2", token: tokens.c1 });
            assert.equal(denied.status, 403);
        });

        test("COUNSELOR cannot dispute another's commission → 403", async () => {
            const r = await dispatch(commissionRouter, {
                method: "PATCH",
                path: "/cm2/dispute",
                token: tokens.c1,
                body: { reason: "wrong" },
            });
            assert.equal(r.status, 403);
            assert.equal(calls.update.length, 0);
        });

        test("SUPER_ADMIN can view and dispute any commission", async () => {
            const r = await dispatch(commissionRouter, {
                method: "PATCH",
                path: "/cm2/dispute",
                token: tokens.admin,
                body: { reason: "audit adjustment" },
            });
            assert.equal(r.status, 200);
        });
    });

    describe("3. Recommendations", () => {
        test("COUNSELOR generating recommendations for another's student → 403", async () => {
            const r = await dispatch(recommendationRouter, {
                method: "POST",
                path: "/",
                token: tokens.c1,
                body: { studentId: "s2" },
            });
            assert.equal(r.status, 403);
            assert.equal(calls.create.length, 0);
        });

        test("COUNSELOR reading latest/history for another's student → 403", async () => {
            const latest = await dispatch(recommendationRouter, { method: "GET", path: "/s2/latest", token: tokens.c1 });
            const history = await dispatch(recommendationRouter, { method: "GET", path: "/s2/history", token: tokens.c1 });
            assert.equal(latest.status, 403);
            assert.equal(history.status, 403);
        });

        test("COUNSELOR reading latest for own student → 200", async () => {
            const r = await dispatch(recommendationRouter, { method: "GET", path: "/s1/latest", token: tokens.c1 });
            assert.equal(r.status, 200);
        });

        test("TEACHER reading recommendations → 403", async () => {
            const r = await dispatch(recommendationRouter, { method: "GET", path: "/s1/latest", token: tokens.teacher });
            assert.equal(r.status, 403);
        });

        test("SUPER_ADMIN can access any student's recommendations", async () => {
            const r = await dispatch(recommendationRouter, { method: "GET", path: "/s2/latest", token: tokens.admin });
            assert.equal(r.status, 200);
        });
    });

    describe("4. Appointments host assignment", () => {
        test("COUNSELOR cannot assign another counselor as host on create → 403", async () => {
            const r = await dispatch(appointmentRouter, {
                method: "POST",
                path: "/",
                token: tokens.c1,
                body: { studentId: "s1", counselorId: C2, datetime: "2026-12-05T10:00:00Z", type: "FOLLOW_UP" },
            });
            assert.equal(r.status, 403);
            assert.equal(calls.create.length, 0);
        });

        test("COUNSELOR creating appointment for own student defaults host to self → 201", async () => {
            const r = await dispatch(appointmentRouter, {
                method: "POST",
                path: "/",
                token: tokens.c1,
                body: { studentId: "s1", datetime: "2026-12-05T10:00:00Z", type: "FOLLOW_UP" },
            });
            assert.equal(r.status, 201);
            assert.equal(lastCall("create", "appointment").data.counselorId, C1);
        });

        test("COUNSELOR cannot reassign host on update → 403", async () => {
            const r = await dispatch(appointmentRouter, {
                method: "PUT",
                path: "/ap1",
                token: tokens.c1,
                body: { counselorId: C2 },
            });
            assert.equal(r.status, 403);
            assert.equal(calls.update.length, 0);
        });

        test("FRONT_DESK can still assign any counselor as host", async () => {
            const r = await dispatch(appointmentRouter, {
                method: "POST",
                path: "/",
                token: tokens.desk,
                body: { studentId: "s2", counselorId: C2, datetime: "2026-12-06T10:00:00Z", type: "FOLLOW_UP" },
            });
            assert.equal(r.status, 201);
            assert.equal(lastCall("create", "appointment").data.counselorId, C2);
        });
    });

    describe("5. Dashboard analytics", () => {
        test("COUNSELOR blocked from admin /dashboard/summary → 403", async () => {
            const r = await dispatch(dashboardRouter, { method: "GET", path: "/summary", token: tokens.c1 });
            assert.equal(r.status, 403);
        });

        test("SUPER_ADMIN can access consultancy-wide /dashboard/summary → 200", async () => {
            const r = await dispatch(dashboardRouter, { method: "GET", path: "/summary", token: tokens.admin });
            assert.equal(r.status, 200);
        });

        test("COUNSELOR /dashboard/counselor-summary ignores spoofed counselorId", async () => {
            await dispatch(dashboardRouter, {
                method: "GET",
                path: "/counselor-summary",
                token: tokens.c1,
                query: { counselorId: C2 },
            });
            const studentCounts = calls.count.filter((c) => c.model === "student");
            assert.ok(studentCounts.length > 0);
            for (const c of studentCounts) {
                assert.equal(c.where.assignedCounselorId, C1);
            }
            const commCall = lastCall("findMany", "communicationLog");
            assert.deepEqual(commCall.where.student, { assignedCounselorId: C1 });
        });

        test("SUPER_ADMIN /dashboard/counselor-summary can inspect target counselor", async () => {
            await dispatch(dashboardRouter, {
                method: "GET",
                path: "/counselor-summary",
                token: tokens.admin,
                query: { counselorId: C2 },
            });
            const studentCounts = calls.count.filter((c) => c.model === "student");
            assert.ok(studentCounts.every((c) => c.where.assignedCounselorId === C2));
        });

        test("Application & Visa dashboards scope counts for COUNSELOR, unfiltered for SUPER_ADMIN", async () => {
            await dispatch(applicationRouter, { method: "GET", path: "/dashboard", token: tokens.c1 });
            const cApp = calls.count.filter((c) => c.model === "application");
            assert.ok(cApp.every((c) => c.where.student?.assignedCounselorId === C1));

            calls.count.length = 0;
            await dispatch(applicationRouter, { method: "GET", path: "/dashboard", token: tokens.admin });
            const aApp = calls.count.filter((c) => c.model === "application");
            assert.ok(aApp.every((c) => c.where.student === undefined));

            calls.count.length = 0;
            await dispatch(visaRouter, { method: "GET", path: "/dashboard", token: tokens.c1 });
            const cVisa = calls.count.filter((c) => c.model === "visaCase");
            assert.ok(cVisa.every((c) => c.where.application?.student?.assignedCounselorId === C1));
        });
    });

    describe("Phase 5.1: Targeted Security Verification", () => {
        test("Recommendations: missing studentId returns 404 (not bypassed) for COUNSELOR", async () => {
            const postRes = await dispatch(recommendationRouter, {
                method: "POST",
                path: "/",
                token: tokens.c1,
                body: { studentId: "missing-student" },
            });
            const getRes = await dispatch(recommendationRouter, {
                method: "GET",
                path: "/missing-student/latest",
                token: tokens.c1,
            });
            assert.equal(postRes.status, 404);
            assert.equal(getRes.status, 404);
        });

        test("Recommendations: STUDENT can view own recordId, blocked on another student → 403", async () => {
            const own = await dispatch(recommendationRouter, {
                method: "GET",
                path: "/s1/history",
                token: tokens.studentS1,
            });
            const other = await dispatch(recommendationRouter, {
                method: "GET",
                path: "/s2/history",
                token: tokens.studentS1,
            });
            assert.equal(own.status, 200);
            assert.equal(other.status, 403);
        });

        test("Follow-ups: update cannot reassign studentId or authorId", async () => {
            const r = await dispatch(followupRouter, {
                method: "PUT",
                path: "/f1",
                token: tokens.c1,
                body: { studentId: "s2", authorId: C2, content: "updated note" },
            });
            assert.equal(r.status, 200);
            const upd = lastCall("update", "communicationLog");
            assert.equal("studentId" in upd.data, false);
            assert.equal("authorId" in upd.data, false);
            assert.equal(upd.data.content, "updated note");
        });

        test("Follow-ups: cross-counselor delete blocked at route and controller", async () => {
            const routeRes = await dispatch(followupRouter, {
                method: "DELETE",
                path: "/f2",
                token: tokens.c1,
            });
            assert.equal(routeRes.status, 403);
            assert.equal(calls.delete.length, 0);

            await assert.rejects(
                followupController.remove(
                    { user: { userId: C1, role: "COUNSELOR" }, params: { id: "f2" } },
                    { status: () => ({ json: () => {} }), json: () => {} }
                ),
                (e) => e.statusCode === 403
            );
            assert.equal(calls.delete.length, 0);
        });

        test("Appointments: COUNSELOR self-assignment on create & update succeeds", async () => {
            const cr = await dispatch(appointmentRouter, {
                method: "POST",
                path: "/",
                token: tokens.c1,
                body: { studentId: "s1", counselorId: C1, datetime: "2026-12-07T10:00:00Z", type: "FOLLOW_UP" },
            });
            assert.equal(cr.status, 201);
            assert.equal(lastCall("create", "appointment").data.counselorId, C1);

            const up = await dispatch(appointmentRouter, {
                method: "PUT",
                path: "/ap1",
                token: tokens.c1,
                body: { counselorId: C1, notes: "confirmed" },
            });
            assert.equal(up.status, 200);
        });

        test("Appointments: COUNSELOR cannot clear host (counselorId: null) on update → 403", async () => {
            const r = await dispatch(appointmentRouter, {
                method: "PUT",
                path: "/ap1",
                token: tokens.c1,
                body: { counselorId: null },
            });
            assert.equal(r.status, 403);
            assert.equal(calls.update.length, 0);
        });

        test("Appointments: direct service call blocks COUNSELOR host reassignment → 403", async () => {
            await assert.rejects(
                appointmentService.updateAppointment("ap1", { counselorId: C2 }, { userId: C1, role: "COUNSELOR" }),
                (e) => e.statusCode === 403
            );
            assert.equal(calls.update.length, 0);
        });

        test("Appointments: SUPER_ADMIN can reassign host on update → 200", async () => {
            const r = await dispatch(appointmentRouter, {
                method: "PUT",
                path: "/ap1",
                token: tokens.admin,
                body: { counselorId: C2 },
            });
            assert.equal(r.status, 200);
            assert.equal(lastCall("update", "appointment").data.counselorId, C2);
        });
    });
});
