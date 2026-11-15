const test = require("node:test");
const assert = require("node:assert/strict");

// ── In-Memory Isolated Store & Prisma Mock ───────────────────────────────────
// Strict zero-database mock: No connections to PostgreSQL on port 5432 or 5433.

const store = {
    students: new Map(),
    users: new Map(),
    counselors: new Map(),
    auditLogs: [],
    pipelineHistories: [],
    appointments: new Map(),
};

const resetStore = () => {
    store.students.clear();
    store.users.clear();
    store.counselors.clear();
    store.auditLogs.length = 0;
    store.pipelineHistories.length = 0;
    store.appointments.clear();
};

const mockPrisma = {
    student: {
        findUnique: async ({ where, include, select }) => {
            const s = store.students.get(where.id);
            if (!s) return null;
            const res = { ...s };
            if (include?.assignedCounselor || select?.assignedCounselor) {
                res.assignedCounselor = store.counselors.get(s.assignedCounselorId) || null;
            }
            return res;
        },
        findMany: async ({ where = {}, skip = 0, take = 50, select, include, orderBy }) => {
            let list = Array.from(store.students.values());
            if (where.isActive !== undefined) {
                list = list.filter((s) => s.isActive === where.isActive);
            }
            if (where.currentStage) {
                if (where.currentStage.in) {
                    list = list.filter((s) => where.currentStage.in.includes(s.currentStage));
                } else if (where.currentStage.notIn) {
                    list = list.filter((s) => !where.currentStage.notIn.includes(s.currentStage));
                } else if (typeof where.currentStage === "string") {
                    list = list.filter((s) => s.currentStage === where.currentStage);
                }
            }
            if (where.assignedCounselorId) {
                list = list.filter((s) => s.assignedCounselorId === where.assignedCounselorId);
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
            if (where.currentStage) {
                if (where.currentStage.in) {
                    list = list.filter((s) => where.currentStage.in.includes(s.currentStage));
                } else if (where.currentStage.notIn) {
                    list = list.filter((s) => !where.currentStage.notIn.includes(s.currentStage));
                }
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
        updateMany: async ({ where, data }) => {
            const existing = store.students.get(where.id);
            if (!existing) return { count: 0 };
            if (where.isActive !== undefined && existing.isActive !== where.isActive) {
                return { count: 0 };
            }
            const updated = {
                ...existing,
                ...data,
                updatedAt: new Date(),
            };
            store.students.set(where.id, updated);
            return { count: 1 };
        },
        update: async ({ where, data }) => {
            const existing = store.students.get(where.id);
            if (!existing) throw new Error("Student not found");
            const updated = {
                ...existing,
                ...data,
                updatedAt: new Date(),
            };
            store.students.set(where.id, updated);
            return updated;
        },
    },
    user: {
        findMany: async ({ where }) => {
            const ids = where?.id?.in || [];
            return ids.map((id) => store.users.get(id)).filter(Boolean);
        },
        findUnique: async ({ where }) => store.users.get(where.id) || null,
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
    pipelineStageHistory: {
        create: async ({ data }) => {
            const h = { id: `hist-${Date.now()}-${Math.random()}`, ...data, changedAt: new Date() };
            store.pipelineHistories.push(h);
            return h;
        },
    },
    $transaction: async (fn) => {
        const studentSnapshot = new Map(store.students);
        const auditSnapshot = [...store.auditLogs];

        const txClient = {
            student: mockPrisma.student,
            user: mockPrisma.user,
            auditLog: mockPrisma.auditLog,
            pipelineStageHistory: mockPrisma.pipelineStageHistory,
        };

        try {
            if (Array.isArray(fn)) return await Promise.all(fn);
            return await fn(txClient);
        } catch (err) {
            store.students = studentSnapshot;
            store.auditLogs = auditSnapshot;
            throw err;
        }
    },
    _simulateAuditFailure: false,
};

// Intercept require.cache for prisma
const prismaPath = require.resolve("../prisma");
require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: mockPrisma,
};

// Load modules under test
const studentService = require("../services/student.service");
const studentController = require("../controllers/student.controller");
const { validateTrashReason } = require("../validators/student.validator");

// ── Test Setup Fixtures ───────────────────────────────────────────────────────
function seedTestData() {
    resetStore();

    // Counselors & Users
    store.users.set("super-admin-1", {
        id: "super-admin-1",
        firstName: "Super",
        lastName: "Admin",
        email: "superadmin@dreamsky.com",
        role: "SUPER_ADMIN",
    });

    store.users.set("branch-admin-b1", {
        id: "branch-admin-b1",
        firstName: "Branch1",
        lastName: "Admin",
        email: "ba1@dreamsky.com",
        role: "BRANCH_ADMIN",
        branchId: "branch-1",
    });

    store.users.set("branch-admin-b2", {
        id: "branch-admin-b2",
        firstName: "Branch2",
        lastName: "Admin",
        email: "ba2@dreamsky.com",
        role: "BRANCH_ADMIN",
        branchId: "branch-2",
    });

    store.users.set("counselor-b1", {
        id: "counselor-b1",
        firstName: "Counselor",
        lastName: "One",
        email: "counselor1@dreamsky.com",
        role: "COUNSELOR",
        branchId: "branch-1",
    });

    store.counselors.set("counselor-b1", {
        id: "counselor-b1",
        firstName: "Counselor",
        lastName: "One",
        branchId: "branch-1",
        role: "COUNSELOR",
    });

    store.counselors.set("counselor-b2", {
        id: "counselor-b2",
        firstName: "Counselor",
        lastName: "Two",
        branchId: "branch-2",
        role: "COUNSELOR",
    });

    // Leads / Students
    store.students.set("lead-1-active", {
        id: "lead-1-active",
        firstName: "Aarav",
        lastName: "Sharma",
        email: "aarav.sharma@example.com",
        phone: "+977-9800000001",
        currentStage: "LEAD",
        academicBackground: { leadStage: "FOLLOW_UP" },
        assignedCounselorId: "counselor-b1",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    store.students.set("lead-2-branch2", {
        id: "lead-2-branch2",
        firstName: "Bibek",
        lastName: "Thapa",
        email: "bibek.thapa@example.com",
        phone: "+977-9800000002",
        currentStage: "PROSPECT",
        academicBackground: { leadStage: "COUNSELLING" },
        assignedCounselorId: "counselor-b2",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    store.students.set("lead-3-lost", {
        id: "lead-3-lost",
        firstName: "Chirag",
        lastName: "Karki",
        email: "chirag.karki@example.com",
        phone: "+977-9800000003",
        currentStage: "LOST",
        academicBackground: { leadStage: null },
        assignedCounselorId: "counselor-b1",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    store.students.set("lead-4-unassigned", {
        id: "lead-4-unassigned",
        firstName: "Dipesh",
        lastName: "Shrestha",
        email: "dipesh.shrestha@example.com",
        phone: "+977-9800000004",
        currentStage: "LEAD",
        academicBackground: { leadStage: "NEW" },
        assignedCounselorId: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
}

test("Phase 28.25B Suite: Persistent Trash Reasons, Leads Trash View, and Restore Workflow", async (t) => {
    seedTestData();

    await t.test("1.1 validateTrashReason: rejects missing, empty, and whitespace-only reasons", () => {
        assert.throws(
            () => validateTrashReason(undefined),
            (err) => err.code === "MISSING_TRASH_REASON" && err.statusCode === 400
        );
        assert.throws(
            () => validateTrashReason(null),
            (err) => err.code === "MISSING_TRASH_REASON" && err.statusCode === 400
        );
        assert.throws(
            () => validateTrashReason(""),
            (err) => err.code === "MISSING_TRASH_REASON" && err.statusCode === 400
        );
        assert.throws(
            () => validateTrashReason("   \t  \n  "),
            (err) => err.code === "MISSING_TRASH_REASON" && err.statusCode === 400
        );
        assert.throws(
            () => validateTrashReason(12345),
            (err) => err.code === "MISSING_TRASH_REASON" && err.statusCode === 400
        );
    });

    await t.test("1.2 validateTrashReason: trims and returns valid reasons", () => {
        const cleaned = validateTrashReason("   Duplicate entry created during walk-in rush   ");
        assert.strictEqual(cleaned, "Duplicate entry created during walk-in rush");
    });

    await t.test("2.1 softDeleteStudent: rejects empty/whitespace reason at service level", async () => {
        const superAdmin = store.users.get("super-admin-1");
        await assert.rejects(
            async () => {
                await studentService.softDeleteStudent("lead-1-active", superAdmin, "   ");
            },
            (err) => {
                assert.strictEqual(err.code, "MISSING_TRASH_REASON");
                assert.strictEqual(err.statusCode, 400);
                return true;
            }
        );
        // Student remains active
        assert.strictEqual(store.students.get("lead-1-active").isActive, true);
    });

    await t.test("2.2 softDeleteStudent: persists trash reason durably and logs audit atomically", async () => {
        const superAdmin = store.users.get("super-admin-1");
        const reason = "Applicant changed country preference to non-service destination";

        const res = await studentService.softDeleteStudent("lead-1-active", superAdmin, reason);

        assert.strictEqual(res.isActive, false);
        assert.strictEqual(res.trashReason, reason);
        assert.strictEqual(res.trashedById, superAdmin.id);
        assert.ok(res.trashedAt);

        // Verify in student record
        const record = store.students.get("lead-1-active");
        assert.strictEqual(record.isActive, false);
        assert.strictEqual(record.academicBackground.trashReason, reason);
        assert.strictEqual(record.academicBackground.trashedById, superAdmin.id);
        assert.ok(record.academicBackground.trashedAt);

        // Prior stage is NOT overwritten
        assert.strictEqual(record.currentStage, "LEAD");
        assert.strictEqual(record.academicBackground.leadStage, "FOLLOW_UP");

        // Verify AuditLog rows: both isActive AND trashReason were created
        const activeAudit = store.auditLogs.find(
            (l) => l.entityId === "lead-1-active" && l.field === "isActive"
        );
        assert.ok(activeAudit);
        assert.strictEqual(activeAudit.oldValue, "true");
        assert.strictEqual(activeAudit.newValue, "false");
        assert.strictEqual(activeAudit.actorId, superAdmin.id);

        const reasonAudit = store.auditLogs.find(
            (l) => l.entityId === "lead-1-active" && l.field === "trashReason"
        );
        assert.ok(reasonAudit);
        assert.strictEqual(reasonAudit.newValue, reason);
        assert.strictEqual(reasonAudit.actorId, superAdmin.id);
    });

    await t.test("2.3 softDeleteStudent: atomicity - rollback when audit fails", async () => {
        const superAdmin = store.users.get("super-admin-1");
        // Ensure student-2 is active
        assert.strictEqual(store.students.get("lead-2-branch2").isActive, true);

        mockPrisma._simulateAuditFailure = true;
        await assert.rejects(
            async () => {
                await studentService.softDeleteStudent(
                    "lead-2-branch2",
                    superAdmin,
                    "Testing audit failure rollback"
                );
            },
            /Simulated database failure during audit log writing/
        );
        mockPrisma._simulateAuditFailure = false;

        // Record must remain active and untrashed
        const rec = store.students.get("lead-2-branch2");
        assert.strictEqual(rec.isActive, true);
        assert.strictEqual(rec.academicBackground.trashReason, undefined);
    });

    await t.test("3.1 Keep Trash separate from LOST: active leads vs trash vs LOST", async () => {
        const superAdmin = store.users.get("super-admin-1");

        // Active listing (type='leads' or stageIn='LEAD,PROSPECT') only returns isActive: true
        const activeLeads = await studentService.listStudents(
            { stageIn: "LEAD,PROSPECT" },
            superAdmin
        );
        const activeIds = activeLeads.students.map((s) => s.id);
        // lead-1-active is in Trash (isActive: false), so must NOT be in active list
        assert.ok(!activeIds.includes("lead-1-active"), "Trashed lead excluded from active list");
        assert.ok(activeIds.includes("lead-2-branch2"), "Active lead is present");

        // Trashing did not convert lead-1 into LOST
        const trashedRec = store.students.get("lead-1-active");
        assert.strictEqual(trashedRec.currentStage, "LEAD");
        assert.notStrictEqual(trashedRec.currentStage, "LOST");

        // LOST lead is still active (not in trash) unless explicitly soft deleted
        const lostRec = store.students.get("lead-3-lost");
        assert.strictEqual(lostRec.currentStage, "LOST");
        assert.strictEqual(lostRec.isActive, true);
    });

    await t.test("4.1 listTrash: returns trashed records with reason and deleting actor", async () => {
        const superAdmin = store.users.get("super-admin-1");

        const trashResult = await studentService.listTrash(
            { stageIn: "LEAD,PROSPECT" },
            superAdmin
        );

        assert.strictEqual(trashResult.students.length, 1);
        const item = trashResult.students[0];
        assert.strictEqual(item.id, "lead-1-active");
        assert.strictEqual(item.isActive, false);
        assert.strictEqual(
            item.trashReason,
            "Applicant changed country preference to non-service destination"
        );
        assert.ok(item.trashedAt);
        assert.strictEqual(item.trashedById, superAdmin.id);
        assert.strictEqual(item.trashedBy?.name, "Super Admin");
    });

    await t.test("4.2 listTrash: branch isolation prevents unauthorized cross-branch viewing", async () => {
        const branchAdminB2 = store.users.get("branch-admin-b2");
        // lead-1-active is in branch-1; branch-2 admin must not see it
        const trashB2 = await studentService.listTrash(
            { stageIn: "LEAD,PROSPECT" },
            branchAdminB2
        );
        assert.strictEqual(trashB2.students.length, 0, "Cross-branch trashed records must be hidden");

        // Counselor is blocked from Trash-management access
        const counselor = store.users.get("counselor-b1");
        await assert.rejects(
            async () => {
                await studentService.listTrash({}, counselor);
            },
            (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
        );

        // Unauthorized roles (e.g. TEACHER) are rejected from viewing Trash
        await assert.rejects(
            async () => {
                await studentService.listTrash({}, { role: "TEACHER", id: "teacher-1" });
            },
            (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
        );
    });

    await t.test("5.1 restoreStudent: returns lead to active state preserving prior stage and audit trail", async () => {
        const superAdmin = store.users.get("super-admin-1");

        const res = await studentService.restoreStudent("lead-1-active", superAdmin);

        assert.strictEqual(res.isActive, true);
        assert.strictEqual(res.currentStage, "LEAD");
        assert.strictEqual(res.leadStage, "FOLLOW_UP");

        const record = store.students.get("lead-1-active");
        assert.strictEqual(record.isActive, true);
        assert.strictEqual(record.academicBackground.trashReason, undefined);
        assert.strictEqual(
            record.academicBackground.lastTrashReason,
            "Applicant changed country preference to non-service destination"
        );
        assert.ok(record.academicBackground.restoredAt);
        assert.strictEqual(record.academicBackground.restoredById, superAdmin.id);

        // Verify active audit log
        const restoreAudit = store.auditLogs.find(
            (l) => l.entityId === "lead-1-active" && l.field === "isActive" && l.newValue === "true"
        );
        assert.ok(restoreAudit);
        assert.strictEqual(restoreAudit.oldValue, "false");
        assert.strictEqual(restoreAudit.actorId, superAdmin.id);

        // Historical deletion reason audit log is preserved
        const oldReasonAudit = store.auditLogs.find(
            (l) => l.entityId === "lead-1-active" && l.field === "trashReason"
        );
        assert.ok(oldReasonAudit, "Historical trashReason audit log must remain intact");

        // Verify record is visible again in active leads
        const activeLeads = await studentService.listStudents(
            { stageIn: "LEAD,PROSPECT" },
            superAdmin
        );
        const activeIds = activeLeads.students.map((s) => s.id);
        assert.ok(activeIds.includes("lead-1-active"));
    });

    await t.test("5.2 restoreStudent: repeated restore returns 409 conflict", async () => {
        const superAdmin = store.users.get("super-admin-1");
        await assert.rejects(
            async () => {
                await studentService.restoreStudent("lead-1-active", superAdmin);
            },
            (err) => err.statusCode === 409 && err.code === "STUDENT_ALREADY_ACTIVE"
        );
    });

    await t.test("6.1 Cross-branch trash and restore operations are rejected with 403", async () => {
        const branchAdminB1 = store.users.get("branch-admin-b1");
        // lead-2-branch2 is assigned to counselor in branch-2; branch-1 admin cannot trash it
        await assert.rejects(
            async () => {
                await studentService.softDeleteStudent(
                    "lead-2-branch2",
                    branchAdminB1,
                    "Unauthorized cross-branch trash"
                );
            },
            (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
        );

        // Now trash it with superAdmin
        const superAdmin = store.users.get("super-admin-1");
        await studentService.softDeleteStudent(
            "lead-2-branch2",
            superAdmin,
            "Valid trash by superadmin"
        );

        // branch-1 admin cannot restore a branch-2 student
        await assert.rejects(
            async () => {
                await studentService.restoreStudent("lead-2-branch2", branchAdminB1);
            },
            (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
        );
    });

    await t.test("6.2 Unassigned leads: Branch Admin fails closed with 403, Super Admin permitted", async () => {
        const branchAdminB1 = store.users.get("branch-admin-b1");
        const superAdmin = store.users.get("super-admin-1");

        // Branch admin cannot trash unassigned lead
        await assert.rejects(
            async () => {
                await studentService.softDeleteStudent(
                    "lead-4-unassigned",
                    branchAdminB1,
                    "Branch admin trying to trash unassigned lead"
                );
            },
            (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
        );

        // Super Admin can trash unassigned lead
        const res = await studentService.softDeleteStudent(
            "lead-4-unassigned",
            superAdmin,
            "Super admin trashes unassigned lead"
        );
        assert.strictEqual(res.isActive, false);

        // Branch admin cannot restore unassigned lead
        await assert.rejects(
            async () => {
                await studentService.restoreStudent("lead-4-unassigned", branchAdminB1);
            },
            (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
        );

        // Super Admin can restore unassigned lead
        const restored = await studentService.restoreStudent("lead-4-unassigned", superAdmin);
        assert.strictEqual(restored.isActive, true);
    });

    await t.test("7.1 updateStudent: preserves historical lastTrashReason and leadStage", async () => {
        const superAdmin = store.users.get("super-admin-1");
        const recBefore = store.students.get("lead-1-active");
        assert.ok(recBefore.academicBackground.lastTrashReason, "Must have lastTrashReason");

        // Update profile with new academicBackground fields
        await studentService.updateStudent(
            "lead-1-active",
            { academicBackground: { gpa: 3.8, interestedFaculty: "Engineering" } },
            superAdmin
        );

        const recAfter = store.students.get("lead-1-active");
        assert.strictEqual(recAfter.academicBackground.gpa, 3.8);
        assert.strictEqual(recAfter.academicBackground.interestedFaculty, "Engineering");
        assert.strictEqual(recAfter.academicBackground.leadStage, "FOLLOW_UP");
        assert.strictEqual(
            recAfter.academicBackground.lastTrashReason,
            "Applicant changed country preference to non-service destination"
        );
    });

    await t.test("7.2 Controller: remove controller requires body.reason and rejects query params / missing reasons", async () => {
        const superAdmin = store.users.get("super-admin-1");

        // Missing body
        await new Promise((resolve) => {
            const req = { params: { id: "lead-1-active" }, body: {}, query: {}, user: superAdmin };
            const res = {};
            const next = (err) => {
                assert.ok(err, "Must pass error to next");
                assert.strictEqual(err.statusCode, 400);
                assert.strictEqual(err.code, "MISSING_TRASH_REASON");
                resolve();
            };
            studentController.remove(req, res, next);
        });

        // Query param only (not accepted in body)
        await new Promise((resolve) => {
            const req = { params: { id: "lead-1-active" }, body: {}, query: { reason: "Sneaking in query" }, user: superAdmin };
            const res = {};
            const next = (err) => {
                assert.ok(err, "Must reject when body.reason is missing");
                assert.strictEqual(err.statusCode, 400);
                assert.strictEqual(err.code, "MISSING_TRASH_REASON");
                resolve();
            };
            studentController.remove(req, res, next);
        });

        // Valid body
        await new Promise((resolve) => {
            const req = {
                params: { id: "lead-1-active" },
                body: { reason: "Valid body reason from frontend" },
                user: superAdmin,
            };
            const res = {
                status: (code) => {
                    assert.strictEqual(code, 200);
                    return res;
                },
                json: (payload) => {
                    assert.strictEqual(payload.success, true);
                    assert.strictEqual(payload.data.isActive, false);
                    resolve();
                },
            };
            studentController.remove(req, res, (err) => {
                if (err) assert.fail("Should not call next with error on valid body");
            });
        });
    });
});
