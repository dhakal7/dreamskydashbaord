/**
 * portal-and-teacher-reports-rbac.test.js
 *
 * Verifies:
 *  - Student Portal isolation (/api/portal/:studentId/*): a student can access
 *    only their own studentId and gets HTTP 403 on another student's ID.
 *  - Student is denied staff-only /api/applications, /api/visa-cases, /api/reports/teacher.
 *  - Teacher can access /api/reports/teacher (200) and is denied /api/reports/summary (403).
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const users = new Map([
    ["stu-u-1", { id: "stu-u-1", role: "STUDENT", status: "ACTIVE", branchId: null, studentId: "stu-1", mustChangePassword: false }],
    ["stu-u-2", { id: "stu-u-2", role: "STUDENT", status: "ACTIVE", branchId: null, studentId: "stu-2", mustChangePassword: false }],
    ["tchr-u-1", { id: "tchr-u-1", role: "TEACHER", status: "ACTIVE", branchId: "br-1", studentId: null, mustChangePassword: false }],
    ["ra-u-1", { id: "ra-u-1", role: "REFERRAL_AGENT", status: "ACTIVE", branchId: null, studentId: null, mustChangePassword: false }],
    ["fd-u-1", { id: "fd-u-1", role: "FRONT_DESK", status: "ACTIVE", branchId: "br-1", studentId: null, mustChangePassword: false }],
    ["co-u-1", { id: "co-u-1", role: "COUNSELOR", status: "ACTIVE", branchId: "br-1", studentId: null, mustChangePassword: false }],
    ["ba-u-1", { id: "ba-u-1", role: "BRANCH_ADMIN", status: "ACTIVE", branchId: "br-1", studentId: null, mustChangePassword: false }],
    ["sa-u-1", { id: "sa-u-1", role: "SUPER_ADMIN", status: "ACTIVE", branchId: null, studentId: null, mustChangePassword: false }],
]);

const mockPrisma = new Proxy({}, {
    get: (_t, prop) => {
        if (typeof prop === "symbol" || prop === "then") return undefined;
        if (prop === "$transaction") return async (arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma));
        return new Proxy({}, {
            get: (_m, method) => {
                if (typeof method === "symbol" || method === "then") return undefined;
                return async (args = {}) => {
                    if (prop === "user" && (method === "findUnique" || method === "findFirst")) {
                        return users.get(args?.where?.id) || null;
                    }
                    if (prop === "student" && method === "findUnique") {
                        return { id: args?.where?.id, firstName: "Test", lastName: "Student", currentStage: "ENROLLED" };
                    }
                    if (method === "count") return 0;
                    if (method === "findMany") return [];
                    return null;
                };
            },
        });
    },
});

const prismaPath = require.resolve("../prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: mockPrisma };

const { signAccessToken } = require("../utils/jwt.util");
const portalRoutes = require("../routes/portal.routes");
const applicationRoutes = require("../routes/application.routes");
const visaRoutes = require("../routes/visa.routes");
const reportRoutes = require("../routes/report.routes");

const tokenFor = (u) => signAccessToken({
    userId: u.id, role: u.role, branchId: u.branchId, studentId: u.studentId, mustChangePassword: false,
});

let server;
let base;

test.before(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/portal", portalRoutes);
    app.use("/api/applications", applicationRoutes);
    app.use("/api/visa-cases", visaRoutes);
    app.use("/api/reports", reportRoutes);
    // eslint-disable-next-line no-unused-vars
    app.use((err, _req, res, _next) => {
        res.status(err.statusCode || 500).json({ success: false, code: err.code || "INTERNAL_ERROR", message: err.message });
    });
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    if (server) await new Promise((r) => server.close(r));
});

const get = async (path, user) => {
    const res = await fetch(`${base}${path}`, {
        headers: { Authorization: `Bearer ${tokenFor(user)}` },
    });
    let body = null;
    try { body = await res.json(); } catch { /* ignore */ }
    return { status: res.status, body };
};

test("Student Portal: student can access own dashboard, applications, visa-cases, documents, appointments", async () => {
    const stu1 = users.get("stu-u-1");
    for (const ep of ["dashboard", "applications", "visa-cases", "documents", "appointments"]) {
        const { status } = await get(`/api/portal/stu-1/${ep}`, stu1);
        assert.equal(status, 200, `expected 200 for own /portal/stu-1/${ep}`);
    }
});

test("Student Portal: student cannot access another student's portal endpoints (403)", async () => {
    const stu1 = users.get("stu-u-1");
    for (const ep of ["dashboard", "applications", "visa-cases", "documents", "appointments"]) {
        const { status, body } = await get(`/api/portal/stu-2/${ep}`, stu1);
        assert.equal(status, 403, `expected 403 for cross-student /portal/stu-2/${ep}`);
        assert.equal(body?.code, "STUDENT_PORTAL_ACCESS_DENIED");
    }
});

test("Student is denied staff-only /api/applications, /api/visa-cases, and /api/reports/teacher", async () => {
    const stu1 = users.get("stu-u-1");
    assert.equal((await get("/api/applications", stu1)).status, 403);
    assert.equal((await get("/api/visa-cases", stu1)).status, 403);
    assert.equal((await get("/api/reports/teacher", stu1)).status, 403);
});

test("Teacher can access /api/reports/teacher (200) and is denied /api/reports/summary (403)", async () => {
    const tchr = users.get("tchr-u-1");
    const own = await get("/api/reports/teacher", tchr);
    assert.equal(own.status, 200);
    assert.equal(own.body?.success, true);

    const summary = await get("/api/reports/summary", tchr);
    assert.equal(summary.status, 403);
});

test("Student Portal: all non-STUDENT roles are denied (403) without exposing student data", async () => {
    const nonStudentIds = ["tchr-u-1", "ra-u-1", "fd-u-1", "co-u-1", "ba-u-1", "sa-u-1"];
    for (const uid of nonStudentIds) {
        const actor = users.get(uid);
        for (const ep of ["dashboard", "profile", "applications", "visa-cases", "documents", "appointments", "follow-ups"]) {
            const { status, body } = await get(`/api/portal/stu-1/${ep}`, actor);
            assert.equal(status, 403, `expected 403 for ${actor.role} on /portal/stu-1/${ep}`);
            assert.equal(body?.code, "STUDENT_PORTAL_ACCESS_DENIED");
            assert.equal(body?.data, undefined, `expected no student data in denied body for ${actor.role}`);
        }
    }
});

test("Super Admin retains administrative access to /applications, /visa-cases, and /reports/summary", async () => {
    const sa = users.get("sa-u-1");
    assert.equal((await get("/api/applications", sa)).status, 200);
    assert.equal((await get("/api/visa-cases", sa)).status, 200);
    assert.equal((await get("/api/reports/summary", sa)).status, 200);
});

