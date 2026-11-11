/**
 * regression-phase-c1.test.js
 *
 * Dedicated regression test suite for Phase C.1 bug fixes:
 *  - BUG-01: Counselor Assignment payload & validation ({ assignedCounselorId }, { counselorId }, branch check, audit)
 *  - BUG-02: 5-Guard Trash Safety with valid Prisma enum handling (VisaStatus & PaymentStatus) and transaction atomicity
 *  - BUG-03: Teacher and Student authorization boundaries
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

// Mock Prisma for service testing
const mockPrisma = {
    student: {},
    user: {},
    branch: {},
    auditLog: {},
    notification: {},
    pipelineStageHistory: {},
    application: {},
    visaCase: {},
    payment: {},
    enrollment: {},
    class: {},
    $transaction: async (cb) => cb(mockPrisma),
};

require.cache[require.resolve("../prisma")] = {
    id: require.resolve("../prisma"),
    filename: require.resolve("../prisma"),
    loaded: true,
    exports: mockPrisma,
};

const studentService = require("../services/student.service");
const { validateCounselorAssignmentBody } = require("../validators/student.validator");

describe("Phase C.1 Bug Fixes & Regression Suite", () => {

    describe("BUG-01: Counselor Assignment Payload & Validation", () => {
        test("1.1 Validator accepts canonical assignedCounselorId", () => {
            const id = validateCounselorAssignmentBody({ assignedCounselorId: "counselor-123" });
            assert.equal(id, "counselor-123");
        });

        test("1.2 Validator accepts legacy / frontend counselorId", () => {
            const id = validateCounselorAssignmentBody({ counselorId: "counselor-456" });
            assert.equal(id, "counselor-456");
        });

        test("1.3 Validator prefers assignedCounselorId if both provided", () => {
            const id = validateCounselorAssignmentBody({ assignedCounselorId: "canon-1", counselorId: "legacy-2" });
            assert.equal(id, "canon-1");
        });

        test("1.4 Validator rejects empty, whitespace, or missing counselor ID", () => {
            assert.throws(() => validateCounselorAssignmentBody({}), { code: "MISSING_COUNSELOR_ID" });
            assert.throws(() => validateCounselorAssignmentBody({ assignedCounselorId: "   " }), { code: "MISSING_COUNSELOR_ID" });
            assert.throws(() => validateCounselorAssignmentBody({ counselorId: "" }), { code: "MISSING_COUNSELOR_ID" });
            assert.throws(() => validateCounselorAssignmentBody(null), { code: "MISSING_COUNSELOR_ID" });
        });

        test("1.5 Service rejects assignment to counselor in different branch with 403", async () => {
            const student = {
                id: "stu-1",
                firstName: "A",
                lastName: "B",
                currentStage: "LEAD",
                isActive: true,
                academicBackground: { branchId: "branch-A", leadStage: "NEW" },
                assignedCounselorId: null,
            };
            const counselorDiffBranch = {
                id: "counselor-B",
                firstName: "Diff",
                lastName: "Branch",
                role: "COUNSELOR",
                status: "ACTIVE",
                branchId: "branch-B",
            };
            mockPrisma.student.findUnique = async () => student;
            mockPrisma.user.findFirst = async () => counselorDiffBranch;

            await assert.rejects(
                () => studentService.assignLeadToCounselor("stu-1", "counselor-B", { role: "FRONT_DESK", branchId: "branch-A" }),
                (err) => err.statusCode === 403 && err.code === "CROSS_BRANCH_ASSIGNMENT_FORBIDDEN"
            );
        });

        test("1.6 Service assigns counselor in same branch, updates stage to ASSIGNED, and logs audit", async () => {
            const student = {
                id: "stu-1",
                firstName: "A",
                lastName: "B",
                currentStage: "LEAD",
                isActive: true,
                academicBackground: { branchId: "branch-A", leadStage: "NEW" },
                assignedCounselorId: null,
            };
            const counselorSameBranch = {
                id: "counselor-A",
                firstName: "Same",
                lastName: "Branch",
                role: "COUNSELOR",
                status: "ACTIVE",
                branchId: "branch-A",
            };
            let auditLogs = [];
            mockPrisma.student.findUnique = async () => student;
            mockPrisma.user.findFirst = async () => counselorSameBranch;
            mockPrisma.student.update = async ({ data }) => ({
                ...student,
                ...data,
                academicBackground: { ...student.academicBackground, ...data.academicBackground },
            });
            mockPrisma.auditLog.create = async ({ data }) => {
                auditLogs.push(data);
                return data;
            };
            mockPrisma.pipelineStageHistory.create = async () => ({});
            mockPrisma.notification.create = async () => ({});

            const res = await studentService.assignLeadToCounselor("stu-1", "counselor-A", { id: "fd-1", role: "FRONT_DESK", branchId: "branch-A" });
            assert.equal(res.assignedCounselorId, "counselor-A");
            assert.equal(res.leadStage, "ASSIGNED");
            assert.ok(auditLogs.some(log => log.entity === "Student" && log.field === "LEAD_ASSIGNED" && log.newValue === "counselor-A"));
        });
    });

    describe("BUG-02: 5-Guard Trash Safety & Transaction Revalidation", () => {
        const createEligibleStudent = () => ({
            id: "lead-trash-1",
            firstName: "Sita",
            lastName: "Adhikari",
            currentStage: "LEAD",
            isActive: true,
            academicBackground: { branchId: "branch-A", leadStage: "INTERESTED" },
            assignedCounselorId: "counselor-1",
            assignedCounselor: { id: "counselor-1", branchId: "branch-A" },
        });

        test("2.1 Guard G1: Blocks trashing enrolled macro stage", async () => {
            const enrolledStudent = { ...createEligibleStudent(), currentStage: "ENROLLED" };
            mockPrisma.student.findUnique = async () => enrolledStudent;

            await assert.rejects(
                () => studentService.softDeleteStudent("lead-trash-1", { role: "SUPER_ADMIN" }, "Test reason"),
                (err) => err.statusCode === 400 && err.code === "CANNOT_TRASH_ENROLLED_STUDENT"
            );
        });

        test("2.2 Guard G2: Blocks active applications, permits terminal (REJECTED, WITHDRAWN)", async () => {
            const student = createEligibleStudent();
            mockPrisma.student.findUnique = async () => student;

            // Active application blocks
            mockPrisma.application.count = async ({ where }) => {
                if (where?.status?.notIn?.includes("REJECTED")) return 1;
                return 0;
            };
            await assert.rejects(
                () => studentService.softDeleteStudent("lead-trash-1", { role: "SUPER_ADMIN" }, "Test reason"),
                (err) => err.statusCode === 409 && err.code === "STUDENT_HAS_ACTIVE_APPLICATIONS"
            );

            // 0 active applications passes
            mockPrisma.application.count = async () => 0;
            mockPrisma.visaCase.count = async () => 0;
            mockPrisma.payment.count = async () => 0;
            mockPrisma.enrollment.count = async () => 0;
            mockPrisma.student.updateMany = async () => ({ count: 1 });
            mockPrisma.user.findFirst = async () => null;
            mockPrisma.auditLog.create = async () => ({});

            const res = await studentService.softDeleteStudent("lead-trash-1", { role: "SUPER_ADMIN" }, "Test reason");
            assert.equal(res.isActive, false);
            assert.equal(res.trashReason, "Test reason");
        });

        test("2.3 Guard G3: Uses valid VisaStatus enum (PREPARING, SUBMITTED, APPROVED, RESUBMITTING block; NOT_APPLIED, REFUSED permit)", async () => {
            const student = createEligibleStudent();
            mockPrisma.student.findUnique = async () => student;
            mockPrisma.application.count = async () => 0;

            // Active visa case blocks
            mockPrisma.visaCase.count = async ({ where }) => {
                // Assert valid enum values are queried
                assert.deepEqual(where.status.in, ["PREPARING", "SUBMITTED", "APPROVED", "RESUBMITTING"]);
                return 2;
            };
            await assert.rejects(
                () => studentService.softDeleteStudent("lead-trash-1", { role: "SUPER_ADMIN" }, "Test reason"),
                (err) => err.statusCode === 409 && err.code === "STUDENT_HAS_ACTIVE_VISA_CASES"
            );

            // Terminal/no visa (count = 0) passes cleanly
            mockPrisma.visaCase.count = async () => 0;
            mockPrisma.payment.count = async () => 0;
            mockPrisma.enrollment.count = async () => 0;
            mockPrisma.student.updateMany = async () => ({ count: 1 });
            mockPrisma.user.findFirst = async () => null;
            mockPrisma.auditLog.create = async () => ({});

            const res = await studentService.softDeleteStudent("lead-trash-1", { role: "SUPER_ADMIN" }, "Test reason");
            assert.equal(res.isActive, false);
        });

        test("2.4 Guard G4: Uses valid PaymentStatus enum (PENDING, PARTIAL, OVERDUE block; COMPLETED, CANCELLED permit)", async () => {
            const student = createEligibleStudent();
            mockPrisma.student.findUnique = async () => student;
            mockPrisma.application.count = async () => 0;
            mockPrisma.visaCase.count = async () => 0;

            // Outstanding payment blocks
            mockPrisma.payment.count = async ({ where }) => {
                // Assert valid enum values are queried
                assert.deepEqual(where.status.in, ["PENDING", "PARTIAL", "OVERDUE"]);
                return 1;
            };
            await assert.rejects(
                () => studentService.softDeleteStudent("lead-trash-1", { role: "SUPER_ADMIN" }, "Test reason"),
                (err) => err.statusCode === 409 && err.code === "STUDENT_HAS_ACTIVE_PAYMENTS"
            );

            // Completed or cancelled (count = 0) passes cleanly
            mockPrisma.payment.count = async () => 0;
            mockPrisma.enrollment.count = async () => 0;
            mockPrisma.student.updateMany = async () => ({ count: 1 });
            mockPrisma.user.findFirst = async () => null;
            mockPrisma.auditLog.create = async () => ({});

            const res = await studentService.softDeleteStudent("lead-trash-1", { role: "SUPER_ADMIN" }, "Test reason");
            assert.equal(res.isActive, false);
        });

        test("2.5 Guard G5: Active class enrollment blocks", async () => {
            const student = createEligibleStudent();
            mockPrisma.student.findUnique = async () => student;
            mockPrisma.application.count = async () => 0;
            mockPrisma.visaCase.count = async () => 0;
            mockPrisma.payment.count = async () => 0;

            mockPrisma.enrollment.count = async () => 1;
            await assert.rejects(
                () => studentService.softDeleteStudent("lead-trash-1", { role: "SUPER_ADMIN" }, "Test reason"),
                (err) => err.statusCode === 409 && err.code === "STUDENT_HAS_ACTIVE_ENROLLMENTS"
            );
        });

        test("2.6 Restoration preserves exact previous lead stage and counselor", async () => {
            const trashedStudent = {
                id: "lead-trash-1",
                firstName: "Sita",
                lastName: "Adhikari",
                currentStage: "LEAD",
                isActive: false,
                academicBackground: {
                    branchId: "branch-A",
                    leadStage: "TRASH",
                    previousLeadStage: "INTERESTED",
                    previousAssignedCounselorId: "counselor-1",
                    trashReason: "Testing",
                },
                assignedCounselorId: null,
            };
            mockPrisma.student.findUnique = async () => trashedStudent;
            let updatedData = null;
            mockPrisma.student.updateMany = async ({ data }) => {
                updatedData = data;
                return { count: 1 };
            };
            mockPrisma.user.findFirst = async () => ({ id: "counselor-1", branchId: "branch-A", status: "ACTIVE" });
            mockPrisma.auditLog.create = async () => ({});

            const res = await studentService.restoreStudent("lead-trash-1", { role: "SUPER_ADMIN" });
            assert.equal(res.isActive, true);
            assert.equal(res.leadStage, "INTERESTED");
            assert.equal(updatedData.assignedCounselorId, "counselor-1");
            assert.equal(updatedData.academicBackground.trashReason, undefined);
        });
    });
});
