/**
 * phase3c-route-defense-in-depth.test.js
 *
 * Verifies route-level requireRole defense-in-depth on:
 *   GET /api/students/:id
 *   GET /api/students/:id/timeline
 *   GET /api/follow-ups/:id
 *   GET /api/follow-ups/student/:studentId
 *   GET /api/appointments/:id
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const IDENTITIES = {
    SUPER_ADMIN: { id: "p3c-sa-1", role: "SUPER_ADMIN", branchId: null },
    BRANCH_ADMIN: { id: "p3c-ba-1", role: "BRANCH_ADMIN", branchId: "p3c-br-1" },
    FRONT_DESK: { id: "p3c-fd-1", role: "FRONT_DESK", branchId: "p3c-br-1" },
    COUNSELOR: { id: "p3c-co-1", role: "COUNSELOR", branchId: "p3c-br-1" },
    TEACHER: { id: "p3c-t-1", role: "TEACHER", branchId: "p3c-br-1" },
    STUDENT: { id: "p3c-s-1", role: "STUDENT", branchId: null, studentId: "p3c-stu-1" },
    REFERRAL_AGENT: { id: "p3c-ra-1", role: "REFERRAL_AGENT", branchId: null },
};

const users = new Map(
    Object.values(IDENTITIES).map((u) => [u.id, { ...u, status: "ACTIVE", mustChangePassword: false, studentId: u.studentId ?? null }])
);

const sampleStudent = {
    id: "p3c-stu-1",
    firstName: "Test",
    lastName: "Student",
    email: "p3c-stu@example.com",
    currentStage: "LEAD",
    isActive: true,
    assignedCounselorId: "p3c-co-1",
    assignedCounselor: { id: "p3c-co-1", firstName: "Co", lastName: "One", branchId: "p3c-br-1" },
    academicBackground: { branchId: "p3c-br-1" },
    stageHistory: [],
    testScores: [],
    documents: [],
};

const otherBranchStudent = {
    ...sampleStudent,
    id: "p3c-stu-br2",
    assignedCounselorId: "p3c-co-2",
    assignedCounselor: { id: "p3c-co-2", firstName: "Co", lastName: "Two", branchId: "p3c-br-2" },
    academicBackground: { branchId: "p3c-br-2" },
};

const sampleFollowUp = {
    id: "p3c-fu-1",
    studentId: "p3c-stu-1",
    authorId: "p3c-co-1",
    channel: "PHONE",
    direction: "OUTBOUND",
    content: "Test",
    student: sampleStudent,
    author: { id: "p3c-co-1", firstName: "Co", lastName: "One", role: "COUNSELOR" },
};

const sampleFollowUpFd = {
    ...sampleFollowUp,
    id: "p3c-fu-fd",
    authorId: "p3c-fd-1",
    author: { id: "p3c-fd-1", firstName: "Front", lastName: "Desk", role: "FRONT_DESK" },
};

const sampleAppointment = {
    id: "p3c-appt-1",
    studentId: "p3c-stu-1",
    counselorId: "p3c-co-1",
    status: "SCHEDULED",
    datetime: new Date(),
    student: sampleStudent,
    counselor: { id: "p3c-co-1", firstName: "Co", lastName: "One", email: "co@example.com", branchId: "p3c-br-1" },
};

const mockPrisma = {
    user: { findUnique: async ({ where }) => users.get(where?.id) || null },
    student: {
        findUnique: async ({ where, select }) => {
            // Guard against querying non-existent Student.branchId column
            if (select && Object.prototype.hasOwnProperty.call(select, "branchId")) {
                throw new Error("Schema incompatibility: Student.branchId column does not exist");
            }
            if (where?.id === sampleStudent.id) return sampleStudent;
            if (where?.id === otherBranchStudent.id) return otherBranchStudent;
            return null;
        },
    },
    communicationLog: {
        findUnique: async ({ where }) => (where?.id === sampleFollowUp.id ? sampleFollowUp : where?.id === sampleFollowUpFd.id ? sampleFollowUpFd : null),
        findMany: async () => [sampleFollowUp],
    },
    appointment: {
        findUnique: async ({ where }) => (where?.id === sampleAppointment.id ? sampleAppointment : null),
    },
    pipelineStageHistory: { findMany: async () => [] },
    $transaction: async (fn) => (Array.isArray(fn) ? Promise.all(fn) : fn(mockPrisma)),
};

const prismaPath = require.resolve("../prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: mockPrisma };

const { signAccessToken } = require("../utils/jwt.util");
const studentRoutes = require("../routes/student.routes");
const followupRoutes = require("../routes/followup.routes");
const appointmentRoutes = require("../routes/appointment.routes");

const tokenFor = (identity) => signAccessToken({
    userId: identity.id,
    role: identity.role,
    branchId: identity.branchId,
    studentId: identity.studentId ?? null,
    mustChangePassword: false,
});

let server;
let base;

test.before(async () => {
    const app = express();
    app.use("/api/students", studentRoutes);
    app.use("/api/follow-ups", followupRoutes);
    app.use("/api/appointments", appointmentRoutes);
    // eslint-disable-next-line no-unused-vars
    app.use((err, _req, res, _next) => {
        res.status(err.statusCode || 500).json({ success: false, code: err.code || "INTERNAL_ERROR", message: err.message });
    });
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    if (server) await new Promise((r) => server.close(r));
});

const ALLOWED = ["SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK", "COUNSELOR"];
const ENDPOINTS = [
    "/api/students/p3c-stu-1",
    "/api/students/p3c-stu-1/timeline",
    "/api/follow-ups/p3c-fu-1",
    "/api/follow-ups/student/p3c-stu-1",
    "/api/appointments/p3c-appt-1",
];

for (const endpoint of ENDPOINTS) {
    for (const [role, identity] of Object.entries(IDENTITIES)) {
        const targetEndpoint = (endpoint === "/api/follow-ups/p3c-fu-1" && role === "FRONT_DESK")
            ? "/api/follow-ups/p3c-fu-fd"
            : endpoint;
        const expectOk = ALLOWED.includes(role);
        test(`${targetEndpoint}: ${role} → ${expectOk ? "200" : "403"}`, async () => {
            const res = await fetch(`${base}${targetEndpoint}`, {
                headers: { Authorization: `Bearer ${tokenFor(identity)}` },
            });
            const body = await res.json().catch(() => null);
            if (expectOk) {
                assert.equal(res.status, 200, `expected 200 for ${role}, got ${res.status} (${body?.message})`);
            } else {
                assert.equal(res.status, 403, `expected 403 for ${role}, got ${res.status}`);
                assert.equal(body?.code, "INSUFFICIENT_ROLE");
            }
        });
    }
}

test("/api/follow-ups/student/:studentId enforces branch isolation, counselor ownership, and 404", async () => {
    // SUPER_ADMIN can view any student
    const saRes = await fetch(`${base}/api/follow-ups/student/p3c-stu-br2`, {
        headers: { Authorization: `Bearer ${tokenFor(IDENTITIES.SUPER_ADMIN)}` },
    });
    assert.equal(saRes.status, 200);

    // BRANCH_ADMIN denied for other branch
    const baCross = await fetch(`${base}/api/follow-ups/student/p3c-stu-br2`, {
        headers: { Authorization: `Bearer ${tokenFor(IDENTITIES.BRANCH_ADMIN)}` },
    });
    assert.equal(baCross.status, 403);

    // FRONT_DESK denied for other branch
    const fdCross = await fetch(`${base}/api/follow-ups/student/p3c-stu-br2`, {
        headers: { Authorization: `Bearer ${tokenFor(IDENTITIES.FRONT_DESK)}` },
    });
    assert.equal(fdCross.status, 403);

    // COUNSELOR denied for student not assigned to them
    const coCross = await fetch(`${base}/api/follow-ups/student/p3c-stu-br2`, {
        headers: { Authorization: `Bearer ${tokenFor(IDENTITIES.COUNSELOR)}` },
    });
    assert.equal(coCross.status, 403);

    // Nonexistent student returns 404
    const notFound = await fetch(`${base}/api/follow-ups/student/nonexistent-id`, {
        headers: { Authorization: `Bearer ${tokenFor(IDENTITIES.SUPER_ADMIN)}` },
    });
    assert.equal(notFound.status, 404);
});
