process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test_access_secret_minimum_64_chars_1234567890abcdef1234567890abcdef";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test_refresh_secret_minimum_64_chars_1234567890abcdef1234567890abcdef";

const test = require("node:test");
const assert = require("node:assert/strict");

// Stub ../prisma and ../services/email.service before loading payment controller/service
const prismaPath = require.resolve("../prisma");
const mockPrisma = {
  student: { findUnique: async () => null },
  payment: { findUnique: async () => null, create: async () => ({}), update: async () => ({}), delete: async () => ({}) },
  transaction: { create: async () => ({}), findMany: async () => [], update: async () => ({}) },
  $transaction: async (cb) => cb(mockPrisma),
};
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: mockPrisma };

const emailServicePath = require.resolve("../services/email.service");
let sentEmails = [];
const mockEmailService = {
  isValidEmail: (e) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()),
  sendFeeDueEmail: async (payload) => {
    sentEmails.push(payload);
    return { messageId: "mock-msg-1" };
  },
};
require.cache[emailServicePath] = { id: emailServicePath, filename: emailServicePath, loaded: true, exports: mockEmailService };

const prisma = require("../prisma");
const paymentService = require("../services/payment.service");
const paymentController = require("../controllers/payment.controller");
const paymentRoutes = require("../routes/payment.routes");

function makeStudent(branchId = "br-1", counselorId = "c-1") {
  return {
    id: "stu-1",
    firstName: "Aarav",
    lastName: "Shrestha",
    email: "aarav@example.com",
    phone: "9800000000",
    isActive: true,
    assignedCounselorId: counselorId,
    assignedCounselor: { id: counselorId, branchId },
    academicBackground: { branchId },
  };
}

function makeRes() {
  return {
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
}

test("1. FRONT_DESK can create fee for own branch, and cross-branch is denied (403)", async () => {
  const origStudentFind = prisma.student.findUnique;
  const origPayFind = prisma.payment.findUnique;
  const origTx = prisma.$transaction;

  const createdPaymentRow = {
    id: "pay-1",
    studentId: "stu-1",
    feeType: "Class Fee",
    totalAmount: 12000,
    status: "PARTIAL",
    student: makeStudent("br-1"),
    transactions: [{ id: "tx-1", amount: 4000, method: "CASH", paidAt: new Date() }],
  };

  prisma.student.findUnique = async () => makeStudent("br-1");
  prisma.payment.findUnique = async () => createdPaymentRow;
  prisma.$transaction = async (cb) =>
    cb({
      payment: {
        create: async ({ data }) => ({ id: "pay-1", ...data }),
        findUnique: async () => createdPaymentRow,
      },
      transaction: { create: async () => ({ id: "tx-1" }) },
    });

  try {
    const created = await paymentService.createPayment(
      { studentId: "stu-1", feeCategory: "Class Fee", totalAmount: 12000, paidAmount: 4000 },
      { id: "fd-1", role: "FRONT_DESK", branchId: "br-1" }
    );
    assert.equal(created.id, "pay-1");

    await assert.rejects(
      () =>
        paymentService.createPayment(
          { studentId: "stu-1", feeCategory: "Class Fee", totalAmount: 12000, paidAmount: 4000 },
          { id: "fd-2", role: "FRONT_DESK", branchId: "br-2" }
        ),
      (err) => err.statusCode === 403
    );
  } finally {
    prisma.student.findUnique = origStudentFind;
    prisma.payment.findUnique = origPayFind;
    prisma.$transaction = origTx;
  }
});

test("2. FRONT_DESK can update fee total/notes for own branch; rejects total below collected & invalid statuses", async () => {
  const origPayFind = prisma.payment.findUnique;
  const origTx = prisma.$transaction;

  const existingTx = [{ id: "tx-1", amount: 5000, method: "CASH", paidAt: new Date(), notes: "Initial" }];
  prisma.payment.findUnique = async () => ({
    id: "pay-2",
    studentId: "stu-1",
    feeType: "Tuition Fee",
    totalAmount: 10000,
    status: "PARTIAL",
    student: makeStudent("br-1"),
    transactions: existingTx,
  });

  let updatedRecord = null;
  prisma.$transaction = async (cb) =>
    cb({
      $executeRaw: async () => {},
      payment: {
        findUnique: async () => ({ id: "pay-2", totalAmount: 10000, status: "PARTIAL", transactions: existingTx }),
        update: async ({ data }) => {
          updatedRecord = data;
          return data;
        },
      },
      transaction: {
        findMany: async () => existingTx,
        update: async () => ({}),
      },
    });

  try {
    const res = await paymentService.updatePayment(
      { id: "pay-2", totalAmount: 12000, status: "DUE", notes: "Updated total" },
      { id: "fd-1", role: "FRONT_DESK", branchId: "br-1" }
    );
    assert.equal(res.id, "pay-2");
    assert.equal(updatedRecord.totalAmount, 12000);
    assert.equal(updatedRecord.status, "PARTIAL");

    // Cannot reduce total below collected 5000
    await assert.rejects(
      () =>
        paymentService.updatePayment(
          { id: "pay-2", totalAmount: 4000 },
          { id: "fd-1", role: "FRONT_DESK", branchId: "br-1" }
        ),
      (err) => err.code === "TOTAL_BELOW_COLLECTED_AMOUNT"
    );

    // Cannot reduce paidAmount below collected 5000
    await assert.rejects(
      () =>
        paymentService.updatePayment(
          { id: "pay-2", totalAmount: 10000, paidAmount: 3000 },
          { id: "fd-1", role: "FRONT_DESK", branchId: "br-1" }
        ),
      (err) => err.code === "CANNOT_REDUCE_COLLECTED_AMOUNT"
    );

    // Cannot mark COMPLETED unless full fee collected
    await assert.rejects(
      () =>
        paymentService.updatePayment(
          { id: "pay-2", totalAmount: 10000, status: "COMPLETED" },
          { id: "fd-1", role: "FRONT_DESK", branchId: "br-1" }
        ),
      (err) => err.code === "INVALID_PAYMENT_STATUS"
    );
  } finally {
    prisma.payment.findUnique = origPayFind;
    prisma.$transaction = origTx;
  }
});

test("3. updatePayment rejects PARTIAL status when zero amount is collected", async () => {
  const origPayFind = prisma.payment.findUnique;
  const origTx = prisma.$transaction;

  prisma.payment.findUnique = async () => ({
    id: "pay-zero",
    studentId: "stu-1",
    feeType: "Registration Fee",
    totalAmount: 5000,
    status: "PENDING",
    student: makeStudent("br-1"),
    transactions: [],
  });
  prisma.$transaction = async (cb) =>
    cb({
      $executeRaw: async () => {},
      payment: { findUnique: async () => ({ id: "pay-zero", totalAmount: 5000, status: "PENDING", transactions: [] }) },
      transaction: { findMany: async () => [] },
    });

  try {
    await assert.rejects(
      () =>
        paymentService.updatePayment(
          { id: "pay-zero", totalAmount: 5000, status: "PARTIAL" },
          { id: "fd-1", role: "FRONT_DESK", branchId: "br-1" }
        ),
      (err) => err.code === "INVALID_PAYMENT_STATUS"
    );
  } finally {
    prisma.payment.findUnique = origPayFind;
    prisma.$transaction = origTx;
  }
});

test("4. FRONT_DESK installment recording preserves existing transactions and blocks overpayment", async () => {
  const origPayFind = prisma.payment.findUnique;
  const origTx = prisma.$transaction;

  const initialTx = [{ id: "tx-1", amount: 4000, method: "CASH", paidAt: new Date() }];
  let appendedTx = null;
  let txUpdatedOrDeleted = false;

  prisma.payment.findUnique = async () => ({
    id: "pay-inst",
    studentId: "stu-1",
    feeType: "Class Fee",
    totalAmount: 10000,
    status: "PARTIAL",
    student: makeStudent("br-1"),
    transactions: initialTx,
  });

  prisma.$transaction = async (cb) =>
    cb({
      $executeRaw: async () => {},
      payment: {
        findUnique: async () => ({ id: "pay-inst", totalAmount: 10000, transactions: initialTx }),
        update: async () => ({}),
      },
      transaction: {
        create: async ({ data }) => {
          appendedTx = data;
          return { id: "tx-2", ...data };
        },
        findMany: async () => [...initialTx, { id: "tx-2", amount: 6000, method: "BANK_TRANSFER" }],
        update: async () => {
          txUpdatedOrDeleted = true;
        },
      },
    });

  try {
    await paymentService.addTransaction(
      { paymentId: "pay-inst", amount: 6000, paymentMethod: "Fonepay", notes: "Installment #2" },
      { id: "fd-1", role: "FRONT_DESK", branchId: "br-1" }
    );
    assert.equal(appendedTx.amount, 6000);
    assert.equal(appendedTx.method, "BANK_TRANSFER");
    assert.equal(txUpdatedOrDeleted, false);

    // Overpayment rejected
    await assert.rejects(
      () =>
        paymentService.addTransaction(
          { paymentId: "pay-inst", amount: 7000, paymentMethod: "Cash" },
          { id: "fd-1", role: "FRONT_DESK", branchId: "br-1" }
        ),
      (err) => err.code === "OVERPAYMENT_NOT_ALLOWED"
    );
  } finally {
    prisma.payment.findUnique = origPayFind;
    prisma.$transaction = origTx;
  }
});

test("5. Unauthorized roles rejected (403) and FRONT_DESK cannot delete payments", async () => {
  await assert.rejects(
    () => paymentService.deletePayment("pay-1", { id: "fd-1", role: "FRONT_DESK", branchId: "br-1" }),
    (err) => err.statusCode === 403
  );

  // Verify route middleware blocks COUNSELOR on POST /api/payments and POST /api/payments/:id/transactions
  for (const pathCheck of ["/", "/:id/transactions"]) {
    const layer = paymentRoutes.stack.find((l) => l.route && l.route.path === pathCheck && l.route.methods.post);
    const roleMiddleware = layer.route.stack[1].handle;
    let errCaptured = null;
    await roleMiddleware({ user: { id: "c-1", role: "COUNSELOR" } }, {}, (e) => {
      errCaptured = e;
    });
    assert.equal(errCaptured.statusCode, 403);
  }
});

test("6. Reminder validation: blocks zero due, invalid email, and duplicate cooldown; sends for valid FRONT_DESK request", async () => {
  const origGetById = paymentService.getPaymentById.bind(paymentService);
  sentEmails = [];

  try {
    // Zero due rejected
    paymentService.getPaymentById = async () => ({
      id: "pay-rem-0",
      studentName: "Aarav",
      studentEmail: "aarav@example.com",
      feeCategory: "Class Fee",
      dueAmount: 0,
      currency: "NPR",
      status: "FULL_PAID",
    });
    const resZero = makeRes();
    await paymentController.sendPaymentReminder({ params: { id: "pay-rem-0" }, user: { id: "fd-1", role: "FRONT_DESK", branchId: "br-1" } }, resZero);
    assert.equal(resZero.statusCode, 400);
    assert.equal(resZero.body.code, "NO_OUTSTANDING_BALANCE");

    // Invalid email rejected
    paymentService.getPaymentById = async () => ({
      id: "pay-rem-bad-email",
      studentName: "Aarav",
      studentEmail: "N/A",
      feeCategory: "Class Fee",
      dueAmount: 5000,
      currency: "NPR",
      status: "DUE",
    });
    const resBadEmail = makeRes();
    await paymentController.sendPaymentReminder({ params: { id: "pay-rem-bad-email" }, user: { id: "fd-1", role: "FRONT_DESK", branchId: "br-1" } }, resBadEmail);
    assert.equal(resBadEmail.statusCode, 400);
    assert.equal(resBadEmail.body.code, "INVALID_STUDENT_EMAIL");

    // Valid reminder sends once, second call hits 429 cooldown
    paymentService.getPaymentById = async () => ({
      id: "pay-rem-ok",
      studentName: "Aarav",
      studentEmail: "aarav@example.com",
      feeCategory: "Class Fee",
      dueAmount: 5000,
      currency: "NPR",
      status: "DUE",
    });
    const resOk = makeRes();
    await paymentController.sendPaymentReminder({ params: { id: "pay-rem-ok" }, user: { id: "fd-1", role: "FRONT_DESK", branchId: "br-1" } }, resOk);
    assert.equal(resOk.statusCode, 200);
    assert.equal(sentEmails.length, 1);

    const resDup = makeRes();
    await paymentController.sendPaymentReminder({ params: { id: "pay-rem-ok" }, user: { id: "fd-1", role: "FRONT_DESK", branchId: "br-1" } }, resDup);
    assert.equal(resDup.statusCode, 429);
    assert.equal(resDup.body.code, "REMINDER_COOLDOWN");
    assert.equal(sentEmails.length, 1);
  } finally {
    paymentService.getPaymentById = origGetById;
  }
});

test("7. Payment method mapping supports CASH, BANK_TRANSFER, CARD, CHEQUE; role matrix enforces BRANCH_ADMIN, COUNSELOR, TEACHER, STUDENT, REFERRAL_AGENT", async () => {
  const origPayFind = prisma.payment.findUnique;
  const origTx = prisma.$transaction;

  const methodsSeen = [];
  prisma.payment.findUnique = async () => ({
    id: "pay-methods",
    studentId: "stu-1",
    feeType: "Class Fee",
    totalAmount: 20000,
    status: "PARTIAL",
    student: makeStudent("br-1", "c-1"),
    transactions: [],
  });
  prisma.$transaction = async (cb) =>
    cb({
      $executeRaw: async () => {},
      payment: {
        findUnique: async () => ({ id: "pay-methods", totalAmount: 20000, transactions: [] }),
        update: async () => ({}),
      },
      transaction: {
        create: async ({ data }) => {
          methodsSeen.push(data.method);
          return { id: `tx-${methodsSeen.length}`, ...data };
        },
        findMany: async () => [],
      },
    });

  try {
    for (const inputMethod of ["Cash", "Fonepay", "Card", "Cheque"]) {
      await paymentService.addTransaction(
        { paymentId: "pay-methods", amount: 1000, paymentMethod: inputMethod },
        { id: "ba-1", role: "BRANCH_ADMIN", branchId: "br-1" }
      );
    }
    assert.deepEqual(methodsSeen, ["CASH", "BANK_TRANSFER", "CARD", "CHEQUE"]);

    // BRANCH_ADMIN cross-branch denied
    await assert.rejects(
      () =>
        paymentService.addTransaction(
          { paymentId: "pay-methods", amount: 1000, paymentMethod: "Cash" },
          { id: "ba-2", role: "BRANCH_ADMIN", branchId: "br-2" }
        ),
      (err) => err.statusCode === 403
    );

    // COUNSELOR reminder allowed for assigned student, denied for unassigned/other counselor
    const own = await paymentService.getPaymentById("pay-methods", { id: "c-1", role: "COUNSELOR" });
    assert.equal(own.id, "pay-methods");
    await assert.rejects(
      () => paymentService.getPaymentById("pay-methods", { id: "c-other", role: "COUNSELOR" }),
      (err) => err.statusCode === 403
    );

    // TEACHER, STUDENT, REFERRAL_AGENT denied
    for (const role of ["TEACHER", "STUDENT", "REFERRAL_AGENT"]) {
      await assert.rejects(
        () => paymentService.getPaymentById("pay-methods", { id: `u-${role}`, role }),
        (err) => err.statusCode === 403
      );
    }
  } finally {
    prisma.payment.findUnique = origPayFind;
    prisma.$transaction = origTx;
  }
});
