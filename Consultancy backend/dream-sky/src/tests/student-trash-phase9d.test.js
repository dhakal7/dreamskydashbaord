const test = require("node:test");
const assert = require("node:assert/strict");

// ── 1. In-Memory Store & Prisma Mock ──────────────────────────────────────────
// Guarantees ZERO connection to PostgreSQL or any real database.

const store = {
    students: new Map(),
    users: new Map(),
    counselors: new Map(),
    auditLogs: [],
    applications: new Map(),
    visas: new Map(),
    appointments: new Map(),
    documents: new Map(),
    communicationLogs: new Map(),
    payments: new Map(),
    transactions: new Map(),
};

const resetStore = () => {
    store.students.clear();
    store.users.clear();
    store.counselors.clear();
    store.auditLogs.length = 0;
    store.applications.clear();
    store.visas.clear();
    store.appointments.clear();
    store.documents.clear();
    store.communicationLogs.clear();
    store.payments.clear();
    store.transactions.clear();
};

const mockPrisma = {
    student: {
        findUnique: async ({ where, select, include }) => {
            const s = store.students.get(where.id);
            if (!s) return null;
            const res = { ...s };
            if (include?.assignedCounselor || select?.assignedCounselor) {
                res.assignedCounselor = store.counselors.get(s.assignedCounselorId) || null;
            }
            return res;
        },
        findMany: async ({ where = {}, skip = 0, take = 50, select, include }) => {
            let list = Array.from(store.students.values());
            if (where.isActive !== undefined) {
                list = list.filter((s) => s.isActive === where.isActive);
            }
            if (where.assignedCounselor?.branchId) {
                list = list.filter((s) => {
                    const c = store.counselors.get(s.assignedCounselorId);
                    return c && c.branchId === where.assignedCounselor.branchId;
                });
            }
            if (Array.isArray(where.OR)) {
                list = list.filter((s) => {
                    return where.OR.some((cond) => {
                        if (cond.assignedCounselor?.branchId) {
                            const c = store.counselors.get(s.assignedCounselorId);
                            return c && c.branchId === cond.assignedCounselor.branchId;
                        }
                        if (cond.academicBackground?.path && cond.academicBackground.equals) {
                            const branchVal = s.academicBackground?.branchId;
                            return s.assignedCounselorId === null && branchVal === cond.academicBackground.equals;
                        }
                        return false;
                    });
                });
            }
            if (Array.isArray(where.OR)) {
                list = list.filter((s) => {
                    return where.OR.some((cond) => {
                        if (cond.assignedCounselor?.branchId) {
                            const c = store.counselors.get(s.assignedCounselorId);
                            return c && c.branchId === cond.assignedCounselor.branchId;
                        }
                        if (cond.academicBackground?.path && cond.academicBackground.equals) {
                            const branchVal = s.academicBackground?.branchId;
                            return s.assignedCounselorId === null && branchVal === cond.academicBackground.equals;
                        }
                        return false;
                    });
                });
            }
            return list.slice(skip, skip + take).map((s) => {
                const res = { ...s };
                if (include?.assignedCounselor || select?.assignedCounselor) {
                    res.assignedCounselor = store.counselors.get(s.assignedCounselorId) || null;
                }
                return res;
            });
        },
        count: async ({ where = {} }) => {
            let list = Array.from(store.students.values());
            if (where.isActive !== undefined) {
                list = list.filter((s) => s.isActive === where.isActive);
            }
            if (where.assignedCounselor?.branchId) {
                list = list.filter((s) => {
                    const c = store.counselors.get(s.assignedCounselorId);
                    return c && c.branchId === where.assignedCounselor.branchId;
                });
            }
            if (Array.isArray(where.OR)) {
                list = list.filter((s) => {
                    return where.OR.some((cond) => {
                        if (cond.assignedCounselor?.branchId) {
                            const c = store.counselors.get(s.assignedCounselorId);
                            return c && c.branchId === cond.assignedCounselor.branchId;
                        }
                        if (cond.academicBackground?.path && cond.academicBackground.equals) {
                            const branchVal = s.academicBackground?.branchId;
                            return s.assignedCounselorId === null && branchVal === cond.academicBackground.equals;
                        }
                        return false;
                    });
                });
            }
            return list.length;
        },
        update: async ({ where, data }) => {
            const existing = store.students.get(where.id);
            if (!existing) throw new Error("Student not found");
            const updated = { ...existing, ...data, updatedAt: new Date() };
            store.students.set(where.id, updated);
            return updated;
        },
        updateMany: async ({ where, data }) => {
            const existing = store.students.get(where.id);
            if (!existing) return { count: 0 };
            if (where.isActive !== undefined && existing.isActive !== where.isActive) {
                return { count: 0 };
            }
            const updated = { ...existing, ...data, updatedAt: new Date() };
            store.students.set(where.id, updated);
            return { count: 1 };
        },
        delete: async ({ where }) => {
            const existing = store.students.get(where.id);
            if (!existing) throw new Error("Student not found");
            store.students.delete(where.id);
            return existing;
        },
    },
    counselor: {
        findUnique: async ({ where }) => {
            return store.counselors.get(where.id) || null;
        },
        findFirst: async ({ where }) => {
            for (const c of store.counselors.values()) {
                if (where.userId && c.userId === where.userId) return { ...c };
            }
            return null;
        },
    },
    user: {
        findUnique: async ({ where }) => {
            return store.users.get(where.id) || null;
        },
        findFirst: async ({ where }) => {
            for (const u of store.users.values()) {
                if (where.studentId && u.studentId === where.studentId) return { ...u };
                if (where.email && u.email === where.email) return { ...u };
            }
            return null;
        },
    },
    auditLog: {
        create: async ({ data }) => {
            if (mockPrisma._simulateAuditFailure) {
                throw new Error("Simulated database failure during audit log writing");
            }
            const log = { id: `audit-${Date.now()}-${Math.random()}`, ...data, timestamp: new Date() };
            store.auditLogs.push(log);
            return log;
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
        create: async ({ data }) => {
            const id = `app-${Date.now()}`;
            const item = { id, ...data };
            store.applications.set(id, item);
            return item;
        },
    },
    visaCase: {
        findUnique: async ({ where }) => store.visas.get(where.id) || null,
        create: async ({ data }) => {
            const id = `visa-${Date.now()}`;
            const item = { id, ...data };
            store.visas.set(id, item);
            return item;
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
        create: async ({ data }) => {
            const id = `appt-${Date.now()}`;
            const item = { id, ...data };
            store.appointments.set(id, item);
            return item;
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
        findUnique: async ({ where, include }) => {
            const d = store.documents.get(where.id);
            if (!d) return null;
            const res = { ...d };
            if (include?.student) {
                res.student = store.students.get(d.studentId) || null;
            }
            return res;
        },
        create: async ({ data }) => {
            const id = `doc-${Date.now()}`;
            const item = { id, ...data };
            store.documents.set(id, item);
            return item;
        },
    },
    documentVersion: {
        create: async ({ data }) => data,
    },
    communicationLog: {
        count: async ({ where }) => {
            let count = 0;
            for (const c of store.communicationLogs.values()) {
                if (where.studentId && c.studentId === where.studentId) count++;
            }
            return count;
        },
        create: async ({ data }) => {
            const id = `comm-${Date.now()}`;
            const item = { id, ...data };
            store.communicationLogs.set(id, item);
            return item;
        },
    },
    payment: {
        count: async ({ where }) => {
            let count = 0;
            for (const p of store.payments.values()) {
                if (where.studentId && p.studentId === where.studentId) count++;
            }
            return count;
        },
        findUnique: async ({ where, include }) => {
            const p = store.payments.get(where.id);
            if (!p) return null;
            const res = { ...p, transactions: [] };
            for (const t of store.transactions.values()) {
                if (t.paymentId === p.id) res.transactions.push(t);
            }
            if (include?.student) {
                res.student = store.students.get(p.studentId) || null;
            }
            return res;
        },
        create: async ({ data }) => {
            const id = `pay-${Date.now()}`;
            const item = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
            store.payments.set(id, item);
            return item;
        },
        update: async ({ where, data }) => {
            const p = store.payments.get(where.id);
            if (!p) throw new Error("Payment not found");
            const updated = { ...p, ...data, updatedAt: new Date() };
            store.payments.set(where.id, updated);
            return updated;
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
        findMany: async ({ where }) => {
            const list = [];
            for (const t of store.transactions.values()) {
                if (where.paymentId && t.paymentId === where.paymentId) list.push(t);
            }
            return list;
        },
        create: async ({ data }) => {
            const id = `tx-${Date.now()}`;
            const item = { id, ...data, paidAt: new Date() };
            store.transactions.set(id, item);
            return item;
        },
    },
    pipelineStageHistory: {
        create: async ({ data }) => data,
    },
    commission: { count: async () => 0 },
    enrollment: { count: async () => 0 },
    attendanceRecord: { count: async () => 0 },
    testScore: { count: async () => 0 },
    $transaction: async (fn) => {
        // Create an isolated snapshot of mutable state to allow rollback
        const studentSnapshot = new Map(store.students);
        const auditSnapshot = [...store.auditLogs];

        const txClient = {
            ...mockPrisma,
            student: {
                ...mockPrisma.student,
                updateMany: async ({ where, data }) => {
                    const existing = store.students.get(where.id);
                    if (!existing) return { count: 0 };
                    if (where.isActive !== undefined && existing.isActive !== where.isActive) {
                        return { count: 0 };
                    }
                    const updated = { ...existing, ...data, updatedAt: new Date() };
                    store.students.set(where.id, updated);
                    return { count: 1 };
                },
            },
            auditLog: {
                create: async ({ data }) => {
                    if (mockPrisma._simulateAuditFailure) {
                        throw new Error("Simulated database failure during audit log writing");
                    }
                    const log = { id: `audit-${Date.now()}-${Math.random()}`, ...data, timestamp: new Date() };
                    store.auditLogs.push(log);
                    return log;
                },
            },
        };

        try {
            if (Array.isArray(fn)) return await Promise.all(fn);
            return await fn(txClient);
        } catch (err) {
            // Roll back snapshot on error
            store.students = studentSnapshot;
            store.auditLogs = auditSnapshot;
            throw err;
        }
    },
    _simulateAuditFailure: false,
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
const applicationService = require("../services/application.service");
const appointmentService = require("../services/appointment.service");
const documentService = require("../services/document.service");
const followupService = require("../services/followup.service");
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

// ── 4. Test Suite ─────────────────────────────────────────────────────────────

test("Setup Seed Data for Tests", () => {
    resetStore();

    // Branch 1 Counselor & Branch 2 Counselor
    store.counselors.set("counselor-b1", {
        id: "counselor-b1",
        userId: "user-counselor-b1",
        branchId: "branch-1",
    });
    store.counselors.set("counselor-b2", {
        id: "counselor-b2",
        userId: "user-counselor-b2",
        branchId: "branch-2",
    });

    // Active student in Branch 1
    store.students.set("student-b1-active", {
        id: "student-b1-active",
        firstName: "Aarav",
        lastName: "Sharma",
        email: "aarav@example.com",
        phone: "9841000001",
        isActive: true,
        currentStage: "COUNSELING",
        assignedCounselorId: "counselor-b1",
    });

    // Active student in Branch 2
    store.students.set("student-b2-active", {
        id: "student-b2-active",
        firstName: "Bikash",
        lastName: "Thapa",
        email: "bikash@example.com",
        phone: "9841000002",
        isActive: true,
        currentStage: "COUNSELING",
        assignedCounselorId: "counselor-b2",
    });

    // Trashed student in Branch 1
    store.students.set("student-b1-trashed", {
        id: "student-b1-trashed",
        firstName: "Chandra",
        lastName: "Gurung",
        email: "chandra@example.com",
        phone: "9841000003",
        isActive: false,
        currentStage: "VISA_APPLIED",
        assignedCounselorId: "counselor-b1",
    });
});

// ── TRASH-01: SUPER_ADMIN Soft Delete & Atomic AuditLog ───────────────────────
test("TRASH-01: SUPER_ADMIN soft deletes student atomically and creates AuditLog entry", async () => {
    const superAdmin = { id: "user-superadmin", role: "SUPER_ADMIN" };
    const student = store.students.get("student-b1-active");
    assert.strictEqual(student.isActive, true);

    const result = await studentService.softDeleteStudent("student-b1-active", superAdmin, "Duplicate lead created in error");

    assert.strictEqual(result.isActive, false);
    assert.strictEqual(store.students.get("student-b1-active").isActive, false);
    // Student stage, counselor assignment, and profile data preserved
    assert.strictEqual(store.students.get("student-b1-active").currentStage, "COUNSELING");
    assert.strictEqual(store.students.get("student-b1-active").assignedCounselorId, "counselor-b1");

    // Check AuditLog
    const audit = store.auditLogs.find((l) => l.entity === "Student" && l.entityId === "student-b1-active");
    assert.ok(audit, "AuditLog row must exist");
    assert.strictEqual(audit.field, "isActive");
    assert.strictEqual(audit.oldValue, "true");
    assert.strictEqual(audit.newValue, "false");
    assert.strictEqual(audit.actorId, superAdmin.id);
});

// ── TRASH-02: BRANCH_ADMIN Soft Delete Own Branch Student ────────────────────
test("TRASH-02: BRANCH_ADMIN soft deletes student belonging to own branch successfully", async () => {
    const branchAdminB2 = { id: "user-ba2", role: "BRANCH_ADMIN", branchId: "branch-2" };
    const studentB2 = store.students.get("student-b2-active");
    assert.strictEqual(studentB2.isActive, true);

    const result = await studentService.softDeleteStudent("student-b2-active", branchAdminB2, "Branch administrative cleanup");

    assert.strictEqual(result.isActive, false);
    assert.strictEqual(store.students.get("student-b2-active").isActive, false);

    const audit = store.auditLogs.find((l) => l.entityId === "student-b2-active");
    assert.ok(audit, "AuditLog created for branch admin deletion");
    assert.strictEqual(audit.actorId, branchAdminB2.id);
});

// ── TRASH-03: BRANCH_ADMIN Cross-Branch Soft Delete Blocked ──────────────────
test("TRASH-03: BRANCH_ADMIN soft delete of student in another branch is rejected with 403 Forbidden", async () => {
    // Re-activate student-b1-active for cross-branch test
    store.students.get("student-b1-active").isActive = true;

    const branchAdminB2 = { id: "user-ba2", role: "BRANCH_ADMIN", branchId: "branch-2" };

    await assert.rejects(
        async () => {
            await studentService.softDeleteStudent("student-b1-active", branchAdminB2, "Cross branch test");
        },
        (err) => {
            assert.strictEqual(err.statusCode, 403);
            assert.strictEqual(err.code, "FORBIDDEN");
            return true;
        }
    );

    // Student remains active
    assert.strictEqual(store.students.get("student-b1-active").isActive, true);
});

// ── TRASH-04 & TRASH-05: Non-Admin Roles Blocked by RBAC ──────────────────────
test("TRASH-04: COUNSELOR soft delete blocked at route middleware with 403 Forbidden", async () => {
    const trashMiddleware = requireRole("SUPER_ADMIN", "BRANCH_ADMIN");
    const result = await runMiddleware(trashMiddleware, { role: "COUNSELOR" });
    assert.strictEqual(result.nextCalled, true);
    assert.strictEqual(result.err?.statusCode, 403);
    assert.strictEqual(result.err?.code, "INSUFFICIENT_ROLE");
});

test("TRASH-05: TEACHER soft delete blocked at service and route with 403 Forbidden", async () => {
    const teacherUser = { id: "user-teacher", role: "TEACHER", branchId: "branch-1" };
    await assert.rejects(
        async () => {
            await studentService.softDeleteStudent("student-b1-active", teacherUser, "Unauthorized attempt");
        },
        (err) => {
            assert.strictEqual(err.statusCode, 403);
            return true;
        }
    );
});

// ── TRASH-06: Repeated & Concurrent Soft Delete Safe (409 Conflict) ───────────
test("TRASH-06: Repeated soft delete returns 409 Conflict with STUDENT_ALREADY_TRASHED", async () => {
    const superAdmin = { id: "user-superadmin", role: "SUPER_ADMIN" };
    // Set student-b1-active to inactive (in trash)
    store.students.get("student-b1-active").isActive = false;

    await assert.rejects(
        async () => {
            await studentService.softDeleteStudent("student-b1-active", superAdmin, "Repeated trash attempt");
        },
        (err) => {
            assert.strictEqual(err.statusCode, 409);
            assert.strictEqual(err.code, "STUDENT_ALREADY_TRASHED");
            return true;
        }
    );
});

// ── TRASH-07: SUPER_ADMIN Restore & Atomic AuditLog ───────────────────────────
test("TRASH-07: SUPER_ADMIN restores trashed student and creates AuditLog entry", async () => {
    const superAdmin = { id: "user-superadmin", role: "SUPER_ADMIN" };
    assert.strictEqual(store.students.get("student-b1-trashed").isActive, false);

    const result = await studentService.restoreStudent("student-b1-trashed", superAdmin);

    assert.strictEqual(result.isActive, true);
    assert.strictEqual(store.students.get("student-b1-trashed").isActive, true);
    // Preserved pipeline stage
    assert.strictEqual(store.students.get("student-b1-trashed").currentStage, "VISA_APPLIED");

    const audit = store.auditLogs.find((l) => l.entityId === "student-b1-trashed" && l.newValue === "true");
    assert.ok(audit, "AuditLog row created for restore");
    assert.strictEqual(audit.oldValue, "false");
    assert.strictEqual(audit.newValue, "true");
    assert.strictEqual(audit.actorId, superAdmin.id);
});

// ── TRASH-08: Repeated & Concurrent Restore Safe (409 Conflict) ───────────────
test("TRASH-08: Repeated restore on active student returns 409 Conflict with STUDENT_ALREADY_ACTIVE", async () => {
    const superAdmin = { id: "user-superadmin", role: "SUPER_ADMIN" };
    assert.strictEqual(store.students.get("student-b1-trashed").isActive, true);

    await assert.rejects(
        async () => {
            await studentService.restoreStudent("student-b1-trashed", superAdmin);
        },
        (err) => {
            assert.strictEqual(err.statusCode, 409);
            assert.strictEqual(err.code, "STUDENT_ALREADY_ACTIVE");
            return true;
        }
    );
});

// ── TRASH-09: listStudents Excludes Trashed Records By Default ────────────────
test("TRASH-09: listStudents query filters where.isActive: true by default", async () => {
    const superAdmin = { id: "user-superadmin", role: "SUPER_ADMIN" };
    // Set 1 active and 1 trashed
    store.students.get("student-b1-active").isActive = true;
    store.students.get("student-b2-active").isActive = false;

    const result = await studentService.listStudents({}, superAdmin);
    assert.ok(result.students);
    const hasTrashed = result.students.some((s) => s.id === "student-b2-active");
    assert.strictEqual(hasTrashed, false, "Trashed student must not appear in normal list");
});

// ── TRASH-10: listTrash Returns Trashed Records With Branch Isolation ─────────
test("TRASH-10: listTrash returns only trashed records and enforces branch isolation", async () => {
    store.students.get("student-b1-active").isActive = false; // Branch 1 trashed
    store.students.get("student-b2-active").isActive = false; // Branch 2 trashed

    const superAdmin = { id: "user-superadmin", role: "SUPER_ADMIN" };
    const saResult = await studentService.listTrash({}, superAdmin);
    assert.strictEqual(saResult.students.length, 2);

    const branchAdminB1 = { id: "user-ba1", role: "BRANCH_ADMIN", branchId: "branch-1" };
    const baResult = await studentService.listTrash({}, branchAdminB1);
    assert.strictEqual(baResult.students.length, 1);
    assert.strictEqual(baResult.students[0].id, "student-b1-active");
});

// ── TRASH-11: Detail Fails Closed For Non-Admin When Trashed ─────────────────
test("TRASH-11: Trashed student detail fails closed with 404 for counselor/student", async () => {
    store.students.get("student-b1-active").isActive = false;
    const counselor = { id: "user-counselor-b1", role: "COUNSELOR" };
    const superAdmin = { id: "user-superadmin", role: "SUPER_ADMIN" };

    await assert.rejects(
        async () => {
            await studentService.getStudentById("student-b1-active", counselor);
        },
        (err) => {
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.code, "STUDENT_NOT_FOUND");
            return true;
        }
    );

    const adminView = await studentService.getStudentById("student-b1-active", superAdmin);
    assert.strictEqual(adminView.id, "student-b1-active");
});

// ── TRASH-12: Trashed Student Update Blocked (400 Bad Request) ────────────────
test("TRASH-12: Updating a trashed student is blocked with 400 Bad Request (STUDENT_IN_TRASH)", async () => {
    store.students.get("student-b1-active").isActive = false;
    const superAdmin = { id: "user-superadmin", role: "SUPER_ADMIN" };

    await assert.rejects(
        async () => {
            await studentService.updateStudent("student-b1-active", { firstName: "Changed" }, superAdmin);
        },
        (err) => {
            assert.strictEqual(err.statusCode, 400);
            assert.strictEqual(err.code, "STUDENT_IN_TRASH");
            return true;
        }
    );
});

// ── TRASH-13: Trashed Student Pipeline Change Blocked ─────────────────────────
test("TRASH-13: Changing pipeline stage on a trashed student is blocked with 400 Bad Request", async () => {
    store.students.get("student-b1-active").isActive = false;
    const superAdmin = { id: "user-superadmin", role: "SUPER_ADMIN" };

    await assert.rejects(
        async () => {
            await studentService.changePipelineStage("student-b1-active", { stage: "ENROLLED" }, superAdmin);
        },
        (err) => {
            assert.strictEqual(err.statusCode, 400);
            assert.strictEqual(err.code, "STUDENT_IN_TRASH");
            return true;
        }
    );
});

// ── TRASH-14: Audit Failure Causes Atomic Transaction Rollback ────────────────
test("TRASH-14: AuditLog creation failure rolls back student status change atomically", async () => {
    store.students.get("student-b1-active").isActive = true;
    const superAdmin = { id: "user-superadmin", role: "SUPER_ADMIN" };

    // Enable simulated audit failure
    mockPrisma._simulateAuditFailure = true;

    await assert.rejects(
        async () => {
            await studentService.softDeleteStudent("student-b1-active", superAdmin, "Simulated audit rollback");
        },
        /Simulated database failure during audit log writing/
    );

    // Turn off simulation
    mockPrisma._simulateAuditFailure = false;

    // Student MUST still be active due to rollback
    assert.strictEqual(store.students.get("student-b1-active").isActive, true, "Student status must roll back");
});

// ── TRASH-15: Related Record Creation Blocked On Trashed Students ─────────────
test("TRASH-15: Related record creation blocked for students in Trash", async () => {
    const trashedId = "student-b1-trashed";
    store.students.get(trashedId).isActive = false;

    // 1. Application
    await assert.rejects(
        async () => {
            await applicationService.createApplication(
                { studentId: trashedId, universityId: "u1", courseName: "CS" },
                { id: "sa-1", role: "SUPER_ADMIN" }
            );
        },
        (err) => {
            assert.strictEqual(err.statusCode, 400);
            assert.strictEqual(err.code, "STUDENT_IN_TRASH");
            return true;
        }
    );

    // 2. Appointment
    await assert.rejects(
        async () => {
            await appointmentService.createAppointment({
                studentId: trashedId,
                counselorId: "c1",
                scheduledAt: new Date().toISOString(),
                type: "IN_PERSON",
            });
        },
        (err) => {
            assert.strictEqual(err.statusCode, 400);
            assert.strictEqual(err.code, "STUDENT_IN_TRASH");
            return true;
        }
    );

    // 3. Document upload
    await assert.rejects(
        async () => {
            await documentService.uploadDocument(
                { originalname: "pass.pdf", mimetype: "application/pdf", buffer: Buffer.from("pdf") },
                { studentId: trashedId, type: "PASSPORT" },
                "user-1"
            );
        },
        (err) => {
            assert.strictEqual(err.statusCode, 400);
            assert.strictEqual(err.code, "STUDENT_IN_TRASH");
            return true;
        }
    );

    // 4. Follow-up communication
    await assert.rejects(
        async () => {
            await followupService.createFollowUp({ studentId: trashedId, channel: "CALL", content: "Called" }, "user-1");
        },
        (err) => {
            assert.strictEqual(err.statusCode, 400);
            assert.strictEqual(err.code, "STUDENT_IN_TRASH");
            return true;
        }
    );

    // 5. Payment
    await assert.rejects(
        async () => {
            await paymentService.createPayment({ studentId: trashedId, feeCategory: "Tuition", totalAmount: 1000 });
        },
        (err) => {
            assert.strictEqual(err.statusCode, 400);
            assert.strictEqual(err.code, "STUDENT_IN_TRASH");
            return true;
        }
    );
});
