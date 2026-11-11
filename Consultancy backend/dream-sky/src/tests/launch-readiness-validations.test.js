const test = require("node:test");
const assert = require("node:assert/strict");
const { validateCreateFollowUp, validateUpdateFollowUp } = require("../validators/followup.validator");

test("FollowUp Validator — Creation with valid future date", () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    assert.doesNotThrow(() => {
        validateCreateFollowUp({
            studentId: "student-123",
            channel: "PHONE",
            direction: "OUTBOUND",
            content: "Discuss offer letter details",
            nextFollowUpAt: futureDate,
        });
    });
});

test("FollowUp Validator — Creation without nextFollowUpAt succeeds (optional field)", () => {
    assert.doesNotThrow(() => {
        validateCreateFollowUp({
            studentId: "student-123",
            channel: "IN_PERSON",
            direction: "INBOUND",
            content: "Walk-in consultation summary",
            nextFollowUpAt: null,
        });
    });
});

test("FollowUp Validator — Creation with past date is rejected", () => {
    const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
    assert.throws(
        () => {
            validateCreateFollowUp({
                studentId: "student-123",
                channel: "PHONE",
                direction: "OUTBOUND",
                content: "Calling student",
                nextFollowUpAt: pastDate,
            });
        },
        (err) => {
            assert.strictEqual(err.statusCode, 400);
            assert.match(err.message, /cannot be scheduled in the past/);
            return true;
        }
    );
});

test("FollowUp Validator — Creation with invalid date string is rejected", () => {
    assert.throws(
        () => {
            validateCreateFollowUp({
                studentId: "student-123",
                channel: "PHONE",
                direction: "OUTBOUND",
                content: "Calling student",
                nextFollowUpAt: "not-a-real-date",
            });
        },
        (err) => {
            assert.strictEqual(err.statusCode, 400);
            assert.match(err.message, /valid date\/time/);
            return true;
        }
    );
});

test("FollowUp Validator — Update with past date is rejected", () => {
    const pastDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    assert.throws(
        () => {
            validateUpdateFollowUp({
                channel: "EMAIL",
                direction: "OUTBOUND",
                nextFollowUpAt: pastDate,
            });
        },
        (err) => {
            assert.strictEqual(err.statusCode, 400);
            assert.match(err.message, /cannot be scheduled in the past/);
            return true;
        }
    );
});

test("FollowUp Validator — Update with future date succeeds", () => {
    const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    assert.doesNotThrow(() => {
        validateUpdateFollowUp({
            channel: "WHATSAPP",
            direction: "OUTBOUND",
            nextFollowUpAt: futureDate,
        });
    });
});

