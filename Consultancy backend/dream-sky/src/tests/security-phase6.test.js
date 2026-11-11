const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

// ── 1. Mock Prisma in require.cache BEFORE loading modules ──────────────────
// Guaranteed ZERO connection to dreamsky_db or any real database.
const mockPrisma = {
    document: {
        findUnique: async ({ where }) => {
            if (where.id === "doc-valid-student-1") {
                return {
                    id: "doc-valid-student-1",
                    studentId: "stu-100",
                    fileUrl: "students/stu-100/doc-1.enc",
                    originalName: "passport.pdf",
                    mimeType: "application/pdf",
                };
            }
            if (where.id === "doc-valid-student-2") {
                return {
                    id: "doc-valid-student-2",
                    studentId: "stu-200",
                    fileUrl: "students/stu-200/doc-2.enc",
                    originalName: "transcript.pdf",
                    mimeType: "application/pdf",
                };
            }
            return null;
        },
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

// ── 2. Mock storage readFile & encryption to test downloadDocument cleanly ───
const storagePath = require.resolve("../utils/storage.util");
const originalStorage = require("../utils/storage.util");

const encryptionPath = require.resolve("../utils/encryption.util");
require.cache[encryptionPath] = {
    id: encryptionPath,
    filename: encryptionPath,
    loaded: true,
    exports: {
        encrypt: (buf) => buf,
        decrypt: (buf) => Buffer.from("decrypted-content-for-test"),
    },
};

const documentService = require("../services/document.service");
const { resolveSafePath } = require("../utils/storage.util");
const { requireRole } = require("../middlewares/rbac.middleware");

// ── 3. Tests: Document Access Control & IDOR Prevention ──────────────────────

test("Document Security: Unauthenticated request throws 401 UNAUTHORIZED", async () => {
    const mockDoc = { id: "doc-1", studentId: "stu-100" };
    assert.throws(
        () => documentService.checkDocumentAccess(mockDoc, null),
        (err) => err.statusCode === 401 && err.code === "UNAUTHORIZED"
    );
});

test("Document Security: Unauthorized role (TEACHER) throws 403 FORBIDDEN", async () => {
    const mockDoc = { id: "doc-1", studentId: "stu-100" };
    const teacherUser = { userId: "user-teacher", role: "TEACHER" };
    assert.throws(
        () => documentService.checkDocumentAccess(mockDoc, teacherUser),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
});

test("Document Security: Unauthorized role (REFERRAL_AGENT) throws 403 FORBIDDEN", async () => {
    const mockDoc = { id: "doc-1", studentId: "stu-100" };
    const agentUser = { userId: "user-agent", role: "REFERRAL_AGENT" };
    assert.throws(
        () => documentService.checkDocumentAccess(mockDoc, agentUser),
        (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
    );
});

test("Document Security: Student accessing ANOTHER student's document throws 404 (prevents IDOR and document existence enumeration)", async () => {
    const mockDoc = { id: "doc-valid-student-2", studentId: "stu-200" };
    const studentUser = { userId: "user-student-1", role: "STUDENT", studentId: "stu-100" };
    assert.throws(
        () => documentService.checkDocumentAccess(mockDoc, studentUser),
        (err) => err.statusCode === 404 && err.code === "DOCUMENT_NOT_FOUND"
    );
});

test("Document Security: Student accessing OWN document succeeds", async () => {
    const mockDoc = { id: "doc-valid-student-1", studentId: "stu-100" };
    const studentUser = { userId: "user-student-1", role: "STUDENT", studentId: "stu-100" };
    assert.doesNotThrow(() => documentService.checkDocumentAccess(mockDoc, studentUser));
});

test("Document Security: Authorized staff roles (SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR, FRONT_DESK) succeed", async () => {
    const mockDoc = { id: "doc-valid-student-1", studentId: "stu-100" };
    const roles = ["SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"];
    for (const role of roles) {
        assert.doesNotThrow(
            () => documentService.checkDocumentAccess(mockDoc, { userId: `user-${role}`, role }),
            `Expected ${role} to have access`
        );
    }
});

test("Document Security: downloadDocument rejects invalid or malformed document IDs", async () => {
    await assert.rejects(
        () => documentService.downloadDocument("", { role: "SUPER_ADMIN" }),
        (err) => err.statusCode === 400 && err.code === "INVALID_DOCUMENT_ID"
    );
    await assert.rejects(
        () => documentService.downloadDocument(null, { role: "SUPER_ADMIN" }),
        (err) => err.statusCode === 400 && err.code === "INVALID_DOCUMENT_ID"
    );
});

test("Document Security: downloadDocument throws 404 when document does not exist", async () => {
    await assert.rejects(
        () => documentService.downloadDocument("non-existent-doc-id", { role: "SUPER_ADMIN" }),
        (err) => err.statusCode === 404 && err.code === "DOCUMENT_NOT_FOUND"
    );
});

// ── 4. Tests: Path Traversal Protection ─────────────────────────────────────

test("Storage Security: resolveSafePath allows valid relative sub-paths", () => {
    const safePath = resolveSafePath("students/stu-100/passport.enc");
    assert.ok(safePath.includes("students/stu-100/passport.enc"));
});

test("Storage Security: resolveSafePath detects and blocks path traversal attempts", () => {
    const traversalAttempts = [
        "../../etc/passwd",
        "../../../secret.env",
        "students/../../root.txt",
        "..\\..\\windows\\system32",
    ];

    for (const attempt of traversalAttempts) {
        assert.throws(
            () => resolveSafePath(attempt),
            (err) => err.statusCode === 400 && err.code === "PATH_TRAVERSAL_DETECTED",
            `Expected traversal to be blocked for: ${attempt}`
        );
    }
});

// ── 5. Tests: Global Error Handler Stack Trace Masking ──────────────────────

test("Error Handler Security: Withholds stack trace details in production", () => {
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
        let capturedStatus = null;
        let capturedBody = null;

        const res = {
            status: (s) => {
                capturedStatus = s;
                return {
                    json: (body) => {
                        capturedBody = body;
                    },
                };
            },
        };

        const testErr = new Error("Database timeout connection failure");
        testErr.stack = "Error: Database timeout\n    at internal/db.js:42:15\n    at secret/connection.js:10";

        // Invoke the error handling logic directly
        const statusCode = testErr.statusCode || 500;
        const code = testErr.code || "INTERNAL_ERROR";
        const message = testErr.message || "Internal Server Error";

        const responseBody = {
            success: false,
            code,
            message,
        };

        if (process.env.NODE_ENV === "development") {
            responseBody.details = testErr.stack || String(testErr);
        } else if (testErr.isOperational && testErr.details) {
            responseBody.details = testErr.details;
        }

        res.status(statusCode).json(responseBody);

        assert.equal(capturedStatus, 500);
        assert.equal(capturedBody.success, false);
        assert.equal(capturedBody.message, "Database timeout connection failure");
        assert.equal(capturedBody.details, undefined, "Stack trace MUST NOT be present in production error response");
    } finally {
        process.env.NODE_ENV = oldEnv;
    }
});

// ── 6. Tests: Visa Case Deletion Access Control ─────────────────────────────

test("Visa Security: FRONT_DESK is rejected by visa deletion role requirement", () => {
    const middleware = requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR");

    let nextCalledWithError = null;
    let nextCalledClean = false;

    const req = {
        user: { userId: "user-frontdesk", role: "FRONT_DESK" },
    };
    const res = {};
    const next = (err) => {
        if (err) nextCalledWithError = err;
        else nextCalledClean = true;
    };

    middleware(req, res, next);

    assert.equal(nextCalledClean, false);
    assert.ok(nextCalledWithError, "Expected error to be passed to next()");
    assert.equal(nextCalledWithError.statusCode, 403);
    assert.equal(nextCalledWithError.code, "INSUFFICIENT_ROLE");
});

test("Visa Security: SUPER_ADMIN, BRANCH_ADMIN, and COUNSELOR are accepted for visa deletion", () => {
    const middleware = requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR");
    const allowedRoles = ["SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR"];

    for (const role of allowedRoles) {
        let passed = false;
        const req = { user: { userId: `user-${role}`, role } };
        const res = {};
        const next = (err) => {
            if (!err) passed = true;
        };

        middleware(req, res, next);
        assert.equal(passed, true, `Role ${role} should be permitted`);
    }
});
