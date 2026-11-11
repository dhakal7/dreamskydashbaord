const test = require("node:test");
const assert = require("node:assert/strict");

// ── 1. In-Memory Store & Prisma Mock ──────────────────────────────────────────
// Guarantees ZERO connection to dreamsky_db or any live database.

const store = {
    users: new Map(),
    students: new Map(),
    pipelineStageHistories: [],
    auditLogs: [],
};

const sentEmails = [];

const resetStore = () => {
    store.users.clear();
    store.students.clear();
    store.pipelineStageHistories.length = 0;
    store.auditLogs.length = 0;
    sentEmails.length = 0;

    // Seed mock staff users (Strictly fake fixture emails)
    store.users.set("user-sa-1", {
        id: "user-sa-1",
        email: "superadmin@mockdomain.internal",
        passwordHash: "ORIGINAL_SUPERADMIN_HASH",
        firstName: "Super",
        lastName: "Admin",
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        mustChangePassword: false,
        studentId: null,
    });

    store.users.set("user-ba-1", {
        id: "user-ba-1",
        email: "branchadmin@mockdomain.internal",
        passwordHash: "ORIGINAL_BRANCHADMIN_HASH",
        firstName: "Branch",
        lastName: "Admin",
        role: "BRANCH_ADMIN",
        status: "ACTIVE",
        mustChangePassword: false,
        studentId: null,
    });

    store.users.set("user-cn-1", {
        id: "user-cn-1",
        email: "counselor@mockdomain.internal",
        passwordHash: "ORIGINAL_COUNSELOR_HASH",
        firstName: "Counselor",
        lastName: "User",
        role: "COUNSELOR",
        status: "ACTIVE",
        mustChangePassword: false,
        studentId: null,
    });

    store.users.set("user-fd-1", {
        id: "user-fd-1",
        email: "frontdesk@mockdomain.internal",
        passwordHash: "ORIGINAL_FRONTDESK_HASH",
        firstName: "Front",
        lastName: "Desk",
        role: "FRONT_DESK",
        status: "ACTIVE",
        mustChangePassword: false,
        studentId: null,
    });
};

const mockPrisma = {
    user: {
        findUnique: async ({ where }) => {
            if (where.id) return store.users.get(where.id) || null;
            if (where.email) {
                const normalized = where.email.toLowerCase().trim();
                for (const u of store.users.values()) {
                    if (u.email.toLowerCase().trim() === normalized) return { ...u };
                }
            }
            return null;
        },
        findFirst: async ({ where }) => {
            if (where.studentId) {
                for (const u of store.users.values()) {
                    if (u.studentId === where.studentId) return { ...u };
                }
            }
            if (where.email) {
                const normalized = where.email.toLowerCase().trim();
                for (const u of store.users.values()) {
                    if (u.email.toLowerCase().trim() === normalized) return { ...u };
                }
            }
            return null;
        },
        create: async ({ data }) => {
            const id = data.id || `user-gen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const user = { id, ...data };
            store.users.set(id, user);
            return { ...user };
        },
        update: async ({ where, data }) => {
            const existing = store.users.get(where.id);
            if (!existing) throw new Error(`User ${where.id} not found`);
            const updated = { ...existing, ...data };
            store.users.set(where.id, updated);
            return { ...updated };
        },
    },
    student: {
        findUnique: async ({ where }) => {
            if (where.id) return store.students.get(where.id) || null;
            if (where.email) {
                const normalized = where.email.toLowerCase().trim();
                for (const s of store.students.values()) {
                    if (s.email && s.email.toLowerCase().trim() === normalized) return { ...s };
                }
            }
            return null;
        },
        findFirst: async ({ where }) => {
            if (where.email) {
                const normalized = where.email.toLowerCase().trim();
                for (const s of store.students.values()) {
                    if (s.email && s.email.toLowerCase().trim() === normalized) {
                        if (where.NOT && where.NOT.id && s.id === where.NOT.id) continue;
                        return { ...s };
                    }
                }
            }
            return null;
        },
        create: async ({ data }) => {
            const id = data.id || `stu-gen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const student = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
            store.students.set(id, student);
            return { ...student };
        },
        update: async ({ where, data }) => {
            const existing = store.students.get(where.id);
            if (!existing) throw new Error(`Student ${where.id} not found`);
            const updated = { ...existing, ...data, updatedAt: new Date() };
            store.students.set(where.id, updated);
            return { ...updated };
        },
    },
    pipelineStageHistory: {
        create: async ({ data }) => {
            const id = `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const hist = { id, ...data, changedAt: new Date() };
            store.pipelineStageHistories.push(hist);
            return { ...hist };
        },
    },
    partnerConsultancy: {
        upsert: async ({ create }) => ({ id: "partner-1", ...create }),
    },
    referralAgentProfile: {
        findUnique: async () => null,
    },
    $transaction: async (arg) => {
        if (Array.isArray(arg)) {
            return Promise.all(arg);
        }
        return arg(mockPrisma);
    },
};

// ── 2. Intercept require.cache for prisma & email.service ─────────────────────
const prismaPath = require.resolve("../prisma");
require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: mockPrisma,
};

const emailServicePath = require.resolve("../services/email.service");
const mockEmailService = {
    isValidEmail: (email) => {
        if (!email || typeof email !== "string") return false;
        const trimmed = email.trim().toLowerCase();
        return trimmed.includes("@") && trimmed.includes(".");
    },
    sendWelcomeStudentEmail: async (payload) => {
        sentEmails.push(payload);
        return { success: true, messageId: `msg-${Date.now()}` };
    },
};
require.cache[emailServicePath] = {
    id: emailServicePath,
    filename: emailServicePath,
    loaded: true,
    exports: mockEmailService,
};

// ── 3. Import student.service AFTER mocks are installed ───────────────────────
const studentService = require("../services/student.service");
const AppError = require("../utils/apiError");

// ── 4. Regression Test Suite ──────────────────────────────────────────────────

test("1. Matching an existing SUPER_ADMIN email rejects provisioning with 409", async () => {
    resetStore();
    const fakeStudent = {
        id: "stu-rogue-1",
        firstName: "Malicious",
        lastName: "Actor",
        email: "superadmin@mockdomain.internal",
    };

    await assert.rejects(
        async () => {
            await studentService.provisionPortalAndSendWelcome(fakeStudent);
        },
        (err) => {
            assert.strictEqual(err.statusCode, 409);
            assert.strictEqual(err.code, "STAFF_ACCOUNT_CONFLICT");
            assert.match(err.message, /already registered to a staff account \(SUPER_ADMIN\)/);
            return true;
        }
    );
});

test("2. Matching an existing BRANCH_ADMIN email rejects provisioning with 409", async () => {
    resetStore();
    const fakeStudent = {
        id: "stu-rogue-2",
        firstName: "Malicious",
        lastName: "Actor",
        email: "branchadmin@mockdomain.internal",
    };

    await assert.rejects(
        async () => {
            await studentService.provisionPortalAndSendWelcome(fakeStudent);
        },
        (err) => {
            assert.strictEqual(err.statusCode, 409);
            assert.strictEqual(err.code, "STAFF_ACCOUNT_CONFLICT");
            assert.match(err.message, /already registered to a staff account \(BRANCH_ADMIN\)/);
            return true;
        }
    );
});

test("3. Matching an existing COUNSELOR email rejects provisioning with 409", async () => {
    resetStore();
    const fakeStudent = {
        id: "stu-rogue-3",
        firstName: "Malicious",
        lastName: "Actor",
        email: "counselor@mockdomain.internal",
    };

    await assert.rejects(
        async () => {
            await studentService.provisionPortalAndSendWelcome(fakeStudent);
        },
        (err) => {
            assert.strictEqual(err.statusCode, 409);
            assert.strictEqual(err.code, "STAFF_ACCOUNT_CONFLICT");
            assert.match(err.message, /already registered to a staff account \(COUNSELOR\)/);
            return true;
        }
    );
});

test("4. Rejected provisioning does not update staff password hashes, roles, status, or studentId", async () => {
    resetStore();
    const originalStaff = { ...store.users.get("user-sa-1") };

    const fakeStudent = {
        id: "stu-rogue-4",
        firstName: "Malicious",
        lastName: "Actor",
        email: "superadmin@mockdomain.internal",
    };

    try {
        await studentService.provisionPortalAndSendWelcome(fakeStudent);
    } catch (e) {
        // Expected rejection
    }

    const currentStaff = store.users.get("user-sa-1");
    assert.strictEqual(currentStaff.passwordHash, originalStaff.passwordHash);
    assert.strictEqual(currentStaff.role, "SUPER_ADMIN");
    assert.strictEqual(currentStaff.status, "ACTIVE");
    assert.strictEqual(currentStaff.mustChangePassword, false);
    assert.strictEqual(currentStaff.studentId, null);
});

test("5. Rejected provisioning does not send a welcome email", async () => {
    resetStore();
    const fakeStudent = {
        id: "stu-rogue-5",
        firstName: "Malicious",
        lastName: "Actor",
        email: "counselor@mockdomain.internal",
    };

    try {
        await studentService.provisionPortalAndSendWelcome(fakeStudent);
    } catch (e) {
        // Expected rejection
    }

    assert.strictEqual(sentEmails.length, 0);
});

test("6. A legitimate student account follows the intended safe workflow", async () => {
    resetStore();
    // Existing legitimate student portal user
    store.users.set("user-stu-legit", {
        id: "user-stu-legit",
        email: "student.legit@mockdomain.internal",
        passwordHash: "OLD_STUDENT_HASH",
        firstName: "Legit",
        lastName: "Student",
        role: "STUDENT",
        status: "ACTIVE",
        mustChangePassword: false,
        studentId: "stu-legit-1",
    });

    const studentObj = {
        id: "stu-legit-1",
        firstName: "Legit",
        lastName: "Student",
        email: "student.legit@mockdomain.internal",
    };

    const result = await studentService.provisionPortalAndSendWelcome(studentObj);

    assert.strictEqual(result.success, true);
    assert.ok(result.tempPassword);
    assert.strictEqual(sentEmails.length, 1);
    assert.strictEqual(sentEmails[0].to, "student.legit@mockdomain.internal");

    const updatedUser = store.users.get("user-stu-legit");
    assert.strictEqual(updatedUser.role, "STUDENT");
    assert.strictEqual(updatedUser.studentId, "stu-legit-1");
    assert.strictEqual(updatedUser.mustChangePassword, true);
    assert.notStrictEqual(updatedUser.passwordHash, "OLD_STUDENT_HASH");
});

test("7. A new student account can be provisioned under established rules", async () => {
    resetStore();
    const studentObj = {
        id: "stu-brand-new",
        firstName: "Fresh",
        lastName: "Applicant",
        email: "fresh.applicant@mockdomain.internal",
    };

    const result = await studentService.provisionPortalAndSendWelcome(studentObj);

    assert.strictEqual(result.success, true);
    assert.ok(result.tempPassword);
    assert.strictEqual(sentEmails.length, 1);
    assert.strictEqual(sentEmails[0].to, "fresh.applicant@mockdomain.internal");

    let createdUser = null;
    for (const u of store.users.values()) {
        if (u.email === "fresh.applicant@mockdomain.internal") {
            createdUser = u;
            break;
        }
    }

    assert.ok(createdUser);
    assert.strictEqual(createdUser.role, "STUDENT");
    assert.strictEqual(createdUser.studentId, "stu-brand-new");
    assert.strictEqual(createdUser.status, "ACTIVE");
    assert.strictEqual(createdUser.mustChangePassword, true);
});

test("8. Failures do not leave partial mutations (changePipelineStage & createStudent)", async () => {
    resetStore();

    // 8a: changePipelineStage rejects BEFORE mutating student stage or writing history
    store.students.set("stu-pipeline-test", {
        id: "stu-pipeline-test",
        firstName: "Prospect",
        lastName: "Lead",
        email: "lead@mockdomain.internal",
        currentStage: "LEAD",
    });

    await assert.rejects(
        async () => {
            await studentService.changePipelineStage(
                "stu-pipeline-test",
                { stage: "ENROLLED", email: "counselor@mockdomain.internal" },
                "actor-123"
            );
        },
        (err) => {
            assert.strictEqual(err.statusCode, 409);
            assert.strictEqual(err.code, "STAFF_ACCOUNT_CONFLICT");
            return true;
        }
    );

    // Verify student is UNCHANGED
    const studentInDb = store.students.get("stu-pipeline-test");
    assert.strictEqual(studentInDb.currentStage, "LEAD");
    assert.strictEqual(studentInDb.email, "lead@mockdomain.internal");
    assert.strictEqual(store.pipelineStageHistories.length, 0);
    assert.strictEqual(sentEmails.length, 0);

    // 8b: createStudent rejects BEFORE creating student record
    await assert.rejects(
        async () => {
            await studentService.createStudent({
                firstName: "Rogue",
                lastName: "Enrollment",
                email: "superadmin@mockdomain.internal",
                currentStage: "ENROLLED",
            });
        },
        (err) => {
            assert.strictEqual(err.statusCode, 409);
            assert.strictEqual(err.code, "STAFF_ACCOUNT_CONFLICT");
            return true;
        }
    );

    // Verify no rogue student created
    let rogueFound = false;
    for (const s of store.students.values()) {
        if (s.email === "superadmin@mockdomain.internal") rogueFound = true;
    }
    assert.strictEqual(rogueFound, false);
});

test("9. Repeated provisioning calls on a legitimate student are safe and idempotent", async () => {
    resetStore();
    const studentObj = {
        id: "stu-repeat-1",
        firstName: "Repeat",
        lastName: "Test",
        email: "repeat.student@mockdomain.internal",
    };

    const res1 = await studentService.provisionPortalAndSendWelcome(studentObj);
    assert.strictEqual(res1.success, true);
    assert.strictEqual(sentEmails.length, 1);

    const userCountAfterFirst = store.users.size;

    // Second call (e.g. Resend Credentials)
    const res2 = await studentService.provisionPortalAndSendWelcome(studentObj);
    assert.strictEqual(res2.success, true);
    assert.strictEqual(sentEmails.length, 2);

    // Ensure no duplicate user record was created
    assert.strictEqual(store.users.size, userCountAfterFirst);
});
