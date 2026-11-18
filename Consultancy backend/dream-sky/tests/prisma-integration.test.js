const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../src/prisma");
const { getSslConfig, getClient, isLoopbackHost, isUnixSocket } = require("../src/prisma");

describe("Prisma Proxy and Integration Verification", () => {
    describe("1. Transparent Model and Delegate Access", () => {
        test("prisma.student is a valid Prisma model delegate with standard operations", () => {
            assert.ok(prisma.student, "prisma.student must be defined");
            assert.equal(typeof prisma.student.findMany, "function");
            assert.equal(typeof prisma.student.findUnique, "function");
            assert.equal(typeof prisma.student.create, "function");
            assert.equal(typeof prisma.student.update, "function");
            assert.equal(typeof prisma.student.delete, "function");
            assert.equal(typeof prisma.student.count, "function");
        });

        test("prisma.user is a valid Prisma model delegate with standard operations", () => {
            assert.ok(prisma.user, "prisma.user must be defined");
            assert.equal(typeof prisma.user.findMany, "function");
            assert.equal(typeof prisma.user.findUnique, "function");
            assert.equal(typeof prisma.user.create, "function");
        });

        test("all core CRM model delegates are accessible via proxy", () => {
            const expectedDelegates = [
                "application",
                "appointment",
                "attendanceRecord",
                "auditLog",
                "branch",
                "class",
                "classContent",
                "commission",
                "commissionRule",
                "communicationLog",
                "counselorProfile",
                "country",
                "course",
                "document",
                "documentVersion",
                "enrollment",
                "event",
                "eventReminder",
                "notification",
                "notificationTemplate",
                "offer",
                "partnerConsultancy",
                "payment",
                "pipelineStageHistory",
                "publicInquiry",
                "recommendationResult",
                "referralAgentProfile",
                "refreshToken",
                "student",
                "teacherProfile",
                "testScore",
                "transaction",
                "university",
                "user",
                "visaCase"
            ];

            for (const delegateName of expectedDelegates) {
                assert.ok(
                    prisma[delegateName],
                    `Model delegate 'prisma.${delegateName}' must be accessible through the proxy`
                );
                assert.equal(
                    typeof prisma[delegateName].findMany,
                    "function",
                    `'prisma.${delegateName}.findMany' must be a callable query function`
                );
            }
        });
    });

    describe("2. Prisma Core Methods and Transaction Handling", () => {
        test("prisma.$transaction is a function bound to the PrismaClient instance", () => {
            assert.equal(typeof prisma.$transaction, "function");
        });

        test("prisma.$connect and prisma.$disconnect are callable functions", () => {
            assert.equal(typeof prisma.$connect, "function");
            assert.equal(typeof prisma.$disconnect, "function");
        });

        test("prisma.$queryRaw and prisma.$executeRaw are callable functions", () => {
            assert.equal(typeof prisma.$queryRaw, "function");
            assert.equal(typeof prisma.$executeRaw, "function");
        });

        test("proxy correctly supports 'in' operator for model delegates and methods", () => {
            assert.ok("student" in prisma);
            assert.ok("user" in prisma);
            assert.ok("$transaction" in prisma);
            assert.ok("$connect" in prisma);
            assert.ok("$disconnect" in prisma);
        });

        test("proxy is not treated as a thenable/Promise", () => {
            assert.equal(prisma.then, undefined);
        });
    });

    describe("3. Helper Function Export Isolation (No Collision with Models)", () => {
        test("exported helpers are functions and do not shadow any Prisma model", () => {
            assert.equal(typeof getSslConfig, "function");
            assert.equal(typeof getClient, "function");
            assert.equal(typeof isLoopbackHost, "function");
            assert.equal(typeof isUnixSocket, "function");

            assert.equal(typeof prisma.getSslConfig, "function");
            assert.equal(typeof prisma.getClient, "function");
            assert.equal(typeof prisma.isLoopbackHost, "function");
            assert.equal(typeof prisma.isUnixSocket, "function");

            // Ensure none of the helper names correspond to Prisma models
            const helperNames = ["getSslConfig", "getClient", "isLoopbackHost", "isUnixSocket"];
            for (const name of helperNames) {
                assert.equal(
                    prisma[name].findMany,
                    undefined,
                    `Helper '${name}' must not shadow or act as a model delegate`
                );
            }
        });
    });

    describe("4. Singleton Reuse and Initialization Stability", () => {
        test("repeated model accesses return the identical model delegate instance", () => {
            const studentRef1 = prisma.student;
            const studentRef2 = prisma.student;
            const userRef1 = prisma.user;
            const userRef2 = prisma.user;

            assert.strictEqual(studentRef1, studentRef2, "Model delegate must be cached and identical");
            assert.strictEqual(userRef1, userRef2, "User delegate must be cached and identical");
        });

        test("globalForPrisma caches the PrismaClient in non-production", () => {
            assert.ok(global.prisma, "global.prisma must be populated in non-production environments");
        });
    });

    describe("5. pg.Pool and SSL Settings Wiring", () => {
        test("getClient correctly initializes PrismaClient with Pg adapter without throwing", () => {
            const client = getClient();
            assert.ok(client, "getClient() must return a valid PrismaClient");
            assert.ok(client.student, "client must have student delegate");
            assert.equal(typeof client.$transaction, "function");
        });
    });
});
