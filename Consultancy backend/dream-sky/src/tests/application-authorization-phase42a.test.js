/**
 * application-authorization-phase42a.test.js
 *
 * Verifies role-based & ownership-based authorization across all /applications endpoints
 * (route middleware -> controller -> application.service) without touching any live DB.
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
    ["tchr-1", { id: "tchr-1", role: "TEACHER", status: "ACTIVE", branchId: "br-1" }],
    ["stu-u-1", { id: "stu-u-1", role: "STUDENT", status: "ACTIVE", branchId: null }],
    ["ra-1", { id: "ra-1", role: "REFERRAL_AGENT", status: "ACTIVE", branchId: null }],
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
    ["stu-unassigned-br1", {
        id: "stu-unassigned-br1",
        firstName: "Unassigned",
        lastName: "Br1",
        email: "unassigned@example.com",
        isActive: true,
        assignedCounselorId: null,
        assignedCounselor: null,
        academicBackground: { branchId: "br-1" },
    }],
]);

const applications = new Map([
    ["app-co1", {
        id: "app-co1",
        studentId: "stu-co1",
        universityId: "uni-1",
        courseId: "crs-1",
        status: "SUBMITTED",
        intake: "Fall 2026",
        priority: "HIGH",
        notes: null,
        submittedAt: new Date("2026-01-10T00:00:00Z"),
        createdAt: new Date("2026-01-10T00:00:00Z"),
        offers: [],
        visaCase: null,
    }],
    ["app-co2", {
        id: "app-co2",
        studentId: "stu-co2",
        universityId: "uni-1",
        courseId: "crs-1",
        status: "UNDER_REVIEW",
        intake: "Fall 2026",
        priority: "MEDIUM",
        notes: null,
        submittedAt: new Date("2026-01-11T00:00:00Z"),
        createdAt: new Date("2026-01-11T00:00:00Z"),
        offers: [],
        visaCase: null,
    }],
    ["app-unassigned", {
        id: "app-unassigned",
        studentId: "stu-unassigned-br1",
        universityId: "uni-1",
        courseId: "crs-1",
        status: "SUBMITTED",
        intake: "Fall 2026",
        priority: "LOW",
        notes: null,
        submittedAt: new Date("2026-01-12T00:00:00Z"),
        createdAt: new Date("2026-01-12T00:00:00Z"),
        offers: [],
        visaCase: null,
    }],
]);

function matchesStudentFilter(student, studentWhere) {
    if (!studentWhere) return true;
    if (studentWhere.assignedCounselorId !== undefined) {
        if (student.assignedCounselorId !== studentWhere.assignedCounselorId) return false;
    }
    if (Array.isArray(studentWhere.OR)) {
        const ok = studentWhere.OR.some((branchCond) => {
            if (branchCond.assignedCounselor?.branchId) {
                return student.assignedCounselor?.branchId === branchCond.assignedCounselor.branchId;
            }
            if (branchCond.assignedCounselorId === null && branchCond.academicBackground?.equals) {
                return student.assignedCounselorId === null &&
                    student.academicBackground?.branchId === branchCond.academicBackground.equals;
            }
            return false;
        });
        if (!ok) return false;
    }
    return true;
}

function hydrateApp(app) {
    const stu = students.get(app.studentId);
    return {
        ...app,
        student: stu ? { ...stu } : null,
        university: { id: "uni-1", name: "Test University" },
        course: { id: "crs-1", name: "BSc CS", level: "BACHELOR" },
    };
}

// Install mock prisma in require.cache before requiring routes/services
const prismaPath = require.resolve("../prisma");
const mockPrisma = {
    user: {
        findUnique: async ({ where }) => users.get(where.id) || null,
    },
    student: {
        findUnique: async ({ where }) => students.get(where.id) || null,
    },
    university: {
        findUnique: async ({ where }) => (where.id === "uni-1" ? { id: "uni-1" } : null),
    },
    course: {
        findUnique: async ({ where }) => (where.id === "crs-1" ? { id: "crs-1" } : null),
    },
    application: {
        findUnique: async ({ where }) => {
            const app = applications.get(where.id);
            return app ? hydrateApp(app) : null;
        },
        findMany: async ({ where = {} }) => {
            return Array.from(applications.values())
                .filter((a) => {
                    if (where.studentId && a.studentId !== where.studentId) return false;
                    if (where.status && a.status !== where.status) return false;
                    if (where.student && !matchesStudentFilter(students.get(a.studentId), where.student)) return false;
                    return true;
                })
                .map(hydrateApp);
        },
        count: async ({ where = {} }) => {
            return Array.from(applications.values()).filter((a) => {
                if (where.studentId && a.studentId !== where.studentId) return false;
                if (where.status && a.status !== where.status) return false;
                if (where.student && !matchesStudentFilter(students.get(a.studentId), where.student)) return false;
                return true;
            }).length;
        },
        create: async ({ data }) => {
            const created = {
                id: `app-created-${applications.size + 1}`,
                ...data,
                createdAt: new Date(),
                offers: [],
                visaCase: null,
            };
            return hydrateApp(created);
        },
        update: async ({ where, data }) => {
            const app = applications.get(where.id);
            return hydrateApp({ ...app, ...data });
        },
        delete: async ({ where }) => applications.get(where.id),
    },
    offer: {
        count: async () => 0,
        create: async ({ data }) => ({ id: "offer-1", ...data, receivedAt: new Date() }),
    },
    visaCase: {
        findUnique: async () => null,
    },
    $transaction: async (fn) => {
        const tx = {
            $queryRaw: async (strings, ...vals) => {
                const id = vals[0];
                return applications.has(id) ? [{ id }] : [];
            },
            application: mockPrisma.application,
            offer: mockPrisma.offer,
            visaCase: mockPrisma.visaCase,
        };
        return fn(tx);
    },
};

require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: mockPrisma };

const applicationRoutes = require("../routes/application.routes");

function signToken(userId) {
    const u = users.get(userId);
    return jwt.sign({ userId: u.id, id: u.id, role: u.role }, process.env.JWT_ACCESS_SECRET, { expiresIn: "5m" });
}

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use("/api/applications", applicationRoutes);
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

test("Phase 4.2A Application Authorization Matrix", async (t) => {
    const app = buildApp();
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => server.close());

    await t.test("Counselor can list only own applications & tampered counselorId is ignored", async () => {
        const r = await reqJson(server, "GET", "/api/applications?counselorId=co-2", "co-1");
        assert.equal(r.status, 200);
        assert.equal(r.json.data.applications.length, 1);
        assert.equal(r.json.data.applications[0].id, "app-co1");
        assert.equal(r.json.data.pagination.total, 1);
    });

    await t.test("Counselor can read own application, but denied (403) for other counselor & unassigned", async () => {
        const own = await reqJson(server, "GET", "/api/applications/app-co1", "co-1");
        assert.equal(own.status, 200);
        assert.equal(own.json.data.id, "app-co1");

        const other = await reqJson(server, "GET", "/api/applications/app-co2", "co-1");
        assert.equal(other.status, 403);

        const unassigned = await reqJson(server, "GET", "/api/applications/app-unassigned", "co-1");
        assert.equal(unassigned.status, 403);
    });

    await t.test("Counselor can create for own student (201), but denied (403) for other counselor or unassigned student", async () => {
        const own = await reqJson(server, "POST", "/api/applications", "co-1", {
            studentId: "stu-co1",
            universityId: "uni-1",
            courseId: "crs-1",
        });
        assert.equal(own.status, 201);

        const other = await reqJson(server, "POST", "/api/applications", "co-1", {
            studentId: "stu-co2",
            universityId: "uni-1",
            courseId: "crs-1",
        });
        assert.equal(other.status, 403);

        const unassigned = await reqJson(server, "POST", "/api/applications", "co-1", {
            studentId: "stu-unassigned-br1",
            universityId: "uni-1",
            courseId: "crs-1",
        });
        assert.equal(unassigned.status, 403);
    });

    await t.test("Counselor update / changeStatus / recordOffer: own allowed, cross-counselor denied (403)", async () => {
        const updOwn = await reqJson(server, "PUT", "/api/applications/app-co1", "co-1", { notes: "Updated" });
        assert.equal(updOwn.status, 200);
        const updOther = await reqJson(server, "PUT", "/api/applications/app-co2", "co-1", { notes: "Hacked" });
        assert.equal(updOther.status, 403);

        const stOwn = await reqJson(server, "PATCH", "/api/applications/app-co1/status", "co-1", { status: "UNDER_REVIEW" });
        assert.equal(stOwn.status, 200);
        const stOther = await reqJson(server, "PATCH", "/api/applications/app-co2/status", "co-1", { status: "ACCEPTED" });
        assert.equal(stOther.status, 403);

        const offOwn = await reqJson(server, "POST", "/api/applications/app-co1/offers", "co-1", { type: "CONDITIONAL" });
        assert.equal(offOwn.status, 201);
        const offOther = await reqJson(server, "POST", "/api/applications/app-co2/offers", "co-1", { type: "CONDITIONAL" });
        assert.equal(offOther.status, 403);
    });

    await t.test("Counselor dashboard stats are scoped to own applications", async () => {
        const r = await reqJson(server, "GET", "/api/applications/dashboard", "co-1");
        assert.equal(r.status, 200);
        assert.equal(r.json.data.submitted, 1);
        assert.equal(r.json.data.underReview, 0);
    });

    await t.test("Super Admin retains global access", async () => {
        const list = await reqJson(server, "GET", "/api/applications", "sa-1");
        assert.equal(list.status, 200);
        assert.equal(list.json.data.applications.length, 3);

        const other = await reqJson(server, "GET", "/api/applications/app-co2", "sa-1");
        assert.equal(other.status, 200);

        const dash = await reqJson(server, "GET", "/api/applications/dashboard", "sa-1");
        assert.equal(dash.status, 200);
        assert.equal(dash.json.data.submitted, 2);
        assert.equal(dash.json.data.underReview, 1);
    });

    await t.test("Branch Admin is isolated to own branch", async () => {
        const list = await reqJson(server, "GET", "/api/applications", "ba-1");
        assert.equal(list.status, 200);
        assert.equal(list.json.data.applications.length, 2);

        const ownBr = await reqJson(server, "GET", "/api/applications/app-unassigned", "ba-1");
        assert.equal(ownBr.status, 200);

        const otherBr = await reqJson(server, "GET", "/api/applications/app-co2", "ba-1");
        assert.equal(otherBr.status, 403);
    });

    await t.test("Unauthorized roles including Front Desk are blocked (403) on all application endpoints", async () => {
        for (const uid of ["tchr-1", "stu-u-1", "ra-1", "fd-1"]) {
            const g1 = await reqJson(server, "GET", "/api/applications", uid);
            assert.equal(g1.status, 403);
            const g2 = await reqJson(server, "GET", "/api/applications/app-co1", uid);
            assert.equal(g2.status, 403);
            const p = await reqJson(server, "POST", "/api/applications", uid, {
                studentId: "stu-co1",
                universityId: "uni-1",
                courseId: "crs-1",
            });
            assert.equal(p.status, 403);
        }
    });
});

