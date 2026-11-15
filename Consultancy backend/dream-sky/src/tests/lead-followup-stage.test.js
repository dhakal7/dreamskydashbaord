const test = require("node:test");
const assert = require("node:assert/strict");

// ── Mock Prisma in require.cache BEFORE loading any services ─────────
// Guarantees ZERO database contact (strictly offline unit test)

let mockStudentStore = {};
let mockAppointmentStore = [];
let mockHistoryStore = [];
let mockLogStore = [];
let mockNotificationCalls = [];
let mockEmailCalls = [];

const mockPrisma = {
    student: {
        findFirst: async ({ where }) => {
            const list = Object.values(mockStudentStore);
            return list.find((s) => {
                if (where.id && s.id !== where.id) return false;
                if (where.branchId && s.branchId !== where.branchId) return false;
                if (where.deletedAt === null && s.deletedAt !== null) return false;
                return true;
            }) || null;
        },
        findUnique: async ({ where }) => mockStudentStore[where.id] || null,
        update: async ({ where, data }) => {
            if (!mockStudentStore[where.id]) throw new Error("Student not found");
            const updated = { ...mockStudentStore[where.id], ...data };
            mockStudentStore[where.id] = updated;
            return updated;
        },
        create: async ({ data }) => {
            const student = { id: data.id || `stu-${Date.now()}`, ...data };
            mockStudentStore[student.id] = student;
            return student;
        },
    },
    appointment: {
        findUnique: async ({ where }) => mockAppointmentStore.find((a) => a.id === where.id) || null,
        findFirst: async ({ where }) => {
            return mockAppointmentStore.find((a) => {
                if (where.studentId && a.studentId !== where.studentId) return false;
                if (where.datetime && a.datetime && a.datetime.toISOString() !== where.datetime.toISOString()) return false;
                if (where.status && a.status !== where.status) return false;
                return true;
            }) || null;
        },
        findMany: async ({ where = {} }) => {
            return mockAppointmentStore.filter((a) => {
                if (where.counselorId && a.counselorId !== where.counselorId) return false;
                if (where.studentId && a.studentId !== where.studentId) return false;
                if (where.branchId && a.branchId !== where.branchId) return false;
                if (where.OR) {
                    const matchOr = where.OR.some((clause) => {
                        if (clause.counselor?.branchId && (a.branchId === clause.counselor.branchId || a.counselor?.branchId === clause.counselor.branchId)) return true;
                        if (clause.student?.assignedCounselor?.branchId && a.branchId === clause.student.assignedCounselor.branchId) return true;
                        return false;
                    });
                    if (!matchOr) return false;
                }
                return true;
            });
        },
        count: async ({ where = {} }) => {
            const items = await mockPrisma.appointment.findMany({ where });
            return items.length;
        },
        create: async ({ data }) => {
            const appt = { id: `appt-${Date.now()}-${Math.random()}`, ...data };
            mockAppointmentStore.push(appt);
            return appt;
        },
        update: async ({ where, data }) => {
            const idx = mockAppointmentStore.findIndex((a) => a.id === where.id);
            if (idx === -1) throw new Error("Appointment not found");
            mockAppointmentStore[idx] = { ...mockAppointmentStore[idx], ...data };
            return mockAppointmentStore[idx];
        },
        delete: async ({ where }) => {
            const idx = mockAppointmentStore.findIndex((a) => a.id === where.id);
            if (idx === -1) throw new Error("Appointment not found");
            return mockAppointmentStore.splice(idx, 1)[0];
        },
    },
    pipelineStageHistory: {
        create: async ({ data }) => {
            mockHistoryStore.push(data);
            return { id: `hist-${Date.now()}`, ...data };
        },
    },
    communicationLog: {
        findFirst: async ({ where = {} }) => {
            return mockLogStore.find((l) => {
                if (where.studentId && l.studentId !== where.studentId) return false;
                if (where.content?.contains && !String(l.content).includes(where.content.contains)) return false;
                return true;
            }) || null;
        },
        create: async ({ data }) => {
            if (mockPrisma._failLogCreate) throw new Error("Simulated communication log write failure");
            const log = { id: `log-${Date.now()}-${Math.random()}`, createdAt: new Date(), ...data };
            mockLogStore.push(log);
            return log;
        },
        update: async ({ where, data }) => {
            const idx = mockLogStore.findIndex((l) => l.id === where.id);
            if (idx === -1) throw new Error("CommunicationLog not found");
            mockLogStore[idx] = { ...mockLogStore[idx], ...data };
            return mockLogStore[idx];
        },
    },
    user: {
        findMany: async () => [],
        findUnique: async () => null,
        findFirst: async () => null,
    },
    auditLog: {
        create: async () => ({}),
    },
    notification: {
        findMany: async () => [],
        create: async () => ({}),
    },
    // Snapshot/rollback to emulate PostgreSQL transaction atomicity
    $transaction: async (fn) => {
        const snap = {
            students: JSON.parse(JSON.stringify(mockStudentStore)),
            appts: mockAppointmentStore.map((a) => ({ ...a })),
            history: [...mockHistoryStore],
            logs: mockLogStore.map((l) => ({ ...l })),
        };
        try {
            return await fn(mockPrisma);
        } catch (err) {
            mockStudentStore = snap.students;
            mockAppointmentStore = snap.appts;
            mockHistoryStore = snap.history;
            mockLogStore = snap.logs;
            throw err;
        }
    },
    _failLogCreate: false,
};

const prismaPath = require.resolve("../prisma");
require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: mockPrisma,
};

// Also mock email service to prevent external calls
const emailPath = require.resolve("../services/email.service");
require.cache[emailPath] = {
    id: emailPath,
    filename: emailPath,
    loaded: true,
    exports: {
        sendAppointmentNotificationEmail: async () => ({ accepted: ["mock@example.com"] }),
        sendNotificationEmail: async (args) => { mockEmailCalls.push(args); return { accepted: ["mock@example.com"] }; },
        sendWelcomeStudentEmail: async () => ({ accepted: ["mock@example.com"] }),
        isValidEmail: () => true,
    },
};

// Capture follow-up notifications (verifies no duplicate notifications)
const notifPath = require.resolve("../services/notification.service");
const realNotif = require("../services/notification.service");
require.cache[notifPath].exports = {
    ...realNotif,
    queueFollowUpNotification: async (args) => { mockNotificationCalls.push(args); return {}; },
};

const studentService = require("../services/student.service");
const appointmentService = require("../services/appointment.service");
const { validatePipelineChange, VALID_LEAD_STAGES } = require("../validators/student.validator");

// Helper to simulate express validator call
function runValidator(validatorFn, body) {
    try {
        validatorFn(body);
        return { statusCode: 200, nextCalled: true };
    } catch (err) {
        return {
            statusCode: err.statusCode || 400,
            responseData: { error: err.message, code: err.code },
            nextCalled: false,
        };
    }
}

test("DreamSky CRM Phase 28.25A — Lead Stages & Follow-Up Unit Test Suite", async (t) => {
    // Reset stores before each test
    function resetStores() {
        mockStudentStore = {};
        mockAppointmentStore = [];
        mockHistoryStore = [];
        mockLogStore = [];
        mockNotificationCalls = [];
        mockEmailCalls = [];
        mockPrisma._failLogCreate = false;
    }

    await t.test("Validator: allows valid lead stages and macro stages", () => {
        assert.deepEqual(VALID_LEAD_STAGES, ["NEW", "FOLLOW_UP", "ASSIGNED", "COUNSELLING", "INTERESTED", "NOT_CONTRACTED"]);

        const res1 = runValidator(validatePipelineChange, { stage: "NEW" });
        assert.equal(res1.nextCalled, true);
        assert.equal(res1.statusCode, 200);

        const res2 = runValidator(validatePipelineChange, { stage: "COUNSELLING" });
        assert.equal(res2.nextCalled, true);
        assert.equal(res2.statusCode, 200);

        const resAssignedMissing = runValidator(validatePipelineChange, { stage: "ASSIGNED" });
        assert.equal(resAssignedMissing.nextCalled, false);
        assert.equal(resAssignedMissing.statusCode, 400);

        const resAssigned = runValidator(validatePipelineChange, {
            stage: "ASSIGNED",
            counselorId: "c-1",
            appointmentDate: "2026-12-01",
            appointmentTime: "10:00",
        });
        assert.equal(resAssigned.nextCalled, true);
        assert.equal(resAssigned.statusCode, 200);

        const resNotContracted = runValidator(validatePipelineChange, { stage: "NOT_CONTRACTED" });
        assert.equal(resNotContracted.nextCalled, true);
        assert.equal(resNotContracted.statusCode, 200);

        const res3 = runValidator(validatePipelineChange, { stage: "PROSPECT" });
        assert.equal(res3.nextCalled, true);
        assert.equal(res3.statusCode, 200);
    });

    await t.test("Validator: rejects invalid stage names with 400", () => {
        const res = runValidator(validatePipelineChange, { stage: "CONTACTED" });
        assert.equal(res.nextCalled, false);
        assert.equal(res.statusCode, 400);
        assert.match(res.responseData.error, /Invalid stage/);
    });

    await t.test("Validator: rejects FOLLOW_UP stage transition if date/time is missing", () => {
        // Missing both
        const res1 = runValidator(validatePipelineChange, { stage: "FOLLOW_UP" });
        assert.equal(res1.nextCalled, false);
        assert.equal(res1.statusCode, 400);
        assert.equal(res1.responseData.code, "MISSING_FOLLOWUP_DATETIME");

        // Missing time
        const res2 = runValidator(validatePipelineChange, { stage: "FOLLOW_UP", followUpDate: "2026-11-01" });
        assert.equal(res2.nextCalled, false);
        assert.equal(res2.statusCode, 400);
        assert.equal(res2.responseData.code, "MISSING_FOLLOWUP_DATETIME");

        // Invalid date format
        const res3 = runValidator(validatePipelineChange, { stage: "FOLLOW_UP", followUpDate: "invalid-date", followUpTime: "10:00" });
        assert.equal(res3.nextCalled, false);
        assert.equal(res3.statusCode, 400);
        assert.equal(res3.responseData.code, "INVALID_FOLLOWUP_DATETIME");
    });

    await t.test("Validator: accepts FOLLOW_UP when valid date and time are provided", () => {
        const res = runValidator(validatePipelineChange, {
            stage: "FOLLOW_UP",
            followUpDate: "2026-11-05",
            followUpTime: "14:30",
        });
        assert.equal(res.nextCalled, true);
        assert.equal(res.statusCode, 200);
    });

    await t.test("Lead stage resolver: correctly resolves legacy and persisted stages", () => {
        // Persisted inside academicBackground
        const s1 = { currentStage: "LEAD", academicBackground: { leadStage: "FOLLOW_UP" } };
        assert.equal(studentService.resolveLeadStage(s1), "FOLLOW_UP");

        // Legacy record with LEAD macro stage defaults to NEW
        const s2 = { currentStage: "LEAD", academicBackground: {} };
        assert.equal(studentService.resolveLeadStage(s2), "NEW");

        // Legacy record with PROSPECT macro stage defaults to COUNSELLING
        const s3 = { currentStage: "PROSPECT", academicBackground: null };
        assert.equal(studentService.resolveLeadStage(s3), "COUNSELLING");

        // Macro lifecycle stages outside leads return null (they are not leads)
        const s4 = { currentStage: "ENROLLED", academicBackground: {} };
        assert.equal(studentService.resolveLeadStage(s4), null);
    });

    await t.test("Persistence & Atomicity: Successfully moves to FOLLOW_UP and creates scheduled appointment", async () => {
        resetStores();

        const testStudent = {
            id: "student-101",
            firstName: "Sita",
            lastName: "Sharma",
            email: "sita@example.com",
            currentStage: "LEAD",
            assignedCounselorId: "counselor-01",
            assignedCounselor: { id: "counselor-01", branchId: "branch-ktm" },
            branchId: "branch-ktm",
            deletedAt: null,
            academicBackground: { leadStage: "NEW" },
        };
        mockStudentStore[testStudent.id] = testStudent;

        const updated = await studentService.changePipelineStage(
            testStudent.id,
            {
                stage: "FOLLOW_UP",
                followUpDate: "2026-11-10",
                followUpTime: "11:00",
                durationMin: 45,
                meetingMode: "ONLINE",
                notes: "Discuss university shortlist",
            },
            {
                id: "user-admin-1",
                role: "SUPER_ADMIN",
                branchId: "branch-ktm",
            }
        );

        // Verify student leadStage updated in returned object and store
        assert.equal(updated.leadStage, "FOLLOW_UP");
        assert.equal(mockStudentStore[testStudent.id].academicBackground.leadStage, "FOLLOW_UP");
        assert.equal(mockStudentStore[testStudent.id].currentStage, "LEAD");

        // Verify appointment was created atomically
        assert.equal(mockAppointmentStore.length, 1);
        const appt = mockAppointmentStore[0];
        assert.equal(appt.studentId, testStudent.id);
        assert.equal(appt.counselorId, "counselor-01");
        assert.equal(appt.type, "FOLLOW_UP");
        assert.equal(appt.status, "SCHEDULED");
        assert.equal(appt.meetingMode, "ONLINE");
        assert.equal(appt.notes, "Discuss university shortlist");

        // Verify history was recorded
        assert.equal(mockHistoryStore.length, 1);
        assert.equal(mockHistoryStore[0].stage, "LEAD");
        assert.equal(mockHistoryStore[0].reasonCode, "FOLLOW_UP");
    });

    await t.test("Atomicity: If appointment creation fails, stage change is aborted", async () => {
        resetStores();

        const testStudent = {
            id: "student-102",
            firstName: "Hari",
            lastName: "Thapa",
            email: "hari@example.com",
            currentStage: "LEAD",
            assignedCounselorId: "counselor-01",
            assignedCounselor: { id: "counselor-01", branchId: "branch-ktm" },
            branchId: "branch-ktm",
            deletedAt: null,
            academicBackground: { leadStage: "NEW" },
        };
        mockStudentStore[testStudent.id] = testStudent;

        // Temporarily simulate appointment create failure
        const originalCreate = mockPrisma.appointment.create;
        mockPrisma.appointment.create = async () => {
            throw new Error("Simulated appointment database write failure");
        };

        await assert.rejects(
            async () => {
                await studentService.changePipelineStage(
                    testStudent.id,
                    {
                        stage: "FOLLOW_UP",
                        followUpDate: "2026-11-12",
                        followUpTime: "15:00",
                    },
                    { id: "user-admin-1", role: "SUPER_ADMIN" }
                );
            },
            { message: "Simulated appointment database write failure" }
        );

        // Restore mock create
        mockPrisma.appointment.create = originalCreate;

        // Verify student state in store was NOT modified to FOLLOW_UP
        assert.equal(mockStudentStore[testStudent.id].academicBackground.leadStage, "NEW");
        assert.equal(mockAppointmentStore.length, 0);
    });

    await t.test("Idempotency: Retries with same datetime update appointment rather than duplicating", async () => {
        resetStores();

        const testStudent = {
            id: "student-103",
            firstName: "Kiran",
            lastName: "KC",
            email: "kiran@example.com",
            currentStage: "LEAD",
            assignedCounselorId: "counselor-01",
            assignedCounselor: { id: "counselor-01", branchId: "branch-ktm" },
            branchId: "branch-ktm",
            deletedAt: null,
            academicBackground: { leadStage: "NEW" },
        };
        mockStudentStore[testStudent.id] = testStudent;

        // First transition
        await studentService.changePipelineStage(
            testStudent.id,
            {
                stage: "FOLLOW_UP",
                followUpDate: "2026-11-15",
                followUpTime: "10:00",
                notes: "Initial follow-up plan",
            },
            { id: "user-admin-1", role: "SUPER_ADMIN" }
        );
        assert.equal(mockAppointmentStore.length, 1);

        // Retry / re-submit transition with updated notes
        await studentService.changePipelineStage(
            testStudent.id,
            {
                stage: "FOLLOW_UP",
                followUpDate: "2026-11-15",
                followUpTime: "10:00",
                notes: "Updated follow-up plan with intake info",
            },
            { id: "user-admin-1", role: "SUPER_ADMIN" }
        );

        // Appointment count must remain 1 (no duplicate inserted)
        assert.equal(mockAppointmentStore.length, 1);
        assert.equal(mockAppointmentStore[0].notes, "Updated follow-up plan with intake info");
    });

    await t.test("Calendar Visibility: Counselor only sees own appointments; Reception restricted to branch", async () => {
        resetStores();

        // Populate mock appointments across 2 branches and counselors
        mockAppointmentStore = [
            { id: "a1", counselorId: "couns-1", branchId: "branch-ktm", studentId: "s1" },
            { id: "a2", counselorId: "couns-2", branchId: "branch-ktm", studentId: "s2" },
            { id: "a3", counselorId: "couns-3", branchId: "branch-pkr", studentId: "s3" },
        ];

        // 1. Counselor query: restricted to couns-1
        const counselorUser = { id: "couns-1", role: "COUNSELOR", counselorId: "couns-1", branchId: "branch-ktm" };
        const counselorResult = await appointmentService.listAppointments(
            { counselorId: "couns-99" }, // Attempted query override
            counselorUser
        );
        assert.equal(counselorResult.appointments.length, 1);
        assert.equal(counselorResult.appointments[0].counselorId, "couns-1");

        // 2. Reception user (FRONT_DESK): restricted to branch-ktm
        const receptionUser = { id: "rec-1", role: "FRONT_DESK", branchId: "branch-ktm" };
        const receptionResult = await appointmentService.listAppointments(
            { branchId: "branch-pkr" }, // Query parameter manipulation attempt
            receptionUser
        );
        assert.equal(receptionResult.appointments.length, 2);
        receptionResult.appointments.forEach((a) => assert.equal(a.branchId, "branch-ktm"));

        // 3. Reception user from branch-pkr: restricted to branch-pkr
        const receptionPkr = { id: "rec-2", role: "FRONT_DESK", branchId: "branch-pkr" };
        const pkrResult = await appointmentService.listAppointments({}, receptionPkr);
        assert.equal(pkrResult.appointments.length, 1);
        assert.equal(pkrResult.appointments[0].branchId, "branch-pkr");

        // 4. Cross-branch getAppointmentById denied
        assert.throws(
            () => appointmentService.assertAppointmentAuthorization(
                { id: "a3", counselor: { branchId: "branch-pkr" }, student: { assignedCounselor: { branchId: "branch-pkr" } } },
                receptionUser,
                "read"
            ),
            (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
        );
    });

    await t.test("PROSPECT to FOLLOW_UP transition: retains PROSPECT macro stage without backward transition error", async () => {
        resetStores();

        const prospectStudent = {
            id: "student-prospect-1",
            firstName: "Binod",
            lastName: "Adhikari",
            email: "binod@example.com",
            currentStage: "PROSPECT",
            assignedCounselorId: "counselor-01",
            assignedCounselor: { id: "counselor-01", branchId: "branch-ktm" },
            branchId: "branch-ktm",
            deletedAt: null,
            academicBackground: { leadStage: "COUNSELLING" },
        };
        mockStudentStore[prospectStudent.id] = prospectStudent;

        const updated = await studentService.changePipelineStage(
            prospectStudent.id,
            {
                stage: "FOLLOW_UP",
                followUpDate: "2026-11-20",
                followUpTime: "16:00",
                notes: "Second counseling follow-up",
            },
            { id: "user-admin-1", role: "SUPER_ADMIN" }
        );

        assert.equal(updated.leadStage, "FOLLOW_UP");
        assert.equal(mockStudentStore[prospectStudent.id].academicBackground.leadStage, "FOLLOW_UP");
        // Macro stage must remain PROSPECT (not demoted to LEAD)
        assert.equal(mockStudentStore[prospectStudent.id].currentStage, "PROSPECT");
        assert.equal(mockAppointmentStore.length, 1);
        assert.equal(mockAppointmentStore[0].notes, "Second counseling follow-up");
    });

    await t.test("updateStudent preserves existing leadStage in academicBackground", async () => {
        resetStores();

        const existingStudent = {
            id: "student-upd-1",
            firstName: "Asha",
            lastName: "Gurung",
            email: "asha@example.com",
            currentStage: "LEAD",
            assignedCounselorId: "counselor-01",
            assignedCounselor: { id: "counselor-01", branchId: "branch-ktm" },
            deletedAt: null,
            academicBackground: { leadStage: "FOLLOW_UP", previousGpa: "3.5" },
        };
        mockStudentStore[existingStudent.id] = existingStudent;

        // Update academic background without mentioning leadStage
        await studentService.updateStudent(
            existingStudent.id,
            {
                academicBackground: { highestQualification: "Bachelor of Science" },
            },
            { id: "user-admin-1", role: "SUPER_ADMIN" }
        );

        // leadStage must still be present in academicBackground!
        assert.equal(mockStudentStore[existingStudent.id].academicBackground.leadStage, "FOLLOW_UP");
        assert.equal(mockStudentStore[existingStudent.id].academicBackground.highestQualification, "Bachelor of Science");
    });

    await t.test("Appointment mutations: updateAppointment and deleteAppointment enforce branch authorization", async () => {
        resetStores();

        const pkrAppt = {
            id: "appt-pkr-99",
            studentId: "s-pkr",
            counselorId: "couns-pkr",
            counselor: { branchId: "branch-pkr" },
            student: { assignedCounselor: { branchId: "branch-pkr" } },
            datetime: new Date("2026-11-25T10:00:00.000Z"),
            status: "SCHEDULED",
        };
        mockAppointmentStore.push(pkrAppt);

        const ktmReception = { id: "rec-ktm", role: "FRONT_DESK", branchId: "branch-ktm" };

        // Updating appointment from another branch must be rejected with 403
        await assert.rejects(
            async () => {
                await appointmentService.updateAppointment(
                    "appt-pkr-99",
                    { notes: "Hacked by KTM" },
                    ktmReception
                );
            },
            (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
        );

        // Deleting appointment from another branch must be rejected with 403
        await assert.rejects(
            async () => {
                await appointmentService.deleteAppointment("appt-pkr-99", ktmReception);
            },
            (err) => err.statusCode === 403 && err.code === "FORBIDDEN"
        );
    });

    // ── Phase 28.25C.9D.17 — Follow-up dual-write (Appointment + CommunicationLog) ──
    const makeLead = (id, overrides = {}) => ({
        id,
        firstName: "Test",
        lastName: "Lead",
        email: `${id}@example.com`,
        currentStage: "LEAD",
        isActive: true,
        assignedCounselorId: "counselor-01",
        assignedCounselor: { id: "counselor-01", branchId: "branch-ktm" },
        academicBackground: { leadStage: "NEW" },
        ...overrides,
    });
    const admin = { id: "user-admin-1", role: "SUPER_ADMIN" };
    const flush = () => new Promise((r) => setImmediate(r));

    await t.test("9D.17: FOLLOW_UP creates appointment AND linked follow-up log for the Follow-Ups page", async () => {
        resetStores();
        mockStudentStore["s-dw-1"] = makeLead("s-dw-1");

        const res = await studentService.changePipelineStage(
            "s-dw-1",
            { stage: "FOLLOW_UP", followUpDate: "2026-12-01", followUpTime: "09:30", meetingMode: "PHONE", notes: "Call about IELTS" },
            admin
        );
        await flush();

        assert.equal(mockAppointmentStore.length, 1);
        assert.equal(mockLogStore.length, 1);
        const appt = mockAppointmentStore[0];
        const log = mockLogStore[0];
        assert.equal(appt.counselorId, "counselor-01", "counselor assignment preserved");
        assert.equal(log.studentId, "s-dw-1");
        assert.equal(log.channel, "PHONE");
        assert.equal(log.direction, "OUTBOUND");
        assert.equal(log.authorId, "user-admin-1");
        assert.equal(new Date(log.nextFollowUpAt).getTime(), new Date(appt.datetime).getTime());
        assert.ok(log.content.includes(`[followup-appt:${appt.id}]`), "log linked to appointment");
        assert.ok(log.content.startsWith("Follow-up scheduled for"), "describes a planned follow-up, not a completed contact");
        assert.equal(res.followUpLog.id, log.id);
        assert.equal(mockNotificationCalls.length, 1);
        assert.equal(mockNotificationCalls[0].action, "SCHEDULED");
        assert.equal(mockEmailCalls.length, 1);
    });

    await t.test("9D.17: identical repeated submissions create no duplicates and no extra notifications", async () => {
        resetStores();
        mockStudentStore["s-dw-2"] = makeLead("s-dw-2");
        const payload = { stage: "FOLLOW_UP", followUpDate: "2026-12-02", followUpTime: "10:00" };

        for (let i = 0; i < 3; i++) {
            await studentService.changePipelineStage("s-dw-2", payload, admin);
        }
        await flush();

        assert.equal(mockAppointmentStore.length, 1);
        assert.equal(mockLogStore.length, 1);
        assert.equal(mockNotificationCalls.length, 1, "only the first submission notifies");
        assert.equal(mockEmailCalls.length, 1, "only the first submission emails");
    });

    await t.test("9D.17: rescheduling updates the same appointment and log in place", async () => {
        resetStores();
        mockStudentStore["s-dw-3"] = makeLead("s-dw-3");

        await studentService.changePipelineStage("s-dw-3", { stage: "FOLLOW_UP", followUpDate: "2026-12-03", followUpTime: "10:00" }, admin);
        const firstApptId = mockAppointmentStore[0].id;
        const firstLogId = mockLogStore[0].id;

        await studentService.changePipelineStage(
            "s-dw-3",
            { stage: "FOLLOW_UP", followUpDate: "2026-12-05", followUpTime: "14:15", meetingMode: "ONLINE" },
            admin
        );
        await flush();

        assert.equal(mockAppointmentStore.length, 1);
        assert.equal(mockLogStore.length, 1);
        assert.equal(mockAppointmentStore[0].id, firstApptId);
        assert.equal(mockLogStore[0].id, firstLogId);
        const expected = new Date("2026-12-05T14:15").getTime();
        assert.equal(new Date(mockAppointmentStore[0].datetime).getTime(), expected);
        assert.equal(new Date(mockLogStore[0].nextFollowUpAt).getTime(), expected);
        assert.equal(mockLogStore[0].channel, "MEETING");
        assert.deepEqual(mockNotificationCalls.map((n) => n.action), ["SCHEDULED", "RESCHEDULED"]);
    });

    await t.test("9D.17: follow-up log write failure rolls back appointment and stage change", async () => {
        resetStores();
        mockStudentStore["s-dw-4"] = makeLead("s-dw-4");
        mockPrisma._failLogCreate = true;

        await assert.rejects(
            () => studentService.changePipelineStage("s-dw-4", { stage: "FOLLOW_UP", followUpDate: "2026-12-04", followUpTime: "11:00" }, admin),
            { message: "Simulated communication log write failure" }
        );
        mockPrisma._failLogCreate = false;
        await flush();

        assert.equal(mockAppointmentStore.length, 0, "appointment rolled back");
        assert.equal(mockLogStore.length, 0);
        assert.equal(mockHistoryStore.length, 0);
        assert.equal(mockStudentStore["s-dw-4"].academicBackground.leadStage, "NEW");
        assert.equal(mockNotificationCalls.length, 0, "no notification for failed transaction");
    });

    await t.test("9D.17: FOLLOW_UP without date/time is rejected and writes nothing", async () => {
        resetStores();
        mockStudentStore["s-dw-5"] = makeLead("s-dw-5");

        await assert.rejects(
            () => studentService.changePipelineStage("s-dw-5", { stage: "FOLLOW_UP", followUpDate: "2026-12-04" }, admin),
            (err) => err.code === "MISSING_FOLLOWUP_DATETIME"
        );
        await assert.rejects(
            () => studentService.changePipelineStage("s-dw-5", { stage: "FOLLOW_UP", followUpDate: "not-a-date", followUpTime: "99:99" }, admin),
            (err) => err.code === "INVALID_FOLLOWUP_DATETIME"
        );
        assert.equal(mockAppointmentStore.length, 0);
        assert.equal(mockLogStore.length, 0);
    });

    await t.test("9D.17: backend authorization blocks out-of-scope follow-up scheduling", async () => {
        resetStores();
        mockStudentStore["s-dw-6"] = makeLead("s-dw-6");
        const payload = { stage: "FOLLOW_UP", followUpDate: "2026-12-06", followUpTime: "10:00" };

        await assert.rejects(
            () => studentService.changePipelineStage("s-dw-6", payload, { id: "counselor-99", role: "COUNSELOR" }),
            (err) => err.statusCode === 403
        );
        await assert.rejects(
            () => studentService.changePipelineStage("s-dw-6", payload, { id: "fd-pkr", role: "FRONT_DESK", branchId: "branch-pkr" }),
            (err) => err.statusCode === 403
        );
        assert.equal(mockAppointmentStore.length, 0);
        assert.equal(mockLogStore.length, 0);

        // Assigned counselor IS allowed
        await studentService.changePipelineStage("s-dw-6", payload, { id: "counselor-01", role: "COUNSELOR" });
        assert.equal(mockAppointmentStore.length, 1);
        assert.equal(mockLogStore.length, 1);
    });

    await t.test("9D.17: student queries use explicit projections (no unmigrated columns requested)", async () => {
        resetStores();
        mockStudentStore["s-dw-7"] = makeLead("s-dw-7");
        const captured = [];
        const origFind = mockPrisma.student.findUnique;
        const origUpdate = mockPrisma.student.update;
        mockPrisma.student.findUnique = async (args) => { captured.push(args); return origFind(args); };
        mockPrisma.student.update = async (args) => { captured.push(args); return origUpdate(args); };
        try {
            await studentService.changePipelineStage("s-dw-7", { stage: "FOLLOW_UP", followUpDate: "2026-12-07", followUpTime: "10:00" }, admin);
        } finally {
            mockPrisma.student.findUnique = origFind;
            mockPrisma.student.update = origUpdate;
        }
        assert.ok(captured.length >= 2);
        for (const args of captured) {
            assert.ok(args.select, "query must use explicit select");
            assert.equal(args.include, undefined);
            for (const col of ["leadStage", "trashReason", "trashedAt", "trashedById"]) {
                assert.equal(args.select[col], undefined, `must not select ${col}`);
            }
        }
    });
});
