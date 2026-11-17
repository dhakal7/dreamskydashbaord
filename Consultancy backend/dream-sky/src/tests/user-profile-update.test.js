const test = require("node:test");
const assert = require("node:assert/strict");

// Stub ../prisma before importing services so NODE_ENV=test never triggers real DB config validation
const prismaPath = require.resolve("../prisma");
const mockPrisma = {
    user: {
        findUnique: async () => null,
        update: async () => null,
    },
};
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: mockPrisma };

const prisma = require("../prisma");
const authService = require("../services/auth.service");
const userService = require("../services/user.service");
const { validateUpdateMe } = require("../validators/auth.validator");

test("validateUpdateMe rejects empty payload and invalid email", () => {
    assert.throws(() => validateUpdateMe({}), { statusCode: 400 });
    assert.throws(() => validateUpdateMe({ email: "not-an-email" }), { statusCode: 400 });
    assert.throws(() => validateUpdateMe({ name: "   " }), { statusCode: 400 });
});

test("authService.updateMe updates name, email, and phone and rejects duplicate email", async () => {
    const origFindUnique = prisma.user.findUnique;
    const origUpdate = prisma.user.update;

    try {
        // 1. Successful update
        prisma.user.findUnique = async ({ where }) => {
            if (where.id === "user-1") {
                return {
                    id: "user-1",
                    email: "old@dreamsky.com",
                    firstName: "Old",
                    lastName: "Name",
                    phone: null,
                    role: "COUNSELOR",
                    status: "ACTIVE",
                };
            }
            if (where.email === "new@dreamsky.com") return null;
            if (where.email === "taken@dreamsky.com") return { id: "user-2", email: "taken@dreamsky.com" };
            return null;
        };

        let capturedUpdateData = null;
        prisma.user.update = async ({ data }) => {
            capturedUpdateData = data;
            return {
                id: "user-1",
                email: data.email ?? "old@dreamsky.com",
                firstName: data.firstName ?? "Old",
                lastName: data.lastName ?? "Name",
                phone: data.phone ?? null,
                role: "COUNSELOR",
                status: "ACTIVE",
                branchId: null,
                branch: null,
                mustChangePassword: false,
                studentId: null,
                referralAgentProfile: null,
            };
        };

        const updated = await authService.updateMe("user-1", {
            name: "New Full Name",
            email: "NEW@dreamsky.com ",
            phone: " +977 9800000000 ",
        });

        assert.equal(capturedUpdateData.firstName, "New");
        assert.equal(capturedUpdateData.lastName, "Full Name");
        assert.equal(capturedUpdateData.email, "new@dreamsky.com");
        assert.equal(capturedUpdateData.phone, "+977 9800000000");
        assert.equal(updated.email, "new@dreamsky.com");
        assert.equal(updated.phone, "+977 9800000000");

        // 2. Duplicate email conflict
        await assert.rejects(
            () => authService.updateMe("user-1", { email: "taken@dreamsky.com" }),
            (err) => err.statusCode === 409 && err.code === "EMAIL_EXISTS"
        );
    } finally {
        prisma.user.findUnique = origFindUnique;
        prisma.user.update = origUpdate;
    }
});

test("userService.updateUserProfile enforces RBAC and persists email/phone with audit log", async () => {
    const origTransaction = prisma.$transaction;

    try {
        const auditLogsCreated = [];
        prisma.$transaction = async (fn) => {
            const tx = {
                user: {
                    findUnique: async ({ where }) => {
                        if (where.id === "target-1") {
                            return {
                                id: "target-1",
                                email: "staff@dreamsky.com",
                                firstName: "Staff",
                                lastName: "User",
                                phone: null,
                                role: "COUNSELOR",
                                status: "ACTIVE",
                                branchId: "branch-1",
                            };
                        }
                        if (where.id === "sa-1") {
                            return { id: "sa-1", role: "SUPER_ADMIN", status: "ACTIVE", branchId: null };
                        }
                        if (where.id === "ba-other") {
                            return { id: "ba-other", role: "BRANCH_ADMIN", status: "ACTIVE", branchId: "branch-2" };
                        }
                        if (where.email) return null;
                        return null;
                    },
                    update: async ({ data }) => ({
                        id: "target-1",
                        email: data.email ?? "staff@dreamsky.com",
                        firstName: data.firstName ?? "Staff",
                        lastName: data.lastName ?? "User",
                        phone: data.phone ?? null,
                        role: "COUNSELOR",
                        status: "ACTIVE",
                        branchId: "branch-1",
                    }),
                },
                auditLog: {
                    createMany: async ({ data }) => {
                        auditLogsCreated.push(...data);
                    },
                },
            };
            return fn(tx);
        };

        // Branch admin from another branch is forbidden
        await assert.rejects(
            () =>
                userService.updateUserProfile(
                    "target-1",
                    { email: "updated@dreamsky.com" },
                    { userId: "ba-other", role: "BRANCH_ADMIN", branchId: "branch-2" }
                ),
            (err) => err.statusCode === 403
        );

        // Super admin succeeds and writes audit logs
        const res = await userService.updateUserProfile(
            "target-1",
            { email: "updated@dreamsky.com", phone: "9801234567" },
            { userId: "sa-1", role: "SUPER_ADMIN", branchId: null }
        );

        assert.equal(res.email, "updated@dreamsky.com");
        assert.equal(res.phone, "9801234567");
        assert.equal(auditLogsCreated.length, 2);
    } finally {
        prisma.$transaction = origTransaction;
    }
});
