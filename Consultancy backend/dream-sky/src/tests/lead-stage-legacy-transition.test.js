const test = require("node:test");
const assert = require("node:assert/strict");

// ── Mock Prisma in require.cache BEFORE loading any services ─────────
// Guarantees ZERO database contact (strictly offline unit test)

let mockStudentStore = {};
let mockHistoryStore = [];
let mockAuditStore = [];
let mockAppointmentStore = [];

const mockPrisma = {
    student: {
        findUnique: async ({ where }) => mockStudentStore[where.id] || null,
        findFirst: async ({ where }) => {
            const list = Object.values(mockStudentStore);
            return list.find((s) => {
                if (where.id && s.id !== where.id) return false;
                if (where.branchId && s.branchId !== where.branchId) return false;
                return true;
            }) || null;
        },
        update: async ({ where, data }) => {
            if (mockPrisma._simulateFailUpdate) {
                throw new Error("Simulated database update failure");
            }
            if (!mockStudentStore[where.id]) throw new Error("Student not found");
            const updated = { ...mockStudentStore[where.id], ...data };
            mockStudentStore[where.id] = updated;
            return updated;
        },
    },
    pipelineStageHistory: {
        create: async ({ data }) => {
            mockHistoryStore.push(data);
            return { id: `hist-${Date.now()}`, ...data };
        },
    },
    auditLog: {
        create: async ({ data }) => {
            mockAuditStore.push(data);
            return { id: `audit-${Date.now()}`, ...data };
        },
    },
    appointment: {
        findFirst: async () => null,
        create: async ({ data }) => {
            const appt = { id: `appt-${Date.now()}`, ...data };
            mockAppointmentStore.push(appt);
            return appt;
        },
    },
    $transaction: async (fn) => fn(mockPrisma),
};

const prismaPath = require.resolve("../prisma");
require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: mockPrisma,
};

const studentService = require("../services/student.service");

// Helper to reset store
function resetStores() {
    mockStudentStore = {};
    mockHistoryStore = [];
    mockAuditStore = [];
    mockAppointmentStore = [];
    mockPrisma._simulateFailUpdate = false;
}

const adminActor = { id: "user-admin", role: "SUPER_ADMIN", branchId: "branch-ktm" };
const counselorActor = { id: "user-counselor", role: "COUNSELOR", branchId: "branch-ktm" };

test("1 & 2. Legacy PROSPECT with leadStage = NULL explicitly transitions to COUNSELLING and persists in store", async () => {
    resetStores();
    const legacyStudent = {
        id: "stu-legacy-prospect",
        firstName: "Aarav",
        lastName: "Sharma",
        email: "aarav@example.com",
        currentStage: "PROSPECT",
        assignedCounselorId: "user-counselor",
        branchId: "branch-ktm",
        isActive: true,
        academicBackground: { officeVisit: "Not Visited", notes: "Excel imported prospect" },
        financialBackground: { budget: 20000 },
        familyBackground: { sponsor: "Parents" },
    };
    mockStudentStore[legacyStudent.id] = { ...legacyStudent };

    const result = await studentService.changePipelineStage(
        legacyStudent.id,
        { stage: "PROSPECT", leadStage: "COUNSELLING" },
        adminActor
    );

    // 1. API response reflects target stage
    assert.equal(result.leadStage, "COUNSELLING");
    assert.equal(result.currentStage, "PROSPECT");

    // 2. Persisted state is verified in mockStudentStore (NOT inferred from API response alone)
    const persisted = mockStudentStore[legacyStudent.id];
    assert.ok(persisted.academicBackground, "academicBackground must exist");
    assert.equal(persisted.academicBackground.leadStage, "COUNSELLING", "leadStage must be persisted in academicBackground");

    // Pipeline history entry must be recorded
    assert.equal(mockHistoryStore.length, 1);
    assert.equal(mockHistoryStore[0].stage, "PROSPECT");
});

test("3. Unchanged target when already persisted short-circuits without duplicate writes", async () => {
    resetStores();
    const alreadyCounselling = {
        id: "stu-already-counselling",
        firstName: "Bikash",
        lastName: "Poudel",
        email: "bikash@example.com",
        currentStage: "PROSPECT",
        assignedCounselorId: "user-counselor",
        branchId: "branch-ktm",
        isActive: true,
        academicBackground: { leadStage: "COUNSELLING" },
    };
    mockStudentStore[alreadyCounselling.id] = { ...alreadyCounselling };

    const result = await studentService.changePipelineStage(
        alreadyCounselling.id,
        { stage: "PROSPECT", leadStage: "COUNSELLING" },
        adminActor
    );

    assert.equal(result.leadStage, "COUNSELLING");
    // History should NOT be created because it's a true no-op
    assert.equal(mockHistoryStore.length, 0, "No duplicate history on true no-op");
});

test("4. Existing valid stages are preserved when transitioning between distinct sub-stages", async () => {
    resetStores();
    const interestedStudent = {
        id: "stu-interested",
        firstName: "Chandra",
        lastName: "Khadka",
        email: "chandra@example.com",
        currentStage: "PROSPECT",
        assignedCounselorId: "user-counselor",
        branchId: "branch-ktm",
        isActive: true,
        academicBackground: { leadStage: "COUNSELLING" },
    };
    mockStudentStore[interestedStudent.id] = { ...interestedStudent };

    const result = await studentService.changePipelineStage(
        interestedStudent.id,
        { stage: "PROSPECT", leadStage: "INTERESTED" },
        adminActor
    );

    assert.equal(result.leadStage, "INTERESTED");
    assert.equal(mockStudentStore[interestedStudent.id].academicBackground.leadStage, "INTERESTED");
    assert.equal(mockHistoryStore.length, 1);
});

test("5. Invalid stage transitions are rejected appropriately", async () => {
    resetStores();
    const prospectStudent = {
        id: "stu-inv",
        firstName: "Deepa",
        lastName: "Rana",
        email: "deepa@example.com",
        currentStage: "PROSPECT",
        assignedCounselorId: "user-counselor",
        branchId: "branch-ktm",
        isActive: true,
        academicBackground: {},
    };
    mockStudentStore[prospectStudent.id] = { ...prospectStudent };

    // Backward transition from PROSPECT to LEAD is invalid
    await assert.rejects(
        () => studentService.changePipelineStage(prospectStudent.id, { stage: "LEAD" }, adminActor),
        (err) => {
            assert.equal(err.code, "INVALID_TRANSITION");
            return true;
        }
    );
});

test("6. Failed database update does not produce a false success response", async () => {
    resetStores();
    const testStudent = {
        id: "stu-fail",
        firstName: "Elina",
        lastName: "Thapa",
        email: "elina@example.com",
        currentStage: "PROSPECT",
        assignedCounselorId: "user-counselor",
        branchId: "branch-ktm",
        isActive: true,
        academicBackground: {},
    };
    mockStudentStore[testStudent.id] = { ...testStudent };
    mockPrisma._simulateFailUpdate = true;

    await assert.rejects(
        () => studentService.changePipelineStage(testStudent.id, { stage: "PROSPECT", leadStage: "COUNSELLING" }, adminActor),
        (err) => {
            assert.match(err.message, /Simulated database update failure/);
            return true;
        }
    );
    // Student remains unmutated
    assert.equal(mockStudentStore[testStudent.id].academicBackground.leadStage, undefined);
});

test("7. Unrelated student attributes and relationships are not modified", async () => {
    resetStores();
    const fullStudent = {
        id: "stu-unrelated",
        firstName: "Gaurav",
        lastName: "KC",
        email: "gaurav@example.com",
        currentStage: "PROSPECT",
        assignedCounselorId: "user-counselor",
        branchId: "branch-ktm",
        isActive: true,
        academicBackground: { officeVisit: "Visited", qualification: "Bachelor" },
        financialBackground: { annualIncome: 500000 },
        familyBackground: { fatherName: "Shyam" },
        notes: "Important counselor notes here",
    };
    mockStudentStore[fullStudent.id] = { ...fullStudent };

    await studentService.changePipelineStage(
        fullStudent.id,
        { stage: "PROSPECT", leadStage: "COUNSELLING" },
        adminActor
    );

    const persisted = mockStudentStore[fullStudent.id];
    assert.equal(persisted.firstName, "Gaurav");
    assert.equal(persisted.notes, "Important counselor notes here");
    assert.equal(persisted.financialBackground.annualIncome, 500000);
    assert.equal(persisted.familyBackground.fatherName, "Shyam");
    assert.equal(persisted.academicBackground.officeVisit, "Visited");
    assert.equal(persisted.academicBackground.qualification, "Bachelor");
    assert.equal(persisted.academicBackground.leadStage, "COUNSELLING");
});

test("8. Authorization: Counselor on another branch is rejected; authorized counselor succeeds", async () => {
    resetStores();
    const branchStudent = {
        id: "stu-branch",
        firstName: "Hari",
        lastName: "Basnet",
        email: "hari@example.com",
        currentStage: "PROSPECT",
        assignedCounselorId: "counselor-ktm",
        branchId: "branch-ktm",
        isActive: true,
        academicBackground: {},
    };
    mockStudentStore[branchStudent.id] = { ...branchStudent };

    // Foreign branch counselor
    const foreignActor = { id: "counselor-pkr", role: "COUNSELOR", branchId: "branch-pkr" };
    await assert.rejects(
        () => studentService.changePipelineStage(branchStudent.id, { stage: "PROSPECT", leadStage: "COUNSELLING" }, foreignActor),
        (err) => {
            assert.equal(err.statusCode, 403); // Scoped authorization blocks foreign branch counselor with 403
            return true;
        }
    );

    // Authorized counselor
    const authorizedActor = { id: "counselor-ktm", role: "COUNSELOR", branchId: "branch-ktm" };
    const success = await studentService.changePipelineStage(
        branchStudent.id,
        { stage: "PROSPECT", leadStage: "COUNSELLING" },
        authorizedActor
    );
    assert.equal(success.leadStage, "COUNSELLING");
});
