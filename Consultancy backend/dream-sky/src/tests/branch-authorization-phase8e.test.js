const test = require("node:test");
const assert = require("node:assert/strict");

// ── 1. In-Memory Store & Prisma Mock ──────────────────────────────────────────
// Guarantees ZERO connection to dreamsky_db or any real database.

const store = {
  users: new Map(),
  commissions: new Map(),
  commissionRules: new Map(),
  students: new Map(),
  recommendationResults: new Map(),
  auditLogs: [],
};

const resetStore = () => {
  store.users.clear();
  store.commissions.clear();
  store.commissionRules.clear();
  store.students.clear();
  store.recommendationResults.clear();
  store.auditLogs.length = 0;
};

const mockPrisma = {
  user: {
    findUnique: async ({ where }) => store.users.get(where.id) || null,
    findMany: async ({ where }) => {
      const results = [];
      for (const u of store.users.values()) {
        if (where?.branchId !== undefined && u.branchId !== where.branchId) continue;
        results.push(u);
      }
      return results;
    },
    findFirst: async ({ where }) => {
      if (where?.studentId) {
        for (const u of store.users.values()) {
          if (u.studentId === where.studentId) return { ...u };
        }
      }
      return null;
    },
  },
  commissionRule: {
    findUnique: async ({ where }) => store.commissionRules.get(where.id) || null,
  },
  commission: {
    findUnique: async ({ where }) => {
      const c = store.commissions.get(where.id);
      if (!c) return null;
      return {
        ...c,
        rule: c.ruleId ? store.commissionRules.get(c.ruleId) || null : null,
        recipient: store.users.get(c.recipientId) || null,
        student: store.students.get(c.studentId) || null,
      };
    },
    findMany: async ({ where }) => {
      const results = [];
      for (const c of store.commissions.values()) {
        if (where?.recipientId && c.recipientId !== where.recipientId) continue;
        if (where?.status && c.status !== where.status) continue;
        if (where?.OR) {
          // General evaluation of where.OR array
          let matched = false;
          for (const orClause of where.OR) {
            let clauseMatches = true;
            if (orClause.recipientId?.in && !orClause.recipientId.in.includes(c.recipientId)) {
              clauseMatches = false;
            }
            if (orClause.rule?.scopeBranchId) {
              const rule = c.ruleId ? store.commissionRules.get(c.ruleId) : null;
              if (rule?.scopeBranchId !== orClause.rule.scopeBranchId) {
                clauseMatches = false;
              }
            }
            if (clauseMatches) {
              matched = true;
              break;
            }
          }
          if (!matched) continue;
        }
        results.push({
          ...c,
          rule: c.ruleId ? store.commissionRules.get(c.ruleId) || null : null,
          recipient: store.users.get(c.recipientId) || null,
          student: store.students.get(c.studentId) || null,
        });
      }
      return results;
    },
    count: async () => 0,
    update: async ({ where, data }) => {
      const existing = store.commissions.get(where.id);
      if (!existing) throw new Error("Commission not found");
      const updated = { ...existing, ...data };
      store.commissions.set(where.id, updated);
      return updated;
    },
  },
  student: {
    findUnique: async ({ where }) => store.students.get(where.id) || null,
    delete: async ({ where }) => {
      const s = store.students.get(where.id);
      store.students.delete(where.id);
      return s;
    },
  },
  payment: { count: async () => 0 },
  application: { count: async () => 0 },
  document: { count: async () => 0 },
  enrollment: { count: async () => 0 },
  appointment: { count: async () => 0 },
  communicationLog: { count: async () => 0 },
  attendanceRecord: { count: async () => 0 },
  testScore: { count: async () => 0 },
  recommendationResult: {
    count: async ({ where }) => {
      let count = 0;
      for (const r of store.recommendationResults.values()) {
        if (where?.recordId && r.recordId === where.recordId) count++;
      }
      return count;
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

// ── 3. Load services and controllers under test ───────────────────────────────
const commissionController = require("../controllers/commission.controller");
const studentService = require("../services/student.service");

// Mock context helper for express
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

// ── 4. POLICY OPTION B TESTS: Strict Earner-Jurisdiction Model ─────────────────

test("1. Branch admin cannot override the branch filter in commission listing", async () => {
  resetStore();
  store.users.set("c-branch-a", { id: "c-branch-a", role: "COUNSELOR", branchId: "branch-a" });
  store.commissions.set("comm-a", { id: "comm-a", recipientId: "c-branch-a", amount: 100, status: "PENDING" });

  store.users.set("c-branch-b", { id: "c-branch-b", role: "COUNSELOR", branchId: "branch-b" });
  store.commissions.set("comm-b", { id: "comm-b", recipientId: "c-branch-b", amount: 200, status: "PENDING" });

  const req = {
    user: { id: "ba-1", role: "BRANCH_ADMIN", branchId: "branch-a" },
    query: { branchId: "branch-b" }, // Malicious attempt to override branch
  };
  const { res, next } = mockContext();
  await commissionController.listCommissions(req, res, next);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].id, "comm-a", "Must strictly return branch-a commission, ignoring client param");
});

test("2. Branch admin without branch context is denied with 403 NO_BRANCH_CONTEXT", async () => {
  resetStore();
  store.commissions.set("comm-1", { id: "comm-1", recipientId: "c1", amount: 100, status: "PENDING" });

  const reqList = { user: { id: "ba-nobranch", role: "BRANCH_ADMIN", branchId: null }, query: {} };
  const { res: resList, next: nextList } = mockContext();
  await commissionController.listCommissions(reqList, resList, nextList);
  assert.equal(resList.statusCode, 403);
  assert.equal(resList.body.error, "NO_BRANCH_CONTEXT");

  const reqDetail = { user: { id: "ba-nobranch", role: "BRANCH_ADMIN", branchId: null }, params: { id: "comm-1" } };
  const { res: resDetail, next: nextDetail } = mockContext();
  await commissionController.getCommission(reqDetail, resDetail, nextDetail);
  assert.equal(resDetail.statusCode, 403);
  assert.equal(resDetail.body.error, "NO_BRANCH_CONTEXT");

  const reqDispute = {
    user: { id: "ba-nobranch", role: "BRANCH_ADMIN", branchId: null },
    params: { id: "comm-1" },
    body: { reason: "test" },
  };
  const { res: resDispute, next: nextDispute } = mockContext();
  await commissionController.dispute(reqDispute, resDispute, nextDispute);
  assert.equal(resDispute.statusCode, 403);
  assert.equal(resDispute.body.error, "NO_BRANCH_CONTEXT");
});

test("3. Policy Option B: Cross-Branch Scenario 1 (Recipient in Branch B, Rule in Branch A)", async () => {
  resetStore();
  // Rule is scoped to Branch A
  store.commissionRules.set("rule-branch-a", { id: "rule-branch-a", scopeBranchId: "branch-a" });

  // Recipient counselor belongs to Branch B
  store.users.set("counselor-b", { id: "counselor-b", role: "COUNSELOR", branchId: "branch-b" });
  store.commissions.set("comm-b-under-rule-a", {
    id: "comm-b-under-rule-a",
    recipientId: "counselor-b",
    ruleId: "rule-branch-a",
    amount: 250,
    status: "PENDING",
  });

  // ── Verification for Branch Admin A (Sponsoring Rule Branch) ──
  // Under Policy Option B, Branch Admin A must NOT access this commission because recipient is in Branch B!
  const reqAdminAList = { user: { id: "ba-a", role: "BRANCH_ADMIN", branchId: "branch-a" }, query: {} };
  const { res: resAList, next: nextAList } = mockContext();
  await commissionController.listCommissions(reqAdminAList, resAList, nextAList);
  assert.equal(resAList.statusCode, 200);
  assert.equal(resAList.body.data.length, 0, "Branch Admin A must NOT see Branch B recipient's commission");

  const reqAdminADetail = { user: { id: "ba-a", role: "BRANCH_ADMIN", branchId: "branch-a" }, params: { id: "comm-b-under-rule-a" } };
  const { res: resADetail, next: nextADetail } = mockContext();
  await commissionController.getCommission(reqAdminADetail, resADetail, nextADetail);
  assert.equal(resADetail.statusCode, 404, "Branch Admin A must receive 404 for Branch B recipient");

  const reqAdminADispute = {
    user: { id: "ba-a", role: "BRANCH_ADMIN", branchId: "branch-a" },
    params: { id: "comm-b-under-rule-a" },
    body: { reason: "Disputing foreign branch commission" },
  };
  const { res: resADispute, next: nextADispute } = mockContext();
  await commissionController.dispute(reqAdminADispute, resADispute, nextADispute);
  assert.equal(resADispute.statusCode, 404, "Branch Admin A must receive 404 on dispute");

  // ── Verification for Branch Admin B (Earner's Branch) ──
  // Branch Admin B MUST have access because the recipient belongs to Branch B!
  const reqAdminBList = { user: { id: "ba-b", role: "BRANCH_ADMIN", branchId: "branch-b" }, query: {} };
  const { res: resBList, next: nextBList } = mockContext();
  await commissionController.listCommissions(reqAdminBList, resBList, nextBList);
  assert.equal(resBList.statusCode, 200);
  assert.equal(resBList.body.data.length, 1);
  assert.equal(resBList.body.data[0].id, "comm-b-under-rule-a");

  const reqAdminBDetail = { user: { id: "ba-b", role: "BRANCH_ADMIN", branchId: "branch-b" }, params: { id: "comm-b-under-rule-a" } };
  const { res: resBDetail, next: nextBDetail } = mockContext();
  await commissionController.getCommission(reqAdminBDetail, resBDetail, nextBDetail);
  assert.equal(resBDetail.statusCode, 200);
  assert.equal(resBDetail.body.data.id, "comm-b-under-rule-a");

  const reqAdminBDispute = {
    user: { id: "ba-b", role: "BRANCH_ADMIN", branchId: "branch-b" },
    params: { id: "comm-b-under-rule-a" },
    body: { reason: "Legitimate branch B dispute" },
  };
  const { res: resBDispute, next: nextBDispute } = mockContext();
  await commissionController.dispute(reqAdminBDispute, resBDispute, nextBDispute);
  assert.equal(resBDispute.statusCode, 200);
});

test("4. Policy Option B: Cross-Branch Scenario 2 (Recipient in Branch A, Rule in Branch B)", async () => {
  resetStore();
  store.commissionRules.set("rule-branch-b", { id: "rule-branch-b", scopeBranchId: "branch-b" });
  store.users.set("counselor-a", { id: "counselor-a", role: "COUNSELOR", branchId: "branch-a" });
  store.commissions.set("comm-a-under-rule-b", {
    id: "comm-a-under-rule-b",
    recipientId: "counselor-a",
    ruleId: "rule-branch-b",
    amount: 180,
    status: "PENDING",
  });

  // Branch Admin A (Earner's branch) has access
  const reqAdminA = { user: { id: "ba-a", role: "BRANCH_ADMIN", branchId: "branch-a" }, params: { id: "comm-a-under-rule-b" } };
  const { res: resA, next: nextA } = mockContext();
  await commissionController.getCommission(reqAdminA, resA, nextA);
  assert.equal(resA.statusCode, 200);

  // Branch Admin B (Rule branch) is strictly DENIED with 404
  const reqAdminB = { user: { id: "ba-b", role: "BRANCH_ADMIN", branchId: "branch-b" }, params: { id: "comm-a-under-rule-b" } };
  const { res: resB, next: nextB } = mockContext();
  await commissionController.getCommission(reqAdminB, resB, nextB);
  assert.equal(resB.statusCode, 404);
});

test("5. Policy Option B: Unassigned Recipient (branchId == null)", async () => {
  resetStore();
  // Unassigned freelance referral agent
  store.users.set("agent-unassigned", { id: "agent-unassigned", role: "REFERRAL_AGENT", branchId: null });

  // Commission 1: Under company-wide rule (scopeBranchId is null)
  store.commissionRules.set("rule-global", { id: "rule-global", scopeBranchId: null });
  store.commissions.set("comm-unassigned-global", {
    id: "comm-unassigned-global",
    recipientId: "agent-unassigned",
    ruleId: "rule-global",
    amount: 100,
    status: "PENDING",
  });

  // Commission 2: Under Branch A scoped rule (scopeBranchId == "branch-a")
  store.commissionRules.set("rule-branch-a", { id: "rule-branch-a", scopeBranchId: "branch-a" });
  store.commissions.set("comm-unassigned-branch-a", {
    id: "comm-unassigned-branch-a",
    recipientId: "agent-unassigned",
    ruleId: "rule-branch-a",
    amount: 150,
    status: "PENDING",
  });

  // ── Company-wide rule on unassigned agent: NO branch admin may access (only Super Admin) ──
  const reqAdminAGlobal = { user: { id: "ba-a", role: "BRANCH_ADMIN", branchId: "branch-a" }, params: { id: "comm-unassigned-global" } };
  const { res: resAGlobal, next: nextAGlobal } = mockContext();
  await commissionController.getCommission(reqAdminAGlobal, resAGlobal, nextAGlobal);
  assert.equal(resAGlobal.statusCode, 404, "Branch Admin A cannot access unassigned global commission");

  // ── Branch A scoped rule on unassigned agent: Branch Admin A CAN access! ──
  const reqAdminABranch = { user: { id: "ba-a", role: "BRANCH_ADMIN", branchId: "branch-a" }, params: { id: "comm-unassigned-branch-a" } };
  const { res: resABranch, next: nextABranch } = mockContext();
  await commissionController.getCommission(reqAdminABranch, resABranch, nextABranch);
  assert.equal(resABranch.statusCode, 200, "Branch Admin A can access unassigned agent under branch A rule");

  // Branch Admin B CANNOT access Branch A rule on unassigned agent
  const reqAdminBBranch = { user: { id: "ba-b", role: "BRANCH_ADMIN", branchId: "branch-b" }, params: { id: "comm-unassigned-branch-a" } };
  const { res: resBBranch, next: nextBBranch } = mockContext();
  await commissionController.getCommission(reqAdminBBranch, resBBranch, nextBBranch);
  assert.equal(resBBranch.statusCode, 404);
});

test("6. Super admin retains global access for list, detail, and dispute", async () => {
  resetStore();
  store.users.set("c1", { id: "c1", role: "COUNSELOR", branchId: "branch-b" });
  store.commissions.set("comm-1", { id: "comm-1", recipientId: "c1", amount: 100, status: "PENDING" });

  const reqList = { user: { id: "sa-1", role: "SUPER_ADMIN" }, query: {} };
  const { res: resList, next: nextList } = mockContext();
  await commissionController.listCommissions(reqList, resList, nextList);
  assert.equal(resList.statusCode, 200);
  assert.equal(resList.body.data.length, 1);

  const reqDetail = { user: { id: "sa-1", role: "SUPER_ADMIN" }, params: { id: "comm-1" } };
  const { res: resDetail, next: nextDetail } = mockContext();
  await commissionController.getCommission(reqDetail, resDetail, nextDetail);
  assert.equal(resDetail.statusCode, 200);

  const reqDispute = {
    user: { id: "sa-1", role: "SUPER_ADMIN" },
    params: { id: "comm-1" },
    body: { reason: "Executive dispute review" },
  };
  const { res: resDispute, next: nextDispute } = mockContext();
  await commissionController.dispute(reqDispute, resDispute, nextDispute);
  assert.equal(resDispute.statusCode, 200);
});

test("7. Counselors and referral agents remain restricted to their own commissions on list, detail, and dispute", async () => {
  resetStore();
  store.commissions.set("comm-own", { id: "comm-own", recipientId: "counselor-1", amount: 100, status: "PENDING" });
  store.commissions.set("comm-other", { id: "comm-other", recipientId: "counselor-2", amount: 150, status: "PENDING" });

  // List: override recipientId is forced to own user id
  const reqList = { user: { id: "counselor-1", role: "COUNSELOR" }, query: { recipientId: "counselor-2" } };
  const { res: resList, next: nextList } = mockContext();
  await commissionController.listCommissions(reqList, resList, nextList);
  assert.equal(resList.statusCode, 200);
  assert.equal(resList.body.data.length, 1);
  assert.equal(resList.body.data[0].id, "comm-own");

  // Detail: access to another's commission returns 404
  const reqDetail = { user: { id: "counselor-1", role: "COUNSELOR" }, params: { id: "comm-other" } };
  const { res: resDetail, next: nextDetail } = mockContext();
  await commissionController.getCommission(reqDetail, resDetail, nextDetail);
  assert.equal(resDetail.statusCode, 404);

  // Dispute: dispute another's commission returns 404
  const reqDispute = {
    user: { id: "counselor-1", role: "COUNSELOR" },
    params: { id: "comm-other" },
    body: { reason: "Attempting dispute" },
  };
  const { res: resDispute, next: nextDispute } = mockContext();
  await commissionController.dispute(reqDispute, resDispute, nextDispute);
  assert.equal(resDispute.statusCode, 404);
});

test("8. Unsupported roles receive 403 Forbidden across all commission endpoints", async () => {
  resetStore();
  store.commissions.set("comm-1", { id: "comm-1", recipientId: "c1", amount: 100, status: "PENDING" });

  const unsupportedRoles = ["TEACHER", "STUDENT"];
  for (const role of unsupportedRoles) {
    const user = { id: `u-${role}`, role };

    const { res: resList, next: nextList } = mockContext();
    await commissionController.listCommissions({ user, query: {} }, resList, nextList);
    assert.equal(resList.statusCode, 403);

    const { res: resDetail, next: nextDetail } = mockContext();
    await commissionController.getCommission({ user, params: { id: "comm-1" } }, resDetail, nextDetail);
    assert.equal(resDetail.statusCode, 403);

    const { res: resDispute, next: nextDispute } = mockContext();
    await commissionController.dispute({ user, params: { id: "comm-1" }, body: { reason: "test" } }, resDispute, nextDispute);
    assert.equal(resDispute.statusCode, 403);
  }
});

test("9. The frontend dispute request matches backend validation ({ reason } and fallback { notes })", async () => {
  resetStore();
  store.commissions.set("comm-own", { id: "comm-own", recipientId: "counselor-1", amount: 100, status: "PENDING" });

  // Test 1: Canonical reason field
  const req1 = {
    user: { id: "counselor-1", role: "COUNSELOR" },
    params: { id: "comm-own" },
    body: { reason: "Calculation incorrect for milestone" },
  };
  const { res: res1, next: next1 } = mockContext();
  await commissionController.dispute(req1, res1, next1);
  assert.equal(res1.statusCode, 200);

  // Test 2: Notes fallback
  const req2 = {
    user: { id: "counselor-1", role: "COUNSELOR" },
    params: { id: "comm-own" },
    body: { notes: "Legacy frontend notes payload" },
  };
  const { res: res2, next: next2 } = mockContext();
  await commissionController.dispute(req2, res2, next2);
  assert.equal(res2.statusCode, 200);

  // Test 3: Missing reason/notes throws 400
  const req3 = {
    user: { id: "counselor-1", role: "COUNSELOR" },
    params: { id: "comm-own" },
    body: {},
  };
  const { res: res3, next: next3 } = mockContext();
  await commissionController.dispute(req3, res3, next3);
  assert.equal(res3.statusCode, 400);
});

test("10. Student deletion safely blocks deletion when recommendation snapshots exist", async () => {
  resetStore();
  store.students.set("stu-rec", { id: "stu-rec", firstName: "Anita", currentStage: "LEAD" });
  store.recommendationResults.set("rec-1", { id: "rec-1", recordId: "stu-rec" });

  await assert.rejects(
    async () => {
      await studentService.deleteStudent("stu-rec");
    },
    (err) => {
      assert.equal(err.code, "CANNOT_DELETE_STUDENT_WITH_DEPENDENCIES");
      assert.ok(err.message.includes("recommendation snapshot"));
      return true;
    }
  );

  assert.ok(store.students.has("stu-rec"), "Student must NOT be deleted");
});

test("11. Student deletion succeeds cleanly when 0 dependencies exist", async () => {
  resetStore();
  store.students.set("stu-empty", { id: "stu-empty", firstName: "Clean", currentStage: "LEAD" });

  const result = await studentService.deleteStudent("stu-empty");
  assert.equal(result.deleted, true);
  assert.ok(!store.students.has("stu-empty"));
});
