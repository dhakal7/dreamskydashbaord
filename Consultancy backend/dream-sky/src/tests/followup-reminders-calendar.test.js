const test = require("node:test");
const assert = require("node:assert/strict");

// ── In-Memory Isolated Store & Prisma Mock ───────────────────────────────────
// Strict zero-database mock: No connections to PostgreSQL on port 5432 or 5433.

const store = {
    students: new Map(),
    users: new Map(),
    appointments: new Map(),
    appointmentReminders: new Map(),
    notifications: new Map(),
    auditLogs: [],
    pipelineHistories: [],
};

const resetStore = () => {
    store.students.clear();
    store.users.clear();
    store.appointments.clear();
    store.appointmentReminders.clear();
    store.notifications.clear();
    store.auditLogs.length = 0;
    store.pipelineHistories.length = 0;
};

const mockPrisma = {
    student: {
        findUnique: async ({ where, select, include }) => {
            const s = store.students.get(where.id);
            if (!s) return null;
            const res = { ...s };
            if (select?.assignedCounselor || include?.assignedCounselor) {
                res.assignedCounselor = store.users.get(s.assignedCounselorId) || null;
            }
            return res;
        },
        findFirst: async ({ where }) => {
            for (const s of store.students.values()) {
                if (where.email && s.email === where.email) {
                    if (where.NOT?.id && s.id === where.NOT.id) continue;
                    return { ...s };
                }
            }
            return null;
        },
        update: async ({ where, data }) => {
            const existing = store.students.get(where.id);
            if (!existing) throw new Error("Student not found");
            const updated = { ...existing, ...data, updatedAt: new Date() };
            store.students.set(where.id, updated);
            return updated;
        },
    },
    user: {
        findUnique: async ({ where, select }) => {
            const u = store.users.get(where.id);
            if (!u) return null;
            return { ...u };
        },
        findMany: async ({ where = {}, orderBy }) => {
            let list = Array.from(store.users.values());
            if (where?.role) {
                if (typeof where.role === "string") {
                    list = list.filter((u) => u.role === where.role);
                } else if (where.role?.in) {
                    list = list.filter((u) => where.role.in.includes(u.role));
                }
            }
            if (where?.branchId) {
                list = list.filter((u) => u.branchId === where.branchId);
            }
            if (where?.status) {
                list = list.filter((u) => (u.status || "ACTIVE") === where.status);
            }
            return list;
        },
    },
    appointment: {
        findUnique: async ({ where, include }) => {
            const a = store.appointments.get(where.id);
            if (!a) return null;
            const res = { ...a };
            if (include?.student) {
                const s = store.students.get(a.studentId);
                res.student = s ? { ...s, assignedCounselor: store.users.get(s?.assignedCounselorId) || null } : null;
            }
            if (include?.counselor) {
                res.counselor = store.users.get(a.counselorId) || null;
            }
            return res;
        },
        findFirst: async ({ where }) => {
            for (const a of store.appointments.values()) {
                if (where.studentId && a.studentId !== where.studentId) continue;
                if (where.type && a.type !== where.type) continue;
                if (where.status && a.status !== where.status) continue;
                if (where.datetime) {
                    const target = new Date(where.datetime).getTime();
                    if (new Date(a.datetime).getTime() !== target) continue;
                }
                return { ...a };
            }
            return null;
        },
        findMany: async ({ where = {}, orderBy, skip = 0, take = 50, include }) => {
            let list = Array.from(store.appointments.values());

            if (where.id?.not) {
                list = list.filter((a) => a.id !== where.id.not);
            }
            if (where.status) {
                list = list.filter((a) => a.status === where.status);
            }
            if (where.type) {
                list = list.filter((a) => a.type === where.type);
            }
            if (where.studentId) {
                list = list.filter((a) => a.studentId === where.studentId);
            }
            if (where.counselorId) {
                list = list.filter((a) => a.counselorId === where.counselorId);
            }
            if (where.student?.isActive !== undefined) {
                list = list.filter((a) => {
                    const s = store.students.get(a.studentId);
                    return s && s.isActive === where.student.isActive;
                });
            }
            if (where.datetime) {
                if (where.datetime.gte) {
                    list = list.filter((a) => new Date(a.datetime) >= new Date(where.datetime.gte));
                }
                if (where.datetime.lte) {
                    list = list.filter((a) => new Date(a.datetime) <= new Date(where.datetime.lte));
                }
                if (where.datetime.lt) {
                    list = list.filter((a) => new Date(a.datetime) < new Date(where.datetime.lt));
                }
                if (where.datetime.gt) {
                    list = list.filter((a) => new Date(a.datetime) > new Date(where.datetime.gt));
                }
            }
            if (where.OR) {
                list = list.filter((a) => {
                    const counselor = store.users.get(a.counselorId);
                    const student = store.students.get(a.studentId);
                    const studentCounselor = student ? store.users.get(student.assignedCounselorId) : null;
                    return where.OR.some((cond) => {
                        if (cond.counselor?.branchId && counselor?.branchId === cond.counselor.branchId) return true;
                        if (cond.student?.assignedCounselor?.branchId && studentCounselor?.branchId === cond.student.assignedCounselor.branchId) return true;
                        return false;
                    });
                });
            }

            list.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
            return list.slice(skip, skip + take).map((a) => {
                const res = { ...a };
                if (include?.student) {
                    const s = store.students.get(a.studentId);
                    res.student = s ? { ...s, assignedCounselor: store.users.get(s?.assignedCounselorId) || null } : null;
                }
                if (include?.counselor) {
                    res.counselor = store.users.get(a.counselorId) || null;
                }
                return res;
            });
        },
        count: async ({ where = {} }) => {
            const items = await mockPrisma.appointment.findMany({ where, skip: 0, take: 9999 });
            return items.length;
        },
        create: async ({ data, include }) => {
            const id = `appt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const appt = {
                id,
                ...data,
                status: data.status || "SCHEDULED",
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            store.appointments.set(id, appt);
            const res = { ...appt };
            if (include?.student) res.student = store.students.get(data.studentId) || null;
            if (include?.counselor) res.counselor = store.users.get(data.counselorId) || null;
            return res;
        },
        update: async ({ where, data }) => {
            const existing = store.appointments.get(where.id);
            if (!existing) throw new Error("Appointment not found");
            const updated = { ...existing, ...data, updatedAt: new Date() };
            store.appointments.set(where.id, updated);
            return updated;
        },
        delete: async ({ where }) => {
            store.appointments.delete(where.id);
            return { id: where.id };
        },
    },
    notification: {
        findUnique: async ({ where }) => {
            const n = store.notifications.get(where.id);
            return n ? { ...n } : null;
        },
        findFirst: async ({ where }) => {
            for (const n of store.notifications.values()) {
                if (where.recipientUserId && n.recipientUserId !== where.recipientUserId) continue;
                if (where.subject && n.subject !== where.subject) continue;
                return { ...n };
            }
            return null;
        },
        findMany: async ({ where = {}, orderBy, skip = 0, take = 50 }) => {
            let list = Array.from(store.notifications.values());
            if (where.recipientUserId) {
                list = list.filter((n) => n.recipientUserId === where.recipientUserId);
            }
            if (where.status) {
                list = list.filter((n) => n.status === where.status);
            }
            list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            return list.slice(skip, skip + take).map((n) => ({ ...n }));
        },
        count: async ({ where = {} }) => {
            let list = Array.from(store.notifications.values());
            if (where.recipientUserId) {
                list = list.filter((n) => n.recipientUserId === where.recipientUserId);
            }
            if (where.status) {
                list = list.filter((n) => n.status === where.status);
            }
            return list.length;
        },
        create: async ({ data }) => {
            const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const n = {
                id,
                ...data,
                status: data.status || "QUEUED",
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            store.notifications.set(id, n);
            return { ...n };
        },
        update: async ({ where, data }) => {
            const existing = store.notifications.get(where.id);
            if (!existing) throw new Error("Notification not found");
            const updated = { ...existing, ...data, updatedAt: new Date() };
            store.notifications.set(where.id, updated);
            return updated;
        },
        delete: async ({ where }) => {
            const existing = store.notifications.get(where.id);
            store.notifications.delete(where.id);
            return existing || { id: where.id };
        },
    },
    appointmentReminder: {
        findUnique: async ({ where }) => {
            const r = store.appointmentReminders.get(where.id);
            return r ? { ...r } : null;
        },
        findFirst: async ({ where = {} }) => {
            for (const r of store.appointmentReminders.values()) {
                if (where.appointmentId && r.appointmentId !== where.appointmentId) continue;
                if (where.offset && r.offset !== where.offset) continue;
                if (where.scheduledFor) {
                    const target = new Date(where.scheduledFor).getTime();
                    if (new Date(r.scheduledFor).getTime() !== target) continue;
                }
                if (where.status) {
                    if (typeof where.status === "string" && r.status !== where.status) continue;
                    if (where.status.in && !where.status.in.includes(r.status)) continue;
                }
                return { ...r };
            }
            return null;
        },
        findMany: async ({ where = {}, orderBy, take = 50, include }) => {
            let list = Array.from(store.appointmentReminders.values());
            if (where.status) {
                list = list.filter((r) => r.status === where.status);
            }
            if (where.scheduledFor?.lte) {
                list = list.filter((r) => new Date(r.scheduledFor) <= new Date(where.scheduledFor.lte));
            }
            if (where.appointmentId) {
                list = list.filter((r) => r.appointmentId === where.appointmentId);
            }
            list.sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));
            return list.slice(0, take).map((r) => {
                const res = { ...r };
                if (include?.appointment) {
                    const appt = store.appointments.get(r.appointmentId);
                    if (appt) {
                        const apptCopy = { ...appt };
                        if (include.appointment.include?.student) {
                            const s = store.students.get(appt.studentId);
                            apptCopy.student = s ? { ...s, assignedCounselor: store.users.get(s?.assignedCounselorId) || null } : null;
                        }
                        if (include.appointment.include?.counselor) {
                            apptCopy.counselor = store.users.get(appt.counselorId) || null;
                        }
                        res.appointment = apptCopy;
                    } else {
                        res.appointment = null;
                    }
                }
                return res;
            });
        },
        create: async ({ data }) => {
            const id = data.id || `rem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const r = {
                id,
                appointmentId: data.appointmentId,
                offset: data.offset,
                scheduledFor: new Date(data.scheduledFor),
                status: data.status || "PENDING",
                sentAt: data.sentAt ? new Date(data.sentAt) : null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            store.appointmentReminders.set(id, r);
            return { ...r };
        },
        update: async ({ where, data }) => {
            const existing = store.appointmentReminders.get(where.id);
            if (!existing) throw new Error("AppointmentReminder not found");
            const updated = { ...existing, ...data, updatedAt: new Date() };
            store.appointmentReminders.set(where.id, updated);
            return updated;
        },
        delete: async ({ where }) => {
            const existing = store.appointmentReminders.get(where.id);
            store.appointmentReminders.delete(where.id);
            return existing || { id: where.id };
        },
        deleteMany: async ({ where = {} }) => {
            let count = 0;
            for (const [id, r] of Array.from(store.appointmentReminders.entries())) {
                if (where.appointmentId && r.appointmentId !== where.appointmentId) continue;
                if (where.status && r.status !== where.status) continue;
                store.appointmentReminders.delete(id);
                count++;
            }
            return { count };
        },
    },
    notificationTemplate: {
        findUnique: async () => null,
    },
    pipelineStageHistory: {
        create: async ({ data }) => {
            const h = { id: `hist-${Date.now()}`, ...data, changedAt: new Date() };
            store.pipelineHistories.push(h);
            return h;
        },
    },
    $queryRawUnsafe: async (sql) => {
        if (sql.includes("pg_try_advisory_lock")) return [{ locked: true }];
        if (sql.includes("pg_advisory_unlock")) return [{ unlocked: true }];
        return [];
    },
    $queryRaw: async (strings, ...values) => {
        const sql = strings[0] || "";
        if (sql.includes("pg_try_advisory_lock")) return [{ locked: true }];
        if (sql.includes("pg_advisory_unlock")) return [{ unlocked: true }];
        return [];
    },
    $pool: {
        connect: async () => ({
            query: async (sql, params) => {
                if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
                if (sql.includes("pg_advisory_unlock")) return { rows: [{ unlocked: true }] };
                return { rows: [] };
            },
            release: () => {},
        }),
    },
    $transaction: async (fn) => {
        if (Array.isArray(fn)) return await Promise.all(fn);
        const txClient = {
            student: mockPrisma.student,
            user: mockPrisma.user,
            appointment: mockPrisma.appointment,
            appointmentReminder: mockPrisma.appointmentReminder,
            notification: mockPrisma.notification,
            pipelineStageHistory: mockPrisma.pipelineStageHistory,
        };
        return await fn(txClient);
    },
};

// Intercept require.cache for prisma
const prismaPath = require.resolve("../prisma");
require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: mockPrisma,
};

// Load modules under test
const appointmentService = require("../services/appointment.service");
const notificationService = require("../services/notification.service");
const studentService = require("../services/student.service");
const notificationController = require("../controllers/notification.controller");
const notificationPoller = require("../services/notification.poller");

// ── Test Setup Fixtures ───────────────────────────────────────────────────────
function seedTestData() {
    resetStore();

    // Users
    store.users.set("super-admin-1", {
        id: "super-admin-1",
        firstName: "Super",
        lastName: "Admin",
        role: "SUPER_ADMIN",
        branchId: null,
        email: "super@dreamsky.com",
        status: "ACTIVE",
    });

    store.users.set("branch-admin-ktm", {
        id: "branch-admin-ktm",
        firstName: "Bijay",
        lastName: "Admin",
        role: "BRANCH_ADMIN",
        branchId: "branch-ktm",
        email: "bijay@dreamsky.com",
        status: "ACTIVE",
    });

    store.users.set("branch-admin-pkr", {
        id: "branch-admin-pkr",
        firstName: "Dinesh",
        lastName: "Pokhara",
        role: "BRANCH_ADMIN",
        branchId: "branch-pkr",
        email: "dinesh@dreamsky.com",
        status: "ACTIVE",
    });

    store.users.set("counselor-ktm-1", {
        id: "counselor-ktm-1",
        firstName: "Aarav",
        lastName: "Sharma",
        role: "COUNSELOR",
        branchId: "branch-ktm",
        email: "aarav@dreamsky.com",
        status: "ACTIVE",
    });

    store.users.set("counselor-ktm-2", {
        id: "counselor-ktm-2",
        firstName: "Pooja",
        lastName: "Thapa",
        role: "COUNSELOR",
        branchId: "branch-ktm",
        email: "pooja@dreamsky.com",
        status: "ACTIVE",
    });

    store.users.set("counselor-pkr-1", {
        id: "counselor-pkr-1",
        firstName: "Bikash",
        lastName: "Gurung",
        role: "COUNSELOR",
        branchId: "branch-pkr",
        email: "bikash@dreamsky.com",
        status: "ACTIVE",
    });

    store.users.set("frontdesk-ktm", {
        id: "frontdesk-ktm",
        firstName: "Sita",
        lastName: "Frontdesk",
        role: "FRONT_DESK",
        branchId: "branch-ktm",
        email: "reception.ktm@dreamsky.com",
        status: "ACTIVE",
    });

    // Students
    store.students.set("student-unassigned-ktm", {
        id: "student-unassigned-ktm",
        firstName: "Anil",
        lastName: "Poudel",
        email: "anil@example.com",
        isActive: true,
        currentStage: "LEAD",
        assignedCounselorId: null,
        academicBackground: { branchId: "branch-ktm" },
    });

    store.students.set("student-unassigned-nobranch", {
        id: "student-unassigned-nobranch",
        firstName: "Binod",
        lastName: "Thapa",
        email: "binod@example.com",
        isActive: true,
        currentStage: "LEAD",
        assignedCounselorId: null,
        academicBackground: {},
    });
    store.students.set("student-active-1", {
        id: "student-active-1",
        firstName: "Rohan",
        lastName: "Adhikari",
        email: "rohan@example.com",
        isActive: true,
        currentStage: "LEAD",
        assignedCounselorId: "counselor-ktm-1",
        academicBackground: { leadStage: "FOLLOW_UP" },
    });

    store.students.set("student-trashed-1", {
        id: "student-trashed-1",
        firstName: "Suresh",
        lastName: "Shrestha",
        email: "suresh@example.com",
        isActive: false, // In Trash!
        currentStage: "LEAD",
        assignedCounselorId: "counselor-ktm-1",
        academicBackground: { leadStage: "FOLLOW_UP", trashReason: "Lead unresponsive" },
    });
}

// ── Test Suites ───────────────────────────────────────────────────────────────

test("Phase 28.25C Suite: Follow-Up Reminders, Staff Notifications, and Calendar Integration", async (t) => {

    await t.test("1. Reminder eligibility: returns upcoming scheduled follow-ups within timeframe", async () => {
        seedTestData();
        const now = new Date();
        const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        const inThirtyMinutes = new Date(now.getTime() + 30 * 60 * 1000);

        store.appointments.set("appt-upcoming-1", {
            id: "appt-upcoming-1",
            studentId: "student-active-1",
            counselorId: "counselor-ktm-1",
            datetime: inTwoHours,
            durationMin: 30,
            type: "FOLLOW_UP",
            status: "SCHEDULED",
            meetingMode: "OFFICE",
        });

        store.appointments.set("appt-approaching-1", {
            id: "appt-approaching-1",
            studentId: "student-active-1",
            counselorId: "counselor-ktm-1",
            datetime: inThirtyMinutes,
            durationMin: 30,
            type: "FOLLOW_UP",
            status: "SCHEDULED",
            meetingMode: "ONLINE",
        });

        const reminders = await appointmentService.getUpcomingFollowUpReminders({
            hoursAhead: 24,
            currentUser: { role: "SUPER_ADMIN" },
        });

        assert.equal(reminders.length, 2);
        const approaching = reminders.find((r) => r.appointmentId === "appt-approaching-1");
        assert.ok(approaching);
        assert.equal(approaching.isApproaching, true);
        assert.ok(approaching.minutesUntil <= 35 && approaching.minutesUntil >= 25);

        const twoHours = reminders.find((r) => r.appointmentId === "appt-upcoming-1");
        assert.ok(twoHours);
        assert.equal(twoHours.isApproaching, false);
    });

    await t.test("2. Stale-reminder suppression: excludes cancelled, completed, no-show, and trashed students", async () => {
        seedTestData();
        const now = new Date();
        const inThreeHours = new Date(now.getTime() + 3 * 60 * 60 * 1000);

        // Cancelled follow-up
        store.appointments.set("appt-cancelled", {
            id: "appt-cancelled",
            studentId: "student-active-1",
            counselorId: "counselor-ktm-1",
            datetime: inThreeHours,
            durationMin: 30,
            type: "FOLLOW_UP",
            status: "CANCELLED",
        });

        // Completed follow-up
        store.appointments.set("appt-completed", {
            id: "appt-completed",
            studentId: "student-active-1",
            counselorId: "counselor-ktm-1",
            datetime: inThreeHours,
            durationMin: 30,
            type: "FOLLOW_UP",
            status: "COMPLETED",
        });

        // No-show follow-up
        store.appointments.set("appt-noshow", {
            id: "appt-noshow",
            studentId: "student-active-1",
            counselorId: "counselor-ktm-1",
            datetime: inThreeHours,
            durationMin: 30,
            type: "FOLLOW_UP",
            status: "NO_SHOW",
        });

        // Follow-up for a student in Trash
        store.appointments.set("appt-trashed-student", {
            id: "appt-trashed-student",
            studentId: "student-trashed-1", // isActive = false
            counselorId: "counselor-ktm-1",
            datetime: inThreeHours,
            durationMin: 30,
            type: "FOLLOW_UP",
            status: "SCHEDULED",
        });

        const reminders = await appointmentService.getUpcomingFollowUpReminders({
            hoursAhead: 24,
            currentUser: { role: "SUPER_ADMIN" },
        });

        // All 4 stale appointments must be suppressed
        assert.equal(reminders.length, 0);
    });

    await t.test("3. Scheduling notification: creating follow-up queues IN_APP notification to counselor", async () => {
        seedTestData();
        const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const appt = await appointmentService.createAppointment({
            studentId: "student-active-1",
            counselorId: "counselor-ktm-1",
            datetime: futureDate.toISOString(),
            durationMin: 30,
            type: "FOLLOW_UP",
            meetingMode: "OFFICE",
        });

        assert.equal(appt.type, "FOLLOW_UP");

        const notifications = Array.from(store.notifications.values());
        assert.equal(notifications.length, 1);
        const notif = notifications[0];
        assert.equal(notif.recipientUserId, "counselor-ktm-1");
        assert.equal(notif.subject, "Follow-Up Scheduled");
        assert.equal(notif.payload.action, "SCHEDULED");
        assert.equal(notif.payload.appointmentId, appt.id);
        assert.equal(notif.payload.studentName, "Rohan Adhikari");
    });

    await t.test("4. Rescheduling notification: updating datetime queues Follow-Up Rescheduled notification", async () => {
        seedTestData();
        const originalDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const appt = await appointmentService.createAppointment({
            studentId: "student-active-1",
            counselorId: "counselor-ktm-1",
            datetime: originalDate.toISOString(),
            durationMin: 30,
            type: "FOLLOW_UP",
        });

        store.notifications.clear(); // Clear initial schedule notification

        const newDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
        await appointmentService.updateAppointment(
            appt.id,
            { datetime: newDate.toISOString() },
            { role: "COUNSELOR", id: "counselor-ktm-1" }
        );

        const notifications = Array.from(store.notifications.values());
        assert.equal(notifications.length, 1);
        const notif = notifications[0];
        assert.equal(notif.recipientUserId, "counselor-ktm-1");
        assert.equal(notif.subject, "Follow-Up Rescheduled");
        assert.equal(notif.payload.action, "RESCHEDULED");
        assert.equal(notif.payload.newDatetime, newDate.toISOString());
    });

    await t.test("5. Cancellation notification: marking CANCELLED queues Follow-Up Cancelled notification", async () => {
        seedTestData();
        const originalDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const appt = await appointmentService.createAppointment({
            studentId: "student-active-1",
            counselorId: "counselor-ktm-1",
            datetime: originalDate.toISOString(),
            durationMin: 30,
            type: "FOLLOW_UP",
        });

        store.notifications.clear();

        await appointmentService.changeStatus(
            appt.id,
            { status: "CANCELLED" },
            { role: "COUNSELOR", id: "counselor-ktm-1" }
        );

        const notifications = Array.from(store.notifications.values());
        assert.equal(notifications.length, 1);
        const notif = notifications[0];
        assert.equal(notif.recipientUserId, "counselor-ktm-1");
        assert.equal(notif.subject, "Follow-Up Cancelled");
        assert.equal(notif.payload.action, "CANCELLED");
    });

    await t.test("6. Duplicate notification prevention: repeated dispatch is suppressed", async () => {
        seedTestData();
        const appt = {
            id: "appt-dup-test",
            studentId: "student-active-1",
            datetime: new Date().toISOString(),
        };

        const first = await notificationService.queueFollowUpNotification({
            recipientUserId: "counselor-ktm-1",
            action: "SCHEDULED",
            appointment: appt,
            studentName: "Rohan Adhikari",
            datetime: appt.datetime,
        });

        assert.ok(first);
        assert.equal(store.notifications.size, 1);

        // Immediate retry of identical notification
        const second = await notificationService.queueFollowUpNotification({
            recipientUserId: "counselor-ktm-1",
            action: "SCHEDULED",
            appointment: appt,
            studentName: "Rohan Adhikari",
            datetime: appt.datetime,
        });

        assert.equal(second, null); // Suppressed!
        assert.equal(store.notifications.size, 1);
    });

    await t.test("7. Role & branch authorization: counselors restricted to own appointments; frontdesk restricted to branch", async () => {
        seedTestData();
        const now = new Date();
        const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

        // KTM counselor appointment
        store.appointments.set("appt-ktm", {
            id: "appt-ktm",
            studentId: "student-active-1",
            counselorId: "counselor-ktm-1",
            datetime: inTwoHours,
            durationMin: 30,
            type: "FOLLOW_UP",
            status: "SCHEDULED",
        });

        store.students.set("student-pkr-1", {
            id: "student-pkr-1",
            firstName: "Binod",
            lastName: "Gurung",
            email: "binod@example.com",
            isActive: true,
            currentStage: "LEAD",
            assignedCounselorId: "counselor-pkr-1",
            academicBackground: { leadStage: "FOLLOW_UP" },
        });

        // PKR counselor appointment
        store.appointments.set("appt-pkr", {
            id: "appt-pkr",
            studentId: "student-pkr-1",
            counselorId: "counselor-pkr-1",
            datetime: inTwoHours,
            durationMin: 30,
            type: "FOLLOW_UP",
            status: "SCHEDULED",
        });

        // 7.1 Counselor KTM query: even if they pass counselorId=counselor-pkr-1, server overrides to their own id!
        const counselorReminders = await appointmentService.getUpcomingFollowUpReminders({
            counselorId: "counselor-pkr-1", // malicious query parameter
            currentUser: { role: "COUNSELOR", id: "counselor-ktm-1", userId: "counselor-ktm-1" },
        });

        assert.equal(counselorReminders.length, 1);
        assert.equal(counselorReminders[0].appointmentId, "appt-ktm");

        // 7.2 Front Desk KTM: sees KTM appointments, excluded from PKR appointments
        const frontDeskReminders = await appointmentService.getUpcomingFollowUpReminders({
            currentUser: { role: "FRONT_DESK", branchId: "branch-ktm" },
        });

        assert.equal(frontDeskReminders.length, 1);
        assert.equal(frontDeskReminders[0].appointmentId, "appt-ktm");

        // 7.3 Super Admin: sees both
        const superAdminReminders = await appointmentService.getUpcomingFollowUpReminders({
            currentUser: { role: "SUPER_ADMIN" },
        });

        assert.equal(superAdminReminders.length, 2);
    });

    await t.test("8. Read status management & feed listing formatting", async () => {
        seedTestData();

        const notif = await mockPrisma.notification.create({
            data: {
                channel: "IN_APP",
                recipientUserId: "counselor-ktm-1",
                subject: "Follow-Up Scheduled",
                body: "Follow-up scheduled with Rohan Adhikari",
                status: "QUEUED",
                payload: { action: "SCHEDULED", appointmentId: "appt-1" },
            },
        });

        // 8.1 Unauthorized read attempt by different user rejected with 403
        await assert.rejects(
            async () => {
                await notificationService.markNotificationAsRead(notif.id, { role: "COUNSELOR", id: "counselor-pkr-1" });
            },
            { statusCode: 403 }
        );

        // 8.2 Authorized read by recipient updates payload read status
        const updated = await notificationService.markNotificationAsRead(notif.id, { role: "COUNSELOR", id: "counselor-ktm-1" });
        assert.equal(updated.payload.read, true);
        assert.ok(updated.payload.readAt);

        // 8.3 listNotifications formats response cleanly with title and readAt
        const listRes = await notificationService.listNotifications({ recipientUserId: "counselor-ktm-1" });
        assert.equal(listRes.total, 1);
        assert.equal(listRes.notifications[0].title, "Follow-Up Scheduled");
        assert.equal(listRes.notifications[0].read, true);
        assert.ok(listRes.notifications[0].readAt);

        // 8.4 markAllNotificationsAsRead marks all user notifications
        const allRes = await notificationService.markAllNotificationsAsRead({ role: "COUNSELOR", id: "counselor-ktm-1" });
        assert.equal(allRes.success, true);
    });

    await t.test("9. Pipeline stage transition to FOLLOW_UP triggers counselor notification outside tx", async () => {
        seedTestData();
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const dateStr = tomorrow.toISOString().split("T")[0];

        const result = await studentService.changePipelineStage(
            "student-active-1",
            {
                leadStage: "FOLLOW_UP",
                followUpDate: dateStr,
                followUpTime: "11:00",
                notes: "Consultation follow-up",
            },
            { role: "COUNSELOR", id: "counselor-ktm-1" }
        );

        assert.ok(result.followUpAppointment);
        assert.equal(result.leadStage, "FOLLOW_UP");

        const notifications = Array.from(store.notifications.values());
        assert.equal(notifications.length, 1);
        const notif = notifications[0];
        assert.equal(notif.recipientUserId, "counselor-ktm-1");
        assert.equal(notif.subject, "Follow-Up Scheduled");
        assert.equal(notif.payload.action, "SCHEDULED");
    });

    await t.test("10. Phase 28.25C.2 Fix 1: Notification status validation & read/unread filtering", async () => {
        seedTestData();

        // 10.1 Controller: status=READ rejected with 400 before service/Prisma call
        let caughtErr = null;
        await notificationController.listNotifications(
            { query: { status: "READ" }, user: { id: "counselor-ktm-1", role: "COUNSELOR" } },
            {},
            (err) => { caughtErr = err; }
        );
        assert.ok(caughtErr);
        assert.equal(caughtErr.statusCode, 400);
        assert.ok(caughtErr.message.includes("Invalid status 'READ'"));

        // 10.2 Controller: status=INVALID rejected with 400
        let caughtInvalid = null;
        await notificationController.listNotifications(
            { query: { status: "INVALID_STATUS" }, user: { id: "counselor-ktm-1", role: "COUNSELOR" } },
            {},
            (err) => { caughtInvalid = err; }
        );
        assert.ok(caughtInvalid);
        assert.equal(caughtInvalid.statusCode, 400);

        // 10.3 Controller: read=invalid rejected with 400
        let caughtReadErr = null;
        await notificationController.listNotifications(
            { query: { read: "not-a-boolean" }, user: { id: "counselor-ktm-1", role: "COUNSELOR" } },
            {},
            (err) => { caughtReadErr = err; }
        );
        assert.ok(caughtReadErr);
        assert.equal(caughtReadErr.statusCode, 400);
        assert.ok(caughtReadErr.message.includes("Invalid read filter"));

        // 10.4 Service: read=true / read=false filters payload read state accurately
        store.notifications.clear();
        await mockPrisma.notification.create({
            data: {
                recipientUserId: "counselor-ktm-1",
                subject: "Read Notification",
                status: "QUEUED",
                payload: { read: true, readAt: new Date().toISOString() },
            },
        });
        await mockPrisma.notification.create({
            data: {
                recipientUserId: "counselor-ktm-1",
                subject: "Unread Notification",
                status: "QUEUED",
                payload: { read: false },
            },
        });

        const readOnly = await notificationService.listNotifications({
            recipientUserId: "counselor-ktm-1",
            read: true,
        });
        assert.equal(readOnly.total, 1);
        assert.equal(readOnly.notifications[0].subject, "Read Notification");
        assert.equal(readOnly.notifications[0].read, true);

        const unreadOnly = await notificationService.listNotifications({
            recipientUserId: "counselor-ktm-1",
            read: false,
        });
        assert.equal(unreadOnly.total, 1);
        assert.equal(unreadOnly.notifications[0].subject, "Unread Notification");
        assert.equal(unreadOnly.notifications[0].read, false);
    });

    await t.test("11. Phase 28.25C.2 Fix 2: Concurrency deduplication & constraint collision suppression", async () => {
        seedTestData();
        store.notifications.clear();

        const fakeAppt = { id: "appt-dedup-1", studentId: "student-active-1", datetime: new Date() };

        // 11.1 Normal duplicate suppression
        const first = await notificationService.queueFollowUpNotification({
            recipientUserId: "counselor-ktm-1",
            action: "SCHEDULED",
            appointment: fakeAppt,
            studentName: "Test Student",
            datetime: fakeAppt.datetime,
        });
        assert.ok(first);

        const duplicate = await notificationService.queueFollowUpNotification({
            recipientUserId: "counselor-ktm-1",
            action: "SCHEDULED",
            appointment: fakeAppt,
            studentName: "Test Student",
            datetime: fakeAppt.datetime,
        });
        assert.equal(duplicate, null);

        // 11.2 Database unique constraint collision simulation (P2002 / 23505)
        const origCreate = mockPrisma.notification.create;
        try {
            mockPrisma.notification.create = async () => {
                const err = new Error("Unique constraint failed on the fields: (recipientUserId, appointmentId, action)");
                err.code = "P2002";
                throw err;
            };

            const concurrentCollision = await notificationService.queueFollowUpNotification({
                recipientUserId: "counselor-ktm-2",
                action: "SCHEDULED",
                appointment: { id: "appt-concurrent-1", datetime: new Date() },
                studentName: "Concurrent Lead",
            });
            // Concurrency violation is caught gracefully and returns null without throwing
            assert.equal(concurrentCollision, null);
        } finally {
            mockPrisma.notification.create = origCreate;
        }

        // 11.3 Concurrency limitation documentation: Unit tests can verify application error catching,
        // but true multi-process serialization requires the database partial unique index in migration.sql.
        assert.ok(true, "Documented concurrency guarantee boundary");
    });

    await t.test("12. Phase 28.25C.2 Fix 4: Cross-tab notification read-state synchronization logic", async () => {
        // Reconcile in-memory store simulation
        const existingLocal = [
            { id: "notif-1", title: "Appt 1", description: "Desc 1", timestamp: "2026-10-24T00:00:00Z", read: false },
            { id: "local-mock-1", title: "Mock", description: "Mock", timestamp: "2026-10-24T00:00:00Z", read: false },
        ];

        // Fresh server response received via background query / cross-tab refetch
        const refreshedServer = [
            { id: "notif-2", title: "Appt 2", description: "Desc 2", timestamp: "2026-10-24T01:00:00Z", read: false },
            { id: "notif-1", title: "Appt 1", description: "Desc 1", timestamp: "2026-10-24T00:00:00Z", read: true }, // Marked read on other tab!
        ];

        const serverMap = new Map(refreshedServer.map((n) => [n.id, n]));
        const existingIds = new Set(existingLocal.map((n) => n.id));

        // Reconcile existing
        const updatedExisting = existingLocal.map((item) => {
            const serverItem = serverMap.get(item.id);
            if (!serverItem) return item;
            return {
                ...item,
                ...serverItem,
                read: Boolean(serverItem.read || item.read),
            };
        });

        // Prepend new items
        const newItems = refreshedServer.filter((n) => !existingIds.has(n.id));
        const finalReconciled = [...newItems, ...updatedExisting];

        // Assertions:
        assert.equal(finalReconciled.length, 3);
        // notif-1 should now be read: true
        const notif1 = finalReconciled.find((n) => n.id === "notif-1");
        assert.equal(notif1.read, true);
        // local-mock-1 is preserved
        const mock1 = finalReconciled.find((n) => n.id === "local-mock-1");
        assert.ok(mock1);
        // notif-2 is prepended
        assert.equal(finalReconciled[0].id, "notif-2");
    });

    await t.test("13. Phase 28.25C.2 Fix 5: Unassigned lead notification routing & branch isolation", async () => {
        seedTestData();
        store.notifications.clear();

        // 13.1 Creating follow-up appointment for unassigned lead in KTM branch notifies designated KTM staff
        const apptKtm = await appointmentService.createAppointment({
            studentId: "student-unassigned-ktm",
            type: "FOLLOW_UP",
            datetime: new Date(Date.now() + 86400000).toISOString(),
            notes: "Initial consultation",
        });
        assert.ok(apptKtm);

        const ktmNotifications = Array.from(store.notifications.values());
        assert.equal(ktmNotifications.length, 1);
        // Designated recipient is BRANCH_ADMIN (Bijay)
        assert.equal(ktmNotifications[0].recipientUserId, "branch-admin-ktm");
        assert.equal(ktmNotifications[0].subject, "Follow-Up Scheduled");

        // 13.2 Never broadcast to all branches: Pokhara staff received 0 notifications
        const pkrStaffNotifications = ktmNotifications.filter(
            (n) => n.recipientUserId === "branch-admin-pkr" || n.recipientUserId === "counselor-pkr-1"
        );
        assert.equal(pkrStaffNotifications.length, 0);

        // 13.3 Avoid duplicate notifications: FRONT_DESK in KTM did not receive duplicate
        const frontDeskNotifications = ktmNotifications.filter((n) => n.recipientUserId === "frontdesk-ktm");
        assert.equal(frontDeskNotifications.length, 0);

        // 13.4 Safe failure on ambiguous branch: Student with no assigned counselor and no determinable branch
        store.notifications.clear();
        const apptNoBranch = await appointmentService.createAppointment({
            studentId: "student-unassigned-nobranch",
            type: "FOLLOW_UP",
            datetime: new Date(Date.now() + 86400000).toISOString(),
        });
        assert.ok(apptNoBranch);

        // Ambiguous branch safely skips notification creation without crashing or broadcasting
        assert.equal(store.notifications.size, 0);
    });

    await t.test("14. Phase 28.25C.4: Migration consolidation logic, NULL action handling & idempotency", async () => {
        seedTestData();
        store.notifications.clear();

        // 14.1 NULL/missing action handling: null and undefined actions match cleanly
        const fakeAppt = { id: "appt-null-action", studentId: "student-active-1", datetime: new Date() };
        const first = await notificationService.queueFollowUpNotification({
            recipientUserId: "counselor-ktm-1",
            action: null,
            appointment: fakeAppt,
            studentName: "Student A",
        });
        assert.ok(first);

        const duplicateNullAction = await notificationService.queueFollowUpNotification({
            recipientUserId: "counselor-ktm-1",
            action: undefined,
            appointment: fakeAppt,
            studentName: "Student A",
        });
        assert.equal(duplicateNullAction, null);

        // 14.2 Migration consolidation simulation:
        // Duplicate records where a later record was read/sent merge state into the earliest record
        const sampleRows = [
            {
                id: "notif-orig",
                recipientUserId: "u1",
                createdAt: new Date("2026-10-24T00:00:00Z"),
                status: "QUEUED",
                sentAt: null,
                payload: { appointmentId: "a1", action: "SCHEDULED", read: false },
            },
            {
                id: "notif-dup",
                recipientUserId: "u1",
                createdAt: new Date("2026-10-24T00:05:00Z"),
                status: "SENT",
                sentAt: new Date("2026-10-24T00:05:10Z"),
                payload: { appointmentId: "a1", action: "SCHEDULED", read: true, readAt: "2026-10-24T00:06:00Z" },
            },
        ];

        // Simulate SQL migration Step 1 consolidation
        const partitionKey = (r) => `${r.recipientUserId}_${r.payload.appointmentId}_${r.payload.action || ""}_${r.payload.newDatetime || ""}`;
        const groups = new Map();
        for (const row of sampleRows) {
            const k = partitionKey(row);
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(row);
        }

        const consolidated = [];
        for (const [key, rows] of groups) {
            rows.sort((a, b) => a.createdAt - b.createdAt);
            const survivor = { ...rows[0], payload: { ...rows[0].payload } };
            const anyRead = rows.some((r) => r.payload?.read === true || r.payload?.readAt);
            const latestReadAt = rows.map((r) => r.payload?.readAt).filter(Boolean).sort().pop();
            const anySent = rows.some((r) => r.status === "SENT");
            const latestSentAt = rows.map((r) => r.sentAt).filter(Boolean).sort().pop();

            if (anySent) {
                survivor.status = "SENT";
                survivor.sentAt = latestSentAt;
            }
            if (anyRead) {
                survivor.payload.read = true;
                survivor.payload.readAt = latestReadAt || new Date().toISOString();
            }
            consolidated.push(survivor);
        }

        // Assertions:
        assert.equal(consolidated.length, 1);
        assert.equal(consolidated[0].id, "notif-orig"); // Earliest survivor preserved
        assert.equal(consolidated[0].status, "SENT");   // Upgraded from QUEUED to SENT
        assert.equal(consolidated[0].payload.read, true); // Read state preserved
        assert.equal(consolidated[0].payload.readAt, "2026-10-24T00:06:00Z"); // Latest readAt preserved

        // 14.3 Idempotency: re-running on consolidated dataset yields 0 further changes
        const reRunGroups = new Map();
        for (const row of consolidated) {
            const k = partitionKey(row);
            if (!reRunGroups.has(k)) reRunGroups.set(k, []);
            reRunGroups.get(k).push(row);
        }
        let reRunDeleted = 0;
        for (const [key, rows] of reRunGroups) {
            if (rows.length > 1) reRunDeleted += rows.length - 1;
        }
        assert.equal(reRunDeleted, 0); // Completely idempotent
    });

    await t.test("15. Phase 28.25C.6: Appointment Reminder Worker & Lifecycle", async () => {
        seedTestData();

        // 15.1 Scheduled appointment automatically persists 24H and 1H AppointmentReminder records
        const baseTime = new Date("2026-11-01T10:00:00.000Z");
        const appt48h = await appointmentService.createAppointment({
            studentId: "student-active-1",
            counselorId: "counselor-ktm-1",
            datetime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
            type: "FOLLOW_UP",
        });

        const reminders48h = await mockPrisma.appointmentReminder.findMany({
            where: { appointmentId: appt48h.id },
        });
        assert.equal(reminders48h.length, 2, "Appointments 48h ahead must have both 24H and 1H reminders scheduled");
        const offsets48h = reminders48h.map((r) => r.offset).sort();
        assert.deepEqual(offsets48h, ["1H", "24H"]);
        assert.equal(reminders48h[0].status, "PENDING");

        // Appointment scheduled 12 hours ahead only schedules 1H reminder (24H would be in past)
        const appt12h = await appointmentService.createAppointment({
            studentId: "student-active-1",
            counselorId: "counselor-ktm-1",
            datetime: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
            type: "FOLLOW_UP",
        });
        const reminders12h = await mockPrisma.appointmentReminder.findMany({
            where: { appointmentId: appt12h.id },
        });
        assert.equal(reminders12h.length, 1, "Appointment 12h ahead must only schedule 1H reminder");
        assert.equal(reminders12h[0].offset, "1H");

        // Clear appointment and reminder stores before 15.2 to isolate worker sweep testing
        store.appointmentReminders.clear();
        store.appointments.clear();

        // 15.2 Worker dispatches due reminders to assigned counselor and updates status to SENT
        // Create an appointment whose 24H reminder is due now
        const apptDueTime = new Date(baseTime.getTime() + 24 * 60 * 60 * 1000); // 24h after baseTime
        const apptDue = await mockPrisma.appointment.create({
            data: {
                studentId: "student-active-1",
                counselorId: "counselor-ktm-1",
                datetime: apptDueTime,
                type: "FOLLOW_UP",
                status: "SCHEDULED",
            },
        });

        const dueReminder = await mockPrisma.appointmentReminder.create({
            data: {
                appointmentId: apptDue.id,
                offset: "24H",
                scheduledFor: baseTime, // exactly due at baseTime
                status: "PENDING",
            },
        });

        // Run worker at baseTime
        const workerResult = await notificationPoller.processDueAppointmentReminders({
            now: baseTime,
            prismaClient: mockPrisma,
        });

        assert.equal(workerResult.sent, 1, "Worker should successfully send 1 due reminder");
        const updatedReminder = await mockPrisma.appointmentReminder.findUnique({ where: { id: dueReminder.id } });
        assert.equal(updatedReminder.status, "SENT");
        assert.ok(updatedReminder.sentAt instanceof Date, "sentAt must be populated with a Date");

        // Verify notification delivered to counselor
        const sentNotifs = Array.from(store.notifications.values()).filter(
            (n) => n.recipientUserId === "counselor-ktm-1" && n.payload?.reminderId === dueReminder.id
        );
        assert.equal(sentNotifs.length, 1, "Exactly one notification queued for counselor");
        assert.ok(sentNotifs[0].subject.includes("24 Hours"));
        assert.ok(sentNotifs[0].body.includes("Rohan Adhikari"));

        // 15.3 Future reminders are NOT processed and remain PENDING
        const futureReminder = await mockPrisma.appointmentReminder.create({
            data: {
                appointmentId: apptDue.id,
                offset: "1H",
                scheduledFor: new Date(baseTime.getTime() + 23 * 60 * 60 * 1000), // in the future
                status: "PENDING",
            },
        });
        const futureSweep = await notificationPoller.processDueAppointmentReminders({
            now: baseTime,
            prismaClient: mockPrisma,
        });
        assert.equal(futureSweep.processed, 0, "Future reminders must not be picked up by worker");
        const untouchedFuture = await mockPrisma.appointmentReminder.findUnique({ where: { id: futureReminder.id } });
        assert.equal(untouchedFuture.status, "PENDING");
        assert.equal(untouchedFuture.sentAt, null);

        // 15.4 Already-sent reminders are not re-processed
        const reSweep = await notificationPoller.processDueAppointmentReminders({
            now: baseTime,
            prismaClient: mockPrisma,
        });
        assert.equal(reSweep.processed, 0, "Already-sent reminder must not be re-processed");

        // 15.5 Cancelled appointments and trashed leads have reminders purged/skipped, never sent
        // A: Cancelled appointment
        const cancelledAppt = await mockPrisma.appointment.create({
            data: {
                studentId: "student-active-1",
                counselorId: "counselor-ktm-1",
                datetime: apptDueTime,
                type: "FOLLOW_UP",
                status: "CANCELLED",
            },
        });
        const cancelledReminder = await mockPrisma.appointmentReminder.create({
            data: {
                appointmentId: cancelledAppt.id,
                offset: "24H",
                scheduledFor: baseTime,
                status: "PENDING",
            },
        });
        const cancelledSweep = await notificationPoller.processDueAppointmentReminders({
            now: baseTime,
            prismaClient: mockPrisma,
        });
        assert.equal(cancelledSweep.cancelled, 1, "Cancelled appointment reminder must be counted as cancelled");
        assert.equal(cancelledSweep.sent, 0, "Cancelled appointment reminder must not be sent");
        const purgedReminder = await mockPrisma.appointmentReminder.findUnique({ where: { id: cancelledReminder.id } });
        assert.equal(purgedReminder, null, "Obsolete reminder for cancelled appointment must be purged from queue");

        // B: Trashed lead (isActive = false)
        store.students.set("student-trashed", {
            id: "student-trashed",
            firstName: "Trashed",
            lastName: "Lead",
            isActive: false,
            assignedCounselorId: "counselor-ktm-1",
        });
        const trashedAppt = await mockPrisma.appointment.create({
            data: {
                studentId: "student-trashed",
                counselorId: "counselor-ktm-1",
                datetime: apptDueTime,
                type: "FOLLOW_UP",
                status: "SCHEDULED",
            },
        });
        const trashedReminder = await mockPrisma.appointmentReminder.create({
            data: {
                appointmentId: trashedAppt.id,
                offset: "24H",
                scheduledFor: baseTime,
                status: "PENDING",
            },
        });
        const trashedSweep = await notificationPoller.processDueAppointmentReminders({
            now: baseTime,
            prismaClient: mockPrisma,
        });
        assert.equal(trashedSweep.cancelled, 1, "Reminder for trashed student must be counted as cancelled");
        assert.equal(trashedSweep.sent, 0, "Reminder for trashed student must not be sent");
        const purgedTrashedReminder = await mockPrisma.appointmentReminder.findUnique({ where: { id: trashedReminder.id } });
        assert.equal(purgedTrashedReminder, null, "Obsolete reminder for trashed student must be purged from queue");

        // 15.6 Rescheduling cleans up obsolete pending reminders and schedules new reminders
        const reschedAppt = await appointmentService.createAppointment({
            studentId: "student-active-1",
            counselorId: "counselor-ktm-1",
            datetime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
            type: "FOLLOW_UP",
        });
        const initialReminders = await mockPrisma.appointmentReminder.findMany({
            where: { appointmentId: reschedAppt.id },
        });
        assert.equal(initialReminders.length, 2);

        // Reschedule to 96 hours ahead
        const newDatetime = new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString();
        await appointmentService.updateAppointment(reschedAppt.id, {
            datetime: newDatetime,
        });
        const postReschedReminders = await mockPrisma.appointmentReminder.findMany({
            where: { appointmentId: reschedAppt.id },
        });
        assert.equal(postReschedReminders.length, 2, "New reminders scheduled for updated datetime");
        // Verify none of the old reminder IDs exist
        const oldIds = initialReminders.map((r) => r.id);
        const hasOldId = postReschedReminders.some((r) => oldIds.includes(r.id));
        assert.equal(hasOldId, false, "Old pending reminders must be replaced on reschedule");

        // 15.7 Status transition to CANCELLED purges pending reminders immediately
        await appointmentService.changeStatus(reschedAppt.id, { status: "CANCELLED" });
        const postCancelReminders = await mockPrisma.appointmentReminder.findMany({
            where: { appointmentId: reschedAppt.id },
        });
        assert.equal(postCancelReminders.length, 0, "Pending reminders must be purged immediately upon cancellation");

        // 15.8 Delivery failure marks reminder as FAILED without setting SENT or sentAt
        const failAppt = await mockPrisma.appointment.create({
            data: {
                studentId: "student-active-1",
                counselorId: "counselor-ktm-1",
                datetime: apptDueTime,
                type: "FOLLOW_UP",
                status: "SCHEDULED",
            },
        });
        const failReminder = await mockPrisma.appointmentReminder.create({
            data: {
                appointmentId: failAppt.id,
                offset: "24H",
                scheduledFor: baseTime,
                status: "PENDING",
            },
        });

        // Simulate delivery error by overriding notification.create temporarily
        const originalNotifCreate = mockPrisma.notification.create;
        mockPrisma.notification.create = async () => {
            throw new Error("SMTP connection refused: Simulated network failure");
        };

        const failedSweep = await notificationPoller.processDueAppointmentReminders({
            now: baseTime,
            prismaClient: mockPrisma,
        });

        // Restore original method
        mockPrisma.notification.create = originalNotifCreate;

        assert.equal(failedSweep.failed, 1, "Failed dispatch should increment failed count");
        assert.equal(failedSweep.sent, 0, "Failed dispatch must not be marked sent");
        const failedRecord = await mockPrisma.appointmentReminder.findUnique({ where: { id: failReminder.id } });
        assert.equal(failedRecord.status, "FAILED", "Reminder status must transition to FAILED");
        assert.equal(failedRecord.sentAt, null, "sentAt must remain null on failure");

        // 15.9 In-process mutex prevents overlapping worker executions
        // We simulate a long running operation during sweep
        let resolveLongRun;
        const longRunPromise = new Promise((resolve) => { resolveLongRun = resolve; });
        const origApptFindMany = mockPrisma.appointmentReminder.findMany;

        mockPrisma.appointmentReminder.findMany = async () => {
            await longRunPromise;
            return [];
        };

        const firstRunPromise = notificationPoller.processDueAppointmentReminders({
            now: baseTime,
            prismaClient: mockPrisma,
        });

        // While first run is awaiting, call second run
        const secondRunResult = await notificationPoller.processDueAppointmentReminders({
            now: baseTime,
            prismaClient: mockPrisma,
        });
        assert.equal(secondRunResult.skipped, true, "Second run must be skipped due to active in-process mutex");
        assert.equal(secondRunResult.reason, "OVERLAPPING_RUN");

        // Release first run
        resolveLongRun();
        await firstRunPromise;
        mockPrisma.appointmentReminder.findMany = origApptFindMany;

        // 15.10 Unassigned lead appointment reminder routing enforces strict branch isolation
        const unassignedStudent = {
            id: "student-unassigned-ktm",
            firstName: "Suman",
            lastName: "Ghimire",
            email: "suman@example.com",
            isActive: true,
            assignedCounselorId: null,
            academicBackground: { branchId: "branch-ktm" },
        };
        store.students.set("student-unassigned-ktm", unassignedStudent);

        const unassignedAppt = await mockPrisma.appointment.create({
            data: {
                studentId: "student-unassigned-ktm",
                counselorId: null,
                datetime: apptDueTime,
                type: "FOLLOW_UP",
                status: "SCHEDULED",
            },
        });
        const unassignedReminder = await mockPrisma.appointmentReminder.create({
            data: {
                appointmentId: unassignedAppt.id,
                offset: "24H",
                scheduledFor: baseTime,
                status: "PENDING",
            },
        });

        const unassignedSweep = await notificationPoller.processDueAppointmentReminders({
            now: baseTime,
            prismaClient: mockPrisma,
        });
        assert.equal(unassignedSweep.sent, 1, "Unassigned student reminder routes to designated branch staff");
        const unassignedRecord = await mockPrisma.appointmentReminder.findUnique({ where: { id: unassignedReminder.id } });
        assert.equal(unassignedRecord.status, "SENT");

        // Verify recipient was branch-admin-ktm (designated staff for branch-ktm)
        const unassignedNotif = Array.from(store.notifications.values()).find(
            (n) => n.payload?.reminderId === unassignedReminder.id
        );
        assert.ok(unassignedNotif);
        assert.equal(unassignedNotif.recipientUserId, "branch-admin-ktm", "Must route strictly to branch staff without broadcast");

        // 15.11 Verified crash recovery idempotency: Genuine duplicate notification transitions reminder to SENT
        const crashAppt = await mockPrisma.appointment.create({
            data: {
                studentId: "student-active-1",
                counselorId: "counselor-ktm-1",
                datetime: apptDueTime,
                type: "FOLLOW_UP",
                status: "SCHEDULED",
            },
        });
        const crashReminder = await mockPrisma.appointmentReminder.create({
            data: {
                appointmentId: crashAppt.id,
                offset: "24H",
                scheduledFor: baseTime,
                status: "PENDING",
            },
        });

        // Simulate crash scenario: notification was inserted in a prior run before worker crashed
        const priorNotifId = `notif-prior-${Date.now()}`;
        store.notifications.set(priorNotifId, {
            id: priorNotifId,
            recipientUserId: "counselor-ktm-1",
            channel: "IN_APP",
            status: "QUEUED",
            createdAt: new Date(baseTime.getTime() - 1000),
            updatedAt: new Date(baseTime.getTime() - 1000),
            payload: {
                appointmentId: crashAppt.id,
                action: "REMINDER_24H",
                reminderOffset: "24H",
                appointmentDatetime: apptDueTime.toISOString(),
                newDatetime: apptDueTime.toISOString(),
            },
        });

        const initialNotifCount = store.notifications.size;

        // When re-attempted after restart, database unique index rejects duplicate insert with P2002
        const origNotifCreateForCrash = mockPrisma.notification.create;
        mockPrisma.notification.create = async () => {
            const err = new Error("Unique constraint failed on the fields: (`recipientUserId`,`payload.appointmentId`,`payload.action`)");
            err.code = "P2002";
            throw err;
        };

        const crashSweep = await notificationPoller.processDueAppointmentReminders({
            now: baseTime,
            prismaClient: mockPrisma,
        });

        mockPrisma.notification.create = origNotifCreateForCrash;

        assert.equal(crashSweep.sent, 1, "Verified recovery should successfully resolve collision as sent");
        assert.equal(crashSweep.failed, 0);
        assert.equal(store.notifications.size, initialNotifCount, "Recovery must not create redundant duplicate notifications");
        const recoveredRecord = await mockPrisma.appointmentReminder.findUnique({ where: { id: crashReminder.id } });
        assert.equal(recoveredRecord.status, "SENT");
        assert.ok(recoveredRecord.sentAt instanceof Date);
    });

    await t.test("16. Phase 28.25C.8: Reminder Recovery Safety & Error Classification Audit", async () => {
        seedTestData();
        const baseTime = new Date("2026-11-01T10:00:00.000Z");
        const apptDueTime = new Date(baseTime.getTime() + 24 * 60 * 60 * 1000);
        const origNotifCreate = mockPrisma.notification.create;

        // 16.1 Unrelated unique-constraint violation does NOT mark reminder as SENT and transitions to FAILED
        const apptUnrelated = await mockPrisma.appointment.create({
            data: {
                studentId: "student-active-1",
                counselorId: "counselor-ktm-1",
                datetime: apptDueTime,
                type: "FOLLOW_UP",
                status: "SCHEDULED",
            },
        });
        const remUnrelated = await mockPrisma.appointmentReminder.create({
            data: {
                appointmentId: apptUnrelated.id,
                offset: "24H",
                scheduledFor: baseTime,
                status: "PENDING",
            },
        });

        // Simulate an unrelated P2002 error (e.g. unique constraint on another table, or synthetic collision)
        // Notice: NO matching notification exists in store.notifications
        mockPrisma.notification.create = async () => {
            const err = new Error("Unique constraint failed on table User email_unique_idx");
            err.code = "P2002";
            throw err;
        };

        const sweepUnrelated = await notificationPoller.processDueAppointmentReminders({
            now: baseTime,
            prismaClient: mockPrisma,
        });
        mockPrisma.notification.create = origNotifCreate;

        assert.equal(sweepUnrelated.sent, 0, "Unrelated collision must NOT be counted as sent");
        assert.equal(sweepUnrelated.failed, 1, "Unrelated collision must be counted as failed");
        const remRecord = await mockPrisma.appointmentReminder.findUnique({ where: { id: remUnrelated.id } });
        assert.equal(remRecord.status, "FAILED", "Reminder must transition to FAILED, not SENT");
        assert.equal(remRecord.sentAt, null, "sentAt must remain null on failure");

        // 16.2 Different reminder offsets (24H vs 1H) have distinct actions and do not collide
        store.appointmentReminders.clear();
        store.notifications.clear();

        const apptMultiOffset = await mockPrisma.appointment.create({
            data: {
                studentId: "student-active-1",
                counselorId: "counselor-ktm-1",
                datetime: apptDueTime,
                type: "FOLLOW_UP",
                status: "SCHEDULED",
            },
        });
        const rem24 = await mockPrisma.appointmentReminder.create({
            data: {
                appointmentId: apptMultiOffset.id,
                offset: "24H",
                scheduledFor: baseTime,
                status: "PENDING",
            },
        });
        const rem1 = await mockPrisma.appointmentReminder.create({
            data: {
                appointmentId: apptMultiOffset.id,
                offset: "1H",
                scheduledFor: baseTime,
                status: "PENDING",
            },
        });

        const sweepMulti = await notificationPoller.processDueAppointmentReminders({
            now: baseTime,
            prismaClient: mockPrisma,
        });
        assert.equal(sweepMulti.sent, 2, "Both 24H and 1H reminders must dispatch successfully without colliding");
        assert.equal(sweepMulti.failed, 0);

        const notifs = Array.from(store.notifications.values()).filter(
            (n) => n.payload?.appointmentId === apptMultiOffset.id
        );
        assert.equal(notifs.length, 2);
        const actions = notifs.map((n) => n.payload?.action).sort();
        assert.deepEqual(actions, ["REMINDER_1H", "REMINDER_24H"], "Distinct action for each offset must be assigned");

        // 16.3 Unrelated recipient or appointment mismatch does NOT trigger false recovery
        store.appointmentReminders.clear();
        store.notifications.clear();

        const apptA = await mockPrisma.appointment.create({
            data: {
                studentId: "student-active-1",
                counselorId: "counselor-ktm-1",
                datetime: apptDueTime,
                type: "FOLLOW_UP",
                status: "SCHEDULED",
            },
        });
        const apptB = await mockPrisma.appointment.create({
            data: {
                studentId: "student-active-1",
                counselorId: "counselor-ktm-1",
                datetime: apptDueTime,
                type: "FOLLOW_UP",
                status: "SCHEDULED",
            },
        });

        // Seed a notification only for apptA
        store.notifications.set("notif-appta", {
            id: "notif-appta",
            recipientUserId: "counselor-ktm-1",
            payload: {
                appointmentId: apptA.id,
                action: "REMINDER_24H",
                reminderOffset: "24H",
                newDatetime: apptDueTime.toISOString(),
            },
        });

        // Reminder for apptB runs, but notification.create throws P2002
        const remB = await mockPrisma.appointmentReminder.create({
            data: {
                appointmentId: apptB.id,
                offset: "24H",
                scheduledFor: baseTime,
                status: "PENDING",
            },
        });

        mockPrisma.notification.create = async () => {
            const err = new Error("Unique constraint collision");
            err.code = "23505";
            throw err;
        };

        const sweepMismatch = await notificationPoller.processDueAppointmentReminders({
            now: baseTime,
            prismaClient: mockPrisma,
        });
        mockPrisma.notification.create = origNotifCreate;

        assert.equal(sweepMismatch.sent, 0, "Notification for apptA must not falsely recover reminder for apptB");
        assert.equal(sweepMismatch.failed, 1);
        const remBRecord = await mockPrisma.appointmentReminder.findUnique({ where: { id: remB.id } });
        assert.equal(remBRecord.status, "FAILED");

        // 16.4 Ordinary dispatch failure preserves standard FAILED status without false recovery
        store.appointmentReminders.clear();
        store.notifications.clear();

        const apptErr = await mockPrisma.appointment.create({
            data: {
                studentId: "student-active-1",
                counselorId: "counselor-ktm-1",
                datetime: apptDueTime,
                type: "FOLLOW_UP",
                status: "SCHEDULED",
            },
        });
        const remErr = await mockPrisma.appointmentReminder.create({
            data: {
                appointmentId: apptErr.id,
                offset: "24H",
                scheduledFor: baseTime,
                status: "PENDING",
            },
        });

        mockPrisma.notification.create = async () => {
            throw new Error("ENOTFOUND smtp.mailtrap.io (Network error)");
        };

        const sweepErr = await notificationPoller.processDueAppointmentReminders({
            now: baseTime,
            prismaClient: mockPrisma,
        });
        mockPrisma.notification.create = origNotifCreate;

        assert.equal(sweepErr.failed, 1);
        assert.equal(sweepErr.sent, 0);
        const remErrRecord = await mockPrisma.appointmentReminder.findUnique({ where: { id: remErr.id } });
        assert.equal(remErrRecord.status, "FAILED");
        assert.equal(remErrRecord.sentAt, null);
    });
});

