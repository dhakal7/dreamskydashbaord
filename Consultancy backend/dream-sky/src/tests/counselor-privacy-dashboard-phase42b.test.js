/**
 * counselor-privacy-dashboard-phase42b.test.js
 *
 * Verifies Phase 4.2B:
 *  - Task 1: Front Desk private communication logs are excluded from GET /api/students/:id
 *            for COUNSELOR while preserving permitted logs, Front Desk author-only privacy,
 *            Branch Admin branch scoping, and Super Admin global visibility.
 *  - Task 2: Visa & Application dashboard statistics are strictly scoped to the
 *            authenticated Counselor (ignoring tampered counselorId), branch-scoped for
 *            BRANCH_ADMIN, and global for SUPER_ADMIN.
 */

process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test_access_secret_minimum_64_chars_1234567890abcdef1234567890abcdef";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test_refresh_secret_minimum_64_chars_1234567890abcdef1234567890abcdef";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const jwt = require("jsonwebtoken");

const users = new Map([
    ["sa-1", { id: "sa-1", role: "SUPER_ADMIN", status: "ACTIVE", branchId: null }],
    ["ba-1", { id: "ba-1", role: "BRANCH_ADMIN", status: "ACTIVE", branchId: "br-1" }],
    ["fd-1", { id: "fd-1", role: "FRONT_DESK", status: "ACTIVE", branchId: "br-1" }],
    ["fd-2", { id: "fd-2", role: "FRONT_DESK", status: "ACTIVE", branchId: "br-1" }],
    ["co-1", { id: "co-1", role: "COUNSELOR", status: "ACTIVE", branchId: "br-1" }],
    ["co-2", { id: "co-2", role: "COUNSELOR", status: "ACTIVE", branchId: "br-2" }],
]);

const allCommLogs = [
    {
        id: "log-fd1",
        studentId: "stu-co1",
        authorId: "fd-1",
        author: { id: "fd-1", firstName: "Front", lastName: "One", role: "FRONT_DESK" },
        content: "Private FD-1 note",
        createdAt: new Date("2026-02-01T10:00:00Z"),
    },
    {
        id: "log-fd2",
        studentId: "stu-co1",
        authorId: "fd-2",
        author: { id: "fd-2", firstName: "Front", lastName: "Two", role: "FRONT_DESK" },
        content: "Private FD-2 note",
        createdAt: new Date("2026-02-01T11:00:00Z"),
    },
    {
        id: "log-co1",
        studentId: "stu-co1",
        authorId: "co-1",
        author: { id: "co-1", firstName: "Counselor", lastName: "One", role: "COUNSELOR" },
        content: "Permitted Counselor note",
        createdAt: new Date("2026-02-01T12:00:00Z"),
    },
    {
        id: "log-sys",
        studentId: "stu-co1",
        authorId: null,
        author: null,
        content: "System log",
        createdAt: new Date("2026-02-01T13:00:00Z"),
    },
];

const students = new Map([
    ["stu-co1", {
        id: "stu-co1",
        firstName: "Student",
        lastName: "One",
        email: "s1@example.com",
        phone: "9800000001",
        currentStage: "ENROLLED",
        isActive: true,
        assignedCounselorId: "co-1",
        assignedCounselor: { id: "co-1", firstName: "Co", lastName: "One", branchId: "br-1" },
        academicBackground: { branchId: "br-1" },
        stageHistory: [],
        testScores: [],
        documents: [],
        payments: [],
        applications: [],
        appointments: [],
    }],
    ["stu-co2", {
        id: "stu-co2",
        firstName: "Student",
        lastName: "Two",
        email: "s2@example.com",
        phone: "9800000002",
        currentStage: "ENROLLED",
        isActive: true,
        assignedCounselorId: "co-2",
        assignedCounselor: { id: "co-2", firstName: "Co", lastName: "Two", branchId: "br-2" },
        academicBackground: { branchId: "br-2" },
        stageHistory: [],
        testScores: [],
        documents: [],
        payments: [],
        applications: [],
        appointments: [],
    }],
]);

const applications = [
    { id: "app-1", studentId: "stu-co1", status: "SUBMITTED" },
    { id: "app-2", studentId: "stu-co2", status: "ACCEPTED" },
    { id: "app-3", studentId: "stu-co2", status: "ACCEPTED" },
];

const visaCases = [
    { id: "visa-1", applicationId: "app-1", status: "PREPARING" },
    { id: "visa-2", applicationId: "app-2", status: "APPROVED" },
    { id: "visa-3", applicationId: "app-3", status: "SUBMITTED" },
];

function matchesCommWhere(log, where) {
    if (!where) return true;
    if (where.authorId !== undefined) return log.authorId === where.authorId;
    if (Array.isArray(where.OR)) {
        return where.OR.some((cond) => {
            if (cond.authorId !== undefined) return log.authorId === cond.authorId;
            if (cond.author?.role?.not) return log.author && log.author.role !== cond.author.role.not;
            return false;
        });
    }
    return true;
}

function matchesStudentScope(stu, stuWhere) {
    if (!stuWhere) return true;
    if (stuWhere.assignedCounselorId !== undefined) {
        return stu.assignedCounselorId === stuWhere.assignedCounselorId;
    }
    if (Array.isArray(stuWhere.OR)) {
        return stuWhere.OR.some((c) => {
            if (c.assignedCounselor?.branchId) return stu.assignedCounselor?.branchId === c.assignedCounselor.branchId;
            if (c.assignedCounselorId === null && c.academicBackground?.equals) {
                return stu.assignedCounselorId === null && stu.academicBackground?.branchId === c.academicBackground.equals;
            }
            return false;
        });
    }
    return true;
}

const prismaPath = require.resolve("../prisma");
const mockPrisma = {
    user: { findUnique: async ({ where }) => users.get(where.id) || null },
    student: {
        findUnique: async ({ where, select }) => {
            const s = students.get(where.id);
            if (!s) return null;
            const copy = { ...s };
            if (select?.communicationLogs) {
                const commWhere = select.communicationLogs.where;
                copy.communicationLogs = allCommLogs.filter((l) => matchesCommWhere(l, commWhere));
            }
            return copy;
        },
        count: async () => 0,
    },
    application: {
        count: async ({ where = {} }) => {
            return applications.filter((a) => {
                if (where.status && a.status !== where.status) return false;
                if (where.student && !matchesStudentScope(students.get(a.studentId), where.student)) return false;
                return true;
            }).length;
        },
    },
    visaCase: {
        count: async ({ where = {} }) => {
            return visaCases.filter((v) => {
                if (where.status && v.status !== where.status) return false;
                if (where.application?.student) {
                    const app = applications.find((a) => a.id === v.applicationId);
                    if (!app || !matchesStudentScope(students.get(app.studentId), where.application.student)) return false;
                }
                return true;
            }).length;
        },
    },
    communicationLog: { findMany: async () => [] },
    commission: { findMany: async () => [] },
};

require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: mockPrisma };

const studentRoutes = require("../routes/student.routes");
const applicationRoutes = require("../routes/application.routes");
const visaRoutes = require("../routes/visa.routes");
const dashboardRoutes = require("../routes/dashboard.routes");

function signToken(userId) {
    const u = users.get(userId);
    return jwt.sign({ userId: u.id, id: u.id, role: u.role }, process.env.JWT_ACCESS_SECRET, { expiresIn: "5m" });
}

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use("/api/students", studentRoutes);
    app.use("/api/applications", applicationRoutes);
    app.use("/api/visa-cases", visaRoutes);
    app.use("/api/dashboard", dashboardRoutes);
    app.use((err, req, res, next) => {
        res.status(err.statusCode || 500).json({ success: false, code: err.code || "ERR", message: err.message });
    });
    return app;
}

async function getJson(server, path, userId) {
    const addr = server.address();
    const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
        headers: { Authorization: `Bearer ${signToken(userId)}` },
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
}

test("Phase 4.2B Counselor Privacy & Dashboard Scoping", async (t) => {
    const app = buildApp();
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => server.close());

    await t.test("Task 1: Counselor sees permitted logs for assigned student, excludes Front Desk private logs", async () => {
        const r = await getJson(server, "/api/students/stu-co1", "co-1");
        assert.equal(r.status, 200);
        const ids = r.json.data.communicationLogs.map((l) => l.id);
        assert.ok(ids.includes("log-co1"), "Counselor should see own log");
        assert.ok(ids.includes("log-sys"), "Counselor should see system log");
        assert.ok(!ids.includes("log-fd1"), "Counselor must NOT see FD-1 private log");
        assert.ok(!ids.includes("log-fd2"), "Counselor must NOT see FD-2 private log");
    });

    await t.test("Task 1: Front Desk retains author-only restriction on student profile logs", async () => {
        const r = await getJson(server, "/api/students/stu-co1", "fd-1");
        assert.equal(r.status, 200);
        const ids = r.json.data.communicationLogs.map((l) => l.id);
        assert.deepEqual(ids, ["log-fd1"]);
    });

    await t.test("Task 1: Super Admin and Branch Admin (own branch) see all permitted communication logs", async () => {
        const sa = await getJson(server, "/api/students/stu-co1", "sa-1");
        assert.equal(sa.status, 200);
        assert.equal(sa.json.data.communicationLogs.length, 4);

        const ba = await getJson(server, "/api/students/stu-co1", "ba-1");
        assert.equal(ba.status, 200);
        assert.equal(ba.json.data.communicationLogs.length, 4);
    });

    await t.test("Task 2: Application dashboard stats scoped by role & ignores tampered counselorId", async () => {
        const co1 = await getJson(server, "/api/applications/dashboard?counselorId=co-2", "co-1");
        assert.equal(co1.status, 200);
        assert.equal(co1.json.data.submitted, 1);
        assert.equal(co1.json.data.accepted, 0);

        const co2 = await getJson(server, "/api/applications/dashboard", "co-2");
        assert.equal(co2.status, 200);
        assert.equal(co2.json.data.submitted, 0);
        assert.equal(co2.json.data.accepted, 2);

        const ba1 = await getJson(server, "/api/applications/dashboard", "ba-1");
        assert.equal(ba1.status, 200);
        assert.equal(ba1.json.data.submitted, 1);
        assert.equal(ba1.json.data.accepted, 0);

        const sa = await getJson(server, "/api/applications/dashboard", "sa-1");
        assert.equal(sa.status, 200);
        assert.equal(sa.json.data.submitted, 1);
        assert.equal(sa.json.data.accepted, 2);
    });

    await t.test("Task 2: Visa dashboard stats scoped by role & ignores tampered counselorId", async () => {
        const co1 = await getJson(server, "/api/visa-cases/dashboard?counselorId=co-2", "co-1");
        assert.equal(co1.status, 200);
        assert.equal(co1.json.data.preparing, 1);
        assert.equal(co1.json.data.approved, 0);
        assert.equal(co1.json.data.submitted, 0);

        const co2 = await getJson(server, "/api/visa-cases/dashboard", "co-2");
        assert.equal(co2.status, 200);
        assert.equal(co2.json.data.preparing, 0);
        assert.equal(co2.json.data.approved, 1);
        assert.equal(co2.json.data.submitted, 1);

        const ba1 = await getJson(server, "/api/visa-cases/dashboard", "ba-1");
        assert.equal(ba1.status, 200);
        assert.equal(ba1.json.data.preparing, 1);
        assert.equal(ba1.json.data.approved, 0);

        const sa = await getJson(server, "/api/visa-cases/dashboard", "sa-1");
        assert.equal(sa.status, 200);
        assert.equal(sa.json.data.preparing, 1);
        assert.equal(sa.json.data.approved, 1);
        assert.equal(sa.json.data.submitted, 1);
    });
});

