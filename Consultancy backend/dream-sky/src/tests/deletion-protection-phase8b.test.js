const test = require("node:test");
const assert = require("node:assert/strict");

// ── 1. In-Memory Store & Prisma Mock ──────────────────────────────────────────
// Guarantees ZERO connection to dreamsky_db or any real database.

const store = {
    students: new Map(),
    users: new Map(),
    payments: new Map(),
    transactions: new Map(),
    documents: new Map(),
    applications: new Map(),
    commissions: new Map(),
    enrollments: new Map(),
    appointments: new Map(),
    communicationLogs: new Map(),
    attendanceRecords: new Map(),
    testScores: new Map(),
    recommendationResults: new Map(),
    invocations: {
        deleteManyCalls: [],
    },
};

const resetStore = () => {
    store.students.clear();
    store.users.clear();
    store.payments.clear();
    store.transactions.clear();
    store.documents.clear();
    store.applications.clear();
    store.commissions.clear();
    store.enrollments.clear();
    store.appointments.clear();
    store.communicationLogs.clear();
    store.attendanceRecords.clear();
    store.testScores.clear();
    store.recommendationResults.clear();
    store.invocations.deleteManyCalls.length = 0;
};

const mockPrisma = {
    student: {
        findUnique: async ({ where }) => store.students.get(where.id) || null,
        delete: async ({ where }) => {
            const existing = store.students.get(where.id);
            if (!existing) throw new Error("Student not found");
            store.students.delete(where.id);
            return existing;
        },
    },
    user: {
        findFirst: async ({ where }) => {
            if (where.studentId) {
                for (const u of store.users.values()) {
                    if (u.studentId === where.studentId) return { ...u };
                }
            }
            return null;
        },
    },
    payment: {
        findUnique: async ({ where }) => store.payments.get(where.id) || null,
        count: async ({ where }) => {
            let count = 0;
            for (const p of store.payments.values()) {
                if (where.studentId && p.studentId === where.studentId) count++;
            }
            return count;
        },
        delete: async ({ where }) => {
            const existing = store.payments.get(where.id);
            if (!existing) throw new Error("Payment record not found");
            store.payments.delete(where.id);
            return existing;
        },
        deleteMany: async (args) => {
            store.invocations.deleteManyCalls.push({ model: "payment", args });
            return { count: 0 };
        },
    },
    transaction: {
        count: async ({ where }) => {
            let count = 0;
            for (const t of store.transactions.values()) {
                if (where.paymentId && t.paymentId === where.paymentId) count++;
            }
            return count;
        },
        deleteMany: async (args) => {
            store.invocations.deleteManyCalls.push({ model: "transaction", args });
            return { count: 0 };
        },
    },
    commission: {
        count: async ({ where }) => {
            let count = 0;
            for (const c of store.commissions.values()) {
                if (where.studentId && c.studentId === where.studentId) count++;
            }
            return count;
        },
        deleteMany: async (args) => {
            store.invocations.deleteManyCalls.push({ model: "commission", args });
            return { count: 0 };
        },
    },
    application: {
        count: async ({ where }) => {
            let count = 0;
            for (const a of store.applications.values()) {
                if (where.studentId && a.studentId === where.studentId) count++;
            }
            return count;
        },
        deleteMany: async (args) => {
            store.invocations.deleteManyCalls.push({ model: "application", args });
            return { count: 0 };
        },
    },
    document: {
        count: async ({ where }) => {
            let count = 0;
            for (const d of store.documents.values()) {
                if (where.studentId && d.studentId === where.studentId) count++;
            }
            return count;
        },
        deleteMany: async (args) => {
            store.invocations.deleteManyCalls.push({ model: "document", args });
            return { count: 0 };
        },
    },
    enrollment: {
        count: async ({ where }) => {
            let count = 0;
            for (const e of store.enrollments.values()) {
                if (where.studentId && e.studentId === where.studentId) count++;
            }
            return count;
        },
        deleteMany: async (args) => {
            store.invocations.deleteManyCalls.push({ model: "enrollment", args });
            return { count: 0 };
        },
    },
    appointment: {
        count: async ({ where }) => {
            let count = 0;
            for (const a of store.appointments.values()) {
                if (where.studentId && a.studentId === where.studentId) count++;
            }
            return count;
        },
        deleteMany: async (args) => {
            store.invocations.deleteManyCalls.push({ model: "appointment", args });
            return { count: 0 };
        },
    },
    communicationLog: {
        count: async ({ where }) => {
            let count = 0;
            for (const c of store.communicationLogs.values()) {
                if (where.studentId && c.studentId === where.studentId) count++;
            }
            return count;
        },
        deleteMany: async (args) => {
            store.invocations.deleteManyCalls.push({ model: "communicationLog", args });
            return { count: 0 };
        },
    },
    attendanceRecord: {
        count: async ({ where }) => {
            let count = 0;
            for (const a of store.attendanceRecords.values()) {
                if (where.studentId && a.studentId === where.studentId) count++;
            }
            return count;
        },
        deleteMany: async (args) => {
            store.invocations.deleteManyCalls.push({ model: "attendanceRecord", args });
            return { count: 0 };
        },
    },
    testScore: {
        count: async ({ where }) => {
            let count = 0;
            for (const t of store.testScores.values()) {
                if (where.studentId && t.studentId === where.studentId) count++;
            }
            return count;
        },
        deleteMany: async (args) => {
            store.invocations.deleteManyCalls.push({ model: "testScore", args });
            return { count: 0 };
        },
    },
    pipelineStageHistory: {
        deleteMany: async (args) => {
            store.invocations.deleteManyCalls.push({ model: "pipelineStageHistory", args });
            return { count: 0 };
        },
    },
    recommendationResult: {
        count: async ({ where }) => {
            let count = 0;
            for (const r of store.recommendationResults.values()) {
                if (where.recordId && r.recordId === where.recordId) count++;
            }
            return count;
        },
    },
    $transaction: async (arg) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        return arg(mockPrisma);
    },
};

// ── 2. Intercept require.cache for prisma ─────────────────────────────────────
const prismaPath = require.resolve("../prisma");
require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: mockPrisma,
};

// ── 3. Load services and RBAC middleware ──────────────────────────────────────
const studentService = require("../services/student.service");
const paymentService = require("../services/payment.service");
const { requireRole } = require("../middlewares/rbac.middleware");

// Helper to simulate Express middleware execution
const runMiddleware = (middleware, user) => {
    return new Promise((resolve) => {
        const req = { user };
        const res = {};
        const next = (err) => resolve({ nextCalled: true, err: err || null });
        try {
            middleware(req, res, next);
        } catch (syncErr) {
            resolve({ nextCalled: false, err: syncErr });
        }
    });
};

// ── 4. Regression Test Suite ──────────────────────────────────────────────────

// ── Part A: Student Deletion RBAC ────────────────────────────────────────────

test("Student RBAC: FRONT_DESK is rejected from deleting students with 403 Forbidden", async () => {
    const studentDeleteMiddleware = requireRole("SUPER_ADMIN");
    const result = await runMiddleware(studentDeleteMiddleware, { role: "FRONT_DESK" });
    assert.strictEqual(result.nextCalled, true);
    assert.ok(result.err);
    assert.strictEqual(result.err.statusCode, 403);
    assert.strictEqual(result.err.code, "INSUFFICIENT_ROLE");
});

test("Student RBAC: COUNSELOR is rejected from deleting students with 403 Forbidden", async () => {
    const studentDeleteMiddleware = requireRole("SUPER_ADMIN");
    const result = await runMiddleware(studentDeleteMiddleware, { role: "COUNSELOR" });
    assert.strictEqual(result.nextCalled, true);
    assert.ok(result.err);
    assert.strictEqual(result.err.statusCode, 403);
    assert.strictEqual(result.err.code, "INSUFFICIENT_ROLE");
});

test("Student RBAC: BRANCH_ADMIN is rejected from deleting students with 403 Forbidden", async () => {
    const studentDeleteMiddleware = requireRole("SUPER_ADMIN");
    const result = await runMiddleware(studentDeleteMiddleware, { role: "BRANCH_ADMIN" });
    assert.strictEqual(result.nextCalled, true);
    assert.ok(result.err);
    assert.strictEqual(result.err.statusCode, 403);
    assert.strictEqual(result.err.code, "INSUFFICIENT_ROLE");
});

test("Student RBAC: SUPER_ADMIN is accepted for student deletion route", async () => {
    const studentDeleteMiddleware = requireRole("SUPER_ADMIN");
    const result = await runMiddleware(studentDeleteMiddleware, { role: "SUPER_ADMIN" });
    assert.strictEqual(result.nextCalled, true);
    assert.strictEqual(result.err, null);
});

// ── Part B: Student Deletion Service Safeguards ──────────────────────────────

test("Student Deletion: Student with payment history CANNOT be deleted", async () => {
    resetStore();
    store.students.set("stu-pay-1", { id: "stu-pay-1", firstName: "Student", lastName: "WithPayment" });
    store.payments.set("pay-1", { id: "pay-1", studentId: "stu-pay-1", totalAmount: 5000, paidAmount: 5000 });

    await assert.rejects(
        async () => {
            await studentService.deleteStudent("stu-pay-1");
        },
        (err) => {
            assert.strictEqual(err.statusCode, 409);
            assert.strictEqual(err.code, "CANNOT_DELETE_STUDENT_WITH_DEPENDENCIES");
            assert.match(err.message, /1 payment\(s\)/);
            return true;
        }
    );

    // Assert student still exists in store
    assert.ok(store.students.has("stu-pay-1"));
    // Assert payment still exists in store
    assert.ok(store.payments.has("pay-1"));
    // Assert zero deleteMany calls were made
    assert.strictEqual(store.invocations.deleteManyCalls.length, 0);
});

test("Student Deletion: Student with documents, applications, or commissions CANNOT be deleted", async () => {
    resetStore();
    store.students.set("stu-complex-1", { id: "stu-complex-1", firstName: "Complex", lastName: "Student" });
    store.documents.set("doc-1", { id: "doc-1", studentId: "stu-complex-1", title: "Passport" });
    store.applications.set("app-1", { id: "app-1", studentId: "stu-complex-1" });
    store.commissions.set("com-1", { id: "com-1", studentId: "stu-complex-1", amount: 1500 });

    await assert.rejects(
        async () => {
            await studentService.deleteStudent("stu-complex-1");
        },
        (err) => {
            assert.strictEqual(err.statusCode, 409);
            assert.strictEqual(err.code, "CANNOT_DELETE_STUDENT_WITH_DEPENDENCIES");
            assert.match(err.message, /1 document\(s\)/);
            assert.match(err.message, /1 application\(s\)/);
            assert.match(err.message, /1 commission\(s\)/);
            return true;
        }
    );

    // Records are completely preserved
    assert.ok(store.students.has("stu-complex-1"));
    assert.ok(store.documents.has("doc-1"));
    assert.ok(store.applications.has("app-1"));
    assert.ok(store.commissions.has("com-1"));
    assert.strictEqual(store.invocations.deleteManyCalls.length, 0);
});

test("Student Deletion: Student with enrollment or appointments CANNOT be deleted", async () => {
    resetStore();
    store.students.set("stu-enr-1", { id: "stu-enr-1", firstName: "Enrolled", lastName: "Student" });
    store.enrollments.set("enr-1", { id: "enr-1", studentId: "stu-enr-1" });
    store.appointments.set("apt-1", { id: "apt-1", studentId: "stu-enr-1" });

    await assert.rejects(
        async () => {
            await studentService.deleteStudent("stu-enr-1");
        },
        (err) => {
            assert.strictEqual(err.statusCode, 409);
            assert.strictEqual(err.code, "CANNOT_DELETE_STUDENT_WITH_DEPENDENCIES");
            assert.match(err.message, /1 enrollment\(s\)/);
            assert.match(err.message, /1 appointment\(s\)/);
            return true;
        }
    );

    assert.ok(store.students.has("stu-enr-1"));
    assert.strictEqual(store.invocations.deleteManyCalls.length, 0);
});

test("Student Deletion: Student with linked user account CANNOT be deleted", async () => {
    resetStore();
    store.students.set("stu-user-1", { id: "stu-user-1", firstName: "Portal", lastName: "Student" });
    store.users.set("usr-stu-1", { id: "usr-stu-1", studentId: "stu-user-1", role: "STUDENT" });

    await assert.rejects(
        async () => {
            await studentService.deleteStudent("stu-user-1");
        },
        (err) => {
            assert.strictEqual(err.statusCode, 409);
            assert.strictEqual(err.code, "CANNOT_DELETE_STUDENT_WITH_DEPENDENCIES");
            assert.match(err.message, /linked portal user account/);
            return true;
        }
    );

    assert.ok(store.students.has("stu-user-1"));
    assert.strictEqual(store.invocations.deleteManyCalls.length, 0);
});

test("Student Deletion: Student with 0 business dependencies can be cleanly deleted without cascade wipes", async () => {
    resetStore();
    store.students.set("stu-clean-1", { id: "stu-clean-1", firstName: "Draft", lastName: "Lead" });

    const result = await studentService.deleteStudent("stu-clean-1");
    assert.deepStrictEqual(result, { id: "stu-clean-1", deleted: true });
    assert.strictEqual(store.students.has("stu-clean-1"), false);
    // Explicitly assert that no cascade deleteMany calls were made across other tables
    assert.strictEqual(store.invocations.deleteManyCalls.length, 0);
});

// ── Part C: Payment Deletion RBAC ────────────────────────────────────────────

test("Payment RBAC: FRONT_DESK is rejected from deleting payments with 403 Forbidden", async () => {
    const paymentDeleteMiddleware = requireRole("SUPER_ADMIN");
    const result = await runMiddleware(paymentDeleteMiddleware, { role: "FRONT_DESK" });
    assert.strictEqual(result.nextCalled, true);
    assert.ok(result.err);
    assert.strictEqual(result.err.statusCode, 403);
    assert.strictEqual(result.err.code, "INSUFFICIENT_ROLE");
});

test("Payment RBAC: COUNSELOR is rejected from deleting payments with 403 Forbidden", async () => {
    const paymentDeleteMiddleware = requireRole("SUPER_ADMIN");
    const result = await runMiddleware(paymentDeleteMiddleware, { role: "COUNSELOR" });
    assert.strictEqual(result.nextCalled, true);
    assert.ok(result.err);
    assert.strictEqual(result.err.statusCode, 403);
    assert.strictEqual(result.err.code, "INSUFFICIENT_ROLE");
});

test("Payment RBAC: BRANCH_ADMIN is rejected from deleting payments with 403 Forbidden", async () => {
    const paymentDeleteMiddleware = requireRole("SUPER_ADMIN");
    const result = await runMiddleware(paymentDeleteMiddleware, { role: "BRANCH_ADMIN" });
    assert.strictEqual(result.nextCalled, true);
    assert.ok(result.err);
    assert.strictEqual(result.err.statusCode, 403);
    assert.strictEqual(result.err.code, "INSUFFICIENT_ROLE");
});

test("Payment RBAC: SUPER_ADMIN is accepted for payment deletion route", async () => {
    const paymentDeleteMiddleware = requireRole("SUPER_ADMIN");
    const result = await runMiddleware(paymentDeleteMiddleware, { role: "SUPER_ADMIN" });
    assert.strictEqual(result.nextCalled, true);
    assert.strictEqual(result.err, null);
});

// ── Part D: Payment Deletion Service Safeguards ──────────────────────────────

test("Payment Deletion: Payment with associated transactions CANNOT be deleted", async () => {
    resetStore();
    store.payments.set("pay-tx-1", { id: "pay-tx-1", studentId: "stu-1", totalAmount: 10000, paidAmount: 5000 });
    store.transactions.set("tx-1", { id: "tx-1", paymentId: "pay-tx-1", amount: 5000 });

    await assert.rejects(
        async () => {
            await paymentService.deletePayment("pay-tx-1");
        },
        (err) => {
            assert.strictEqual(err.statusCode, 400);
            assert.strictEqual(err.code, "PAYMENT_HAS_TRANSACTIONS");
            assert.match(err.message, /1 transaction\(s\)/);
            return true;
        }
    );

    // Records are completely preserved
    assert.ok(store.payments.has("pay-tx-1"));
    assert.ok(store.transactions.has("tx-1"));
    // Assert transaction.deleteMany was NEVER called
    assert.strictEqual(store.invocations.deleteManyCalls.length, 0);
});

test("Payment Deletion: Payment with paidAmount > 0 CANNOT be deleted even if transaction count is 0", async () => {
    resetStore();
    store.payments.set("pay-paid-1", { id: "pay-paid-1", studentId: "stu-1", totalAmount: 10000, paidAmount: 2000 });

    await assert.rejects(
        async () => {
            await paymentService.deletePayment("pay-paid-1");
        },
        (err) => {
            assert.strictEqual(err.statusCode, 400);
            assert.strictEqual(err.code, "PAYMENT_HAS_TRANSACTIONS");
            return true;
        }
    );

    assert.ok(store.payments.has("pay-paid-1"));
    assert.strictEqual(store.invocations.deleteManyCalls.length, 0);
});

test("Payment Deletion: Uncollected payment with zero transactions can be cleanly deleted", async () => {
    resetStore();
    store.payments.set("pay-draft-1", { id: "pay-draft-1", studentId: "stu-1", totalAmount: 10000, paidAmount: 0 });

    const result = await paymentService.deletePayment("pay-draft-1");
    assert.deepStrictEqual(result, { deleted: true, id: "pay-draft-1" });
    assert.strictEqual(store.payments.has("pay-draft-1"), false);
    // Assert zero deleteMany calls were made
    assert.strictEqual(store.invocations.deleteManyCalls.length, 0);
});
