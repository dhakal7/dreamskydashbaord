/**
 * dashboard-users-reports-rbac.test.js — Route-level RBAC regression suite
 *
 * Protects the authorization rules for:
 *   GET /api/dashboard/summary
 *   GET /api/dashboard/counselor-summary
 *   GET /api/users
 *   GET /api/reports/summary
 *
 * Mounts the REAL routers, REAL requireAuth/requireRole middleware and REAL
 * controllers on an ephemeral local HTTP server. Prisma is replaced with an
 * in-memory mock via require.cache, so there is ZERO database connection.
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

// ── 1. In-memory Prisma mock ─────────────────────────────────────────────────
const users = new Map();
const calls = [];

const modelCache = new Map();
const modelProxy = (model) => {
    if (modelCache.has(model)) return modelCache.get(model);
    const proxy = new Proxy({}, {
        get: (_t, method) => {
            if (typeof method === "symbol" || method === "then") return undefined;
            return async (args = {}) => {
                calls.push({ model, method, args });
                if (model === "user" && (method === "findUnique" || method === "findFirst")) {
                    const u = users.get(args?.where?.id);
                    return u ? { ...u } : null;
                }
                if (method === "count") return 0;
                if (method === "findMany" || method === "groupBy") return [];
                if (method === "aggregate") return { _sum: {}, _count: {}, _avg: {}, _min: {}, _max: {} };
                return null;
            };
        },
    });
    modelCache.set(model, proxy);
    return proxy;
};

const mockPrisma = new Proxy({}, {
    get: (_t, prop) => {
        if (typeof prop === "symbol" || prop === "then") return undefined;
        if (prop === "$transaction") {
            return async (arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma));
        }
        if (prop === "$queryRaw" || prop === "$queryRawUnsafe" || prop === "$executeRaw") {
            return async () => [];
        }
        if (prop === "$disconnect" || prop === "$connect") return async () => {};
        return modelProxy(prop);
    },
});

const prismaPath = require.resolve("../prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: mockPrisma };

// ── 2. Load real modules ─────────────────────────────────────────────────────
const { signAccessToken } = require("../utils/jwt.util");
const dashboardRoutes = require("../routes/dashboard.routes");
const userRoutes = require("../routes/user.routes");
const reportRoutes = require("../routes/report.routes");

// ── 3. Synthetic identities (no real accounts) ───────────────────────────────
const IDENTITIES = {
    SUPER_ADMIN: { id: "rbac-sa-1", role: "SUPER_ADMIN", branchId: null },
    BRANCH_ADMIN: { id: "rbac-ba-1", role: "BRANCH_ADMIN", branchId: "rbac-br-1" },
    FRONT_DESK: { id: "rbac-fd-1", role: "FRONT_DESK", branchId: "rbac-br-1" },
    COUNSELOR: { id: "rbac-c-1", role: "COUNSELOR", branchId: "rbac-br-1" },
    TEACHER: { id: "rbac-t-1", role: "TEACHER", branchId: "rbac-br-1" },
    STUDENT: { id: "rbac-s-1", role: "STUDENT", branchId: null, studentId: "rbac-stu-1" },
    REFERRAL_AGENT: { id: "rbac-ra-1", role: "REFERRAL_AGENT", branchId: null },
};
const OTHER_COUNSELOR_OTHER_BRANCH = { id: "rbac-c-2", role: "COUNSELOR", branchId: "rbac-br-2" };
const OTHER_COUNSELOR_SAME_BRANCH = { id: "rbac-c-3", role: "COUNSELOR", branchId: "rbac-br-1" };

for (const u of [...Object.values(IDENTITIES), OTHER_COUNSELOR_OTHER_BRANCH, OTHER_COUNSELOR_SAME_BRANCH]) {
    users.set(u.id, { ...u, status: "ACTIVE", mustChangePassword: false, studentId: u.studentId ?? null });
}

const tokenFor = (identity) =>
    signAccessToken({
        userId: identity.id,
        role: identity.role,
        branchId: identity.branchId,
        studentId: identity.studentId ?? null,
        mustChangePassword: false,
    });

// ── 4. Ephemeral server with real routers ────────────────────────────────────
let server;
let base;

test.before(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/dashboard", dashboardRoutes);
    app.use("/api/users", userRoutes);
    app.use("/api/reports", reportRoutes);
    // eslint-disable-next-line no-unused-vars
    app.use((err, _req, res, _next) => {
        res.status(err.statusCode || 500).json({ success: false, code: err.code || "INTERNAL_ERROR", message: err.message });
    });
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
});

const get = async (path, identity) => {
    const headers = identity ? { Authorization: `Bearer ${tokenFor(identity)}` } : {};
    const res = await fetch(`${base}${path}`, { headers });
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, body };
};

// ── 5. Role × endpoint authorization matrix ──────────────────────────────────
const MATRIX = {
    "/api/dashboard/summary": ["SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK"],
    "/api/dashboard/counselor-summary": ["SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"],
    "/api/users": ["SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK", "COUNSELOR"],
    "/api/reports/summary": ["SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"],
};

for (const [endpoint, allowed] of Object.entries(MATRIX)) {
    for (const [role, identity] of Object.entries(IDENTITIES)) {
        const expectAllowed = allowed.includes(role);
        test(`${endpoint}: ${role} → ${expectAllowed ? "200" : "403"}`, async () => {
            const { status, body } = await get(endpoint, identity);
            if (expectAllowed) {
                assert.equal(status, 200, `expected 200 for ${role}, got ${status} (${body?.code}: ${body?.message})`);
                assert.equal(body?.success, true);
            } else {
                assert.equal(status, 403, `expected 403 for ${role}, got ${status}`);
                assert.equal(body?.code, "INSUFFICIENT_ROLE");
                assert.equal(body?.data, undefined, "forbidden response must not carry data");
            }
        });
    }

    test(`${endpoint}: unauthenticated request → 401`, async () => {
        const { status } = await get(endpoint, null);
        assert.equal(status, 401);
    });
}

// ── 6. Counselor-summary data isolation ──────────────────────────────────────
const counselorIdsQueried = () =>
    calls
        .filter((c) => c.model === "student" && c.method === "count")
        .map((c) => c.args?.where?.assignedCounselorId);

test("counselor-summary: COUNSELOR cannot read another counselor's data via ?counselorId", async () => {
    calls.length = 0;
    const { status } = await get(`/api/dashboard/counselor-summary?counselorId=${OTHER_COUNSELOR_OTHER_BRANCH.id}`, IDENTITIES.COUNSELOR);
    assert.equal(status, 200);
    const ids = counselorIdsQueried();
    assert.ok(ids.length > 0, "expected student counts to be queried");
    assert.ok(ids.every((id) => id === IDENTITIES.COUNSELOR.id), `queries must be pinned to own id, got ${JSON.stringify(ids)}`);
    assert.ok(!ids.includes(OTHER_COUNSELOR_OTHER_BRANCH.id));
    const commissionCalls = calls.filter((c) => c.model === "commission");
    assert.ok(commissionCalls.every((c) => c.args?.where?.recipientId === IDENTITIES.COUNSELOR.id));
    const followUpCalls = calls.filter((c) => c.model === "communicationLog");
    assert.ok(followUpCalls.every((c) => c.args?.where?.authorId === IDENTITIES.COUNSELOR.id));
});

test("counselor-summary: COUNSELOR cannot read a same-branch peer either", async () => {
    calls.length = 0;
    const { status } = await get(`/api/dashboard/counselor-summary?counselorId=${OTHER_COUNSELOR_SAME_BRANCH.id}`, IDENTITIES.COUNSELOR);
    assert.equal(status, 200);
    assert.ok(counselorIdsQueried().every((id) => id === IDENTITIES.COUNSELOR.id));
});

test("counselor-summary: SUPER_ADMIN can read any counselor", async () => {
    calls.length = 0;
    const { status } = await get(`/api/dashboard/counselor-summary?counselorId=${OTHER_COUNSELOR_OTHER_BRANCH.id}`, IDENTITIES.SUPER_ADMIN);
    assert.equal(status, 200);
    assert.ok(counselorIdsQueried().every((id) => id === OTHER_COUNSELOR_OTHER_BRANCH.id));
});

test("counselor-summary: BRANCH_ADMIN can read a counselor in own branch", async () => {
    calls.length = 0;
    const { status } = await get(`/api/dashboard/counselor-summary?counselorId=${OTHER_COUNSELOR_SAME_BRANCH.id}`, IDENTITIES.BRANCH_ADMIN);
    assert.equal(status, 200);
    assert.ok(counselorIdsQueried().every((id) => id === OTHER_COUNSELOR_SAME_BRANCH.id));
});

test("counselor-summary: BRANCH_ADMIN cannot read a counselor in another branch", async () => {
    calls.length = 0;
    const { status, body } = await get(`/api/dashboard/counselor-summary?counselorId=${OTHER_COUNSELOR_OTHER_BRANCH.id}`, IDENTITIES.BRANCH_ADMIN);
    assert.equal(status, 403);
    assert.equal(body?.code, "CROSS_BRANCH_ACCESS_DENIED");
    assert.equal(counselorIdsQueried().length, 0, "no counselor data may be queried after denial");
});

test("counselor-summary: BRANCH_ADMIN requesting a non-existent counselor is denied", async () => {
    const { status, body } = await get("/api/dashboard/counselor-summary?counselorId=rbac-does-not-exist", IDENTITIES.BRANCH_ADMIN);
    assert.equal(status, 403);
    assert.equal(body?.code, "CROSS_BRANCH_ACCESS_DENIED");
});

test("counselor-summary: repeated counselorId parameter is rejected with 400", async () => {
    const { status, body } = await get(
        `/api/dashboard/counselor-summary?counselorId=${OTHER_COUNSELOR_SAME_BRANCH.id}&counselorId=${OTHER_COUNSELOR_OTHER_BRANCH.id}`,
        IDENTITIES.SUPER_ADMIN
    );
    assert.equal(status, 400);
    assert.equal(body?.code, "VALIDATION_ERROR");
});

// ── 7. Controller-level defense in depth ─────────────────────────────────────
test("dashboard controllers reject unauthorized roles even if route guard is bypassed", async () => {
    const { getSummary, getCounselorSummary } = require("../controllers/dashboard.controller");
    for (const role of ["COUNSELOR", "TEACHER", "STUDENT", "REFERRAL_AGENT"]) {
        let err = null;
        await getSummary({ user: { ...IDENTITIES[role], userId: IDENTITIES[role].id } }, {}, (e) => { err = e; });
        assert.equal(err?.statusCode, 403, `getSummary must reject ${role}`);
    }
    for (const role of ["FRONT_DESK", "TEACHER", "STUDENT", "REFERRAL_AGENT"]) {
        await assert.rejects(
            () => getCounselorSummary({ user: { ...IDENTITIES[role], userId: IDENTITIES[role].id }, query: {} }, {}),
            (e) => e.statusCode === 403,
            `getCounselorSummary must reject ${role}`
        );
    }
});

