/**
 * auth-backdoor-safety.test.js
 *
 * Isolated unit tests verifying that the teacher backdoor bypass in
 * src/services/auth.service.js is completely eliminated (Fix A).
 * Guarantees zero real database connections and zero network dispatches.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

// In-memory mock database state
let mockUsers = {};
let mockRefreshTokens = {};

const mockPrisma = {
    user: {
        findUnique: async ({ where }) => {
            if (where.email) return mockUsers[where.email] || null;
            if (where.id) return Object.values(mockUsers).find((u) => u.id === where.id) || null;
            return null;
        },
        update: async ({ where, data }) => {
            const user = Object.values(mockUsers).find((u) => u.id === where.id);
            if (user) Object.assign(user, data);
            return user;
        },
    },
    refreshToken: {
        deleteMany: async () => ({ count: 0 }),
        create: async ({ data }) => {
            mockRefreshTokens[data.userId] = data;
            return data;
        },
    },
    student: {
        findUnique: async () => null,
    },
};

global.prisma = mockPrisma;

const { login } = require("../services/auth.service");

test("Fix A: Teacher account rejects old hardcoded backdoor password 'Password123!' when hash does not match", async () => {
    // Generate actual hash for a legitimate random password
    const legitPasswordHash = await bcrypt.hash("ProperTeacherSecret2026#", 10);

    mockUsers["teacher@dreamsky.internal"] = {
        id: "teacher-1",
        email: "teacher@dreamsky.internal",
        firstName: "EPT",
        lastName: "Instructor",
        passwordHash: legitPasswordHash,
        role: "TEACHER",
        status: "ACTIVE",
        branchId: "br-1",
    };

    // Attempt login with old hardcoded backdoor password
    await assert.rejects(
        async () => {
            await login({
                email: "teacher@dreamsky.internal",
                password: "Password123!",
            });
        },
        (err) => {
            assert.equal(err.code, "INVALID_CREDENTIALS");
            assert.equal(err.statusCode, 401);
            return true;
        }
    );
});

test("Fix A: Teacher account rejects hardcoded default 'dreamskyteacher@2025' when changed in database", async () => {
    const customPasswordHash = await bcrypt.hash("StaffCustomizedPassword99!", 10);

    mockUsers["teacher@dreamsky.internal"] = {
        id: "teacher-1",
        email: "teacher@dreamsky.internal",
        firstName: "EPT",
        lastName: "Instructor",
        passwordHash: customPasswordHash,
        role: "TEACHER",
        status: "ACTIVE",
        branchId: "br-1",
    };

    // Attempt login with default initial password
    await assert.rejects(
        async () => {
            await login({
                email: "teacher@dreamsky.internal",
                password: "dreamskyteacher@2025",
            });
        },
        (err) => {
            assert.equal(err.code, "INVALID_CREDENTIALS");
            assert.equal(err.statusCode, 401);
            return true;
        }
    );
});

test("Fix A: Teacher account authenticates successfully with correct bcrypt password", async () => {
    const validPassword = "CorrectTeacherPassword2026!";
    const legitPasswordHash = await bcrypt.hash(validPassword, 10);

    mockUsers["teacher@dreamsky.internal"] = {
        id: "teacher-1",
        email: "teacher@dreamsky.internal",
        firstName: "EPT",
        lastName: "Instructor",
        passwordHash: legitPasswordHash,
        role: "TEACHER",
        status: "ACTIVE",
        branchId: "br-1",
    };

    const res = await login({
        email: "teacher@dreamsky.internal",
        password: validPassword,
    });

    assert.ok(res.accessToken, "Should generate access token");
    assert.ok(res.refreshToken, "Should generate refresh token");
    assert.equal(res.user.email, "teacher@dreamsky.internal");
    assert.equal(res.user.role, "TEACHER");
});
