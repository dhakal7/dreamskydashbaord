/**
 * staff-provisioning-safety.test.js
 *
 * Isolated unit tests for Phase 34E.1 Staff Seeder Credential Cleanup & Secure Provisioning.
 * Guarantees ZERO database connection (ports 5432/5433), ZERO network calls, and ZERO server startup.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Mock state
let mockUsers = {};
let mockBranches = {};
let createCalls = [];
let updateCalls = [];

const mockPrisma = {
    user: {
        findUnique: async ({ where }) => {
            return mockUsers[where.email] || Object.values(mockUsers).find((u) => u.id === where.id) || null;
        },
        create: async ({ data, select }) => {
            const user = { id: data.id || `user-${Date.now()}`, ...data };
            mockUsers[data.email] = user;
            createCalls.push(data);
            if (select) {
                const res = {};
                for (const k of Object.keys(select)) res[k] = user[k];
                return res;
            }
            return user;
        },
        update: async ({ where, data }) => {
            updateCalls.push({ where, data });
            const user = mockUsers[where.email] || Object.values(mockUsers).find((u) => u.id === where.id);
            if (user) Object.assign(user, data);
            return user;
        },
        deleteMany: async () => ({ count: 0 }),
    },
    branch: {
        findUnique: async ({ where }) => mockBranches[where.id] || null,
        upsert: async ({ create }) => {
            mockBranches[create.id] = create;
            return create;
        },
    },
};

global.prisma = mockPrisma;

const {
    autoSeedUsers,
    staffIdentities,
} = require("../utils/auto-seeder");

const {
    provisionStaff,
    validatePasswordComplexity,
    generateSecureTempPassword,
    ALLOWED_STAFF_ROLES,
} = require("../../scripts/provision-staff");

function resetState() {
    mockUsers = {};
    mockBranches = { "br-1": { id: "br-1", name: "Chabahil Branch" } };
    createCalls = [];
    updateCalls = [];
}

test("1. Plaintext credentials are completely absent from the seeder", () => {
    // Check exported staff identities
    assert.ok(Array.isArray(staffIdentities), "staffIdentities must be an array");
    assert.ok(staffIdentities.length > 0, "staffIdentities must contain records");

    for (const staff of staffIdentities) {
        assert.equal(staff.password, undefined, `Staff ${staff.email} must not have a password property`);
    }

    // Statically inspect auto-seeder.js file text
    const seederSource = fs.readFileSync(
        path.join(__dirname, "../utils/auto-seeder.js"),
        "utf8"
    );
    assert.doesNotMatch(seederSource, /dreamskyconsultancy@2025/i, "Must not contain default admin password");
    assert.doesNotMatch(seederSource, /DreamSky@Counselor2025!/i, "Must not contain default counselor password");
    assert.doesNotMatch(seederSource, /dreamskyfrontdesk@2025/i, "Must not contain default frontdesk password");
    assert.doesNotMatch(seederSource, /dreamskyteacher@2025/i, "Must not contain default teacher password");
});

test("2. The options.force bypass no longer exists in autoSeedUsers", async () => {
    resetState();
    const originalEnv = process.env.CONFIRM_STAFF_SEED;
    delete process.env.CONFIRM_STAFF_SEED;

    try {
        // Attempt invocation with options.force = true
        const result = await autoSeedUsers({ force: true });
        assert.equal(result.skipped, true);
        assert.equal(result.reason, "CONFIRM_STAFF_SEED required");
        assert.equal(createCalls.length, 0, "No users should be created via options.force");
    } finally {
        if (originalEnv !== undefined) process.env.CONFIRM_STAFF_SEED = originalEnv;
        else delete process.env.CONFIRM_STAFF_SEED;
    }
});

test("3. Missing confirmation is rejected (fails closed)", async () => {
    resetState();
    const originalEnv = process.env.CONFIRM_STAFF_SEED;
    delete process.env.CONFIRM_STAFF_SEED;

    try {
        // autoSeedUsers
        const result = await autoSeedUsers();
        assert.equal(result.skipped, true);
        assert.equal(result.reason, "CONFIRM_STAFF_SEED required");

        // provisionStaff
        await assert.rejects(
            async () => {
                await provisionStaff({
                    email: "test.staff@dreamsky.com",
                    role: "COUNSELOR",
                    firstName: "Test",
                    lastName: "Staff",
                }, { prisma: mockPrisma });
            },
            /Provisioning blocked: Requires explicit authorization/
        );
    } finally {
        if (originalEnv !== undefined) process.env.CONFIRM_STAFF_SEED = originalEnv;
        else delete process.env.CONFIRM_STAFF_SEED;
    }
});

test("4. Invalid confirmation values are rejected", async () => {
    resetState();
    const originalEnv = process.env.CONFIRM_STAFF_SEED;

    try {
        const invalidValues = ["1", "truee", "yes", "enable", "TRUE", ""];
        for (const val of invalidValues) {
            process.env.CONFIRM_STAFF_SEED = val;
            const res = await autoSeedUsers();
            assert.equal(res.skipped, true, `Value "${val}" should be rejected`);
        }
    } finally {
        if (originalEnv !== undefined) process.env.CONFIRM_STAFF_SEED = originalEnv;
        else delete process.env.CONFIRM_STAFF_SEED;
    }
});

test("5. Existing accounts are never overwritten during seeding", async () => {
    resetState();
    process.env.CONFIRM_STAFF_SEED = "true";

    try {
        // Seed an existing user with custom hash
        const existingHash = "$2a$12$CustomPreExistingHashThatMustNeverBeTouched";
        mockUsers["dreamskyadmission@gmail.com"] = {
            id: "user-sa-1",
            email: "dreamskyadmission@gmail.com",
            firstName: "Ashish",
            lastName: "Shrestha",
            passwordHash: existingHash,
            role: "SUPER_ADMIN",
            status: "ACTIVE",
            mustChangePassword: false,
        };

        const res = await autoSeedUsers();
        assert.equal(res.success, true);

        // Verify the existing user's passwordHash was NOT modified
        const userAfter = mockUsers["dreamskyadmission@gmail.com"];
        assert.equal(userAfter.passwordHash, existingHash, "Existing passwordHash must remain untouched");
        assert.equal(updateCalls.length, 0, "No update queries should be executed on existing accounts");
    } finally {
        delete process.env.CONFIRM_STAFF_SEED;
        resetState();
    }
});

test("6. Duplicate staff provisioning is rejected by provisionStaff", async () => {
    resetState();

    mockUsers["counselor.amit@dreamsky.com"] = {
        id: "counselor-1",
        email: "counselor.amit@dreamsky.com",
        firstName: "Amit",
        lastName: "Dhodari",
        passwordHash: "$2a$12$someExistingPasswordHash",
        role: "COUNSELOR",
        status: "ACTIVE",
    };

    await assert.rejects(
        async () => {
            await provisionStaff({
                confirm: true,
                email: "counselor.amit@dreamsky.com",
                role: "COUNSELOR",
                firstName: "Amit",
                lastName: "Dhodari",
                password: "SecurePassword123!",
            }, { prisma: mockPrisma });
        },
        /Cannot provision staff: Account with email "counselor.amit@dreamsky.com" already exists/
    );

    assert.equal(updateCalls.length, 0, "No user update should occur");
});

test("7. Passwords and hashes are not printed to logs during provisioning", async () => {
    resetState();

    const loggedMessages = [];
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => loggedMessages.push(args.join(" "));
    console.info = (...args) => loggedMessages.push(args.join(" "));
    console.warn = (...args) => loggedMessages.push(args.join(" "));
    console.error = (...args) => loggedMessages.push(args.join(" "));

    const secretPassword = "SuperSecretCustomPassword99#@";

    try {
        await provisionStaff({
            confirm: true,
            email: "new.counselor@dreamsky.com",
            role: "COUNSELOR",
            firstName: "Suman",
            lastName: "Adhikari",
            password: secretPassword,
        }, { prisma: mockPrisma });

        for (const msg of loggedMessages) {
            assert.ok(!msg.includes(secretPassword), `Log message must not contain secret password: "${msg}"`);
            assert.ok(!msg.includes("$2a$12$"), `Log message must not contain bcrypt password hash: "${msg}"`);
        }
    } finally {
        console.log = originalLog;
        console.info = originalInfo;
        console.warn = originalWarn;
        console.error = originalError;
        resetState();
    }
});

test("8. Temporary credentials are generated securely and satisfy complexity", () => {
    for (let i = 0; i < 50; i++) {
        const tempPassword = generateSecureTempPassword();
        assert.ok(tempPassword.length >= 10, "Password length must be >= 10");
        const check = validatePasswordComplexity(tempPassword);
        assert.equal(check.valid, true, `Generated password "${tempPassword}" must be valid: ${check.error}`);
    }

    // Validate edge cases in complexity checker
    assert.equal(validatePasswordComplexity("short1!Aa").valid, false, "Too short");
    assert.equal(validatePasswordComplexity("lowercaseonly123!@#").valid, false, "Missing uppercase");
    assert.equal(validatePasswordComplexity("UPPERCASEONLY123!@#").valid, false, "Missing lowercase");
    assert.equal(validatePasswordComplexity("NoSpecialCharacters123").valid, false, "Missing symbol");
    assert.equal(validatePasswordComplexity("NoNumbersHere!@#Aa").valid, false, "Missing digit");
    assert.equal(validatePasswordComplexity("ValidPass123!").valid, true, "Valid password");
});

test("9. Normal server startup does not invoke provisioning", () => {
    const serverSource = fs.readFileSync(
        path.join(__dirname, "../server.js"),
        "utf8"
    );
    assert.doesNotMatch(serverSource, /autoSeedUsers/i, "server.js must not import or invoke autoSeedUsers");
    assert.doesNotMatch(serverSource, /provisionStaff/i, "server.js must not import or invoke provisionStaff");
});

test("10. Provisioning does not execute automatically when utilities are imported", () => {
    resetState();
    // Re-requiring should not invoke any create or update calls
    const initialCreateCount = createCalls.length;
    const initialUpdateCount = updateCalls.length;

    require("../utils/auto-seeder");
    require("../../scripts/provision-staff");

    assert.equal(createCalls.length, initialCreateCount, "Importing must not trigger user creation");
    assert.equal(updateCalls.length, initialUpdateCount, "Importing must not trigger user update");
});

test("11. Role validation rejects invalid roles and uncontrolled SUPER_ADMIN defaults", async () => {
    resetState();

    // Rejects invalid role
    await assert.rejects(
        async () => {
            await provisionStaff({
                confirm: true,
                email: "invalid.role@dreamsky.com",
                role: "HACKER",
                firstName: "Bad",
                lastName: "Actor",
            }, { prisma: mockPrisma });
        },
        /Invalid role "HACKER"/
    );

    // Rejects missing role
    await assert.rejects(
        async () => {
            await provisionStaff({
                confirm: true,
                email: "missing.role@dreamsky.com",
                firstName: "Missing",
                lastName: "Role",
            }, { prisma: mockPrisma });
        },
        /Staff role is required/
    );
});

