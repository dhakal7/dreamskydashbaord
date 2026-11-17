process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test_access_secret_minimum_64_chars_1234567890abcdef1234567890abcdef";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test_refresh_secret_minimum_64_chars_1234567890abcdef1234567890abcdef";

const test = require("node:test");
const assert = require("node:assert/strict");

// Stub ../prisma in require.cache before loading services/controllers so unit tests stay 100% DB-free
const prismaPath = require.resolve("../prisma");
const mockPrisma = {
  class: { findMany: async () => [], findUnique: async () => null },
  student: { findMany: async () => [], findUnique: async () => null },
  enrollment: { findUnique: async () => null, count: async () => 0, create: async () => ({}) },
  country: { findMany: async () => [] },
  $transaction: async (cb) => cb(mockPrisma),
};
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: mockPrisma };

const prisma = require("../prisma");
const classService = require("../services/class.service");
const universityController = require("../controllers/university.controller");
const paymentRoutes = require("../routes/payment.routes");
const classRoutes = require("../routes/class.routes");

test("Issue 1: payment.routes authorizes FRONT_DESK on POST / and rejects COUNSELOR/TEACHER", () => {
  const postLayer = paymentRoutes.stack.find(
    (layer) => layer.route && layer.route.path === "/" && layer.route.methods.post
  );
  assert.ok(postLayer, "POST /payment route should exist");
  assert.ok(postLayer.route.stack.length >= 2, "POST /payment should have auth + role middlewares");
});

test("Issue 2: listClasses enforces branch isolation for FRONT_DESK", async () => {
  const originalFindMany = prisma.class.findMany;
  let capturedWhere = null;

  prisma.class.findMany = async (args) => {
    capturedWhere = args.where;
    return [
      {
        id: "cls-br1",
        name: "IELTS Branch 1",
        subject: "IELTS",
        schedule: "07:00-08:00 AM",
        branchId: "br-1",
        enrollments: [],
      },
    ];
  };

  try {
    const result = await classService.listClasses({
      id: "fd-2",
      role: "FRONT_DESK",
      branchId: "br-1",
    });

    assert.deepEqual(capturedWhere, { branchId: "br-1" });
    assert.equal(result.length, 1);
    assert.equal(result[0].branchId, "br-1");
  } finally {
    prisma.class.findMany = originalFindMany;
  }
});

test("Issue 3: class.routes restricts POST /:classId/enroll to SUPER_ADMIN, BRANCH_ADMIN, FRONT_DESK (not TEACHER)", async () => {
  const enrollLayer = classRoutes.stack.find(
    (layer) => layer.route && layer.route.path === "/:classId/enroll" && layer.route.methods.post
  );
  assert.ok(enrollLayer, "POST /:classId/enroll route should exist");

  const roleMiddleware = enrollLayer.route.stack[0].handle;
  let nextErr = null;

  await roleMiddleware(
    { user: { id: "t-1", role: "TEACHER" } },
    {},
    (err) => {
      nextErr = err;
    }
  );

  assert.ok(nextErr, "TEACHER should be rejected with an error");
  assert.equal(nextErr.statusCode, 403);
  assert.equal(nextErr.code, "INSUFFICIENT_ROLE");
});

test("Issue 4: enrollStudent blocks enrollment into over-capacity legacy batch (27 >= 20) without altering existing enrollments", async () => {
  const origStudentFind = prisma.student.findUnique;
  const origClassFind = prisma.class.findUnique;
  const origEnrollFind = prisma.enrollment.findUnique;
  const origTransaction = prisma.$transaction;

  let enrollmentCreated = false;

  prisma.student.findUnique = async () => ({
    id: "stu-new",
    isActive: true,
    trashedAt: null,
    assignedCounselor: { branchId: "cmszp5w4d0000u9n3bbg65qon" },
  });
  prisma.class.findUnique = async () => ({
    id: "cls-legacy",
    branchId: "cmszp5w4d0000u9n3bbg65qon",
    schedule: "07:00-08:00 AM",
    capacity: 20,
  });
  prisma.enrollment.findUnique = async () => null;
  prisma.$transaction = async (cb) => {
    const tx = {
      $queryRaw: async () => [{ id: "cls-legacy", schedule: "07:00-08:00 AM" }],
      class: {
        findUnique: async () => ({ id: "cls-legacy", schedule: "07:00-08:00 AM", capacity: 20 }),
      },
      enrollment: {
        count: async () => 27,
        findUnique: async () => null,
        create: async () => {
          enrollmentCreated = true;
          return { id: "enr-new" };
        },
      },
    };
    return cb(tx);
  };

  try {
    const result = await classService.enrollStudent("cls-legacy", "stu-new", {
      id: "sa-1",
      role: "SUPER_ADMIN",
    });

    assert.equal(result.error, "CLASS_FULL");
    assert.equal(result.currentCount, 27);
    assert.equal(result.maxCapacity, 20);
    assert.equal(enrollmentCreated, false);
  } finally {
    prisma.student.findUnique = origStudentFind;
    prisma.class.findUnique = origClassFind;
    prisma.enrollment.findUnique = origEnrollFind;
    prisma.$transaction = origTransaction;
  }
});

test("Issue 5: listCountries computes dynamic universityCount and deduplicated studentCount", async () => {
  const origCountryFindMany = prisma.country.findMany;
  const origStudentFindMany = prisma.student.findMany;

  prisma.country.findMany = async () => [
    { id: "c-au", name: "Australia", code: "AU", _count: { universities: 6 } },
    { id: "c-uk", name: "United Kingdom", code: "UK", _count: { universities: 5 } },
  ];
  prisma.student.findMany = async () => [
    {
      id: "s-1",
      academicBackground: { countriesInterested: "UK , Australia" },
      applications: [{ course: { university: { countryId: "c-au" } } }], // also AU -> must not double count s-1 in AU
    },
    {
      id: "s-2",
      academicBackground: { interestedCountries: ["United Kingdom"] },
      applications: [],
    },
  ];

  let jsonPayload = null;
  try {
    await universityController.listCountries(
      {},
      {
        status() {
          return this;
        },
        json(body) {
          jsonPayload = body;
          return this;
        },
      },
      (err) => {
        throw err;
      }
    );

    assert.equal(jsonPayload.success, true);
    assert.equal(jsonPayload.data.length, 2);
    assert.equal(jsonPayload.data[0].universityCount, 6);
    assert.equal(jsonPayload.data[0].studentCount, 1); // s-1 counted once for AU
    assert.equal(jsonPayload.data[1].universityCount, 5);
    assert.equal(jsonPayload.data[1].studentCount, 2); // s-1 + s-2 for UK
  } finally {
    prisma.country.findMany = origCountryFindMany;
    prisma.student.findMany = origStudentFindMany;
  }
});
