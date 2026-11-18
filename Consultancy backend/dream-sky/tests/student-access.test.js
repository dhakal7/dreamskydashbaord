/**
 * Phase 4: Student data access enforcement.
 *
 * Uses an in-memory Prisma mock injected into require.cache — no database
 * connection is ever opened.
 */
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// ─── In-memory Prisma mock ────────────────────────────────────────────────────
const C1 = "counselor-1";
const C2 = "counselor-2";

const students = {
    s1: { id: "s1", firstName: "A", lastName: "One", email: "a@x.io", assignedCounselorId: C1, currentStage: "ENROLLED" },
    s2: { id: "s2", firstName: "B", lastName: "Two", email: "b@x.io", assignedCounselorId: C2, currentStage: "ENROLLED" },
};
const applications = {
    a1: { id: "a1", studentId: "s1", status: "SUBMITTED", student: students.s1 },
    a2: { id: "a2", studentId: "s2", status: "SUBMITTED", student: students.s2 },
};
const visaCases = {
    v1: { id: "v1", status: "PREPARING", application: { student: students.s1 } },
    v2: { id: "v2", status: "PREPARING", application: { student: students.s2 } },
};
const documents = {
    d1: { id: "d1", studentId: "s1", student: students.s1 },
    d2: { id: "d2", studentId: "s2", student: students.s2 },
};
const appointments = {
    ap1: { id: "ap1", counselorId: C1, student: students.s1 },
    ap2: { id: "ap2", counselorId: C2, student: students.s2 },
    ap3: { id: "ap3", counselorId: C1, student: students.s2 }, // hosted by C1, student owned by C2
};

const calls = { findMany: [], update: [] };
const table = (rows, name) => ({
    findUnique: async ({ where }) => rows[where.id] || null,
    findFirst: async () => null,
    findMany: async (args) => { calls.findMany.push({ model: name, ...args }); return []; },
    count: async () => 0,
    update: async (args) => { calls.update.push({ model: name, ...args }); return { ...rows[args.where.id], ...args.data }; },
});

const fakePrisma = {
    student: table(students, "student"),
    application: table(applications, "application"),
    visaCase: table(visaCases, "visaCase"),
    document: table(documents, "document"),
    appointment: table(appointments, "appointment"),
    payment: table({ p1: { id: "p1", student: students.s1 }, p2: { id: "p2", student: students.s2 } }, "payment"),
};

const prismaPath = require.resolve(path.join(__dirname, "../src/prisma"));
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };

const access = require("../src/utils/student-access");
const studentService = require("../src/services/student.service");
const studentController = require("../src/controllers/student.controller");
const applicationController = require("../src/controllers/application.controller");
const visaController = require("../src/controllers/visa.controller");
const documentController = require("../src/controllers/document.controller");
const appointmentController = require("../src/controllers/appointment.controller");

// ─── Helpers ──────────────────────────────────────────────────────────────────
const users = {
    c1: { userId: C1, role: "COUNSELOR" },
    admin: { userId: "admin-1", role: "SUPER_ADMIN" },
    branch: { userId: "branch-1", role: "BRANCH_ADMIN" },
    desk: { userId: "desk-1", role: "FRONT_DESK" },
    teacher: { userId: "t-1", role: "TEACHER" },
    studentS1: { userId: "u-s1", role: "STUDENT", studentId: "s1" },
};

const mockRes = () => {
    const res = { statusCode: 200, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    res.set = () => res;
    res.send = (b) => { res.body = b; return res; };
    return res;
};

/** Runs a handler; returns { res, err } capturing thrown errors and next(err). */
const run = async (handler, req) => {
    const res = mockRes();
    let err = null;
    try { await handler(req, res, (e) => { err = e || null; }); } catch (e) { err = e; }
    return { res, err };
};

const lastWhere = (model) => [...calls.findMany].reverse().find((c) => c.model === model)?.where;

beforeEach(() => { calls.findMany.length = 0; calls.update.length = 0; });

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("Phase 4: Student data access enforcement", () => {
    describe("Student list scoping", () => {
        test("COUNSELOR without counselorId sees only own students", async () => {
            await run(studentController.list, { user: users.c1, query: {} });
            assert.equal(lastWhere("student").assignedCounselorId, C1);
        });

        test("COUNSELOR supplying another counselor's id is still scoped to self", async () => {
            await run(studentController.list, { user: users.c1, query: { counselorId: C2 } });
            assert.equal(lastWhere("student").assignedCounselorId, C1);
        });

        test("SUPER_ADMIN lists all students (no forced scope)", async () => {
            await run(studentController.list, { user: users.admin, query: {} });
            assert.equal(lastWhere("student").assignedCounselorId, undefined);
        });

        test("SUPER_ADMIN may still filter by counselorId explicitly", async () => {
            await run(studentController.list, { user: users.admin, query: { counselorId: C2 } });
            assert.equal(lastWhere("student").assignedCounselorId, C2);
        });

        test("FRONT_DESK lists all students (reception workflow preserved)", async () => {
            await run(studentController.list, { user: users.desk, query: {} });
            assert.equal(lastWhere("student").assignedCounselorId, undefined);
        });

        test("listStudents without caller context keeps legacy behaviour", async () => {
            await studentService.listStudents({ counselorId: C2 });
            assert.equal(lastWhere("student").assignedCounselorId, C2);
        });
    });

    describe("Single student access", () => {
        test("COUNSELOR can view own assigned student", async () => {
            const { res, err } = await run(studentController.getOne, { user: users.c1, params: { id: "s1" } });
            assert.equal(err, null);
            assert.equal(res.statusCode, 200);
        });

        test("COUNSELOR viewing another counselor's student → 403", async () => {
            const { err } = await run(studentController.getOne, { user: users.c1, params: { id: "s2" } });
            assert.equal(err?.statusCode, 403);
        });

        test("COUNSELOR timeline for another counselor's student → 403", async () => {
            const { err } = await run(studentController.timeline, { user: users.c1, params: { id: "s2" } });
            assert.equal(err?.statusCode, 403);
        });

        test("COUNSELOR updating another counselor's student → 403, no write", async () => {
            const { err } = await run(studentController.update, { user: users.c1, params: { id: "s2" }, body: { notes: "x" } });
            assert.equal(err?.statusCode, 403);
            assert.equal(calls.update.length, 0);
        });

        test("COUNSELOR deleting another counselor's student → 403", async () => {
            const { err } = await run(studentController.remove, { user: users.c1, params: { id: "s2" } });
            assert.equal(err?.statusCode, 403);
        });

        test("COUNSELOR changing pipeline of another counselor's student → 403", async () => {
            const { err } = await run(studentController.changePipeline, { user: users.c1, params: { id: "s2" }, body: { stage: "APPLIED" } });
            assert.equal(err?.statusCode, 403);
        });

        test("FRONT_DESK can view any student", async () => {
            const { err } = await run(studentController.getOne, { user: users.desk, params: { id: "s2" } });
            assert.equal(err, null);
        });

        test("Missing student → 404 for counselor", async () => {
            const { err } = await run(studentController.timeline, { user: users.c1, params: { id: "nope" } });
            assert.equal(err?.statusCode, 404);
        });
    });

    describe("Reassignment", () => {
        test("COUNSELOR cannot change assignedCounselorId on own student", async () => {
            const { err } = await run(studentController.update, { user: users.c1, params: { id: "s1" }, body: { assignedCounselorId: C2 } });
            assert.equal(err, null);
            const upd = calls.update.find((c) => c.model === "student");
            assert.ok(upd, "update should run");
            assert.equal("assignedCounselorId" in upd.data, false);
        });

        test("SUPER_ADMIN can reassign a student", async () => {
            const { err } = await run(studentController.update, { user: users.admin, params: { id: "s1" }, body: { assignedCounselorId: C2 } });
            assert.equal(err, null);
            assert.equal(calls.update.find((c) => c.model === "student").data.assignedCounselorId, C2);
        });

        test("BRANCH_ADMIN can reassign a student", async () => {
            await run(studentController.update, { user: users.branch, params: { id: "s2" }, body: { assignedCounselorId: C1 } });
            assert.equal(calls.update.find((c) => c.model === "student").data.assignedCounselorId, C1);
        });

        test("Access follows reassignment (canAccessStudent reads current assignment)", () => {
            const s = { id: "sx", assignedCounselorId: C2 };
            assert.equal(access.canAccessStudent(users.c1, s), false);
            s.assignedCounselorId = C1;
            assert.equal(access.canAccessStudent(users.c1, s), true);
        });
    });

    describe("Nested resources", () => {
        test("COUNSELOR can view application of own student", async () => {
            const { err } = await run(applicationController.getOne, { user: users.c1, params: { id: "a1" } });
            assert.notEqual(err?.statusCode, 403);
        });

        test("COUNSELOR viewing application of another's student → 403", async () => {
            const { err } = await run(applicationController.getOne, { user: users.c1, params: { id: "a2" } });
            assert.equal(err?.statusCode, 403);
        });

        test("COUNSELOR creating application for another's student → 403", async () => {
            const { err } = await run(applicationController.create, {
                user: users.c1, params: {}, body: { studentId: "s2", universityId: "u", courseId: "c" },
            });
            assert.equal(err?.statusCode, 403);
        });

        test("Application list is scoped for COUNSELOR", async () => {
            await run(applicationController.list, { user: users.c1, query: {} });
            assert.deepEqual(lastWhere("application").student, { assignedCounselorId: C1 });
        });

        test("COUNSELOR viewing visa case of another's student → 403", async () => {
            const { err } = await run(visaController.getOne, { user: users.c1, params: { id: "v2" } });
            assert.equal(err?.statusCode, 403);
        });

        test("COUNSELOR deleting visa case of another's student → 403", async () => {
            const { err } = await run(visaController.remove, { user: users.c1, params: { id: "v2" } });
            assert.equal(err?.statusCode, 403);
        });

        test("Visa list is scoped for COUNSELOR and keeps studentId filter", async () => {
            await run(visaController.list, { user: users.c1, query: { studentId: "s1" } });
            assert.deepEqual(lastWhere("visaCase").application, { studentId: "s1", student: { assignedCounselorId: C1 } });
        });

        test("COUNSELOR downloading another's document → 403", async () => {
            const { err } = await run(documentController.download, { user: users.c1, params: { id: "d2" }, query: {} });
            assert.equal(err?.statusCode, 403);
        });

        test("STUDENT cannot read another student's document", async () => {
            const { err } = await run(documentController.getOne, { user: users.studentS1, params: { id: "d2" } });
            assert.equal(err?.statusCode, 403);
        });

        test("TEACHER cannot read student documents", async () => {
            const { err } = await run(documentController.getOne, { user: users.teacher, params: { id: "d1" } });
            assert.equal(err?.statusCode, 403);
        });

        test("Document list is scoped for COUNSELOR", async () => {
            await run(documentController.list, { user: users.c1, query: {} });
            assert.deepEqual(lastWhere("document").student, { assignedCounselorId: C1 });
        });

        test("COUNSELOR may access appointment they host even if student is not theirs", async () => {
            const { err } = await run(appointmentController.getOne, { user: users.c1, params: { id: "ap3" } });
            assert.notEqual(err?.statusCode, 403);
        });

        test("COUNSELOR cannot access another counselor's appointment for another's student", async () => {
            const { err } = await run(appointmentController.getOne, { user: users.c1, params: { id: "ap2" } });
            assert.equal(err?.statusCode, 403);
        });

        test("Payment access helper blocks counselor on another's student payment", async () => {
            await assert.rejects(access.assertPaymentAccess(users.c1, "p2"), (e) => e.statusCode === 403);
            await access.assertPaymentAccess(users.c1, "p1");
            await access.assertPaymentAccess(users.desk, "p2");
        });
    });

    describe("Route-level RBAC", () => {
        const routeRoles = (router, method, routePath) => {
            const layer = router.stack.find((l) => l.route?.path === routePath && l.route.methods[method]);
            return layer ? layer.route.stack.map((s) => s.name) : null;
        };

        test("GET /students/:id now has a role guard", () => {
            const router = require("../src/routes/student.routes");
            const stack = routeRoles(router, "get", "/:id");
            assert.ok(stack && stack.length >= 2, "expected requireRole middleware before handler");
        });

        test("FRONT_DESK still cannot delete visa cases", () => {
            const { requireRole } = require("../src/middlewares/rbac.middleware");
            const mw = requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR");
            let nextErr;
            const res = mockRes();
            mw({ user: users.desk }, res, (e) => { nextErr = e; });
            const denied = res.statusCode === 403 || nextErr?.statusCode === 403;
            assert.ok(denied);
        });
    });
});
