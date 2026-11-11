/**
 * notification-email-delivery.test.js
 *
 * Isolated mocked unit tests for notification channel decoupling & email delivery integrity (Phase 34E.2).
 * Guarantees zero real database connections (ports 5432/5433) and zero SMTP network dispatches.
 *
 * Covers:
 * 1. Successful IN_APP notification creation.
 * 2. IN_APP notification remains active when SMTP is unconfigured.
 * 3. IN_APP notification remains active when email delivery is skipped.
 * 4. IN_APP notification remains active when optional email delivery fails.
 * 5. Email delivery failure is recorded in payload.emailDeliveryError.
 * 6. Existing payload properties remain preserved during update.
 * 7. Successful EMAIL delivery records SENT and messageId.
 * 8. Failed EMAIL delivery records FAILED and deliveryError.
 * 9. Skipped EMAIL delivery does not incorrectly record SENT.
 * 10. Missing or malformed email service responses fail safely.
 * 11. Notification creation remains functional when optional email is unavailable.
 * 12. Existing notification status contracts remain unchanged (including skipEmail opt-out & sendDirectNotification).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

// In-memory mock database state
let mockUsers = {};
let mockNotifications = {};
let mockTemplates = {};
let createdNotifications = [];
let updatedNotifications = [];

// Inject mock Prisma into global before requiring services
const mockPrisma = {
    user: {
        findUnique: async ({ where }) => {
            return mockUsers[where.id] || null;
        },
    },
    notificationTemplate: {
        findUnique: async ({ where }) => {
            return mockTemplates[where.name] || null;
        },
    },
    notification: {
        create: async ({ data }) => {
            const id = data.id || `notif-${Date.now()}-${Math.random()}`;
            const record = { id, ...data };
            mockNotifications[id] = record;
            createdNotifications.push(record);
            return record;
        },
        update: async ({ where, data }) => {
            const existing = mockNotifications[where.id] || { id: where.id };
            const updated = {
                ...existing,
                ...data,
                payload: {
                    ...(existing.payload || {}),
                    ...(data.payload || {}),
                },
            };
            mockNotifications[where.id] = updated;
            updatedNotifications.push({ id: where.id, data, updatedRecord: updated });
            return updated;
        },
        findMany: async () => Object.values(mockNotifications),
    },
};

global.prisma = mockPrisma;

const {
    _setTransporter,
    _resetTransporter,
} = require("../services/email.service");

const {
    sendNotification,
    deliverByEmail,
    sendDirectNotification,
} = require("../services/notification.service");

function resetState() {
    mockUsers = {};
    mockNotifications = {};
    mockTemplates = {};
    createdNotifications = [];
    updatedNotifications = [];
    _resetTransporter();
}

test("1. Successful IN_APP notification creation via sendNotification", async () => {
    resetState();
    mockUsers["user-inapp-1"] = {
        id: "user-inapp-1",
        email: "counselor.inapp@dreamsky.com",
        firstName: "Counselor",
    };

    mockTemplates["TASK_ASSIGNED"] = {
        id: "tmpl-1",
        name: "TASK_ASSIGNED",
        channel: "IN_APP",
        content: "Hello {{name}}, you have a new task.",
    };

    const notif = await sendNotification("user-inapp-1", "TASK_ASSIGNED", {
        name: "Suman",
        taskId: "task-99",
        skipEmail: true,
    });

    assert.equal(notif.channel, "IN_APP");
    assert.equal(notif.status, "QUEUED");
    assert.equal(notif.body, "Hello Suman, you have a new task.");
    assert.equal(notif.payload.taskId, "task-99");
});

test("2. IN_APP notification remains active when SMTP is unconfigured", async () => {
    resetState();
    const originalEnv = { ...process.env };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    try {
        mockUsers["user-inapp-2"] = {
            id: "user-inapp-2",
            email: "staff.test@dreamsky.com",
            firstName: "Staff",
        };

        const inAppNotif = {
            id: "notif-inapp-2",
            channel: "IN_APP",
            recipientUserId: "user-inapp-2",
            subject: "New Student Lead",
            body: "A new lead was submitted.",
            status: "QUEUED",
            payload: { studentId: "stu-123" },
        };
        mockNotifications["notif-inapp-2"] = inAppNotif;

        await deliverByEmail(inAppNotif);

        const updated = mockNotifications["notif-inapp-2"];
        // In-app status must NOT be FAILED
        assert.equal(updated.status, "QUEUED");
        assert.equal(updated.payload.studentId, "stu-123");
        assert.equal(updated.payload.emailDeliveryError, "SMTP_NOT_CONFIGURED");
    } finally {
        process.env = originalEnv;
        resetState();
    }
});

test("3. IN_APP notification remains active when email delivery is skipped", async () => {
    resetState();
    const originalEnv = { ...process.env };
    process.env.SMTP_HOST = "smtp.mock.dreamsky";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "consultancy@dreamsky.com";
    process.env.SMTP_PASS = "mockSecret123";
    process.env.NODE_ENV = "production";
    process.env.ENABLE_EMAIL = "false"; // explicitly skipped

    try {
        mockUsers["user-inapp-3"] = {
            id: "user-inapp-3",
            email: "staff.skip@dreamsky.com",
            firstName: "Staff",
        };

        const inAppNotif = {
            id: "notif-inapp-3",
            channel: "IN_APP",
            recipientUserId: "user-inapp-3",
            subject: "Document Uploaded",
            body: "Passport uploaded.",
            status: "QUEUED",
            payload: { docId: "doc-555" },
        };
        mockNotifications["notif-inapp-3"] = inAppNotif;

        await deliverByEmail(inAppNotif);

        const updated = mockNotifications["notif-inapp-3"];
        assert.equal(updated.status, "QUEUED");
        assert.equal(updated.payload.docId, "doc-555");
        assert.equal(updated.payload.emailDeliverySkipped, "EMAIL_DISABLED");
    } finally {
        process.env = originalEnv;
        resetState();
    }
});

test("4. IN_APP notification remains active when optional email delivery fails", async () => {
    resetState();
    const originalEnv = { ...process.env };
    process.env.SMTP_HOST = "smtp.mock.dreamsky";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "consultancy@dreamsky.com";
    process.env.SMTP_PASS = "mockSecret123";
    process.env.NODE_ENV = "production";
    delete process.env.ENABLE_EMAIL;

    try {
        mockUsers["user-inapp-4"] = {
            id: "user-inapp-4",
            email: "staff.fail@dreamsky.com",
            firstName: "Staff",
        };

        const inAppNotif = {
            id: "notif-inapp-4",
            channel: "IN_APP",
            recipientUserId: "user-inapp-4",
            subject: "Application Update",
            body: "Visa lodge date scheduled.",
            status: "QUEUED",
            payload: { appId: "app-888" },
        };
        mockNotifications["notif-inapp-4"] = inAppNotif;

        // Mock transporter failure
        _setTransporter({
            sendMail: async () => {
                throw new Error("SMTP connection timeout error 504");
            },
        });

        await deliverByEmail(inAppNotif);

        const updated = mockNotifications["notif-inapp-4"];
        // In-app status must remain QUEUED, not degraded to FAILED
        assert.equal(updated.status, "QUEUED");
        assert.equal(updated.payload.appId, "app-888");
        assert.ok(updated.payload.emailDeliveryError.includes("SMTP connection timeout error 504"));
    } finally {
        process.env = originalEnv;
        resetState();
    }
});

test("5. Email delivery failure is recorded in payload.emailDeliveryError", async () => {
    resetState();
    const originalEnv = { ...process.env };
    process.env.SMTP_HOST = "smtp.mock.dreamsky";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "consultancy@dreamsky.com";
    process.env.SMTP_PASS = "mockSecret123";
    process.env.NODE_ENV = "production";
    delete process.env.ENABLE_EMAIL;

    try {
        mockUsers["user-inapp-5"] = {
            id: "user-inapp-5",
            email: "staff.err@dreamsky.com",
            firstName: "Staff",
        };

        const inAppNotif = {
            id: "notif-inapp-5",
            channel: "IN_APP",
            recipientUserId: "user-inapp-5",
            subject: "Test Subject",
            body: "Test Body",
            status: "QUEUED",
            payload: { testKey: "testValue" },
        };
        mockNotifications["notif-inapp-5"] = inAppNotif;

        _setTransporter({
            sendMail: async () => {
                throw new Error("550 5.1.1 User unknown");
            },
        });

        await deliverByEmail(inAppNotif);

        const updated = mockNotifications["notif-inapp-5"];
        assert.equal(updated.status, "QUEUED");
        assert.equal(updated.payload.emailDeliveryError, "550 5.1.1 User unknown");
    } finally {
        process.env = originalEnv;
        resetState();
    }
});

test("6. Existing payload properties remain preserved during update", async () => {
    resetState();
    const originalEnv = { ...process.env };
    process.env.SMTP_HOST = "smtp.mock.dreamsky";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "consultancy@dreamsky.com";
    process.env.SMTP_PASS = "mockSecret123";
    process.env.NODE_ENV = "production";
    delete process.env.ENABLE_EMAIL;

    try {
        mockUsers["user-inapp-6"] = {
            id: "user-inapp-6",
            email: "counselor.merge@dreamsky.com",
            firstName: "Counselor",
        };

        const richPayload = {
            appointmentId: "appt-999",
            studentId: "stu-777",
            studentName: "Bikash Thapa",
            action: "SCHEDULED",
            datetime: "2026-11-05T10:00:00.000Z",
            nestedMeta: { counselorNotes: "Prepare visa documents" },
        };

        const inAppNotif = {
            id: "notif-inapp-6",
            channel: "IN_APP",
            recipientUserId: "user-inapp-6",
            subject: "Follow-Up Scheduled",
            body: "Follow-up scheduled with Bikash Thapa.",
            status: "QUEUED",
            payload: richPayload,
        };
        mockNotifications["notif-inapp-6"] = inAppNotif;

        _setTransporter({
            sendMail: async () => {
                return { messageId: "<email-success-msg-999@dreamsky>" };
            },
        });

        await deliverByEmail(inAppNotif);

        const updated = mockNotifications["notif-inapp-6"];
        // Status remains QUEUED for IN_APP
        assert.equal(updated.status, "QUEUED");
        // All original payload fields preserved
        assert.equal(updated.payload.appointmentId, "appt-999");
        assert.equal(updated.payload.studentId, "stu-777");
        assert.equal(updated.payload.studentName, "Bikash Thapa");
        assert.equal(updated.payload.action, "SCHEDULED");
        assert.equal(updated.payload.datetime, "2026-11-05T10:00:00.000Z");
        assert.equal(updated.payload.nestedMeta.counselorNotes, "Prepare visa documents");
        // Email metadata recorded separately
        assert.equal(updated.payload.emailMessageId, "<email-success-msg-999@dreamsky>");
        assert.ok(updated.payload.emailSentAt instanceof Date);
    } finally {
        process.env = originalEnv;
        resetState();
    }
});

test("7. Successful EMAIL delivery records SENT and messageId", async () => {
    resetState();
    const originalEnv = { ...process.env };
    process.env.SMTP_HOST = "smtp.mock.dreamsky";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "consultancy@dreamsky.com";
    process.env.SMTP_PASS = "mockSecret123";
    process.env.NODE_ENV = "production";
    delete process.env.ENABLE_EMAIL;

    try {
        mockUsers["user-email-7"] = {
            id: "user-email-7",
            email: "student.ashish@dreamsky.com",
            firstName: "Ashish",
        };

        const emailNotif = {
            id: "notif-email-7",
            channel: "EMAIL",
            recipientUserId: "user-email-7",
            subject: "Your visa application was submitted",
            body: "Great news! Your visa application is now lodged.",
            status: "QUEUED",
            payload: { applicationId: "app-111" },
        };
        mockNotifications["notif-email-7"] = emailNotif;

        _setTransporter({
            sendMail: async (mailOptions) => {
                assert.equal(mailOptions.to, "student.ashish@dreamsky.com");
                return { messageId: "<msg-succ-email-7@dreamsky>" };
            },
        });

        await deliverByEmail(emailNotif);

        const updated = mockNotifications["notif-email-7"];
        assert.equal(updated.status, "SENT");
        assert.ok(updated.sentAt instanceof Date);
        assert.equal(updated.payload.messageId, "<msg-succ-email-7@dreamsky>");
        assert.equal(updated.payload.applicationId, "app-111");
    } finally {
        process.env = originalEnv;
        resetState();
    }
});

test("8. Failed EMAIL delivery records FAILED and deliveryError", async () => {
    resetState();
    const originalEnv = { ...process.env };
    process.env.SMTP_HOST = "smtp.mock.dreamsky";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "consultancy@dreamsky.com";
    process.env.SMTP_PASS = "mockSecret123";
    process.env.NODE_ENV = "production";
    delete process.env.ENABLE_EMAIL;

    try {
        mockUsers["user-email-8"] = {
            id: "user-email-8",
            email: "student.kiran@dreamsky.com",
            firstName: "Kiran",
        };

        const emailNotif = {
            id: "notif-email-8",
            channel: "EMAIL",
            recipientUserId: "user-email-8",
            subject: "Offer letter update",
            body: "Your offer letter has arrived.",
            status: "QUEUED",
            payload: {},
        };
        mockNotifications["notif-email-8"] = emailNotif;

        _setTransporter({
            sendMail: async () => {
                throw new Error("535 Authentication credentials invalid");
            },
        });

        await deliverByEmail(emailNotif);

        const updated = mockNotifications["notif-email-8"];
        assert.equal(updated.status, "FAILED");
        assert.equal(updated.sentAt, undefined);
        assert.ok(updated.payload.deliveryError.includes("535 Authentication credentials invalid"));
    } finally {
        process.env = originalEnv;
        resetState();
    }
});

test("9. Skipped EMAIL delivery does not incorrectly record SENT", async () => {
    resetState();
    const originalEnv = { ...process.env };
    process.env.SMTP_HOST = "smtp.mock.dreamsky";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "consultancy@dreamsky.com";
    process.env.SMTP_PASS = "mockSecret123";
    process.env.NODE_ENV = "production";
    process.env.ENABLE_EMAIL = "false"; // explicitly suppressed

    try {
        mockUsers["user-email-9"] = {
            id: "user-email-9",
            email: "student.bina@dreamsky.com",
            firstName: "Bina",
        };

        const emailNotif = {
            id: "notif-email-9",
            channel: "EMAIL",
            recipientUserId: "user-email-9",
            subject: "Class schedule update",
            body: "IELTS class timing changed.",
            status: "QUEUED",
            payload: {},
        };
        mockNotifications["notif-email-9"] = emailNotif;

        await deliverByEmail(emailNotif);

        const updated = mockNotifications["notif-email-9"];
        assert.equal(updated.status, "FAILED");
        assert.equal(updated.sentAt, undefined);
        assert.equal(updated.payload.deliveryError, "SKIPPED_EMAIL_DISABLED");
    } finally {
        process.env = originalEnv;
        resetState();
    }
});

test("10. Missing or malformed email service responses fail safely", async () => {
    resetState();
    const originalEnv = { ...process.env };
    process.env.SMTP_HOST = "smtp.mock.dreamsky";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "consultancy@dreamsky.com";
    process.env.SMTP_PASS = "mockSecret123";
    process.env.NODE_ENV = "production";
    delete process.env.ENABLE_EMAIL;

    try {
        mockUsers["user-malformed-10"] = {
            id: "user-malformed-10",
            email: "student.malformed@dreamsky.com",
            firstName: "Malformed",
        };

        // Case A: EMAIL channel with malformed response
        const emailNotif = {
            id: "notif-malformed-email",
            channel: "EMAIL",
            recipientUserId: "user-malformed-10",
            subject: "Malformed Response Test",
            body: "Testing unexpected return object.",
            status: "QUEUED",
            payload: {},
        };
        mockNotifications["notif-malformed-email"] = emailNotif;

        // Returns empty object without messageId or error
        _setTransporter({
            sendMail: async () => ({}),
        });

        await deliverByEmail(emailNotif);
        assert.equal(mockNotifications["notif-malformed-email"].status, "FAILED");
        assert.equal(mockNotifications["notif-malformed-email"].payload.deliveryError, "UNKNOWN_EMAIL_DISPATCH_RESULT");

        // Case B: IN_APP channel with malformed response
        const inAppNotif = {
            id: "notif-malformed-inapp",
            channel: "IN_APP",
            recipientUserId: "user-malformed-10",
            subject: "Malformed InApp Response Test",
            body: "Testing unexpected return object for in-app.",
            status: "QUEUED",
            payload: {},
        };
        mockNotifications["notif-malformed-inapp"] = inAppNotif;

        await deliverByEmail(inAppNotif);
        // Status remains QUEUED, error captured in payload
        assert.equal(mockNotifications["notif-malformed-inapp"].status, "QUEUED");
        assert.equal(mockNotifications["notif-malformed-inapp"].payload.emailDeliveryError, "UNKNOWN_EMAIL_DISPATCH_RESULT");
    } finally {
        process.env = originalEnv;
        resetState();
    }
});

test("11. Notification creation remains functional when optional email is unavailable", async () => {
    resetState();
    const originalEnv = { ...process.env };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    try {
        mockUsers["user-func-11"] = {
            id: "user-func-11",
            email: "student.functional@dreamsky.com",
            firstName: "Functional",
        };

        mockTemplates["VISA_STATUS_CHANGE"] = {
            id: "tmpl-visa",
            name: "VISA_STATUS_CHANGE",
            channel: "IN_APP",
            content: "Visa status has changed for {{studentName}}.",
        };

        // sendNotification creates notification and delivers by email asynchronously
        const created = await sendNotification("user-func-11", "VISA_STATUS_CHANGE", {
            studentName: "Aarav Sharma",
            visaStatus: "APPROVED",
        });

        assert.ok(created.id, "Notification record must be created");
        assert.equal(created.channel, "IN_APP");
        assert.equal(created.status, "QUEUED");

        // Wait a microtick for background deliverByEmail promise to settle
        await new Promise((resolve) => setTimeout(resolve, 10));

        const persisted = mockNotifications[created.id];
        assert.equal(persisted.status, "QUEUED");
        assert.equal(persisted.payload.visaStatus, "APPROVED");
        assert.equal(persisted.payload.emailDeliveryError, "SMTP_NOT_CONFIGURED");
    } finally {
        process.env = originalEnv;
        resetState();
    }
});

test("12. Existing notification status contracts remain unchanged", async () => {
    resetState();
    const originalEnv = { ...process.env };
    process.env.SMTP_HOST = "smtp.mock.dreamsky";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "consultancy@dreamsky.com";
    process.env.SMTP_PASS = "mockSecret123";
    process.env.NODE_ENV = "production";

    try {
        // Test A: Explicit skipEmail === true preserves status without dispatch
        mockUsers["user-opt-12"] = {
            id: "user-opt-12",
            email: "student.optout@dreamsky.com",
            firstName: "OptOut",
        };

        const optOutNotif = {
            id: "notif-opt-12",
            channel: "IN_APP",
            recipientUserId: "user-opt-12",
            subject: "Strictly In-App Notice",
            body: "No email should ever be attempted.",
            status: "QUEUED",
            payload: { skipEmail: true },
        };
        mockNotifications["notif-opt-12"] = optOutNotif;

        await deliverByEmail(optOutNotif);
        assert.equal(mockNotifications["notif-opt-12"].status, "QUEUED");
        assert.equal(updatedNotifications.length, 0, "No database updates should occur on skipEmail");

        // Test B: sendDirectNotification contracts
        _setTransporter({
            sendMail: async () => ({ messageId: "<direct-success-999@dreamsky>" }),
        });
        const resSuccess = await sendDirectNotification({
            to: "student.direct@dreamsky.com",
            subject: "Direct Subject",
            body: "Direct Body",
        });
        assert.equal(resSuccess.success, true);
        assert.equal(resSuccess.messageId, "<direct-success-999@dreamsky>");

        _setTransporter({
            sendMail: async () => {
                throw new Error("Mailbox is full");
            },
        });
        const resFail = await sendDirectNotification({
            to: "student.direct@dreamsky.com",
            subject: "Direct Subject",
            body: "Direct Body",
        });
        assert.equal(resFail.success, false);
        assert.ok(resFail.error.includes("Mailbox is full"));

        const resSkip = await sendDirectNotification({
            to: "invalid-email-address",
            subject: "Direct Subject",
            body: "Direct Body",
        });
        assert.equal(resSkip.success, false);
        assert.equal(resSkip.skipped, true);
        assert.equal(resSkip.reason, "INVALID_EMAIL_FORMAT");
    } finally {
        process.env = originalEnv;
        resetState();
    }
});
