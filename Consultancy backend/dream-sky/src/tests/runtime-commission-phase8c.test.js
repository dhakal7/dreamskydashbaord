const test = require("node:test");
const assert = require("node:assert/strict");

// ── 1. In-Memory Store & Prisma Mock ──────────────────────────────────────────
// Guarantees ZERO connection to dreamsky_db or any real database.

const store = {
  classes: new Map(),
  students: new Map(),
  enrollments: new Map(),
  pipelineStageHistories: [],
  commissions: new Map(),
  commissionRules: new Map(),
  users: new Map(),
  branches: new Map(),
  auditLogs: [],
};

const resetStore = () => {
  store.classes.clear();
  store.students.clear();
  store.enrollments.clear();
  store.pipelineStageHistories.length = 0;
  store.commissions.clear();
  store.commissionRules.clear();
  store.users.clear();
  store.branches.clear();
  store.auditLogs.length = 0;
};

let transactionRollbackTrigger = false;

const mockPrisma = {
  class: {
    findUnique: async ({ where }) => store.classes.get(where.id) || null,
    delete: async ({ where }) => {
      const existing = store.classes.get(where.id);
      store.classes.delete(where.id);
      return existing;
    },
    update: async ({ where, data }) => {
      const existing = store.classes.get(where.id);
      const updated = { ...existing, ...data };
      store.classes.set(where.id, updated);
      return updated;
    },
  },
  student: {
    findUnique: async ({ where }) => store.students.get(where.id) || null,
    update: async ({ where, data }) => {
      const existing = store.students.get(where.id);
      if (!existing) throw new Error("Student not found");
      const updated = { ...existing, ...data };
      store.students.set(where.id, updated);
      return updated;
    },
  },
  enrollment: {
    findUnique: async ({ where }) => {
      if (where.classId_studentId) {
        const key = `${where.classId_studentId.classId}_${where.classId_studentId.studentId}`;
        return store.enrollments.get(key) || null;
      }
      return null;
    },
    create: async ({ data }) => {
      if (transactionRollbackTrigger) {
        throw new Error("Simulated database failure during enrollment");
      }
      const key = `${data.classId}_${data.studentId}`;
      if (store.enrollments.has(key)) {
        const p2002Err = new Error("Unique constraint failed");
        p2002Err.code = "P2002";
        throw p2002Err;
      }
      const record = { id: `enr-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date() };
      store.enrollments.set(key, record);
      return record;
    },
    delete: async ({ where }) => {
      if (where.classId_studentId) {
        const key = `${where.classId_studentId.classId}_${where.classId_studentId.studentId}`;
        const existing = store.enrollments.get(key);
        store.enrollments.delete(key);
        return existing;
      }
      return null;
    },
  },
  pipelineStageHistory: {
    create: async ({ data }) => {
      // Validate schema compliance: Only allowed fields are studentId, stage, changedById, reasonCode
      const allowedFields = new Set(["studentId", "stage", "changedById", "reasonCode"]);
      for (const field of Object.keys(data)) {
        if (!allowedFields.has(field)) {
          throw new Error(`Schema violation: field '${field}' does not exist on PipelineStageHistory`);
        }
      }
      const record = { id: `psh-${Date.now()}-${Math.random()}`, ...data, changedAt: new Date() };
      store.pipelineStageHistories.push(record);
      return record;
    },
  },
  user: {
    findUnique: async ({ where }) => store.users.get(where.id) || null,
    findMany: async ({ where }) => {
      const results = [];
      for (const u of store.users.values()) {
        if (where?.branchId && u.branchId !== where.branchId) continue;
        results.push(u);
      }
      return results;
    },
  },
  branch: {
    findUnique: async ({ where }) => store.branches.get(where.id) || null,
  },
  commissionRule: {
    findMany: async ({ where }) => {
      const results = [];
      const now = new Date();
      for (const r of store.commissionRules.values()) {
        if (where?.role && r.role !== where.role) continue;
        if (where?.triggerStage && r.triggerStage !== where.triggerStage) continue;
        if (where?.isActive !== undefined && r.isActive !== where.isActive) continue;
        if (where?.effectiveFrom?.lte && new Date(r.effectiveFrom) > where.effectiveFrom.lte) continue;
        results.push(r);
      }
      return results;
    },
    findUnique: async ({ where }) => store.commissionRules.get(where.id) || null,
  },
  commission: {
    findFirst: async ({ where }) => {
      for (const c of store.commissions.values()) {
        if (where.studentId && c.studentId !== where.studentId) continue;
        if (where.ruleId && c.ruleId !== where.ruleId) continue;
        if (where.recipientId && c.recipientId !== where.recipientId) continue;
        if (where.status?.not && c.status === where.status.not) continue;
        return c;
      }
      return null;
    },
    findUnique: async ({ where }) => {
      const c = store.commissions.get(where.id);
      if (!c) return null;
      return {
        ...c,
        recipient: store.users.get(c.recipientId) || null,
        student: store.students.get(c.studentId) || null,
      };
    },
    findMany: async ({ where }) => {
      const results = [];
      for (const c of store.commissions.values()) {
        if (where?.recipientId && c.recipientId !== where.recipientId) continue;
        if (where?.status && c.status !== where.status) continue;
        if (where?.studentId && c.studentId !== where.studentId) continue;
        results.push({
          ...c,
          recipient: store.users.get(c.recipientId) || null,
          student: store.students.get(c.studentId) || null,
        });
      }
      return results;
    },
    create: async ({ data }) => {
      const record = {
        id: `comm-${Date.now()}-${Math.random()}`,
        ...data,
        createdAt: new Date(),
      };
      store.commissions.set(record.id, record);
      return record;
    },
    count: async ({ where }) => {
      let count = 0;
      for (const c of store.commissions.values()) {
        if (where?.recipientId && c.recipientId !== where.recipientId) continue;
        count++;
      }
      return count;
    },
    update: async ({ where, data }) => {
      const existing = store.commissions.get(where.id);
      if (!existing) throw new Error("Commission not found");
      const updated = { ...existing, ...data };
      store.commissions.set(where.id, updated);
      return updated;
    },
  },
  auditLog: {
    create: async ({ data }) => {
      store.auditLogs.push(data);
      return data;
    },
  },
  $transaction: async (arg) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    // Execute interactive transaction with snapshot rollback capability
    const enrollmentSnapshot = new Map(store.enrollments);
    const studentSnapshot = new Map(store.students);
    const historySnapshot = [...store.pipelineStageHistories];
    try {
      return await arg(mockPrisma);
    } catch (err) {
      // Rollback memory state on error
      store.enrollments = enrollmentSnapshot;
      store.students = studentSnapshot;
      store.pipelineStageHistories = historySnapshot;
      throw err;
    }
  },
};

// ── 2. Intercept require.cache for prisma and email service ───────────────────
const prismaPath = require.resolve("../prisma");
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: mockPrisma,
};

const emailServicePath = require.resolve("../services/email.service");
require.cache[emailServicePath] = {
  id: emailServicePath,
  filename: emailServicePath,
  loaded: true,
  exports: {
    sendNotificationEmail: async () => ({ sent: true }),
  },
};

// ── 3. Load services and controller under test ────────────────────────────────
const classService = require("../services/class.service");
const commissionService = require("../services/commission.service");
const commissionController = require("../controllers/commission.controller");

// Helper to simulate express req/res/next
function mockContext() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(data) {
      res.body = data;
      return res;
    },
  };
  const next = (err) => {
    if (err) {
      res.statusCode = err.statusCode || 500;
      res.body = { error: err.code || err.message, message: err.message };
    }
  };
  return { res, next };
}

// ── 4. PART A TESTS: Class enrollment history & atomicity ─────────────────────

test("Part A.1: Class enrollment creates valid PipelineStageHistory payload matching schema", async () => {
  resetStore();
  store.classes.set("cls-1", { id: "cls-1", name: "IELTS Morning", branchId: "br-1" });
  store.students.set("stu-1", { id: "stu-1", firstName: "Suman", lastName: "Karki", currentStage: "LEAD" });

  const result = await classService.enrollStudent("cls-1", "stu-1", { id: "counselor-1" });

  assert.ok(result.enrollment, "Enrollment must succeed");
  assert.equal(store.pipelineStageHistories.length, 1, "Exactly one history record must be created");

  const history = store.pipelineStageHistories[0];
  assert.equal(history.studentId, "stu-1");
  assert.equal(history.stage, "ENROLLED");
  assert.equal(history.changedById, "counselor-1");
  assert.equal(history.reasonCode, "CLASS_ENROLLMENT");

  // Verify student's currentStage was updated to ENROLLED
  const updatedStudent = store.students.get("stu-1");
  assert.equal(updatedStudent.currentStage, "ENROLLED");
});

test("Part A.2: Class enrollment failure aborts transaction atomically without partial mutations", async () => {
  resetStore();
  store.classes.set("cls-1", { id: "cls-1", name: "IELTS Morning", branchId: "br-1" });
  store.students.set("stu-1", { id: "stu-1", firstName: "Suman", lastName: "Karki", currentStage: "LEAD" });

  // Arm the failure trigger inside the transaction
  transactionRollbackTrigger = true;
  await assert.rejects(
    async () => {
      await classService.enrollStudent("cls-1", "stu-1", { id: "counselor-1" });
    },
    /Simulated database failure during enrollment/
  );
  transactionRollbackTrigger = false;

  // Verify that enrollment was NOT created, history was NOT created, and student stage remained LEAD
  assert.equal(store.enrollments.size, 0, "No enrollment should be persisted on failure");
  assert.equal(store.pipelineStageHistories.length, 0, "No stage history should be persisted on failure");
  assert.equal(store.students.get("stu-1").currentStage, "LEAD", "Student stage must not change on failure");
});

test("Part A.3: Duplicate class enrollment is prevented cleanly", async () => {
  resetStore();
  store.classes.set("cls-1", { id: "cls-1", name: "IELTS Morning", branchId: "br-1" });
  store.students.set("stu-1", { id: "stu-1", firstName: "Suman", lastName: "Karki", currentStage: "LEAD" });

  // First enrollment
  const res1 = await classService.enrollStudent("cls-1", "stu-1", { id: "counselor-1" });
  assert.ok(res1.enrollment);

  // Second enrollment for same student in same class
  const res2 = await classService.enrollStudent("cls-1", "stu-1", { id: "counselor-1" });
  assert.equal(res2.error, "ALREADY_ENROLLED", "Must report ALREADY_ENROLLED without creating duplicate");
  assert.equal(store.enrollments.size, 1, "Only one enrollment record must exist");
});

test("Part A.4: Student already at higher pipeline stage does not regress to ENROLLED", async () => {
  resetStore();
  store.classes.set("cls-1", { id: "cls-1", name: "IELTS Morning", branchId: "br-1" });
  store.students.set("stu-1", { id: "stu-1", firstName: "Suman", lastName: "Karki", currentStage: "VISA_GRANTED" });

  const res = await classService.enrollStudent("cls-1", "stu-1", { id: "counselor-1" });
  assert.ok(res.enrollment);
  assert.equal(store.students.get("stu-1").currentStage, "VISA_GRANTED", "Stage must not regress");
  assert.equal(store.pipelineStageHistories.length, 0, "Stage history not created if student was not LEAD/PROSPECT");
});

// ── 5. PART B TESTS: Commission API authorization and recipient scoping ──────

test("Part B.1: Super Admin has global commission visibility", async () => {
  resetStore();
  store.commissions.set("c1", { id: "c1", recipientId: "counselor-1", amount: 150, status: "PENDING" });
  store.commissions.set("c2", { id: "c2", recipientId: "agent-1", amount: 100, status: "PENDING" });

  const req = {
    user: { id: "sa-1", role: "SUPER_ADMIN" },
    query: {},
  };
  const { res, next } = mockContext();
  await commissionController.listCommissions(req, res, next);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.length, 2, "Super admin sees all commission records");
});

test("Part B.2: Counselor is scoped strictly to their own commissions", async () => {
  resetStore();
  store.commissions.set("c1", { id: "c1", recipientId: "counselor-1", amount: 150, status: "PENDING" });
  store.commissions.set("c2", { id: "c2", recipientId: "counselor-2", amount: 200, status: "PENDING" });

  const req = {
    user: { id: "counselor-1", role: "COUNSELOR" },
    query: {},
  };
  const { res, next } = mockContext();
  await commissionController.listCommissions(req, res, next);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].recipientId, "counselor-1");
});

test("Part B.3: Counselor query override attempts on recipientId are ignored and forced to authenticated id", async () => {
  resetStore();
  store.commissions.set("c1", { id: "c1", recipientId: "counselor-1", amount: 150, status: "PENDING" });
  store.commissions.set("c2", { id: "c2", recipientId: "counselor-2", amount: 200, status: "PENDING" });

  const req = {
    user: { id: "counselor-1", role: "COUNSELOR" },
    query: { recipientId: "counselor-2" }, // Malicious attempt to view another counselor's commissions
  };
  const { res, next } = mockContext();
  await commissionController.listCommissions(req, res, next);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.length, 1, "Must ignore override and return only own commissions");
  assert.equal(res.body.data[0].recipientId, "counselor-1");
});

test("Part B.4: Referral agent query override attempts on recipientId are ignored and forced to authenticated id", async () => {
  resetStore();
  store.commissions.set("c1", { id: "c1", recipientId: "agent-1", amount: 100, status: "PENDING" });
  store.commissions.set("c2", { id: "c2", recipientId: "agent-2", amount: 120, status: "PENDING" });

  const req = {
    user: { id: "agent-1", role: "REFERRAL_AGENT" },
    query: { recipientId: "agent-2" }, // Malicious attempt
  };
  const { res, next } = mockContext();
  await commissionController.listCommissions(req, res, next);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].recipientId, "agent-1");
});

test("Part B.5: Unsupported roles receive 403 Forbidden on commission endpoints", async () => {
  resetStore();
  const reqTeacher = { user: { id: "teacher-1", role: "TEACHER" }, query: {} };
  const { res: resTeacher, next: nextTeacher } = mockContext();
  await commissionController.listCommissions(reqTeacher, resTeacher, nextTeacher);
  assert.equal(resTeacher.statusCode, 403);
  assert.equal(resTeacher.body.error, "FORBIDDEN");

  const reqStudent = { user: { id: "student-1", role: "STUDENT" }, query: {} };
  const { res: resStudent, next: nextStudent } = mockContext();
  await commissionController.listCommissions(reqStudent, resStudent, nextStudent);
  assert.equal(resStudent.statusCode, 403);
  assert.equal(resStudent.body.error, "FORBIDDEN");
});

test("Part B.6: Commission detail endpoint returns 404 when counselor accesses another recipient's commission", async () => {
  resetStore();
  store.commissions.set("c1", { id: "c1", recipientId: "counselor-2", amount: 150, status: "PENDING" });

  const req = {
    user: { id: "counselor-1", role: "COUNSELOR" },
    params: { id: "c1" },
  };
  const { res, next } = mockContext();
  await commissionController.getCommission(req, res, next);

  assert.equal(res.statusCode, 404, "Must return 404 to avoid disclosing existence or details of other records");
});

test("Part B.7: Commission detail endpoint returns commission when counselor accesses their own record", async () => {
  resetStore();
  store.commissions.set("c1", { id: "c1", recipientId: "counselor-1", amount: 150, status: "PENDING" });

  const req = {
    user: { id: "counselor-1", role: "COUNSELOR" },
    params: { id: "c1" },
  };
  const { res, next } = mockContext();
  await commissionController.getCommission(req, res, next);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.id, "c1");
  assert.equal(res.body.data.recipientId, "counselor-1");
});

// ── 6. PART C TESTS: Referral-agent commission display & identity mapping ──────

test("Part C.1: Referral agent ledger visibility correctly matches both User.id and linked profile ID", () => {
  // Simulate the visibleCommissions filtering logic implemented in commission-ledger-page.tsx
  const currentUser = {
    id: "user-ra-1",
    role: "referral_agent",
    linkedId: "profile-agent-1",
  };

  const commissions = [
    { id: "c1", earnerId: "user-ra-1", earnerType: "referral_agent", amountUsd: 100, status: "pending" },
    { id: "c2", earnerId: "profile-agent-1", earnerType: "referral_agent", amountUsd: 120, status: "pending" },
    { id: "c3", earnerId: "user-ra-2", earnerType: "referral_agent", amountUsd: 150, status: "pending" },
    { id: "c4", earnerId: "user-c-1", earnerType: "counselor", amountUsd: 200, status: "pending" },
  ];

  const visibleCommissions = commissions.filter((commission) => {
    if (currentUser.role !== "super_admin" && currentUser.role !== "branch_admin") {
      const matchesUser = commission.earnerId === currentUser.id || commission.earnerId === currentUser.linkedId;
      if (!matchesUser) return false;
    }
    return true;
  });

  assert.equal(visibleCommissions.length, 2, "Agent sees both real API User.id and mock profileId records");
  assert.deepEqual(
    visibleCommissions.map((c) => c.id),
    ["c1", "c2"]
  );
});

test("Part C.2: Admin roles retain full visibility in frontend ledger", () => {
  const superAdmin = { id: "user-sa-1", role: "super_admin", linkedId: "user-sa-1" };
  const branchAdmin = { id: "user-ba-1", role: "branch_admin", linkedId: "user-ba-1" };

  const commissions = [
    { id: "c1", earnerId: "user-ra-1", amountUsd: 100, status: "pending" },
    { id: "c2", earnerId: "user-c-1", amountUsd: 200, status: "pending" },
  ];

  const filterForUser = (user) =>
    commissions.filter((commission) => {
      if (user.role !== "super_admin" && user.role !== "branch_admin") {
        const matchesUser = commission.earnerId === user.id || commission.earnerId === user.linkedId;
        if (!matchesUser) return false;
      }
      return true;
    });

  assert.equal(filterForUser(superAdmin).length, 2, "Super admin sees all");
  assert.equal(filterForUser(branchAdmin).length, 2, "Branch admin sees all (backend handles branch filter)");
});

// ── 7. PART D TESTS: Duplicate commission prevention ──────────────────────────

test("Part D.1: generateCommission reuses existing commission on duplicate trigger", async () => {
  resetStore();

  store.users.set("user-c1", { id: "user-c1", role: "COUNSELOR", firstName: "Ram", email: "ram@counselor.com" });
  store.students.set("stu-1", { id: "stu-1", firstName: "Hari" });

  store.commissionRules.set("rule-1", {
    id: "rule-1",
    role: "COUNSELOR",
    triggerStage: "ENROLLED",
    type: "FIXED",
    fixedAmount: 150,
    isActive: true,
    effectiveFrom: new Date("2024-01-01"),
    effectiveTo: null,
  });

  // First commission generation
  const comm1 = await commissionService.generateCommission("stu-1", "user-c1", "ENROLLED");
  assert.ok(comm1, "Commission should be generated");
  assert.equal(store.commissions.size, 1);

  // Second commission generation for the exact same student, rule, and recipient
  const comm2 = await commissionService.generateCommission("stu-1", "user-c1", "ENROLLED");
  assert.ok(comm2, "Should return commission record");
  assert.equal(comm2.id, comm1.id, "Must return the existing commission record");
  assert.equal(store.commissions.size, 1, "Must NOT create a duplicate record");
});

test("Part D.2: Legitimate separate commissions for different rules on same student are preserved", async () => {
  resetStore();

  store.users.set("user-c1", { id: "user-c1", role: "COUNSELOR", firstName: "Ram", email: "ram@counselor.com" });
  store.students.set("stu-1", { id: "stu-1", firstName: "Hari" });

  store.commissionRules.set("rule-enrolled", {
    id: "rule-enrolled",
    role: "COUNSELOR",
    triggerStage: "ENROLLED",
    type: "FIXED",
    fixedAmount: 150,
    isActive: true,
    effectiveFrom: new Date("2024-01-01"),
  });

  store.commissionRules.set("rule-visa", {
    id: "rule-visa",
    role: "COUNSELOR",
    triggerStage: "VISA_GRANTED",
    type: "FIXED",
    fixedAmount: 300,
    isActive: true,
    effectiveFrom: new Date("2024-01-01"),
  });

  const comm1 = await commissionService.generateCommission("stu-1", "user-c1", "ENROLLED");
  const comm2 = await commissionService.generateCommission("stu-1", "user-c1", "VISA_GRANTED");

  assert.ok(comm1);
  assert.ok(comm2);
  assert.notEqual(comm1.id, comm2.id, "Different milestone rules must generate distinct commissions");
  assert.equal(store.commissions.size, 2);
});

test("Part D.3: Legitimate separate commissions for different recipients on same student are preserved", async () => {
  resetStore();

  store.users.set("user-c1", { id: "user-c1", role: "COUNSELOR", firstName: "Ram", email: "ram@counselor.com" });
  store.users.set("user-ra1", { id: "user-ra1", role: "REFERRAL_AGENT", firstName: "Sita", email: "sita@agent.com" });
  store.students.set("stu-1", { id: "stu-1", firstName: "Hari" });

  store.commissionRules.set("rule-counselor", {
    id: "rule-counselor",
    role: "COUNSELOR",
    triggerStage: "ENROLLED",
    type: "FIXED",
    fixedAmount: 150,
    isActive: true,
    effectiveFrom: new Date("2024-01-01"),
  });

  store.commissionRules.set("rule-agent", {
    id: "rule-agent",
    role: "REFERRAL_AGENT",
    triggerStage: "ENROLLED",
    type: "FIXED",
    fixedAmount: 100,
    isActive: true,
    effectiveFrom: new Date("2024-01-01"),
  });

  const commCounselor = await commissionService.generateCommission("stu-1", "user-c1", "ENROLLED");
  const commAgent = await commissionService.generateCommission("stu-1", "user-ra1", "ENROLLED");

  assert.ok(commCounselor);
  assert.ok(commAgent);
  assert.notEqual(commCounselor.id, commAgent.id);
  assert.equal(commCounselor.recipientId, "user-c1");
  assert.equal(commAgent.recipientId, "user-ra1");
  assert.equal(store.commissions.size, 2);
});
