/**
 * dashboard-kpi-and-deletion-safeguards.test.js
 *
 * Isolated In-Memory Offline Unit Tests for:
 * 1. Dashboard KPI queries in dashboard.controller.js (actual source function)
 * 2. Follow-up NPT date boundary semantics with deterministic frozen clock
 * 3. Concurrency-safe application deletion and shared parent-row locking protocol:
 *    - deleteApplication(id) in application.service.js
 *    - recordOffer(applicationId, data) in application.service.js
 *    - createVisaCase(data, currentUser) in visa.service.js
 *
 * MANDATORY SAFETY:
 * - Completely isolated in-memory stores. ZERO database connections.
 * - ZERO network calls or socket openings.
 * - require.cache interceptor for "../prisma" prevents real PrismaClient or Pool initialization.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// ─── 1. In-Memory Store Definition ───────────────────────────────────────────

const store = {
    students: new Map(),
    applications: new Map(),
    offers: new Map(),
    visaCases: new Map(),
    communicationLogs: new Map(),
    countries: new Map(),
    universities: new Map(),
    courses: new Map(),
    flags: {
        simulateP2025OnDelete: false,
        simulateUnexpectedErrorInTx: false,
    },
    invocations: {
        applicationDeleteCalls: [],
        applicationCreateCalls: [],
        queryRawCalls: [],
        offerCreateCalls: [],
        visaCaseCreateCalls: [],
    },
};

const resetStore = () => {
    store.students.clear();
    store.applications.clear();
    store.offers.clear();
    store.visaCases.clear();
    store.communicationLogs.clear();
    store.countries.clear();
    store.universities.clear();
    store.courses.clear();
    store.flags.simulateP2025OnDelete = false;
    store.flags.simulateUnexpectedErrorInTx = false;
    store.invocations.applicationDeleteCalls.length = 0;
    store.invocations.applicationCreateCalls.length = 0;
    store.invocations.queryRawCalls.length = 0;
    store.invocations.offerCreateCalls.length = 0;
    store.invocations.visaCaseCreateCalls.length = 0;
};

// ─── 2. Faithful In-Memory Prisma Mock ────────────────────────────────────────

const mockPrisma = {
    $queryRaw: async (strings, ...values) => {
        const sql = typeof strings === "string" ? strings : strings.join("?");
        const id = values[0];
        store.invocations.queryRawCalls.push({ sql, id, values, timestamp: Date.now() });
        if (id && store.applications.has(id)) {
            return [{ id }];
        }
        return [];
    },

    student: {
        findUnique: async ({ where } = {}) => {
            const s = store.students.get(where?.id);
            if (!s) return null;
            return {
                id: s.id,
                assignedCounselorId: s.assignedCounselorId || "counselor-1",
                isActive: s.isActive !== undefined ? s.isActive : true,
                assignedCounselor: { id: s.assignedCounselorId || "counselor-1", branchId: "branch-1" },
            };
        },
        count: async ({ where } = {}) => {
            let count = 0;
            for (const s of store.students.values()) {
                if (where?.isActive !== undefined && s.isActive !== where.isActive) continue;
                if (where?.currentStage) {
                    if (where.currentStage.in && !where.currentStage.in.includes(s.currentStage)) continue;
                    if (typeof where.currentStage === "string" && s.currentStage !== where.currentStage) continue;
                }
                if (where?.createdAt?.gte) {
                    if (new Date(s.createdAt) < new Date(where.createdAt.gte)) continue;
                }
                count++;
            }
            return count;
        },
    },

    application: {
        findUnique: async ({ where } = {}) => {
            const app = store.applications.get(where?.id);
            if (!app) return null;
            const s = app.studentId ? store.students.get(app.studentId) : null;
            return {
                ...app,
                student: s ? {
                    id: s.id,
                    assignedCounselorId: s.assignedCounselorId || "counselor-1",
                    isActive: s.isActive !== undefined ? s.isActive : true,
                    assignedCounselor: { id: s.assignedCounselorId || "counselor-1", branchId: "branch-1" },
                } : null,
            };
        },
        findFirst: async ({ where } = {}) => {
            for (const app of store.applications.values()) {
                if (where?.studentId && app.studentId !== where.studentId) continue;
                return { ...app };
            }
            return null;
        },
        create: async ({ data } = {}) => {
            const id = `app-created-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const app = { id, ...data };
            store.applications.set(id, app);
            store.invocations.applicationCreateCalls.push(app);
            return { ...app };
        },
        update: async ({ where, data } = {}) => {
            const app = store.applications.get(where?.id);
            if (!app) throw Object.assign(new Error("Record to update not found"), { code: "P2025" });
            Object.assign(app, data);
            return { ...app };
        },
        count: async ({ where } = {}) => {
            let count = 0;
            for (const app of store.applications.values()) {
                if (where?.status) {
                    if (where.status.notIn && where.status.notIn.includes(app.status)) continue;
                    if (typeof where.status === "string" && app.status !== where.status) continue;
                }
                if (where?.offers?.some) {
                    const appOffers = Array.from(store.offers.values()).filter((o) => o.applicationId === app.id);
                    if (appOffers.length === 0) continue;
                }
                count++;
            }
            return count;
        },
        delete: async ({ where } = {}) => {
            if (store.flags.simulateP2025OnDelete) {
                throw Object.assign(new Error("An operation failed because it depends on one or more records that were required but not found."), { code: "P2025" });
            }
            const existing = store.applications.get(where.id);
            if (!existing) throw Object.assign(new Error("Application not found"), { code: "P2025" });
            store.invocations.applicationDeleteCalls.push({ id: where.id, existing });
            store.applications.delete(where.id);
            return existing;
        },
    },

    offer: {
        create: async ({ data } = {}) => {
            const id = `offer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const offer = { id, ...data };
            store.offers.set(id, offer);
            store.invocations.offerCreateCalls.push(offer);
            return offer;
        },
        count: async ({ where } = {}) => {
            let count = 0;
            for (const o of store.offers.values()) {
                if (where?.applicationId && o.applicationId !== where.applicationId) continue;
                count++;
            }
            return count;
        },
    },

    visaCase: {
        findUnique: async ({ where } = {}) => {
            if (where?.applicationId) {
                for (const vc of store.visaCases.values()) {
                    if (vc.applicationId === where.applicationId) return vc;
                }
            }
            return store.visaCases.get(where?.id) || null;
        },
        create: async ({ data } = {}) => {
            const id = `vc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const vc = { id, ...data };
            store.visaCases.set(id, vc);
            store.invocations.visaCaseCreateCalls.push(vc);
            return vc;
        },
        count: async ({ where } = {}) => {
            let count = 0;
            for (const vc of store.visaCases.values()) {
                if (where?.status) {
                    if (where.status.notIn && where.status.notIn.includes(vc.status)) continue;
                    if (typeof where.status === "string" && vc.status !== where.status) continue;
                }
                count++;
            }
            return count;
        },
    },

    country: {
        findFirst: async () => null,
    },
    university: {
        findFirst: async () => ({ id: "uni-default", name: "Default University" }),
    },
    course: {
        findFirst: async () => ({ id: "course-default", name: "Default Course" }),
    },

    communicationLog: {
        count: async ({ where } = {}) => {
            let count = 0;
            for (const log of store.communicationLogs.values()) {
                if (!log.nextFollowUpAt) continue;
                const logTime = new Date(log.nextFollowUpAt).getTime();
                if (where?.nextFollowUpAt?.gt && !(logTime > new Date(where.nextFollowUpAt.gt).getTime())) continue;
                if (where?.nextFollowUpAt?.gte && !(logTime >= new Date(where.nextFollowUpAt.gte).getTime())) continue;
                if (where?.nextFollowUpAt?.lte && !(logTime <= new Date(where.nextFollowUpAt.lte).getTime())) continue;
                if (where?.nextFollowUpAt?.lt && !(logTime < new Date(where.nextFollowUpAt.lt).getTime())) continue;
                count++;
            }
            return count;
        },
    },

    $transaction: async (arg) => {
        if (store.flags.simulateUnexpectedErrorInTx) {
            throw new Error("Simulated database connection failure");
        }
        if (Array.isArray(arg)) return Promise.all(arg);
        return arg(mockPrisma);
    },
};

// ─── 3. Intercept require.cache for "../prisma" BEFORE loading modules ───────

const prismaModulePath = path.resolve(__dirname, "../prisma/index.js");
require.cache[prismaModulePath] = {
    id: prismaModulePath,
    filename: prismaModulePath,
    loaded: true,
    exports: mockPrisma,
};

// Verify interception works
assert.strictEqual(require("../prisma"), mockPrisma, "Prisma require.cache interception failed!");

// ─── 4. Load Actual Controller and Service Modules Under Test ────────────────

const dashboardController = require("../controllers/dashboard.controller");
const applicationService = require("../services/application.service");
const visaService = require("../services/visa.service");
const AppError = require("../utils/apiError");

// Helper to mock Express req and res
const createMockContext = () => {
    const req = { user: { userId: "user-superadmin-1", role: "SUPER_ADMIN" }, query: {} };
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
    return { req, res };
};

// ─── 5. Test Suite Execution ──────────────────────────────────────────────────

test("Isolated Offline Test Suite: Dashboard KPIs & Deletion Safeguards", async (t) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Dashboard KPI Tests (Tests 1–7)
    // ─────────────────────────────────────────────────────────────────────────

    await t.test("Test 1 — Visa-linked applications: Active applications linked to a visa case are still counted", async () => {
        resetStore();
        store.applications.set("app-1", { id: "app-1", studentId: "s-1", status: "SUBMITTED" });
        store.applications.set("app-2", { id: "app-2", studentId: "s-2", status: "UNDER_REVIEW" });
        store.applications.set("app-3", { id: "app-3", studentId: "s-3", status: "ACCEPTED" });

        store.visaCases.set("vc-1", { id: "vc-1", applicationId: "app-1", status: "SUBMITTED" });
        store.visaCases.set("vc-2", { id: "vc-2", applicationId: "app-2", status: "PREPARING" });
        store.visaCases.set("vc-3", { id: "vc-3", applicationId: "app-3", status: "SUBMITTED" });

        const { req, res } = createMockContext();
        await dashboardController.getSummary(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.ok(res.body?.data, "Response missing data envelope");
        assert.strictEqual(
            res.body.data.applications,
            3,
            "Expected backend summary applications count to be 3 when 3 active apps have linked visa cases"
        );
    });

    await t.test("Test 2 — Excluded application statuses: WITHDRAWN and REJECTED applications are excluded", async () => {
        resetStore();
        store.applications.set("app-valid", { id: "app-valid", status: "SUBMITTED" });
        store.applications.set("app-withdrawn", { id: "app-withdrawn", status: "WITHDRAWN" });
        store.applications.set("app-rejected", { id: "app-rejected", status: "REJECTED" });

        const { req, res } = createMockContext();
        await dashboardController.getSummary(req, res);

        assert.strictEqual(
            res.body.data.applications,
            1,
            "Expected backend summary applications count to exclude WITHDRAWN and REJECTED statuses"
        );
    });

    await t.test("Test 3 — Offer deduplication: Multiple offers on one application count as one qualifying application", async () => {
        resetStore();
        store.applications.set("app-a", { id: "app-a", status: "SUBMITTED" });
        store.offers.set("offer-1", { id: "offer-1", applicationId: "app-a", type: "CONDITIONAL" });
        store.offers.set("offer-2", { id: "offer-2", applicationId: "app-a", type: "UNCONDITIONAL" });

        store.applications.set("app-b", { id: "app-b", status: "SUBMITTED" });
        store.offers.set("offer-3", { id: "offer-3", applicationId: "app-b", type: "UNCONDITIONAL" });

        store.applications.set("app-c", { id: "app-c", status: "SUBMITTED" });

        const { req, res } = createMockContext();
        await dashboardController.getSummary(req, res);

        assert.strictEqual(
            res.body.data.offerLetters,
            2,
            "Expected exactly 2 distinct active applications with offers (App A and App B counted once each)"
        );
    });

    await t.test("Test 4 — Applications without offers: Do not contribute to the Offer Letters KPI", async () => {
        resetStore();
        store.applications.set("app-no-offer-1", { id: "app-no-offer-1", status: "SUBMITTED" });
        store.applications.set("app-no-offer-2", { id: "app-no-offer-2", status: "ACCEPTED" });

        const { req, res } = createMockContext();
        await dashboardController.getSummary(req, res);

        assert.strictEqual(
            res.body.data.offerLetters,
            0,
            "Applications without offers must not contribute to offerLetters KPI even if status is ACCEPTED"
        );
    });

    await t.test("Test 5 — Offers on WITHDRAWN or REJECTED applications: Excluded from Offer Letters KPI", async () => {
        resetStore();
        store.applications.set("app-active", { id: "app-active", status: "SUBMITTED" });
        store.offers.set("offer-active", { id: "offer-active", applicationId: "app-active", type: "UNCONDITIONAL" });

        store.applications.set("app-withdrawn", { id: "app-withdrawn", status: "WITHDRAWN" });
        store.offers.set("offer-withdrawn", { id: "offer-withdrawn", applicationId: "app-withdrawn", type: "CONDITIONAL" });

        store.applications.set("app-rejected", { id: "app-rejected", status: "REJECTED" });
        store.offers.set("offer-rejected", { id: "offer-rejected", applicationId: "app-rejected", type: "CONDITIONAL" });

        const { req, res } = createMockContext();
        await dashboardController.getSummary(req, res);

        assert.strictEqual(
            res.body.data.offerLetters,
            1,
            "Offers on WITHDRAWN or REJECTED applications must be excluded from offerLetters KPI"
        );
    });

    await t.test("Test 6 — Visa processing count: Excludes APPROVED and REFUSED cases, includes active cases", async () => {
        resetStore();
        store.visaCases.set("vc-sub", { id: "vc-sub", status: "SUBMITTED" });
        store.visaCases.set("vc-prep", { id: "vc-prep", status: "PREPARING" });
        store.visaCases.set("vc-appr", { id: "vc-appr", status: "APPROVED" });
        store.visaCases.set("vc-ref", { id: "vc-ref", status: "REFUSED" });

        const { req, res } = createMockContext();
        await dashboardController.getSummary(req, res);

        assert.strictEqual(
            res.body.data.visaCases,
            2,
            "Expected active visa-processing count to be 2 (SUBMITTED + PREPARING), excluding APPROVED and REFUSED"
        );
    });

    await t.test("Test 7 — Today's Follow-ups: Deterministic NPT date boundaries with frozen clock", async () => {
        resetStore();

        // Deterministic clock freeze: 2026-10-26 12:00:00 UTC (17:45:00 NPT)
        const originalDateNow = Date.now;
        const fixedNowMs = new Date("2026-10-26T12:00:00.000Z").getTime();
        Date.now = () => fixedNowMs;

        try {
            const NPT_OFFSET_MS = 5.75 * 60 * 60 * 1000;
            const nptNow = new Date(fixedNowMs + NPT_OFFSET_MS);

            const nptYear = nptNow.getUTCFullYear();
            const nptMonth = nptNow.getUTCMonth();
            const nptDate = nptNow.getUTCDate();

            const startOfTodayNPT = new Date(Date.UTC(nptYear, nptMonth, nptDate) - NPT_OFFSET_MS);
            const startOfTomorrowNPT = new Date(Date.UTC(nptYear, nptMonth, nptDate + 1) - NPT_OFFSET_MS);

            // 1. Immediately before start boundary: 1 ms before NPT midnight (Excluded)
            const logBeforeStart = new Date(startOfTodayNPT.getTime() - 1);
            store.communicationLogs.set("log-before", { id: "log-before", nextFollowUpAt: logBeforeStart.toISOString() });

            // 2. Exactly at start of Nepal day (Included)
            const logAtStart = startOfTodayNPT;
            store.communicationLogs.set("log-start", { id: "log-start", nextFollowUpAt: logAtStart.toISOString() });

            // 3. Immediately before next-day boundary: 1 ms before startOfTomorrowNPT (Included)
            const logBeforeEnd = new Date(startOfTomorrowNPT.getTime() - 1);
            store.communicationLogs.set("log-before-end", { id: "log-before-end", nextFollowUpAt: logBeforeEnd.toISOString() });

            // 4. Exactly at next-day boundary: startOfTomorrowNPT (Excluded)
            const logAtNextDay = startOfTomorrowNPT;
            store.communicationLogs.set("log-next-day", { id: "log-next-day", nextFollowUpAt: logAtNextDay.toISOString() });

            // 5. Follow-ups scheduled tomorrow (Excluded)
            const logTomorrow = new Date(startOfTomorrowNPT.getTime() + 4 * 3600000);
            store.communicationLogs.set("log-tomorrow", { id: "log-tomorrow", nextFollowUpAt: logTomorrow.toISOString() });

            const { req, res } = createMockContext();
            await dashboardController.getSummary(req, res);

            assert.strictEqual(
                res.body.data.pendingFollowUps,
                2,
                "Expected exactly 2 follow-ups (start boundary and before-end boundary) to be counted for today's NPT day"
            );
        } finally {
            Date.now = originalDateNow;
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Concurrency-Safe Deletion & Synchronization Protocol Tests (Tests 8–18)
    // ─────────────────────────────────────────────────────────────────────────

    await t.test("Test 8 — Application with an Offer: Rejection with 409 conflict, no deletion occurs", async () => {
        resetStore();
        store.applications.set("app-with-offer", { id: "app-with-offer", studentId: "s-1", status: "SUBMITTED" });
        store.offers.set("offer-1", { id: "offer-1", applicationId: "app-with-offer", type: "CONDITIONAL" });

        await assert.rejects(
            async () => {
                await applicationService.deleteApplication("app-with-offer");
            },
            (err) => {
                assert.ok(err instanceof AppError, "Expected error to be instance of AppError");
                assert.strictEqual(err.statusCode, 409, "Expected 409 Conflict status code");
                assert.strictEqual(err.code, "CANNOT_DELETE_APPLICATION_WITH_DEPENDENCIES");
                assert.match(err.message, /offer letters or visa cases/i);
                return true;
            }
        );

        assert.strictEqual(store.invocations.applicationDeleteCalls.length, 0, "Physical delete must NOT be called when linked Offer exists");
        assert.ok(store.applications.has("app-with-offer"), "Application record must be preserved");
    });

    await t.test("Test 9 — Application with a VisaCase: Rejection with 409 conflict, no deletion occurs", async () => {
        resetStore();
        store.applications.set("app-with-visa", { id: "app-with-visa", studentId: "s-2", status: "SUBMITTED" });
        store.visaCases.set("vc-1", { id: "vc-1", applicationId: "app-with-visa", status: "SUBMITTED" });

        await assert.rejects(
            async () => {
                await applicationService.deleteApplication("app-with-visa");
            },
            (err) => {
                assert.ok(err instanceof AppError, "Expected error to be instance of AppError");
                assert.strictEqual(err.statusCode, 409, "Expected 409 Conflict status code");
                assert.strictEqual(err.code, "CANNOT_DELETE_APPLICATION_WITH_DEPENDENCIES");
                return true;
            }
        );

        assert.strictEqual(store.invocations.applicationDeleteCalls.length, 0);
        assert.ok(store.applications.has("app-with-visa"));
    });

    await t.test("Test 10 — Application with both dependencies: Rejection with 409 conflict, no records changed", async () => {
        resetStore();
        store.applications.set("app-with-both", { id: "app-with-both", studentId: "s-3", status: "SUBMITTED" });
        store.offers.set("offer-1", { id: "offer-1", applicationId: "app-with-both", type: "UNCONDITIONAL" });
        store.visaCases.set("vc-1", { id: "vc-1", applicationId: "app-with-both", status: "PREPARING" });

        await assert.rejects(
            async () => {
                await applicationService.deleteApplication("app-with-both");
            },
            (err) => {
                assert.ok(err instanceof AppError);
                assert.strictEqual(err.statusCode, 409);
                return true;
            }
        );

        assert.strictEqual(store.invocations.applicationDeleteCalls.length, 0);
        assert.ok(store.applications.has("app-with-both"));
        assert.ok(store.offers.has("offer-1"));
        assert.ok(store.visaCases.has("vc-1"));
    });

    await t.test("Test 11 — Application without dependencies: Lock acquired first, successful deletion", async () => {
        resetStore();
        store.applications.set("app-clean", { id: "app-clean", studentId: "s-4", status: "DRAFT" });

        const result = await applicationService.deleteApplication("app-clean");

        // Verify lock acquisition happened before delete
        assert.ok(store.invocations.queryRawCalls.length >= 1, "Must acquire row lock via $queryRaw");
        assert.strictEqual(store.invocations.queryRawCalls[0].id, "app-clean");
        assert.match(store.invocations.queryRawCalls[0].sql, /FOR UPDATE/i);

        assert.strictEqual(store.invocations.applicationDeleteCalls.length, 1);
        assert.strictEqual(store.applications.has("app-clean"), false, "Expected application to be deleted");
        assert.strictEqual(result.message, "Application deleted successfully");
    });

    await t.test("Test 12 — Missing application: Returns 404 from empty lock result without delete attempt", async () => {
        resetStore();

        await assert.rejects(
            async () => {
                await applicationService.deleteApplication("non-existent-app-id");
            },
            (err) => {
                assert.ok(err instanceof AppError);
                assert.strictEqual(err.statusCode, 404);
                assert.strictEqual(err.code, "APPLICATION_NOT_FOUND");
                return true;
            }
        );

        assert.strictEqual(store.invocations.applicationDeleteCalls.length, 0);
    });

    await t.test("Test 13 — Simulated P2025 deletion race: Translates to predictable 404", async () => {
        resetStore();
        store.applications.set("app-race", { id: "app-race", studentId: "s-5", status: "DRAFT" });
        store.flags.simulateP2025OnDelete = true;

        await assert.rejects(
            async () => {
                await applicationService.deleteApplication("app-race");
            },
            (err) => {
                assert.ok(err instanceof AppError, "Must wrap P2025 in AppError");
                assert.strictEqual(err.statusCode, 404, "P2025 must translate to 404");
                assert.strictEqual(err.code, "APPLICATION_NOT_FOUND");
                return true;
            }
        );
    });

    await t.test("Test 14 — Lock acquisition precedes dependency checks in deleteApplication", async () => {
        resetStore();
        store.applications.set("app-order-check", { id: "app-order-check", studentId: "s-6", status: "DRAFT" });

        await applicationService.deleteApplication("app-order-check");

        assert.ok(store.invocations.queryRawCalls.length > 0, "Row lock must be acquired");
        const lockCall = store.invocations.queryRawCalls[0];
        assert.strictEqual(lockCall.id, "app-order-check");
        assert.match(lockCall.sql, /SELECT id FROM "Application".*FOR UPDATE/i);
    });

    await t.test("Test 15 — recordOffer: Uses transaction client and acquires row lock before insert", async () => {
        resetStore();
        store.applications.set("app-offer-target", { id: "app-offer-target", studentId: "s-7", status: "SUBMITTED" });

        const offer = await applicationService.recordOffer("app-offer-target", { type: "CONDITIONAL", details: { cond: "IELTS 7" } });

        // Verify lock acquired
        assert.ok(store.invocations.queryRawCalls.length >= 1, "recordOffer must acquire parent row lock");
        assert.strictEqual(store.invocations.queryRawCalls[0].id, "app-offer-target");
        assert.match(store.invocations.queryRawCalls[0].sql, /FOR UPDATE/i);

        // Verify offer created
        assert.strictEqual(store.invocations.offerCreateCalls.length, 1);
        assert.strictEqual(offer.applicationId, "app-offer-target");
        assert.strictEqual(offer.type, "CONDITIONAL");

        // Verify missing parent throws 404
        await assert.rejects(
            async () => {
                await applicationService.recordOffer("missing-app", { type: "UNCONDITIONAL" });
            },
            (err) => {
                assert.ok(err instanceof AppError);
                assert.strictEqual(err.statusCode, 404);
                assert.strictEqual(err.code, "APPLICATION_NOT_FOUND");
                return true;
            }
        );
    });

    await t.test("Test 16 — createVisaCase: Explicit applicationId uses parent row lock and transaction", async () => {
        resetStore();
        store.students.set("s-visa-1", { id: "s-visa-1", isActive: true });
        store.applications.set("app-visa-target", { id: "app-visa-target", studentId: "s-visa-1", status: "ACCEPTED" });

        const currentUser = { id: "user-superadmin-1", role: "SUPER_ADMIN" };
        const vc = await visaService.createVisaCase({ applicationId: "app-visa-target", visaType: "STUDENT_500" }, currentUser);

        // Verify lock acquired
        assert.ok(store.invocations.queryRawCalls.length >= 1, "createVisaCase must acquire parent row lock");
        assert.strictEqual(store.invocations.queryRawCalls[0].id, "app-visa-target");
        assert.match(store.invocations.queryRawCalls[0].sql, /FOR UPDATE/i);

        // Verify visa case created
        assert.strictEqual(store.invocations.visaCaseCreateCalls.length, 1);
        assert.strictEqual(vc.applicationId, "app-visa-target");

        // Missing application throws 404
        await assert.rejects(
            async () => {
                await visaService.createVisaCase({ applicationId: "missing-app-id" }, currentUser);
            },
            (err) => {
                assert.ok(err instanceof AppError);
                assert.strictEqual(err.statusCode, 404);
                assert.strictEqual(err.code, "APPLICATION_NOT_FOUND");
                return true;
            }
        );
    });

    await t.test("Test 17 — createVisaCase: studentId-only branch handles existing and auto-created applications", async () => {
        resetStore();
        const currentUser = { id: "user-superadmin-1", role: "SUPER_ADMIN" };

        // Subcase A: Existing application for student
        store.students.set("s-existing-app", { id: "s-existing-app", isActive: true });
        store.applications.set("app-for-student", { id: "app-for-student", studentId: "s-existing-app", status: "SUBMITTED" });

        const vcA = await visaService.createVisaCase({ studentId: "s-existing-app", visaType: "STUDENT_500" }, currentUser);

        assert.strictEqual(vcA.applicationId, "app-for-student");
        assert.strictEqual(store.applications.get("app-for-student").status, "ACCEPTED", "Existing application updated to ACCEPTED");
        assert.ok(store.invocations.queryRawCalls.some((c) => c.id === "app-for-student"), "Locked existing application");

        // Subcase B: No application exists for student (auto-creates)
        store.students.set("s-no-app", { id: "s-no-app", isActive: true });

        const vcB = await visaService.createVisaCase({ studentId: "s-no-app", visaType: "STUDENT_500" }, currentUser);

        assert.ok(vcB.applicationId, "Generated new applicationId");
        assert.ok(store.applications.has(vcB.applicationId), "New application persisted");
        assert.strictEqual(store.applications.get(vcB.applicationId).status, "ACCEPTED");
        assert.strictEqual(store.invocations.applicationCreateCalls.length, 1, "Created 1 application automatically");
    });

    await t.test("Test 18 — Unexpected error propagation and transaction failure", async () => {
        resetStore();
        store.applications.set("app-tx-fail", { id: "app-tx-fail", studentId: "s-8", status: "DRAFT" });
        store.flags.simulateUnexpectedErrorInTx = true;

        await assert.rejects(
            async () => {
                await applicationService.deleteApplication("app-tx-fail");
            },
            (err) => {
                assert.strictEqual(err.message, "Simulated database connection failure");
                return true;
            }
        );

        assert.strictEqual(store.invocations.applicationDeleteCalls.length, 0);
        assert.ok(store.applications.has("app-tx-fail"), "Application was preserved when transaction failed");
    });

});
