/**
 * document-frontdesk-authz.test.js
 *
 * Verifies branch-scoped document upload/access authorization for FRONT_DESK
 * (both unassigned and assigned students) alongside COUNSELOR, BRANCH_ADMIN,
 * SUPER_ADMIN, STUDENT, and unauthorized roles.
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");

const users = new Map([
    ["sa-1", { id: "sa-1", role: "SUPER_ADMIN", status: "ACTIVE", branchId: null, studentId: null }],
    ["ba-1", { id: "ba-1", role: "BRANCH_ADMIN", status: "ACTIVE", branchId: "br-1", studentId: null }],
    ["fd-1", { id: "fd-1", role: "FRONT_DESK", status: "ACTIVE", branchId: "br-1", studentId: null }],
    ["fd-nobr", { id: "fd-nobr", role: "FRONT_DESK", status: "ACTIVE", branchId: null, studentId: null }],
    ["co-1", { id: "co-1", role: "COUNSELOR", status: "ACTIVE", branchId: "br-1", studentId: null }],
    ["co-2", { id: "co-2", role: "COUNSELOR", status: "ACTIVE", branchId: "br-2", studentId: null }],
    ["stu-u-1", { id: "stu-u-1", role: "STUDENT", status: "ACTIVE", branchId: null, studentId: "stu-assigned-br1" }],
    ["tchr-1", { id: "tchr-1", role: "TEACHER", status: "ACTIVE", branchId: "br-1", studentId: null }],
]);

const students = new Map([
    ["stu-unassigned-br1", {
        id: "stu-unassigned-br1",
        firstName: "Unassigned",
        lastName: "Br1",
        email: "u1@example.com",
        assignedCounselorId: null,
        assignedCounselor: null,
        academicBackground: { branchId: "br-1" },
        isActive: true,
    }],
    ["stu-unassigned-br2", {
        id: "stu-unassigned-br2",
        firstName: "Unassigned",
        lastName: "Br2",
        email: "u2@example.com",
        assignedCounselorId: null,
        assignedCounselor: null,
        academicBackground: { branchId: "br-2" },
        isActive: true,
    }],
    ["stu-assigned-br1", {
        id: "stu-assigned-br1",
        firstName: "Assigned",
        lastName: "Br1",
        email: "a1@example.com",
        assignedCounselorId: "co-1",
        assignedCounselor: { id: "co-1", firstName: "Co", lastName: "One", branchId: "br-1" },
        academicBackground: { branchId: "br-1" },
        isActive: true,
    }],
]);

const savedFiles = [];

const mockPrisma = {
    user: {
        findUnique: async ({ where }) => users.get(where?.id) || null,
    },
    student: {
        findUnique: async ({ where }) => students.get(where?.id) || null,
    },
    document: {
        create: async ({ data }) => ({
            id: "doc-test-1",
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
        }),
    },
    documentVersion: {
        create: async ({ data }) => ({ id: "docver-test-1", ...data }),
    },
    $transaction: async (fn) => fn(mockPrisma),
};

const prismaPath = require.resolve("../prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: mockPrisma };

const storagePath = require.resolve("../utils/storage.util");
require.cache[storagePath] = {
    id: storagePath,
    filename: storagePath,
    loaded: true,
    exports: {
        saveFile: async (relPath) => { savedFiles.push(relPath); },
        readFile: async () => Buffer.from(""),
        deleteFile: async () => {},
        initUploadDir: async () => {},
        resolveSafePath: (p) => p,
        resolveUploadDir: () => "/tmp",
    },
};

const encryptionPath = require.resolve("../utils/encryption.util");
require.cache[encryptionPath] = {
    id: encryptionPath,
    filename: encryptionPath,
    loaded: true,
    exports: {
        encrypt: (buf) => buf,
        decrypt: (buf) => buf,
        validateEncryptionConfig: () => ({ isConfigured: false }),
    },
};

const { signAccessToken } = require("../utils/jwt.util");
const documentRoutes = require("../routes/document.routes");
const documentService = require("../services/document.service");

const fakeFile = {
    originalname: "passport.pdf",
    mimetype: "application/pdf",
    size: 16,
    buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
};

test("FRONT_DESK can upload document for an unassigned student in own branch", async () => {
    const doc = await documentService.uploadDocument(
        fakeFile,
        { studentId: "stu-unassigned-br1", type: "PASSPORT" },
        "fd-1",
        { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" }
    );
    assert.equal(doc.studentId, "stu-unassigned-br1");
});

test("FRONT_DESK can upload document for an assigned student in own branch", async () => {
    const doc = await documentService.uploadDocument(
        fakeFile,
        { studentId: "stu-assigned-br1", type: "PASSPORT" },
        "fd-1",
        { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" }
    );
    assert.equal(doc.studentId, "stu-assigned-br1");
});

test("FRONT_DESK is denied (403) uploading for an unassigned student in another branch", async () => {
    await assert.rejects(
        () => documentService.uploadDocument(
            fakeFile,
            { studentId: "stu-unassigned-br2", type: "PASSPORT" },
            "fd-1",
            { userId: "fd-1", role: "FRONT_DESK", branchId: "br-1" }
        ),
        (err) => err.statusCode === 403
    );
});

test("FRONT_DESK without branch context is denied (403 NO_BRANCH_CONTEXT)", async () => {
    await assert.rejects(
        () => documentService.uploadDocument(
            fakeFile,
            { studentId: "stu-unassigned-br1", type: "PASSPORT" },
            "fd-nobr",
            { userId: "fd-nobr", role: "FRONT_DESK", branchId: null }
        ),
        (err) => err.statusCode === 403 && err.code === "NO_BRANCH_CONTEXT"
    );
});

test("COUNSELOR, BRANCH_ADMIN, and SUPER_ADMIN permissions are preserved", async () => {
    const coDoc = await documentService.uploadDocument(
        fakeFile,
        { studentId: "stu-assigned-br1", type: "PASSPORT" },
        "co-1",
        { userId: "co-1", role: "COUNSELOR", branchId: "br-1" }
    );
    assert.equal(coDoc.studentId, "stu-assigned-br1");

    // Counselor cannot upload for unassigned or another counselor's student
    await assert.rejects(
        () => documentService.uploadDocument(
            fakeFile,
            { studentId: "stu-unassigned-br1", type: "PASSPORT" },
            "co-1",
            { userId: "co-1", role: "COUNSELOR", branchId: "br-1" }
        ),
        (err) => err.statusCode === 403
    );

    const baDoc = await documentService.uploadDocument(
        fakeFile,
        { studentId: "stu-unassigned-br1", type: "PASSPORT" },
        "ba-1",
        { userId: "ba-1", role: "BRANCH_ADMIN", branchId: "br-1" }
    );
    assert.equal(baDoc.studentId, "stu-unassigned-br1");

    const saDoc = await documentService.uploadDocument(
        fakeFile,
        { studentId: "stu-unassigned-br2", type: "PASSPORT" },
        "sa-1",
        { userId: "sa-1", role: "SUPER_ADMIN", branchId: null }
    );
    assert.equal(saDoc.studentId, "stu-unassigned-br2");
});

test("Unauthorized roles (TEACHER, STUDENT) are denied on POST /api/documents/upload", async () => {
    const app = express();
    app.use("/api/documents", documentRoutes);
    // eslint-disable-next-line no-unused-vars
    app.use((err, _req, res, _next) => {
        res.status(err.statusCode || 500).json({ success: false, code: err.code });
    });
    const server = http.createServer(app);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        for (const uid of ["tchr-1", "stu-u-1"]) {
            const u = users.get(uid);
            const tok = signAccessToken({ userId: u.id, role: u.role, branchId: u.branchId, studentId: u.studentId, mustChangePassword: false });
            const res = await fetch(`${base}/api/documents/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${tok}` },
            });
            assert.equal(res.status, 403, `expected 403 for ${u.role}`);
        }
    } finally {
        await new Promise((r) => server.close(r));
    }
});
