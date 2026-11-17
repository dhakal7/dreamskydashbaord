/**
 * visa-followup-phase44.test.js
 *
 * Verifies Phase 4.4:
 *  - Visa Case Permissions: COUNSELOR (view/create/update/delete own assigned students' cases,
 *    denied cross-counselor & tampered payloads), BRANCH_ADMIN (branch-scoped),
 *    SUPER_ADMIN (global), FRONT_DESK (blocked 403 across all visa endpoints).
 *  - Follow-up Workflow: Counselor scoping, tampered authorId ignored, and dashboard
 *    overdue vs upcoming statistics.
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
    ["co-1", { id: "co-1", role: "COUNSELOR", status: "ACTIVE", branchId: "br-1" }],
    ["co-2", { id: "co-2", role: "COUNSELOR", status: "ACTIVE", branchId: "br-2" }],
]);

const students = new Map([
    ["stu-co1", {
        id: "stu-co1",
        firstName: "Own",
        lastName: "Student",
        email: "own@example.com",
        isActive: true,
        assignedCounselorId: "co-1",
        assignedCounselor: { id: "co-1", branchId: "br-1" },
        academicBackground: { branchId: "br-1" },
    }],
    ["stu-co2", {
        id: "stu-co2",
        firstName: "Other",
        lastName: "Student",
        email: "other@example.com",
        isActive: true,
        assignedCounselorId: "co-2",
        assignedCounselor: { id: "co-2", branchId: "br-2" },
        academicBackground: { branchId: "br-2" },
    }],
]);

const applications = new Map([
    ["app-co1", { id: "app-co1", studentId: "stu-co1", status: "ACCEPTED", student: students.get("stu-co1") }],
    ["app-co2", { id: "app-co2", studentId: "stu-co2", status: "ACCEPTED", student: students.get("stu-co2") }],
]);

const visaCases = new Map([
    ["vc-co1", {
        id: "vc-co1",
        applicationId: "app-co1",
        status: "PREPARING",
        application: {
            id: "app-co1",
            status: "ACCEPTED",
            intake: "Fall 2026",
            student: students.get("stu-co1"),
            university: { id: "uni-1", name: "Uni 1" },
            course: { id: "crs-1", name: "Course 1", level: "BACHELOR" },
        },
    }],
    ["vc-co2", {
        id: "vc-co2",
        applicationId: "app-co2",
        status: "SUBMITTED",
        application: {
            id: "app-co2",
            status: "ACCEPTED",
            intake: "Fall 2026",
            student: students.get("stu-co2"),
            university: { id: "uni-1", name: "Uni 1" },
            course: { id: "crs-1", name: "Course 1", level: "BACHELOR" },
        },
    }],
]);

const followUps = new Map([
    ["fu-co1-future", {
        id: "fu-co1-future",
        studentId: "stu-co1",
        authorId: "co-1",
        content: "Future reminder",
        nextFollowUpAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        student: students.get("stu-co1"),
        author: { id: "co-1", firstName: "Co", lastName: "One", role: "COUNSELOR" },
    }],
    ["fu-co1-past", {
        id: "fu-co1-past",
        studentId: "stu-co1",
        authorId: "co-1",
        content: "Overdue reminder",
        nextFollowUpAt: new Date(Date.now() - 86400000),
        createdAt: new Date(Date.now() - 172800000),
        student: students.get("stu-co1"),
        author: { id: "co-1", firstName: "Co", lastName: "One", role: "COUNSELOR" },
    }],
    ["fu-co2", {
        id: "fu-co2",
        studentId: "stu-co2",
        authorId: "co-2",
        content: "Other counselor reminder",
        nextFollowUpAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        student: students.get("stu-co2"),
        author: { id: "co-2", firstName: "Co", lastName: "Two", role: "COUNSELOR" },
    }],
]);

let deletedVisaIds = [];

function matchesStudentFilter(stu, stuWhere) {
    if (!stuWhere) return true;
    if (stuWhere.assignedCounselorId !== undefined) return stu.assignedCounselorId === stuWhere.assignedCounselorId;
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
    student: { findUnique: async ({ where }) => students.get(where.id) || null },
    application: { findUnique: async ({ where }) => applications.get(where.id) || null },
    visaCase: {
        findUnique: async ({ where }) => {
            if (where.id) return visaCases.get(where.id) || null;
            if (where.applicationId) {
                return Array.from(visaCases.values()).find((v) => v.applicationId === where.applicationId) || null;
            }
            return null;
        },
        findMany: async ({ where = {} }) => {
            return Array.from(visaCases.values()).filter((v) => {
                if (where.application?.student && !matchesStudentFilter(v.application.student, where.application.student)) return false;
                return true;
            });
        },
        count: async ({ where = {} }) => {
            return Array.from(visaCases.values()).filter((v) => {
                if (where.status && v.status !== where.status) return false;
                if (where.application?.student && !matchesStudentFilter(v.application.student, where.application.student)) return false;
                return true;
            }).length;
        },
        delete: async ({ where }) => {
            deletedVisaIds.push(where.id);
            return visaCases.get(where.id);
        },
    },
    communicationLog: {
        findUnique: async ({ where }) => followUps.get(where.id) || null,
        findMany: async ({ where = {} }) => {
            return Array.from(followUps.values()).filter((f) => {
                if (Array.isArray(where.AND)) {
                    for (const cond of where.AND) {
                        if (Array.isArray(cond.OR)) {
                            const ok = cond.OR.some((o) => {
                                if (o.authorId !== undefined) return f.authorId === o.authorId;
                                if (o.student?.assignedCounselorId !== undefined) {
                                    return f.student.assignedCounselorId === o.student.assignedCounselorId && f.author?.role !== "FRONT_DESK";
                                }
                                return false;
                            });
                            if (!ok) return false;
                        }
                    }
                }
                if (where.authorId !== undefined && f.authorId !== where.authorId) return false;
                return true;
            });
        },
        count: async ({ where = {} }) => {
            return Array.from(followUps.values()).filter((f) => {
                if (Array.isArray(where.OR)) {
                    const ok = where.OR.some((o) => {
                        if (o.authorId !== undefined) return f.authorId === o.authorId;
                        if (o.student?.assignedCounselorId !== undefined) return f.student.assignedCounselorId === o.student.assignedCounselorId;
                        return false;
                    });
                    if (!ok) return false;
                }
                if (where.nextFollowUpAt) {
                    if (!f.nextFollowUpAt) return false;
                    if (where.nextFollowUpAt.gt && !(f.nextFollowUpAt > where.nextFollowUpAt.gt)) return false;
                    if (where.nextFollowUpAt.lt && !(f.nextFollowUpAt < where.nextFollowUpAt.lt)) return false;
                    if (where.nextFollowUpAt.gte && !(f.nextFollowUpAt >= where.nextFollowUpAt.gte)) return false;
                }
                return true;
            }).length;
        },
    },
    $transaction: async (fn) => {
        const tx = {
            $queryRaw: async (strings, ...vals) => (applications.has(vals[0]) ? [{ id: vals[0] }] : []),
            application: mockPrisma.application,
            visaCase: mockPrisma.visaCase,
        };
        return fn(tx);
    },
};

require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: mockPrisma };

const visaRoutes = require("../routes/visa.routes");
const followUpRoutes = require("../routes/followup.routes");

function signToken(userId) {
    const u = users.get(userId);
    return jwt.sign({ userId: u.id, id: u.id, role: u.role }, process.env.JWT_ACCESS_SECRET, { expiresIn: "5m" });
}

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use("/api/visa-cases", visaRoutes);
    app.use("/api/follow-ups", followUpRoutes);
    app.use((err, req, res, next) => {
        res.status(err.statusCode || 500).json({ success: false, code: err.code || "ERR", message: err.message });
    });
    return app;
}

async function reqJson(server, method, path, userId, body) {
    const addr = server.address();
    const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${signToken(userId)}`,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
}

test("Phase 4.4 Visa Case Permissions & Follow-up Workflow", async (t) => {
    const app = buildApp();
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => server.close());

    await t.test("Visa: Counselor can access and delete assigned student's visa case", async () => {
        const getOwn = await reqJson(server, "GET", "/api/visa-cases/vc-co1", "co-1");
        assert.equal(getOwn.status, 200);
        assert.equal(getOwn.json.data.id, "vc-co1");

        deletedVisaIds = [];
        const delOwn = await reqJson(server, "DELETE", "/api/visa-cases/vc-co1", "co-1");
        assert.equal(delOwn.status, 200);
        assert.deepEqual(deletedVisaIds, ["vc-co1"]);
    });

    await t.test("Visa: Counselor cannot access or delete another counselor's visa case", async () => {
        const getOther = await reqJson(server, "GET", "/api/visa-cases/vc-co2", "co-1");
        assert.equal(getOther.status, 404);

        deletedVisaIds = [];
        const delOther = await reqJson(server, "DELETE", "/api/visa-cases/vc-co2", "co-1");
        assert.equal(delOther.status, 403);
        assert.deepEqual(deletedVisaIds, []);
    });

    await t.test("Visa: Tampered counselorId/studentId is ignored or rejected", async () => {
        const listTampered = await reqJson(server, "GET", "/api/visa-cases?counselorId=co-2", "co-1");
        assert.equal(listTampered.status, 200);
        assert.equal(listTampered.json.data.visaCases.length, 1);
        assert.equal(listTampered.json.data.visaCases[0].id, "vc-co1");

        const createMismatch = await reqJson(server, "POST", "/api/visa-cases", "co-1", {
            applicationId: "app-co1",
            studentId: "stu-co2",
            country: "Australia",
        });
        assert.equal(createMismatch.status, 400);

        const createOther = await reqJson(server, "POST", "/api/visa-cases", "co-1", {
            applicationId: "app-co2",
            country: "Australia",
        });
        assert.equal(createOther.status, 403);
    });

    await t.test("Visa: Branch Admin branch-scoped, SUPER_ADMIN global, FRONT_DESK blocked (403)", async () => {
        assert.equal((await reqJson(server, "GET", "/api/visa-cases/vc-co1", "ba-1")).status, 200);
        assert.equal((await reqJson(server, "GET", "/api/visa-cases/vc-co2", "ba-1")).status, 404);

        const saList = await reqJson(server, "GET", "/api/visa-cases", "sa-1");
        assert.equal(saList.status, 200);
        assert.equal(saList.json.data.visaCases.length, 2);

        assert.equal((await reqJson(server, "GET", "/api/visa-cases", "fd-1")).status, 403);
        assert.equal((await reqJson(server, "GET", "/api/visa-cases/vc-co1", "fd-1")).status, 403);
        assert.equal((await reqJson(server, "DELETE", "/api/visa-cases/vc-co1", "fd-1")).status, 403);
    });

    await t.test("Follow-ups: Counselor scoped, tampered authorId ignored, overdue counted accurately", async () => {
        const list = await reqJson(server, "GET", "/api/follow-ups?authorId=co-2", "co-1");
        assert.equal(list.status, 200);
        assert.ok(list.json.data.followUps.every((f) => f.authorId === "co-1"));

        const other = await reqJson(server, "GET", "/api/follow-ups/fu-co2", "co-1");
        assert.equal(other.status, 403);

        const dash = await reqJson(server, "GET", "/api/follow-ups/dashboard", "co-1");
        assert.equal(dash.status, 200);
        assert.equal(dash.json.data.upcoming, 1);
        assert.equal(dash.json.data.overdue, 1);
    });
});
