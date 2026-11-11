const test = require("node:test");
const assert = require("node:assert/strict");

// ── Mock Prisma in require.cache BEFORE loading any services ─────────
const mockPrisma = {
    student: {
        findUnique: async () => null,
        findFirst: async () => null,
        findMany: async () => [],
        update: async () => ({}),
        updateMany: async () => ({ count: 1 }),
        count: async () => 0,
    },
    user: {
        findUnique: async () => null,
        findFirst: async () => null,
        findMany: async () => [],
    },
    branch: {
        findUnique: async () => null,
    },
    application: {
        count: async () => 0,
    },
    visaCase: {
        count: async () => 0,
    },
    payment: {
        count: async () => 0,
    },
    enrollment: {
        count: async () => 0,
    },
    auditLog: {
        create: async () => ({}),
        findMany: async () => [],
        count: async () => 0,
    },
    pipelineStageHistory: {
        create: async () => ({}),
    },
    communicationLog: {
        updateMany: async () => ({ count: 1 }),
        findFirst: async () => null,
        create: async () => ({}),
    },
    notification: {
        create: async () => ({}),
    },
    $transaction: async (cb) => cb(mockPrisma),
};

const prismaPath = require.resolve("../prisma");
require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: mockPrisma,
};

const studentService = require("../services/student.service");
const followupService = require("../services/followup.service");
const auditService = require("../services/audit.service");

test("Phase B: Lead Management & Administration Enhancement Suite", async (t) => {
    // ─── 1. Counselor Assignment ──────────────────────────────────────────
    await t.test("Counselor Assignment: Front Desk can assign lead to counselor in same branch", async () => {
        const student = {
            id: "lead-assign-1",
            firstName: "Sita",
            lastName: "Sharma",
            isActive: true,
            currentStage: "LEAD",
            assignedCounselorId: null,
            academicBackground: { branchId: "branch-kathmandu" },
        };
        const counselor = {
            id: "counselor-1",
            role: "COUNSELOR",
            status: "ACTIVE",
            branchId: "branch-kathmandu",
            firstName: "Ram",
            lastName: "Thapa",
        };
        const frontDesk = {
            userId: "fd-1",
            role: "FRONT_DESK",
            branchId: "branch-kathmandu",
            firstName: "Geeta",
            lastName: "Adhikari",
        };

        let txExecuted = false;
        mockPrisma.student.findUnique = async () => student;
        mockPrisma.user.findFirst = async () => counselor;
        mockPrisma.$transaction = async (cb) => {
            txExecuted = true;
            return cb({
                student: {
                    update: async ({ data }) => ({
                        ...student,
                        ...data,
                        id: student.id,
                    }),
                },
                pipelineStageHistory: { create: async () => ({}) },
                auditLog: { create: async () => ({}) },
            });
        };

        const res = await studentService.assignLeadToCounselor(student.id, counselor.id, frontDesk);
        assert.strictEqual(txExecuted, true);
        assert.strictEqual(res.leadStage, "ASSIGNED");
        assert.strictEqual(res.assignedCounselorId, counselor.id);
    });

    await t.test("Counselor Assignment: Counselor cannot assign leads (403)", async () => {
        const counselorUser = {
            userId: "counselor-1",
            role: "COUNSELOR",
            branchId: "branch-kathmandu",
        };
        await assert.rejects(
            async () => {
                await studentService.assignLeadToCounselor("lead-1", "counselor-2", counselorUser);
            },
            (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
        );
    });

    await t.test("Counselor Assignment: Front Desk cannot assign to counselor in another branch (403/400)", async () => {
        const student = {
            id: "lead-assign-cross",
            firstName: "Hari",
            isActive: true,
            currentStage: "LEAD",
            academicBackground: { branchId: "branch-kathmandu" },
        };
        const crossCounselor = {
            id: "counselor-pokhara",
            role: "COUNSELOR",
            status: "ACTIVE",
            branchId: "branch-pokhara",
        };
        const frontDesk = {
            userId: "fd-1",
            role: "FRONT_DESK",
            branchId: "branch-kathmandu",
        };

        mockPrisma.student.findUnique = async () => student;
        mockPrisma.user.findFirst = async () => crossCounselor;

        await assert.rejects(
            async () => {
                await studentService.assignLeadToCounselor(student.id, crossCounselor.id, frontDesk);
            },
            (err) => err.statusCode === 403 && err.code === "CROSS_BRANCH_ASSIGNMENT_FORBIDDEN"
        );
    });

    // ─── 2. Super Admin Cross-Branch Transfer ──────────────────────────────
    await t.test("Cross-Branch Transfer: Only Super Admin allowed, non-super admin rejected (403)", async () => {
        const frontDesk = { role: "FRONT_DESK", branchId: "branch-1" };
        const branchAdmin = { role: "BRANCH_ADMIN", branchId: "branch-1" };
        const counselor = { role: "COUNSELOR", userId: "c1" };

        await assert.rejects(
            async () => studentService.transferBranch("s1", { destinationBranchId: "b2" }, frontDesk),
            (err) => err.statusCode === 403
        );
        await assert.rejects(
            async () => studentService.transferBranch("s1", { destinationBranchId: "b2" }, branchAdmin),
            (err) => err.statusCode === 403
        );
        await assert.rejects(
            async () => studentService.transferBranch("s1", { destinationBranchId: "b2" }, counselor),
            (err) => err.statusCode === 403
        );
    });

    await t.test("Cross-Branch Transfer: Identical destination branch rejected with 400", async () => {
        const superAdmin = { role: "SUPER_ADMIN", userId: "super-1" };

        mockPrisma.branch.findUnique = async () => ({ id: "branch-1", isActive: true });
        mockPrisma.student.findUnique = async () => ({
            id: "s1",
            isActive: true,
            academicBackground: { branchId: "branch-1" },
        });

        await assert.rejects(
            async () => studentService.transferBranch("s1", { destinationBranchId: "branch-1" }, superAdmin),
            (err) => err.statusCode === 400 && err.code === "IDENTICAL_DESTINATION_BRANCH"
        );
    });

    // ─── 3. Atomic Follow-up Concurrency ───────────────────────────────────
    await t.test("Atomic Follow-up: Concurrency conflict returns 409 STALE_REMINDER_CONFLICT", async () => {
        const mockTx = {
            communicationLog: {
                updateMany: async () => ({ count: 0 }), // 0 rows updated means expectedScheduledAt mismatched!
            },
        };

        const pastDate = new Date("2026-11-10T10:00:00Z");
        const newDate = new Date("2026-11-12T10:00:00Z");

        await assert.rejects(
            async () => followupService.atomicTransitionFollowUp(mockTx, "log-1", pastDate, newDate),
            (err) => err.statusCode === 409 && err.code === "STALE_REMINDER_CONFLICT"
        );
    });

    // ─── 4. 5-Guard Trash Safety ───────────────────────────────────────────
    await t.test("Trash Safety: G1 blocks trashing enrolled student", async () => {
        const enrolledStudent = {
            id: "enrolled-1",
            isActive: true,
            currentStage: "ENROLLED",
            academicBackground: {},
        };
        const superAdmin = { role: "SUPER_ADMIN", userId: "sa-1" };
        mockPrisma.student.findUnique = async () => enrolledStudent;

        await assert.rejects(
            async () => studentService.softDeleteStudent("enrolled-1", superAdmin, "Invalid lead"),
            (err) => err.statusCode === 400 && err.code === "CANNOT_TRASH_ENROLLED_STUDENT"
        );
    });

    await t.test("Trash Safety: G2 blocks trashing student with active application", async () => {
        const lead = {
            id: "lead-with-app",
            isActive: true,
            currentStage: "PROSPECT",
            academicBackground: {},
        };
        const superAdmin = { role: "SUPER_ADMIN", userId: "sa-1" };

        mockPrisma.student.findUnique = async () => lead;
        mockPrisma.application.count = async () => 1; // 1 active application

        await assert.rejects(
            async () => studentService.softDeleteStudent("lead-with-app", superAdmin, "No longer interested"),
            (err) => err.statusCode === 409 && err.code === "STUDENT_HAS_ACTIVE_APPLICATIONS"
        );
    });

    // ─── 5. Audit Log Isolation ────────────────────────────────────────────
    await t.test("Audit Log: Branch Admin cannot access cross-branch logs", async () => {
        const branchAdminB1 = {
            role: "BRANCH_ADMIN",
            branchId: "branch-1",
            userId: "ba-1",
        };

        let capturedWhere = null;
        mockPrisma.student.findMany = async () => [{ id: "student-in-b1" }];
        mockPrisma.user.findMany = async () => [{ id: "user-in-b1" }];
        mockPrisma.auditLog.count = async () => 1;
        mockPrisma.auditLog.findMany = async ({ where }) => {
            capturedWhere = where;
            return [];
        };

        await auditService.listAuditLogs({}, branchAdminB1);
        assert.ok(capturedWhere.AND);
        const branchCond = capturedWhere.AND[0];
        assert.ok(branchCond.OR);
        assert.deepStrictEqual(branchCond.OR[0].entityId.in, ["student-in-b1"]);
        assert.deepStrictEqual(branchCond.OR[1].entityId.in, ["user-in-b1"]);
    });
});
