/**
 * rbac-authorization-phase9d.test.js — Mocked Regression Suite for Backend RBAC
 *
 * Guarantees ZERO database connection, ZERO network calls, and ZERO server startup.
 * Tests all authorization remediation from Phase 9D.2G2A.17.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

// ── 1. In-Memory Store & Prisma Mock ──────────────────────────────────────────
const store = {
    users: new Map(),
    branches: new Map(),
    students: new Map(),
    applications: new Map(),
    visaCases: new Map(),
    refreshTokens: new Map(),
};

const resetStore = () => {
    store.users.clear();
    store.branches.clear();
    store.students.clear();
    store.applications.clear();
    store.visaCases.clear();
    store.refreshTokens.clear();
    updateStudentCalled = false;
    transactionCalled = false;
    deleteVisaCaseCalled = false;
    deleteStudentCalled = false;
    getTimelineHistoryCalled = false;
    createVisaCaseCalled = false;
    createStudentCalled = false;
    sendEmailCalled = false;
    sentEmails = [];
};

let deleteVisaCaseCalled = false;
let deleteStudentCalled = false;
let getTimelineHistoryCalled = false;
let createVisaCaseCalled = false;
let createStudentCalled = false;
let updateStudentCalled = false;
let transactionCalled = false;
let sendEmailCalled = false;
let sentEmails = [];

const mockPrisma = {
    user: {
        findUnique: async ({ where }) => {
            if (where.id) return store.users.get(where.id) || null;
            if (where.email) {
                for (const u of store.users.values()) {
                    if (u.email === where.email) return { ...u };
                }
            }
            return null;
        },
        findFirst: async ({ where }) => {
            for (const u of store.users.values()) {
                if (where.studentId && u.studentId === where.studentId) return { ...u };
                if (where.email && u.email === where.email) return { ...u };
            }
            return null;
        },
        findMany: async ({ where }) => {
            const results = [];
            for (const u of store.users.values()) {
                if (where?.role && u.role !== where.role) continue;
                if (where?.branchId && u.branchId !== where.branchId) continue;
                results.push({ ...u });
            }
            return results;
        },
        create: async ({ data }) => {
            const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const user = { id, ...data, createdAt: new Date() };
            store.users.set(id, user);
            return { ...user };
        },
        update: async ({ where, data }) => {
            const user = store.users.get(where.id);
            if (!user) throw new Error("User not found");
            const updated = { ...user, ...data };
            store.users.set(where.id, updated);
            return { ...updated };
        },
    },
    branch: {
        findUnique: async ({ where }) => store.branches.get(where.id) || null,
    },
    student: {
        findUnique: async ({ where }) => {
            const s = store.students.get(where.id);
            if (!s) return null;
            const counselor = s.assignedCounselorId ? store.users.get(s.assignedCounselorId) || null : null;
            return {
                ...s,
                assignedCounselor: counselor ? { ...counselor } : null,
            };
        },
        findFirst: async ({ where }) => {
            for (const s of store.students.values()) {
                if (where?.email && s.email === where.email) return { ...s };
                if (where?.id && s.id === where.id) return { ...s };
            }
            return null;
        },
        findMany: async ({ where, select }) => {
            const results = [];
            for (const s of store.students.values()) {
                if (where.assignedCounselorId && s.assignedCounselorId !== where.assignedCounselorId) continue;
                if (where.assignedCounselor?.branchId) {
                    const counselor = s.assignedCounselorId ? store.users.get(s.assignedCounselorId) : null;
                    if (!counselor || counselor.branchId !== where.assignedCounselor.branchId) continue;
                }
                const counselor = s.assignedCounselorId ? store.users.get(s.assignedCounselorId) : null;
                results.push({
                    ...s,
                    assignedCounselor: counselor ? { id: counselor.id, firstName: counselor.firstName, lastName: counselor.lastName } : null,
                });
            }
            return results;
        },
        count: async ({ where }) => {
            let count = 0;
            for (const s of store.students.values()) {
                if (where.assignedCounselorId && s.assignedCounselorId !== where.assignedCounselorId) continue;
                if (where.assignedCounselor?.branchId) {
                    const counselor = s.assignedCounselorId ? store.users.get(s.assignedCounselorId) : null;
                    if (!counselor || counselor.branchId !== where.assignedCounselor.branchId) continue;
                }
                count++;
            }
            return count;
        },
        create: async ({ data }) => {
            createStudentCalled = true;
            const id = `stu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const s = { id, ...data, createdAt: new Date(), isActive: true };
            store.students.set(id, s);
            const counselor = s.assignedCounselorId ? store.users.get(s.assignedCounselorId) : null;
            return {
                ...s,
                assignedCounselor: counselor ? { id: counselor.id, firstName: counselor.firstName, lastName: counselor.lastName } : null,
            };
        },
        update: async ({ where, data }) => {
            updateStudentCalled = true;
            const s = store.students.get(where.id);
            if (!s) throw new Error("Student not found");
            const updated = { ...s, ...data };
            store.students.set(where.id, updated);
            return { ...updated };
        },
    },
    visaCase: {
        findUnique: async ({ where }) => {
            const vc = store.visaCases.get(where.id);
            if (!vc) return null;
            const app = store.applications.get(vc.applicationId);
            const student = app ? store.students.get(app.studentId) : null;
            const counselor = student?.assignedCounselorId ? store.users.get(student.assignedCounselorId) : null;

            return {
                ...vc,
                application: app ? {
                    ...app,
                    student: student ? {
                        ...student,
                        assignedCounselorId: student.assignedCounselorId,
                        assignedCounselor: counselor ? { id: counselor.id, branchId: counselor.branchId } : null,
                    } : null,
                } : null,
            };
        },
        findMany: async ({ where }) => {
            const results = [];
            for (const vc of store.visaCases.values()) {
                const app = store.applications.get(vc.applicationId);
                const student = app ? store.students.get(app.studentId) : null;
                const counselor = student?.assignedCounselorId ? store.users.get(student.assignedCounselorId) : null;

                if (where.application?.student?.assignedCounselorId) {
                    if (student?.assignedCounselorId !== where.application.student.assignedCounselorId) continue;
                }
                if (where.application?.student?.assignedCounselor?.branchId) {
                    if (counselor?.branchId !== where.application.student.assignedCounselor.branchId) continue;
                }
                results.push({
                    ...vc,
                    application: app ? {
                        ...app,
                        student: student ? {
                            ...student,
                            assignedCounselorId: student.assignedCounselorId,
                            assignedCounselor: counselor ? { id: counselor.id, branchId: counselor.branchId } : null,
                        } : null,
                    } : null,
                });
            }
            return results;
        },
        count: async ({ where }) => {
            let count = 0;
            for (const vc of store.visaCases.values()) {
                const app = store.applications.get(vc.applicationId);
                const student = app ? store.students.get(app.studentId) : null;
                const counselor = student?.assignedCounselorId ? store.users.get(student.assignedCounselorId) : null;

                if (where.application?.student?.assignedCounselorId) {
                    if (student?.assignedCounselorId !== where.application.student.assignedCounselorId) continue;
                }
                if (where.application?.student?.assignedCounselor?.branchId) {
                    if (counselor?.branchId !== where.application.student.assignedCounselor.branchId) continue;
                }
                count++;
            }
            return count;
        },
        update: async ({ where, data }) => {
            const vc = store.visaCases.get(where.id);
            if (!vc) throw new Error("VisaCase not found");
            const updated = { ...vc, ...data };
            store.visaCases.set(where.id, updated);
            return { ...updated };
        },
        create: async ({ data }) => {
            createVisaCaseCalled = true;
            const id = `visa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const vc = { id, ...data, createdAt: new Date() };
            store.visaCases.set(id, vc);
            const app = store.applications.get(data.applicationId);
            const student = app ? store.students.get(app.studentId) : null;
            const counselor = student?.assignedCounselorId ? store.users.get(student.assignedCounselorId) : null;
            return {
                ...vc,
                application: app ? {
                    ...app,
                    student: student ? {
                        ...student,
                        assignedCounselorId: student.assignedCounselorId,
                        assignedCounselor: counselor ? { id: counselor.id, branchId: counselor.branchId } : null,
                    } : null,
                } : null,
            };
        },
        delete: async ({ where }) => {
            deleteVisaCaseCalled = true;
            const vc = store.visaCases.get(where.id);
            store.visaCases.delete(where.id);
            return vc;
        },
    },
    application: {
        findUnique: async ({ where }) => {
            const app = store.applications.get(where.id);
            if (!app) return null;
            const student = store.students.get(app.studentId);
            const counselor = student?.assignedCounselorId ? store.users.get(student.assignedCounselorId) : null;
            return {
                ...app,
                student: student ? {
                    ...student,
                    assignedCounselorId: student.assignedCounselorId,
                    assignedCounselor: counselor ? { id: counselor.id, branchId: counselor.branchId } : null,
                } : null,
            };
        },
        findFirst: async ({ where }) => {
            for (const app of store.applications.values()) {
                if (where.studentId && app.studentId === where.studentId) return { ...app };
            }
            return null;
        },
        create: async ({ data }) => {
            const id = `app-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const app = { id, ...data, createdAt: new Date() };
            store.applications.set(id, app);
            return { ...app };
        },
        update: async ({ where, data }) => {
            const app = store.applications.get(where.id);
            if (!app) throw new Error("Application not found");
            const updated = { ...app, ...data };
            store.applications.set(where.id, updated);
            return { ...updated };
        },
    },
    pipelineStageHistory: {
        create: async ({ data }) => {
            const id = `psh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const record = { id, ...data, changedAt: new Date() };
            return record;
        },
        findMany: async ({ where }) => {
            getTimelineHistoryCalled = true;
            return [
                { id: "h1", studentId: where.studentId, stage: "LEAD", changedAt: new Date(), changedBy: { id: "u1", firstName: "Admin", lastName: "User" } },
            ];
        },
    },
    $transaction: async (fn) => {
        transactionCalled = true;
        if (Array.isArray(fn)) return Promise.all(fn);
        return fn(mockPrisma);
    },
};

const prismaPath = require.resolve("../prisma");
require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: mockPrisma,
};

const emailPath = require.resolve("../services/email.service");
require.cache[emailPath] = {
    id: emailPath,
    filename: emailPath,
    loaded: true,
    exports: {
        sendWelcomeStudentEmail: async (opts) => {
            sendEmailCalled = true;
            sentEmails.push(opts);
            return { accepted: [opts.to] };
        },
        sendStaffInvitationEmail: async (opts) => {
            sendEmailCalled = true;
            sentEmails.push(opts);
            return { accepted: [opts.to] };
        },
        sendNotificationEmail: async (opts) => {
            sendEmailCalled = true;
            sentEmails.push(opts);
            return { accepted: [opts.to] };
        },
        isValidEmail: (email) => Boolean(email && email.includes("@")),
    },
};

// ── 2. Load Target Modules ───────────────────────────────────────────────────
const { requireAuth, requirePasswordChanged } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");
const { signAccessToken } = require("../utils/jwt.util");
const authService = require("../services/auth.service");
const visaService = require("../services/visa.service");
const visaController = require("../controllers/visa.controller");
const userService = require("../services/user.service");
const userController = require("../controllers/user.controller");
const studentService = require("../services/student.service");
const studentController = require("../controllers/student.controller");

// ── 3. Test Suites ────────────────────────────────────────────────────────────

// ── Section 1: Auth and RBAC Middleware ──────────────────────────────────────
test("Auth Middleware: requireAuth rejects missing authorization header with 401", async () => {
    const req = { headers: {} };
    let error = null;
    requireAuth(req, {}, (err) => { error = err; });
    assert.ok(error);
    assert.equal(error.statusCode, 401);
    assert.equal(error.code, "NO_TOKEN");
});

test("Auth Middleware: requireAuth rejects invalid token format with 401", async () => {
    const req = { headers: { authorization: "Bearer invalid.jwt.token" } };
    let error = null;
    requireAuth(req, {}, (err) => { error = err; });
    assert.ok(error);
    assert.equal(error.statusCode, 401);
    assert.equal(error.code, "INVALID_TOKEN");
});

test("Auth Middleware: requireAuth accepts valid JWT and normalizes both id and userId", async () => {
    const token = signAccessToken({ userId: "user-123", role: "COUNSELOR", branchId: "br-1", mustChangePassword: false });
    const req = { headers: { authorization: `Bearer ${token}` } };
    let error = null;
    requireAuth(req, {}, (err) => { error = err; });
    assert.equal(error, undefined);
    assert.equal(req.user.userId, "user-123");
    assert.equal(req.user.id, "user-123");
    assert.equal(req.user.role, "COUNSELOR");
});

test("Auth Middleware: requirePasswordChanged blocks user when mustChangePassword is true", () => {
    const req = { user: { userId: "user-1", mustChangePassword: true } };
    let error = null;
    requirePasswordChanged(req, {}, (err) => { error = err; });
    assert.ok(error);
    assert.equal(error.statusCode, 403);
    assert.equal(error.code, "PASSWORD_CHANGE_REQUIRED");
});

test("Auth Middleware: requirePasswordChanged allows user when mustChangePassword is false", () => {
    const req = { user: { userId: "user-1", mustChangePassword: false } };
    let error = null;
    requirePasswordChanged(req, {}, (err) => { error = err; });
    assert.equal(error, undefined);
});

test("RBAC Middleware: requireRole rejects unauthorized role with 403", () => {
    const middleware = requireRole("SUPER_ADMIN", "BRANCH_ADMIN");
    const req = { user: { userId: "c1", role: "COUNSELOR" } };
    let error = null;
    middleware(req, {}, (err) => { error = err; });
    assert.ok(error);
    assert.equal(error.statusCode, 403);
    assert.equal(error.code, "INSUFFICIENT_ROLE");
});

test("RBAC Middleware: requireRole allows authorized role", () => {
    const middleware = requireRole("SUPER_ADMIN", "COUNSELOR");
    const req = { user: { userId: "c1", role: "COUNSELOR" } };
    let error = null;
    middleware(req, {}, (err) => { error = err; });
    assert.equal(error, undefined);
});

// ── Section 2: Login Validation & Inactive User Rejection ───────────────────
test("Auth Service: login rejects inactive user with 401 ACCOUNT_INACTIVE", async () => {
    resetStore();
    store.users.set("u-inactive", {
        id: "u-inactive",
        email: "inactive@example.com",
        passwordHash: "$2a$10$dummyhash",
        status: "INACTIVE",
        role: "COUNSELOR",
    });

    await assert.rejects(
        () => authService.login({ email: "inactive@example.com", password: "Password123!" }),
        (err) => err.statusCode === 401 && err.code === "ACCOUNT_INACTIVE"
    );
});

test("Auth Service: login rejects nonexistent user with 401 INVALID_CREDENTIALS without enumeration", async () => {
    resetStore();
    await assert.rejects(
        () => authService.login({ email: "nonexistent@example.com", password: "Password123!" }),
        (err) => err.statusCode === 401 && err.code === "INVALID_CREDENTIALS"
    );
});

// ── Section 3: Task 1 — Counselor Visa-Case Deletion ─────────────────────────
test("Task 1: Authorized counselor can delete assigned visa case", async () => {
    resetStore();
    deleteVisaCaseCalled = false;

    store.branches.set("br-1", { id: "br-1", name: "Main Branch" });
    store.users.set("counselor-1", { id: "counselor-1", role: "COUNSELOR", branchId: "br-1" });
    store.students.set("stu-1", { id: "stu-1", firstName: "Alice", assignedCounselorId: "counselor-1" });
    store.applications.set("app-1", { id: "app-1", studentId: "stu-1" });
    store.visaCases.set("visa-1", { id: "visa-1", applicationId: "app-1", status: "PREPARING" });

    const actor = { userId: "counselor-1", role: "COUNSELOR", branchId: "br-1" };
    await visaService.deleteVisaCase("visa-1", actor);

    assert.equal(deleteVisaCaseCalled, true);
    assert.equal(store.visaCases.has("visa-1"), false);
});

test("Task 1: Counselor cannot delete another counselor's case (throws 403, delete not called)", async () => {
    resetStore();
    deleteVisaCaseCalled = false;

    store.users.set("counselor-1", { id: "counselor-1", role: "COUNSELOR", branchId: "br-1" });
    store.users.set("counselor-2", { id: "counselor-2", role: "COUNSELOR", branchId: "br-1" });
    store.students.set("stu-1", { id: "stu-1", firstName: "Alice", assignedCounselorId: "counselor-1" });
    store.applications.set("app-1", { id: "app-1", studentId: "stu-1" });
    store.visaCases.set("visa-1", { id: "visa-1", applicationId: "app-1", status: "PREPARING" });

    const attacker = { userId: "counselor-2", role: "COUNSELOR", branchId: "br-1" };

    await assert.rejects(
        () => visaService.deleteVisaCase("visa-1", attacker),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
    assert.equal(deleteVisaCaseCalled, false);
    assert.equal(store.visaCases.has("visa-1"), true);
});

test("Task 1: Counselor cannot delete an unassigned visa case (throws 403)", async () => {
    resetStore();
    deleteVisaCaseCalled = false;

    store.users.set("counselor-1", { id: "counselor-1", role: "COUNSELOR", branchId: "br-1" });
    store.students.set("stu-unassigned", { id: "stu-unassigned", firstName: "Bob", assignedCounselorId: null });
    store.applications.set("app-2", { id: "app-2", studentId: "stu-unassigned" });
    store.visaCases.set("visa-unassigned", { id: "visa-unassigned", applicationId: "app-2", status: "PREPARING" });

    const actor = { userId: "counselor-1", role: "COUNSELOR", branchId: "br-1" };

    await assert.rejects(
        () => visaService.deleteVisaCase("visa-unassigned", actor),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
    assert.equal(deleteVisaCaseCalled, false);
});

test("Task 1: SUPER_ADMIN can delete a visa case regardless of assignment", async () => {
    resetStore();
    deleteVisaCaseCalled = false;

    store.users.set("counselor-1", { id: "counselor-1", role: "COUNSELOR", branchId: "br-1" });
    store.students.set("stu-1", { id: "stu-1", firstName: "Alice", assignedCounselorId: "counselor-1" });
    store.applications.set("app-1", { id: "app-1", studentId: "stu-1" });
    store.visaCases.set("visa-1", { id: "visa-1", applicationId: "app-1", status: "PREPARING" });

    const admin = { userId: "admin-1", role: "SUPER_ADMIN" };
    await visaService.deleteVisaCase("visa-1", admin);

    assert.equal(deleteVisaCaseCalled, true);
    assert.equal(store.visaCases.has("visa-1"), false);
});

test("Task 1: Missing visa case record returns 404 VISA_CASE_NOT_FOUND", async () => {
    resetStore();
    const admin = { userId: "admin-1", role: "SUPER_ADMIN" };
    await assert.rejects(
        () => visaService.deleteVisaCase("nonexistent-visa-id", admin),
        (err) => err.statusCode === 404 && err.code === "VISA_CASE_NOT_FOUND"
    );
});

// ── Section 4: Task 2 — Branch-Admin Staff Invitation ────────────────────────
test("Task 2: SUPER_ADMIN can invite any staff role and specify branch", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1", name: "Branch 1" });

    const req = {
        user: { userId: "admin-1", role: "SUPER_ADMIN" },
        body: { email: "newstaff@example.com", firstName: "New", lastName: "Staff", role: "BRANCH_ADMIN", branchId: "br-1" },
    };
    let capturedResult = null;
    const res = {
        status: (code) => {
            assert.equal(code, 201);
            return {
                json: (body) => { capturedResult = body; },
            };
        },
    };

    await userController.inviteUser(req, res, () => {});
    assert.ok(capturedResult);
    assert.equal(capturedResult.data.role, "BRANCH_ADMIN");
    assert.equal(capturedResult.data.email, "newstaff@example.com");
});

test("Task 2: BRANCH_ADMIN cannot invite SUPER_ADMIN (throws 403)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1", name: "Branch 1" });

    const req = {
        user: { userId: "ba-1", role: "BRANCH_ADMIN", branchId: "br-1" },
        body: { email: "escalated@example.com", firstName: "Bad", lastName: "Admin", role: "SUPER_ADMIN" },
    };
    let error = null;
    await userController.inviteUser(req, {}, (err) => { error = err; });

    assert.ok(error);
    assert.equal(error.statusCode, 403);
    assert.equal(error.code, "FORBIDDEN");
});

test("Task 2: BRANCH_ADMIN cannot invite another BRANCH_ADMIN (throws 403)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1", name: "Branch 1" });

    const req = {
        user: { userId: "ba-1", role: "BRANCH_ADMIN", branchId: "br-1" },
        body: { email: "otherba@example.com", firstName: "Other", lastName: "BA", role: "BRANCH_ADMIN" },
    };
    let error = null;
    await userController.inviteUser(req, {}, (err) => { error = err; });

    assert.ok(error);
    assert.equal(error.statusCode, 403);
});

test("Task 2: BRANCH_ADMIN cannot assign staff to another branch (throws 403)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1", name: "Branch 1" });
    store.branches.set("br-2", { id: "br-2", name: "Branch 2" });

    const req = {
        user: { userId: "ba-1", role: "BRANCH_ADMIN", branchId: "br-1" },
        body: { email: "counselor@example.com", firstName: "Jane", lastName: "Doe", role: "COUNSELOR", branchId: "br-2" },
    };
    let error = null;
    await userController.inviteUser(req, {}, (err) => { error = err; });

    assert.ok(error);
    assert.equal(error.statusCode, 403);
});

test("Task 2: BRANCH_ADMIN without assigned branch is rejected with 403 NO_BRANCH_CONTEXT", async () => {
    resetStore();
    const req = {
        user: { userId: "ba-nobranch", role: "BRANCH_ADMIN", branchId: null },
        body: { email: "counselor@example.com", firstName: "Jane", lastName: "Doe", role: "COUNSELOR" },
    };
    let error = null;
    await userController.inviteUser(req, {}, (err) => { error = err; });

    assert.ok(error);
    assert.equal(error.statusCode, 403);
    assert.equal(error.code, "NO_BRANCH_CONTEXT");
});

test("Task 2: BRANCH_ADMIN can invite permitted role (COUNSELOR) locked to their own branch", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1", name: "Branch 1" });

    const req = {
        user: { userId: "ba-1", role: "BRANCH_ADMIN", branchId: "br-1" },
        body: { email: "counselor1@example.com", firstName: "Sam", lastName: "Counselor", role: "COUNSELOR" },
    };
    let capturedResult = null;
    const res = {
        status: (code) => {
            assert.equal(code, 201);
            return { json: (b) => { capturedResult = b; } };
        },
    };

    await userController.inviteUser(req, res, () => {});
    assert.ok(capturedResult);
    assert.equal(capturedResult.data.role, "COUNSELOR");

    // Verify stored user in mock DB has branchId locked to br-1
    const storedUser = store.users.get(capturedResult.data.id);
    assert.equal(storedUser.branchId, "br-1");
});

// ── Section 5: Task 3 — Student & Visa-Case Data Scoping ─────────────────────
test("Task 3: Counselor listing students is strictly scoped to their assigned students", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR" });
    store.students.set("s1", { id: "s1", firstName: "Alice", assignedCounselorId: "c1", isActive: true, currentStage: "ENROLLED" });
    store.students.set("s2", { id: "s2", firstName: "Bob", assignedCounselorId: "c2", isActive: true, currentStage: "ENROLLED" });

    const result = await studentService.listStudents({}, { userId: "c1", role: "COUNSELOR" });
    assert.equal(result.students.length, 1);
    assert.equal(result.students[0].id, "s1");
});

test("Task 3: Counselor cannot view another counselor's student by ID (returns 404)", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR" });
    store.students.set("s2", { id: "s2", firstName: "Bob", assignedCounselorId: "c2" });

    await assert.rejects(
        () => studentService.getStudentById("s2", { userId: "c1", role: "COUNSELOR" }),
        (err) => err.statusCode === 404 && err.code === "STUDENT_NOT_FOUND"
    );
});

test("Task 3: Counselor can view their assigned student by ID", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });
    store.students.set("s1", { id: "s1", firstName: "Alice", assignedCounselorId: "c1" });

    const student = await studentService.getStudentById("s1", { userId: "c1", role: "COUNSELOR" });
    assert.equal(student.id, "s1");
});

test("Task 3: Counselor cannot update another counselor's student (throws 403)", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR" });
    store.students.set("s2", { id: "s2", firstName: "Bob", assignedCounselorId: "c2" });

    await assert.rejects(
        () => studentService.updateStudent("s2", { firstName: "Robert" }, { userId: "c1", role: "COUNSELOR" }),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
});

test("Task 3: Branch admin student list is scoped to counselors in their branch", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.branches.set("br-2", { id: "br-2" });
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR", branchId: "br-2" });

    store.students.set("s1", { id: "s1", firstName: "Alice", assignedCounselorId: "c1", isActive: true, currentStage: "ENROLLED" });
    store.students.set("s2", { id: "s2", firstName: "Bob", assignedCounselorId: "c2", isActive: true, currentStage: "ENROLLED" });

    const result = await studentService.listStudents({}, { userId: "ba-1", role: "BRANCH_ADMIN", branchId: "br-1" });
    assert.equal(result.students.length, 1);
    assert.equal(result.students[0].id, "s1");
});

test("Task 3: Branch admin cannot view out-of-branch student by ID (returns 404)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.branches.set("br-2", { id: "br-2" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR", branchId: "br-2" });
    store.students.set("s2", { id: "s2", firstName: "Bob", assignedCounselorId: "c2" });

    await assert.rejects(
        () => studentService.getStudentById("s2", { userId: "ba-1", role: "BRANCH_ADMIN", branchId: "br-1" }),
        (err) => err.statusCode === 404 && err.code === "STUDENT_NOT_FOUND"
    );
});

test("Task 3: SUPER_ADMIN retains global access to students across all branches", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR", branchId: "br-2" });
    store.students.set("s1", { id: "s1", firstName: "Alice", assignedCounselorId: "c1", isActive: true, currentStage: "ENROLLED" });
    store.students.set("s2", { id: "s2", firstName: "Bob", assignedCounselorId: "c2", isActive: true, currentStage: "ENROLLED" });

    const result = await studentService.listStudents({}, { userId: "sa-1", role: "SUPER_ADMIN" });
    assert.equal(result.students.length, 2);
});

test("Task 3: Counselor listing visa cases is strictly scoped to assigned students", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR" });

    store.students.set("stu-1", { id: "stu-1", assignedCounselorId: "c1" });
    store.students.set("stu-2", { id: "stu-2", assignedCounselorId: "c2" });

    store.applications.set("app-1", { id: "app-1", studentId: "stu-1" });
    store.applications.set("app-2", { id: "app-2", studentId: "stu-2" });

    store.visaCases.set("v1", { id: "v1", applicationId: "app-1" });
    store.visaCases.set("v2", { id: "v2", applicationId: "app-2" });

    const result = await visaService.listVisaCases({}, { userId: "c1", role: "COUNSELOR" });
    assert.equal(result.visaCases.length, 1);
    assert.equal(result.visaCases[0].id, "v1");
});

test("Task 3: Counselor cannot view another counselor's visa case by ID (returns 404)", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR" });
    store.students.set("stu-2", { id: "stu-2", assignedCounselorId: "c2" });
    store.applications.set("app-2", { id: "app-2", studentId: "stu-2" });
    store.visaCases.set("v2", { id: "v2", applicationId: "app-2" });

    await assert.rejects(
        () => visaService.getVisaCaseById("v2", { userId: "c1", role: "COUNSELOR" }),
        (err) => err.statusCode === 404 && err.code === "VISA_CASE_NOT_FOUND"
    );
});

test("Task 3: Counselor cannot update another counselor's visa case (throws 403)", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR" });
    store.students.set("stu-2", { id: "stu-2", assignedCounselorId: "c2" });
    store.applications.set("app-2", { id: "app-2", studentId: "stu-2" });
    store.visaCases.set("v2", { id: "v2", applicationId: "app-2" });

    await assert.rejects(
        () => visaService.updateVisaCase("v2", { notes: "hacked notes" }, { userId: "c1", role: "COUNSELOR" }),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
});

test("Task 3: Branch admin listing visa cases is scoped to cases in their branch", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.branches.set("br-2", { id: "br-2" });

    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR", branchId: "br-2" });

    store.students.set("stu-1", { id: "stu-1", assignedCounselorId: "c1" });
    store.students.set("stu-2", { id: "stu-2", assignedCounselorId: "c2" });

    store.applications.set("app-1", { id: "app-1", studentId: "stu-1" });
    store.applications.set("app-2", { id: "app-2", studentId: "stu-2" });

    store.visaCases.set("v1", { id: "v1", applicationId: "app-1" });
    store.visaCases.set("v2", { id: "v2", applicationId: "app-2" });

    const result = await visaService.listVisaCases({}, { userId: "ba-1", role: "BRANCH_ADMIN", branchId: "br-1" });
    assert.equal(result.visaCases.length, 1);
    assert.equal(result.visaCases[0].id, "v1");
});

test("Task 3: SUPER_ADMIN retains global access to all visa cases", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR", branchId: "br-2" });
    store.students.set("stu-1", { id: "stu-1", assignedCounselorId: "c1" });
    store.students.set("stu-2", { id: "stu-2", assignedCounselorId: "c2" });
    store.applications.set("app-1", { id: "app-1", studentId: "stu-1" });
    store.applications.set("app-2", { id: "app-2", studentId: "stu-2" });
    store.visaCases.set("v1", { id: "v1", applicationId: "app-1" });
    store.visaCases.set("v2", { id: "v2", applicationId: "app-2" });

    const result = await visaService.listVisaCases({}, { userId: "admin-1", role: "SUPER_ADMIN" });
    assert.equal(result.visaCases.length, 2);
});

// ── Section 6: Student Timeline Authorization ────────────────────────────────
test("Timeline Auth: Authorized counselor can view timeline of assigned student", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });
    store.students.set("s1", { id: "s1", assignedCounselorId: "c1" });

    const timeline = await studentService.getTimeline("s1", { userId: "c1", role: "COUNSELOR" });
    assert.ok(timeline);
    assert.equal(getTimelineHistoryCalled, true);
});

test("Timeline Auth: Counselor cannot view timeline of another counselor's student (throws 404, query not called)", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR" });
    store.students.set("s2", { id: "s2", assignedCounselorId: "c2" });

    await assert.rejects(
        () => studentService.getTimeline("s2", { userId: "c1", role: "COUNSELOR" }),
        (err) => err.statusCode === 404 && err.code === "STUDENT_NOT_FOUND"
    );
    assert.equal(getTimelineHistoryCalled, false);
});

test("Timeline Auth: Counselor cannot view timeline of unassigned student (throws 404)", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });
    store.students.set("s-unassigned", { id: "s-unassigned", assignedCounselorId: null });

    await assert.rejects(
        () => studentService.getTimeline("s-unassigned", { userId: "c1", role: "COUNSELOR" }),
        (err) => err.statusCode === 404 && err.code === "STUDENT_NOT_FOUND"
    );
    assert.equal(getTimelineHistoryCalled, false);
});

test("Timeline Auth: Branch admin can view timeline of student in their branch", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });
    store.students.set("s1", { id: "s1", assignedCounselorId: "c1" });

    const timeline = await studentService.getTimeline("s1", { userId: "ba-1", role: "BRANCH_ADMIN", branchId: "br-1" });
    assert.ok(timeline);
    assert.equal(getTimelineHistoryCalled, true);
});

test("Timeline Auth: Branch admin cannot view timeline of student in another branch (throws 404, query not called)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.branches.set("br-2", { id: "br-2" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR", branchId: "br-2" });
    store.students.set("s2", { id: "s2", assignedCounselorId: "c2" });

    await assert.rejects(
        () => studentService.getTimeline("s2", { userId: "ba-1", role: "BRANCH_ADMIN", branchId: "br-1" }),
        (err) => err.statusCode === 404 && err.code === "STUDENT_NOT_FOUND"
    );
    assert.equal(getTimelineHistoryCalled, false);
});

test("Timeline Auth: SUPER_ADMIN retains global access to timeline of any student", async () => {
    resetStore();
    store.users.set("c2", { id: "c2", role: "COUNSELOR", branchId: "br-2" });
    store.students.set("s2", { id: "s2", assignedCounselorId: "c2" });

    const timeline = await studentService.getTimeline("s2", { userId: "admin-1", role: "SUPER_ADMIN" });
    assert.ok(timeline);
    assert.equal(getTimelineHistoryCalled, true);
});

test("Timeline Auth: Nonexistent student returns 404", async () => {
    resetStore();
    await assert.rejects(
        () => studentService.getTimeline("nonexistent", { userId: "admin-1", role: "SUPER_ADMIN" }),
        (err) => err.statusCode === 404 && err.code === "STUDENT_NOT_FOUND"
    );
});

// ── Section 7: Resend-Credentials Authorization ──────────────────────────────
test("Resend Credentials: Counselor cannot resend credentials for another counselor's student (throws 404, no email sent)", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR" });
    store.students.set("s2", { id: "s2", firstName: "Bob", email: "bob@example.com", assignedCounselorId: "c2" });

    const req = {
        params: { id: "s2" },
        user: { userId: "c1", role: "COUNSELOR" },
    };
    let error = null;
    await studentController.resendCredentials(req, {}, (err) => { error = err; });

    assert.ok(error);
    assert.equal(error.statusCode, 404);
    assert.equal(sendEmailCalled, false);
});

test("Resend Credentials: Branch admin cannot resend credentials for student in another branch (throws 404, no email sent)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.branches.set("br-2", { id: "br-2" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR", branchId: "br-2" });
    store.students.set("s2", { id: "s2", firstName: "Bob", email: "bob@example.com", assignedCounselorId: "c2" });

    const req = {
        params: { id: "s2" },
        user: { userId: "ba-1", role: "BRANCH_ADMIN", branchId: "br-1" },
    };
    let error = null;
    await studentController.resendCredentials(req, {}, (err) => { error = err; });

    assert.ok(error);
    assert.equal(error.statusCode, 404);
    assert.equal(sendEmailCalled, false);
});

test("Resend Credentials: Counselor can resend credentials for their assigned student (sends email)", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });
    store.students.set("s1", { id: "s1", firstName: "Alice", email: "alice@example.com", assignedCounselorId: "c1" });

    let capturedResult = null;
    const req = {
        params: { id: "s1" },
        user: { userId: "c1", role: "COUNSELOR" },
    };
    const res = {
        status: (code) => ({
            json: (data) => { capturedResult = data; },
        }),
    };

    await studentController.resendCredentials(req, res, () => {});
    assert.ok(capturedResult);
    assert.equal(capturedResult.success, true);
    assert.equal(sendEmailCalled, true);
});

test("Resend Credentials: SUPER_ADMIN can resend credentials for any student", async () => {
    resetStore();
    store.users.set("c2", { id: "c2", role: "COUNSELOR", branchId: "br-2" });
    store.students.set("s2", { id: "s2", firstName: "Bob", email: "bob@example.com", assignedCounselorId: "c2" });

    let capturedResult = null;
    const req = {
        params: { id: "s2" },
        user: { userId: "admin-1", role: "SUPER_ADMIN" },
    };
    const res = {
        status: (code) => ({
            json: (data) => { capturedResult = data; },
        }),
    };

    await studentController.resendCredentials(req, res, () => {});
    assert.ok(capturedResult);
    assert.equal(capturedResult.success, true);
    assert.equal(sendEmailCalled, true);
});

// ── Section 8: Visa-Case Creation Authorization ──────────────────────────────
test("Visa Creation: Counselor can create visa case for their assigned student", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });
    store.students.set("s1", { id: "s1", assignedCounselorId: "c1" });
    store.applications.set("app-1", { id: "app-1", studentId: "s1", status: "ACCEPTED" });

    const vc = await visaService.createVisaCase(
        { applicationId: "app-1", visaType: "STUDENT" },
        { userId: "c1", role: "COUNSELOR" }
    );
    assert.ok(vc);
    assert.equal(createVisaCaseCalled, true);
});

test("Visa Creation: Counselor cannot create visa case for another counselor's student (throws 403, create not called)", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR" });
    store.students.set("s2", { id: "s2", assignedCounselorId: "c2" });
    store.applications.set("app-2", { id: "app-2", studentId: "s2", status: "ACCEPTED" });

    await assert.rejects(
        () => visaService.createVisaCase(
            { applicationId: "app-2", visaType: "STUDENT" },
            { userId: "c1", role: "COUNSELOR" }
        ),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
    assert.equal(createVisaCaseCalled, false);
});

test("Visa Creation: Counselor cannot create visa case for unassigned student (throws 403)", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });
    store.students.set("s-unassigned", { id: "s-unassigned", assignedCounselorId: null });
    store.applications.set("app-unassigned", { id: "app-unassigned", studentId: "s-unassigned", status: "ACCEPTED" });

    await assert.rejects(
        () => visaService.createVisaCase(
            { applicationId: "app-unassigned", visaType: "STUDENT" },
            { userId: "c1", role: "COUNSELOR" }
        ),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
    assert.equal(createVisaCaseCalled, false);
});

test("Visa Creation: Branch admin can create visa case for student in their branch", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });
    store.students.set("s1", { id: "s1", assignedCounselorId: "c1" });
    store.applications.set("app-1", { id: "app-1", studentId: "s1", status: "ACCEPTED" });

    const vc = await visaService.createVisaCase(
        { applicationId: "app-1", visaType: "STUDENT" },
        { userId: "ba-1", role: "BRANCH_ADMIN", branchId: "br-1" }
    );
    assert.ok(vc);
    assert.equal(createVisaCaseCalled, true);
});

test("Visa Creation: Branch admin cannot create visa case for student in another branch (throws 403)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.branches.set("br-2", { id: "br-2" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR", branchId: "br-2" });
    store.students.set("s2", { id: "s2", assignedCounselorId: "c2" });
    store.applications.set("app-2", { id: "app-2", studentId: "s2", status: "ACCEPTED" });

    await assert.rejects(
        () => visaService.createVisaCase(
            { applicationId: "app-2", visaType: "STUDENT" },
            { userId: "ba-1", role: "BRANCH_ADMIN", branchId: "br-1" }
        ),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
    assert.equal(createVisaCaseCalled, false);
});

test("Visa Creation: SUPER_ADMIN can create visa case for any student", async () => {
    resetStore();
    store.users.set("c2", { id: "c2", role: "COUNSELOR", branchId: "br-2" });
    store.students.set("s2", { id: "s2", assignedCounselorId: "c2" });
    store.applications.set("app-2", { id: "app-2", studentId: "s2", status: "ACCEPTED" });

    const vc = await visaService.createVisaCase(
        { applicationId: "app-2", visaType: "STUDENT" },
        { userId: "admin-1", role: "SUPER_ADMIN" }
    );
    assert.ok(vc);
    assert.equal(createVisaCaseCalled, true);
});

test("Visa Creation: Rejects mismatched studentId and applicationId with 400", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });
    store.students.set("s1", { id: "s1", assignedCounselorId: "c1" });
    store.students.set("s2", { id: "s2", assignedCounselorId: "c1" });
    store.applications.set("app-1", { id: "app-1", studentId: "s1", status: "ACCEPTED" });

    await assert.rejects(
        () => visaService.createVisaCase(
            { applicationId: "app-1", studentId: "s2" },
            { userId: "c1", role: "COUNSELOR" }
        ),
        (err) => err.statusCode === 400 && err.code === "APPLICATION_STUDENT_MISMATCH"
    );
    assert.equal(createVisaCaseCalled, false);
});

test("Visa Creation: Rejects nonexistent application with 404", async () => {
    resetStore();
    await assert.rejects(
        () => visaService.createVisaCase(
            { applicationId: "nonexistent-app" },
            { userId: "admin-1", role: "SUPER_ADMIN" }
        ),
        (err) => err.statusCode === 404 && err.code === "APPLICATION_NOT_FOUND"
    );
});

// ── Section 9: Student Creation and Counselor Assignment ────────────────────
test("Student Assignment: Counselor creating student without assignedCounselorId defaults to themselves", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });

    const student = await studentService.createStudent(
        { firstName: "John", lastName: "Doe", email: "john@example.com" },
        { userId: "c1", role: "COUNSELOR" }
    );
    assert.ok(student);
    assert.equal(student.assignedCounselorId, "c1");
    assert.equal(createStudentCalled, true);
});

test("Student Assignment: Counselor creating student with another counselor's ID is rejected with 403", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR" });

    await assert.rejects(
        () => studentService.createStudent(
            { firstName: "John", lastName: "Doe", email: "john@example.com", assignedCounselorId: "c2" },
            { userId: "c1", role: "COUNSELOR" }
        ),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
    assert.equal(createStudentCalled, false);
});

test("Student Assignment: Counselor cannot reassign their student to another counselor (throws 403)", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR" });
    store.students.set("s1", { id: "s1", firstName: "John", assignedCounselorId: "c1" });

    await assert.rejects(
        () => studentService.updateStudent("s1", { assignedCounselorId: "c2" }, { userId: "c1", role: "COUNSELOR" }),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
});

test("Student Assignment: Counselor cannot unassign their student (throws 403)", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR" });
    store.students.set("s1", { id: "s1", firstName: "John", assignedCounselorId: "c1" });

    await assert.rejects(
        () => studentService.updateStudent("s1", { assignedCounselorId: null }, { userId: "c1", role: "COUNSELOR" }),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
});

test("Student Assignment: Branch admin can create student assigned to counselor in their branch", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });

    const student = await studentService.createStudent(
        { firstName: "Jane", lastName: "Smith", email: "jane@example.com", assignedCounselorId: "c1" },
        { userId: "ba-1", role: "BRANCH_ADMIN", branchId: "br-1" }
    );
    assert.ok(student);
    assert.equal(student.assignedCounselorId, "c1");
    assert.equal(createStudentCalled, true);
});

test("Student Assignment: Branch admin creating student assigned to out-of-branch counselor is rejected with 403", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.branches.set("br-2", { id: "br-2" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR", branchId: "br-2" });

    await assert.rejects(
        () => studentService.createStudent(
            { firstName: "Jane", lastName: "Smith", email: "jane@example.com", assignedCounselorId: "c2" },
            { userId: "ba-1", role: "BRANCH_ADMIN", branchId: "br-1" }
        ),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
    assert.equal(createStudentCalled, false);
});

test("Student Assignment: Branch admin without branchId is rejected with 403 NO_BRANCH_CONTEXT", async () => {
    resetStore();
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });

    await assert.rejects(
        () => studentService.createStudent(
            { firstName: "Jane", lastName: "Smith", email: "jane@example.com", assignedCounselorId: "c1" },
            { userId: "ba-nobranch", role: "BRANCH_ADMIN", branchId: null }
        ),
        (err) => err.statusCode === 403 && err.code === "NO_BRANCH_CONTEXT"
    );
});

test("Student Assignment: Assigning nonexistent counselor ID throws 404 COUNSELOR_NOT_FOUND", async () => {
    resetStore();
    await assert.rejects(
        () => studentService.createStudent(
            { firstName: "Jane", lastName: "Smith", email: "jane@example.com", assignedCounselorId: "nonexistent-counselor" },
            { userId: "admin-1", role: "SUPER_ADMIN" }
        ),
        (err) => err.statusCode === 404 && err.code === "COUNSELOR_NOT_FOUND"
    );
});

test("Student Assignment: Assigning user who is not a counselor throws 400 INVALID_COUNSELOR_ROLE", async () => {
    resetStore();
    store.users.set("teacher-1", { id: "teacher-1", role: "TEACHER" });

    await assert.rejects(
        () => studentService.createStudent(
            { firstName: "Jane", lastName: "Smith", email: "jane@example.com", assignedCounselorId: "teacher-1" },
            { userId: "admin-1", role: "SUPER_ADMIN" }
        ),
        (err) => err.statusCode === 400 && err.code === "INVALID_COUNSELOR_ROLE"
    );
});

test("Student Assignment: Branch admin cannot unassign student from their branch (throws 403)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });
    store.students.set("s1", { id: "s1", firstName: "Jane", assignedCounselorId: "c1" });

    await assert.rejects(
        () => studentService.updateStudent("s1", { assignedCounselorId: null }, { userId: "ba-1", role: "BRANCH_ADMIN", branchId: "br-1" }),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
});

test("Student Assignment: SUPER_ADMIN can reassign student to any valid counselor or unassign", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.branches.set("br-2", { id: "br-2" });
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR", branchId: "br-2" });
    store.students.set("s1", { id: "s1", firstName: "Jane", assignedCounselorId: "c1" });

    const updated = await studentService.updateStudent("s1", { assignedCounselorId: "c2" }, { userId: "admin-1", role: "SUPER_ADMIN" });
    assert.equal(updated.assignedCounselorId, "c2");

    const unassigned = await studentService.updateStudent("s1", { assignedCounselorId: null }, { userId: "admin-1", role: "SUPER_ADMIN" });
    assert.equal(unassigned.assignedCounselorId, null);
});

// ── Section 10: Front-Desk Scope, RBAC Remediation & Safety Verification ────
test("Front Desk Scope: Front desk with branchId can view timeline of student in their branch", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });
    store.students.set("s1", { id: "s1", assignedCounselorId: "c1" });

    const timeline = await studentService.getTimeline("s1", { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" });
    assert.ok(timeline);
    assert.equal(getTimelineHistoryCalled, true);
});

test("Front Desk Scope: Front desk with branchId cannot view timeline of student in another branch (throws 404)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.branches.set("br-2", { id: "br-2" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR", branchId: "br-2" });
    store.students.set("s2", { id: "s2", assignedCounselorId: "c2" });

    await assert.rejects(
        () => studentService.getTimeline("s2", { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" }),
        (err) => err.statusCode === 404 && err.code === "STUDENT_NOT_FOUND"
    );
    assert.equal(getTimelineHistoryCalled, false);
});

test("Front Desk Scope: Front desk cannot view timeline of unassigned student (fails closed with 404)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.students.set("s-unassigned", { id: "s-unassigned", assignedCounselorId: null });

    await assert.rejects(
        () => studentService.getTimeline("s-unassigned", { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" }),
        (err) => err.statusCode === 404 && err.code === "STUDENT_NOT_FOUND"
    );
    assert.equal(getTimelineHistoryCalled, false);
});

test("Front Desk Scope: Front desk cannot view detail profile of unassigned student (fails closed with 404)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.students.set("s-unassigned", { id: "s-unassigned", assignedCounselorId: null });

    await assert.rejects(
        () => studentService.getStudentById("s-unassigned", { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" }),
        (err) => err.statusCode === 404 && err.code === "STUDENT_NOT_FOUND"
    );
});

test("Front Desk Scope: Front desk cannot update unassigned student (fails closed with 403, mutation not called)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.students.set("s-unassigned", { id: "s-unassigned", assignedCounselorId: null });

    await assert.rejects(
        () => studentService.updateStudent("s-unassigned", { notes: "tampered" }, { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" }),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
    assert.equal(updateStudentCalled, false);
});

test("Front Desk Scope: Front desk cannot change pipeline stage of unassigned student (fails closed with 403, transaction not called)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.students.set("s-unassigned", { id: "s-unassigned", assignedCounselorId: null, currentStage: "LEAD" });

    await assert.rejects(
        () => studentService.changePipelineStage("s-unassigned", "PROSPECT", { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" }),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
    assert.equal(transactionCalled, false);
});

test("Front Desk Scope: Front desk listing students is strictly scoped to counselors in their branch and excludes other branches & unassigned students", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.branches.set("br-2", { id: "br-2" });
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR", branchId: "br-2" });

    store.students.set("s-br1", { id: "s-br1", firstName: "Branch1 Student", assignedCounselorId: "c1" });
    store.students.set("s-br2", { id: "s-br2", firstName: "Branch2 Student", assignedCounselorId: "c2" });
    store.students.set("s-unassigned", { id: "s-unassigned", firstName: "Unassigned Student", assignedCounselorId: null });

    const result = await studentService.listStudents({}, { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" });
    assert.equal(result.students.length, 1);
    assert.equal(result.students[0].id, "s-br1");
});

test("Front Desk Scope: Front desk without branchId cannot list students (throws 403 NO_BRANCH_CONTEXT)", async () => {
    resetStore();
    await assert.rejects(
        () => studentService.listStudents({}, { userId: "fd-1", role: "FRONT_DESK" }),
        (err) => err.statusCode === 403 && err.code === "NO_BRANCH_CONTEXT"
    );
});

test("Front Desk Scope: Front desk without branchId cannot view detail of student (throws 404)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });
    store.students.set("s1", { id: "s1", assignedCounselorId: "c1" });

    await assert.rejects(
        () => studentService.getStudentById("s1", { userId: "fd-1", role: "FRONT_DESK" }),
        (err) => err.statusCode === 404 && err.code === "STUDENT_NOT_FOUND"
    );
});

test("Front Desk Scope: Front desk can create student assigned to counselor in their branch", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });

    const student = await studentService.createStudent(
        { firstName: "Alice", lastName: "Wonderland", email: "alice.desk@example.com", assignedCounselorId: "c1" },
        { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" }
    );
    assert.ok(student);
    assert.equal(student.assignedCounselorId, "c1");
    assert.equal(createStudentCalled, true);
});

test("Front Desk Scope: Front desk cannot assign counselor from another branch (throws 403, create not called)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.branches.set("br-2", { id: "br-2" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR", branchId: "br-2" });

    await assert.rejects(
        () => studentService.createStudent(
            { firstName: "Jane", lastName: "Smith", email: "jane@example.com", assignedCounselorId: "c2" },
            { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" }
        ),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
    assert.equal(createStudentCalled, false);
});

test("Front Desk Scope: Front desk without branchId cannot assign counselor on creation (throws 403 NO_BRANCH_CONTEXT, create not called)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });

    await assert.rejects(
        () => studentService.createStudent(
            { firstName: "Jane", lastName: "Smith", email: "jane@example.com", assignedCounselorId: "c1" },
            { userId: "fd-1", role: "FRONT_DESK" }
        ),
        (err) => err.statusCode === 403 && err.code === "NO_BRANCH_CONTEXT"
    );
    assert.equal(createStudentCalled, false);
});

test("Front Desk Scope: Front desk cannot unassign student from branch (throws 403, mutation not called)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });
    store.students.set("s1", { id: "s1", assignedCounselorId: "c1" });

    await assert.rejects(
        () => studentService.updateStudent("s1", { assignedCounselorId: null }, { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" }),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
    assert.equal(updateStudentCalled, false);
});

test("Front Desk Scope: Front desk cannot update student assigned to another branch (throws 403, mutation not called)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.branches.set("br-2", { id: "br-2" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR", branchId: "br-2" });
    store.students.set("s2", { id: "s2", assignedCounselorId: "c2" });

    await assert.rejects(
        () => studentService.updateStudent("s2", { notes: "tampered" }, { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" }),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
    assert.equal(updateStudentCalled, false);
});

test("Front Desk Scope: Front desk cannot change pipeline stage of student in another branch (throws 403, transaction not called)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.branches.set("br-2", { id: "br-2" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR", branchId: "br-2" });
    store.students.set("s2", { id: "s2", assignedCounselorId: "c2", currentStage: "LEAD" });

    await assert.rejects(
        () => studentService.changePipelineStage("s2", "PROSPECT", { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" }),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
    assert.equal(transactionCalled, false);
});

test("Front Desk Visa Restriction: Front desk cannot list visa cases (throws 403 FORBIDDEN)", async () => {
    resetStore();
    await assert.rejects(
        () => visaService.listVisaCases({}, { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" }),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
});

test("Front Desk Visa Restriction: Front desk cannot get visa case detail (throws 404 VISA_CASE_NOT_FOUND)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });
    store.students.set("s1", { id: "s1", assignedCounselorId: "c1" });
    store.applications.set("app-1", { id: "app-1", studentId: "s1" });
    store.visaCases.set("vc-1", { id: "vc-1", applicationId: "app-1" });

    await assert.rejects(
        () => visaService.getVisaCaseById("vc-1", { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" }),
        (err) => err.statusCode === 404 && err.code === "VISA_CASE_NOT_FOUND"
    );
});

test("Front Desk Visa Restriction: Front desk cannot create visa case (throws 403 FORBIDDEN, create not called)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });
    store.students.set("s1", { id: "s1", assignedCounselorId: "c1" });
    store.applications.set("app-1", { id: "app-1", studentId: "s1" });

    await assert.rejects(
        () => visaService.createVisaCase({ applicationId: "app-1" }, { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" }),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
    assert.equal(createVisaCaseCalled, false);
});

test("Front Desk Visa Restriction: Front desk cannot update visa case (throws 403 FORBIDDEN)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });
    store.students.set("s1", { id: "s1", assignedCounselorId: "c1" });
    store.applications.set("app-1", { id: "app-1", studentId: "s1" });
    store.visaCases.set("vc-1", { id: "vc-1", applicationId: "app-1" });

    await assert.rejects(
        () => visaService.updateVisaCase("vc-1", { notes: "tampered" }, { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" }),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
});

test("Front Desk Visa Restriction: Front desk cannot delete visa case (throws 403 FORBIDDEN, delete not called)", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });
    store.students.set("s1", { id: "s1", assignedCounselorId: "c1" });
    store.applications.set("app-1", { id: "app-1", studentId: "s1" });
    store.visaCases.set("vc-1", { id: "vc-1", applicationId: "app-1" });

    await assert.rejects(
        () => visaService.deleteVisaCase("vc-1", { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" }),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
    assert.equal(deleteVisaCaseCalled, false);
});

test("Student Profile Access: STUDENT can retrieve their own profile by studentId or user.id", async () => {
    resetStore();
    store.students.set("stu-own", { id: "stu-own", firstName: "Alice Student" });

    const profileByStudentId = await studentService.getStudentById("stu-own", { userId: "u-1", role: "STUDENT", studentId: "stu-own" });
    assert.ok(profileByStudentId);
    assert.equal(profileByStudentId.id, "stu-own");

    const profileByUserId = await studentService.getStudentById("stu-own", { id: "stu-own", role: "STUDENT" });
    assert.ok(profileByUserId);
    assert.equal(profileByUserId.id, "stu-own");
});

test("Student Profile Access: STUDENT cannot retrieve another student's profile (throws 404)", async () => {
    resetStore();
    store.students.set("stu-other", { id: "stu-other", firstName: "Other Student" });

    await assert.rejects(
        () => studentService.getStudentById("stu-other", { userId: "u-1", role: "STUDENT", studentId: "stu-own" }),
        (err) => err.statusCode === 404 && err.code === "STUDENT_NOT_FOUND"
    );
});

test("Missing Actor Protection: student and visa service methods reject missing or invalid actor", async () => {
    resetStore();
    store.students.set("s1", { id: "s1" });
    store.visaCases.set("vc1", { id: "vc1" });

    // Missing actor in assertion functions throws 401 UNAUTHORIZED
    assert.throws(
        () => studentService.assertStudentAuthorization({ id: "s1" }, null),
        (err) => err.statusCode === 401 && err.code === "UNAUTHORIZED"
    );

    assert.throws(
        () => visaService.assertVisaCaseAuthorization({ id: "vc1" }, null),
        (err) => err.statusCode === 401 && err.code === "UNAUTHORIZED"
    );

    // Missing actor in list queries throws 401 UNAUTHORIZED
    await assert.rejects(
        () => studentService.listStudents({}, null),
        (err) => err.statusCode === 401 && err.code === "UNAUTHORIZED"
    );

    await assert.rejects(
        () => visaService.listVisaCases({}, null),
        (err) => err.statusCode === 401 && err.code === "UNAUTHORIZED"
    );

    // Invalid actor (unknown role or empty actor) cannot bypass authorization
    const invalidActor = { userId: "anon-1", role: "UNKNOWN_ROLE" };

    await assert.rejects(
        () => studentService.getStudentById("s1", invalidActor),
        (err) => err.statusCode === 404 && err.code === "STUDENT_NOT_FOUND"
    );

    await assert.rejects(
        () => studentService.listStudents({}, invalidActor),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );

    await assert.rejects(
        () => studentService.updateStudent("s1", { notes: "tampered" }, invalidActor),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
    assert.equal(updateStudentCalled, false);

    await assert.rejects(
        () => studentService.getTimeline("s1", invalidActor),
        (err) => err.statusCode === 404 && err.code === "STUDENT_NOT_FOUND"
    );

    await assert.rejects(
        () => studentService.changePipelineStage("s1", "PROSPECT", invalidActor),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
    assert.equal(transactionCalled, false);

    await assert.rejects(
        () => visaService.listVisaCases({}, invalidActor),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );

    await assert.rejects(
        () => visaService.getVisaCaseById("vc1", invalidActor),
        (err) => err.statusCode === 404 && err.code === "VISA_CASE_NOT_FOUND"
    );

    await assert.rejects(
        () => visaService.updateVisaCase("vc1", { notes: "tampered" }, invalidActor),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );

    await assert.rejects(
        () => visaService.deleteVisaCase("vc1", invalidActor),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
    assert.equal(deleteVisaCaseCalled, false);
});

test("Role Protection: SUPER_ADMIN retains global access to list students and visa cases across branches", async () => {
    resetStore();
    store.branches.set("br-1", { id: "br-1" });
    store.branches.set("br-2", { id: "br-2" });
    store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "br-1" });
    store.users.set("c2", { id: "c2", role: "COUNSELOR", branchId: "br-2" });

    store.students.set("s-br1", { id: "s-br1", assignedCounselorId: "c1" });
    store.students.set("s-br2", { id: "s-br2", assignedCounselorId: "c2" });
    store.students.set("s-unassigned", { id: "s-unassigned", assignedCounselorId: null });

    const students = await studentService.listStudents({}, { userId: "admin-1", role: "SUPER_ADMIN" });
    assert.equal(students.students.length, 3);

    const visas = await visaService.listVisaCases({}, { userId: "admin-1", role: "SUPER_ADMIN" });
    assert.ok(visas);
});

test("Role Protection: Unauthorized roles (TEACHER) attempting to view student profile by ID throw 404", async () => {
    resetStore();
    store.students.set("s1", { id: "s1", firstName: "Alice" });

    await assert.rejects(
        () => studentService.getStudentById("s1", { userId: "t-1", role: "TEACHER" }),
        (err) => err.statusCode === 404 && err.code === "STUDENT_NOT_FOUND"
    );
});

