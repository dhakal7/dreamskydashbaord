const test = require("node:test");
const assert = require("node:assert/strict");

// Mock prisma client in require.cache BEFORE loading services to guarantee ZERO database contact
const mockPrisma = {
    referralAgentProfile: {
        findUnique: async () => null,
        findFirst: async () => null,
        create: async () => ({}),
    },
    user: {
        findUnique: async () => null,
        findFirst: async () => null,
        findMany: async () => [],
        create: async () => ({}),
    },
    student: {
        findFirst: async () => null,
        findUnique: async () => null,
        create: async () => ({}),
        update: async () => ({}),
    },
    pipelineStageHistory: {
        create: async () => ({}),
    },
    stageHistory: {
        create: async () => ({}),
    },
    counselorProfile: {
        create: async () => ({}),
    },
    teacherProfile: {
        create: async () => ({}),
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

// Also mock email service to prevent sending real emails
const emailPath = require.resolve("../services/email.service");
require.cache[emailPath] = {
    id: emailPath,
    filename: emailPath,
    loaded: true,
    exports: {
        sendStaffInvitationEmail: async () => ({ accepted: ["mock@example.com"] }),
        sendWelcomeStudentEmail: async () => ({ accepted: ["mock@example.com"] }),
    },
};

const userService = require("../services/user.service");
const studentService = require("../services/student.service");

test("Referral Agent: generateUniqueReferralCode generates valid REF-XXXXX format", async () => {
    let checkCalls = 0;
    const txMock = {
        referralAgentProfile: {
            findUnique: async () => {
                checkCalls++;
                return null; // No collision
            },
        },
    };

    const code = await userService.generateUniqueReferralCode(txMock);
    assert.match(code, /^REF-[A-Z0-9]{5}$/);
    assert.equal(checkCalls, 1);
});

test("Referral Agent: generateUniqueReferralCode retries on collision", async () => {
    let checkCalls = 0;
    const txMock = {
        referralAgentProfile: {
            findUnique: async () => {
                checkCalls++;
                if (checkCalls === 1) return { id: "existing-agent-1" }; // collision on 1st attempt
                return null; // unique on 2nd attempt
            },
        },
    };

    const code = await userService.generateUniqueReferralCode(txMock);
    assert.match(code, /^REF-[A-Z0-9]{5}$/);
    assert.equal(checkCalls, 2);
});

test("Referral Agent: inviteStaffUser creates ReferralAgentProfile when role is REFERRAL_AGENT", async () => {
    let createdProfileData = null;
    let createdUserData = null;

    mockPrisma.user.findUnique = async () => null; // email not taken
    mockPrisma.referralAgentProfile.findUnique = async () => null; // unique code

    mockPrisma.user.create = async ({ data, include }) => {
        createdUserData = data;
        const refCode = data.referralAgentProfile?.create?.referralCode;
        return {
            id: "user-agent-123",
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
            role: data.role,
            status: data.status,
            referralAgentProfile: refCode
                ? {
                      id: "profile-agent-123",
                      userId: "user-agent-123",
                      referralCode: refCode,
                  }
                : null,
        };
    };

    const result = await userService.inviteStaffUser({
        email: "partner.agent@example.com",
        firstName: "Partner",
        lastName: "Agent",
        role: "REFERRAL_AGENT",
        phone: "+9779800000000",
    });

    assert.equal(createdUserData.role, "REFERRAL_AGENT");
    assert.match(createdUserData.referralAgentProfile.create.referralCode, /^REF-[A-Z0-9]{5}$/);
    assert.equal(result.referralAgentProfileId, "profile-agent-123");
    assert.equal(result.referralCode, createdUserData.referralAgentProfile.create.referralCode);
});

test("Referral Agent: listReferralAgents maps profile ID to id for frontend selection", async () => {
    mockPrisma.user.findMany = async (args) => {
        assert.equal(args.where.role, "REFERRAL_AGENT");
        assert.equal(args.where.status, "ACTIVE");
        return [
            {
                id: "user-456",
                email: "agent@agency.com",
                firstName: "Jane",
                lastName: "Doe",
                phone: "+9779811111111",
                referralAgentProfile: {
                    id: "profile-789",
                    referralCode: "REF-ABC12",
                },
            },
        ];
    };

    const agents = await userService.listReferralAgents();
    assert.equal(agents.length, 1);
    assert.equal(agents[0].id, "profile-789"); // Crucial: id matches ReferralAgentProfile.id for Foreign Key
    assert.equal(agents[0].userId, "user-456");
    assert.equal(agents[0].profileId, "profile-789");
    assert.equal(agents[0].name, "Jane Doe");
    assert.equal(agents[0].referralCode, "REF-ABC12");
});

test("Referral Agent: createStudent throws 400 when invalid referredByAgentId is provided", async () => {
    mockPrisma.student.findFirst = async () => null; // email unique
    mockPrisma.referralAgentProfile.findUnique = async () => null; // agent profile does not exist

    await assert.rejects(
        async () => {
            await studentService.createStudent({
                firstName: "Test",
                lastName: "Student",
                email: "student@test.com",
                referredByAgentId: "non-existent-agent-profile-id",
            });
        },
        (err) => {
            assert.equal(err.statusCode, 400);
            assert.equal(err.code, "INVALID_REFERRAL_AGENT");
            return true;
        }
    );
});

test("Referral Agent: createStudent persists referredByAgentId when profile is valid", async () => {
    let createdStudentData = null;

    mockPrisma.student.findFirst = async () => null;
    mockPrisma.referralAgentProfile.findUnique = async ({ where }) => {
        if (where.id === "profile-valid-123") {
            return { id: "profile-valid-123", referralCode: "REF-XYZ99" };
        }
        return null;
    };

    mockPrisma.student.create = async ({ data, include }) => {
        createdStudentData = data;
        return {
            id: "student-1",
            ...data,
            referredByAgent: {
                id: data.referredByAgentId,
                referralCode: "REF-XYZ99",
                user: { id: "u-1", firstName: "Agent", lastName: "Smith", email: "smith@agency.com" },
            },
        };
    };

    const student = await studentService.createStudent({
        firstName: "Ram",
        lastName: "Sharma",
        email: "ram.sharma@example.com",
        referredByAgentId: "profile-valid-123",
        source: "referral_agent",
    });

    assert.equal(createdStudentData.referredByAgentId, "profile-valid-123");
    assert.equal(student.referredByAgent.id, "profile-valid-123");
    assert.equal(student.referredByAgent.referralCode, "REF-XYZ99");
});

test("Referral Agent: updateStudent validates referredByAgentId", async () => {
    mockPrisma.student.findUnique = async () => ({ id: "student-1", email: "existing@test.com" });
    mockPrisma.referralAgentProfile.findUnique = async () => null; // invalid profile

    await assert.rejects(
        async () => {
            await studentService.updateStudent("student-1", {
                referredByAgentId: "invalid-profile-id",
            });
        },
        (err) => {
            assert.equal(err.statusCode, 400);
            assert.equal(err.code, "INVALID_REFERRAL_AGENT");
            return true;
        }
    );
});

test("Staff/Counselor: listUsers filters by role=COUNSELOR and status", async () => {
    let capturedArgs = null;
    mockPrisma.user.findMany = async (args) => {
        capturedArgs = args;
        return [
            {
                id: "counselor-1",
                email: "counselor1@dreamsky.com",
                firstName: "Dipshikha",
                lastName: "Dawadi",
                phone: "+9779800000001",
                role: "COUNSELOR",
                status: "ACTIVE",
                counselorProfile: { id: "cp-1", specialization: "Australia" },
            },
        ];
    };

    const result = await userService.listUsers({ role: "COUNSELOR", status: "ACTIVE" });
    assert.equal(capturedArgs.where.role, "COUNSELOR");
    assert.equal(capturedArgs.where.status, "ACTIVE");
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "counselor-1");
    assert.equal(result[0].firstName, "Dipshikha");
    assert.equal(result[0].role, "COUNSELOR");
});

test("Referral Agent: updateStudent clears referredByAgentId when passed null", async () => {
    let updatedData = null;
    mockPrisma.student.findUnique = async () => ({ id: "student-1", email: "student@test.com" });
    mockPrisma.student.update = async ({ where, data }) => {
        updatedData = data;
        return { id: "student-1", ...data };
    };

    await studentService.updateStudent("student-1", {
        referredByAgentId: null,
    });

    assert.equal(updatedData.referredByAgentId, null);
});

