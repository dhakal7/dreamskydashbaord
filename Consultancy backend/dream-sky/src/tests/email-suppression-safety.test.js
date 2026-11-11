/**
 * email-suppression-safety.test.js
 *
 * Pure unit tests verifying email suppression safeguards in src/services/email.service.js.
 * Guarantees zero SMTP connections, zero network access, and zero real email dispatches.
 * All tests use in-memory environment overrides and mock transport objects.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    sendMail,
    sendWelcomeStudentEmail,
    sendStaffInvitationEmail,
    sendEventNotificationEmail,
    sendFeeDueEmail,
    sendNotificationEmail,
    isValidEmail,
    isConfigured,
    _setTransporter,
    _resetTransporter,
} = require("../services/email.service");

// Helper to snapshot and restore environment variables cleanly
function withEnv(tempEnv, fn) {
    const original = {};
    for (const key of Object.keys(tempEnv)) {
        original[key] = process.env[key];
        if (tempEnv[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = tempEnv[key];
        }
    }
    try {
        return fn();
    } finally {
        for (const key of Object.keys(tempEnv)) {
            if (original[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = original[key];
            }
        }
    }
}

async function withEnvAsync(tempEnv, fn) {
    const original = {};
    for (const key of Object.keys(tempEnv)) {
        original[key] = process.env[key];
        if (tempEnv[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = tempEnv[key];
        }
    }
    try {
        return await fn();
    } finally {
        for (const key of Object.keys(tempEnv)) {
            if (original[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = original[key];
            }
        }
    }
}

// ── 1. Guard 1: ENABLE_EMAIL === "false" ─────────────────────────────────────

test("Email safety - ENABLE_EMAIL='false' suppresses sendMail immediately even when SMTP credentials exist", async () => {
    let transportCalled = false;
    _setTransporter({
        sendMail: async () => {
            transportCalled = true;
            return { messageId: "should-never-be-called" };
        },
    });

    try {
        await withEnvAsync(
            {
                ENABLE_EMAIL: "false",
                NODE_ENV: "production", // Ensure NODE_ENV is not "test" so we specifically test ENABLE_EMAIL
                SMTP_HOST: "smtp.mockdomain.com",
                SMTP_PORT: "587",
                SMTP_USER: "smtp_user@mockdomain.com",
                SMTP_PASS: "smtp_password",
            },
            async () => {
                // Verify SMTP is detected as configured
                assert.strictEqual(isConfigured(), true);

                const result = await sendMail({
                    to: "applicant@somedomain.com",
                    subject: "Test Subject",
                    text: "Test Body",
                });

                assert.deepStrictEqual(result, { skipped: true, reason: "EMAIL_DISABLED" });
                assert.strictEqual(transportCalled, false, "Transport must not be invoked when ENABLE_EMAIL='false'");
            }
        );
    } finally {
        _resetTransporter();
    }
});

test("Email safety - ENABLE_EMAIL='false' case insensitivity and whitespace handling", async () => {
    await withEnvAsync(
        {
            ENABLE_EMAIL: "  FALSE  ",
            NODE_ENV: "production",
        },
        async () => {
            const result = await sendMail({
                to: "applicant@somedomain.com",
                subject: "Test Subject",
                text: "Test Body",
            });
            assert.deepStrictEqual(result, { skipped: true, reason: "EMAIL_DISABLED" });
        }
    );
});

// ── 2. Guard 2: NODE_ENV === "test" ──────────────────────────────────────────

test("Email safety - NODE_ENV='test' suppresses sendMail immediately even when SMTP credentials exist", async () => {
    let transportCalled = false;
    _setTransporter({
        sendMail: async () => {
            transportCalled = true;
            return { messageId: "should-never-be-called" };
        },
    });

    try {
        await withEnvAsync(
            {
                ENABLE_EMAIL: "true", // Even if explicitly enabled
                NODE_ENV: "test",
                SMTP_HOST: "smtp.mockdomain.com",
                SMTP_PORT: "587",
                SMTP_USER: "smtp_user@mockdomain.com",
                SMTP_PASS: "smtp_password",
            },
            async () => {
                assert.strictEqual(isConfigured(), true);

                const result = await sendMail({
                    to: "applicant@somedomain.com",
                    subject: "Test Subject",
                    text: "Test Body",
                });

                assert.deepStrictEqual(result, { skipped: true, reason: "TEST_ENVIRONMENT" });
                assert.strictEqual(transportCalled, false, "Transport must not be invoked in test environment");
            }
        );
    } finally {
        _resetTransporter();
    }
});

// ── 3. High-level wrapper function suppression ───────────────────────────────

test("Email safety - all service wrappers inherit fail-closed environment suppression", async () => {
    await withEnvAsync(
        {
            ENABLE_EMAIL: "false",
            NODE_ENV: "test",
        },
        async () => {
            const welcome = await sendWelcomeStudentEmail({
                to: "student@somedomain.com",
                studentName: "Test Student",
                tempPassword: "mock-password-123",
            });
            assert.strictEqual(welcome.skipped, true);

            const staff = await sendStaffInvitationEmail({
                to: "staff@somedomain.com",
                staffName: "Test Staff",
                role: "COUNSELOR",
                tempPassword: "mock-password-123",
            });
            assert.strictEqual(staff.skipped, true);

            const event = await sendEventNotificationEmail({
                to: "student@somedomain.com",
                recipientName: "Test Student",
                eventTitle: "Mock Event",
                datetime: "2026-11-01",
            });
            assert.strictEqual(event.skipped, true);

            const fee = await sendFeeDueEmail({
                to: "student@somedomain.com",
                studentName: "Test Student",
                feeCategory: "Tuition",
                dueAmount: 5000,
            });
            assert.strictEqual(fee.skipped, true);

            const notif = await sendNotificationEmail({
                to: "user@somedomain.com",
                subject: "Notice",
                body: "Body",
            });
            assert.strictEqual(notif.skipped, true);
        }
    );
});

// ── 4. Recipient domain suppression ──────────────────────────────────────────

test("Email safety - isValidEmail suppresses test, placeholder, and example domains", () => {
    assert.strictEqual(isValidEmail("student@example.com"), false);
    assert.strictEqual(isValidEmail("admin@test.com"), false);
    assert.strictEqual(isValidEmail("user@placeholder.com"), false);
    assert.strictEqual(isValidEmail("system@no-email.internal"), false);
    assert.strictEqual(isValidEmail(""), false);
    assert.strictEqual(isValidEmail(null), false);
    assert.strictEqual(isValidEmail(undefined), false);
    assert.strictEqual(isValidEmail("not-an-email"), false);

    // Legitimate format passes format validator
    assert.strictEqual(isValidEmail("valid.user@legitdomain.com"), true);
});

test("Email safety - sendMail suppresses @example.com without invoking transport", async () => {
    let transportCalled = false;
    _setTransporter({
        sendMail: async () => {
            transportCalled = true;
            return { messageId: "mock-123" };
        },
    });

    try {
        await withEnvAsync(
            {
                ENABLE_EMAIL: "true",
                NODE_ENV: "production",
                SMTP_HOST: "smtp.mockdomain.com",
                SMTP_USER: "user",
                SMTP_PASS: "pass",
            },
            async () => {
                const result = await sendMail({
                    to: "fixture.student@example.com",
                    subject: "Welcome",
                    text: "Body",
                });

                assert.deepStrictEqual(result, { skipped: true, reason: "INVALID_EMAIL_FORMAT" });
                assert.strictEqual(transportCalled, false, "Transport must not be called for @example.com");
            }
        );
    } finally {
        _resetTransporter();
    }
});

// ── 5. Mock transport dispatch under valid conditions ────────────────────────

test("Email safety - mock transport receives correct payload when enabled and valid", async () => {
    let sentPayload = null;
    _setTransporter({
        sendMail: async (payload) => {
            sentPayload = payload;
            return { messageId: "<mock-msg-001@dreamsky.internal>" };
        },
    });

    try {
        await withEnvAsync(
            {
                ENABLE_EMAIL: "true",
                NODE_ENV: "production",
                SMTP_HOST: "smtp.mockdomain.com",
                SMTP_PORT: "587",
                SMTP_USER: "info@dreamsky.internal",
                SMTP_PASS: "secret",
                EMAIL_FROM: '"DreamSky Official" <info@dreamsky.internal>',
            },
            async () => {
                const result = await sendMail({
                    to: "student@legitimate-external-domain.com",
                    subject: "Visa Update",
                    text: "Your visa application has progressed.",
                    html: "<p>Your visa application has progressed.</p>",
                });

                assert.strictEqual(result.messageId, "<mock-msg-001@dreamsky.internal>");
                assert.ok(sentPayload, "Transport must receive payload");
                assert.strictEqual(sentPayload.to, "student@legitimate-external-domain.com");
                assert.strictEqual(sentPayload.from, '"DreamSky Official" <info@dreamsky.internal>');
                assert.strictEqual(sentPayload.subject, "Visa Update");
            }
        );
    } finally {
        _resetTransporter();
    }
});
