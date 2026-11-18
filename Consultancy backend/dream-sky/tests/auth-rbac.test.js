const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const { hashPassword, comparePassword, generateTempPassword } = require("../src/utils/password.util");
const {
    signAccessToken,
    signRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    hashToken,
} = require("../src/utils/jwt.util");
const { requireAuth, requirePasswordChanged } = require("../src/middlewares/auth.middleware");
const { requireRole, requireOwnStudentPortal } = require("../src/middlewares/rbac.middleware");

describe("Phase 3: Authentication and RBAC Security Review", () => {
    describe("1. Password Security & Backdoor Elimination", () => {
        test("hashPassword generates valid bcrypt hash with 12 salt rounds", async () => {
            const raw = "SuperSecretPassword2026!";
            const hash = await hashPassword(raw);
            assert.ok(hash.startsWith("$2"), "Hash must be a valid bcrypt string");
            assert.notEqual(raw, hash);

            const matches = await comparePassword(raw, hash);
            assert.equal(matches, true);
        });

        test("comparePassword rejects mismatched passwords", async () => {
            const hash = await hashPassword("CorrectPassword123");
            const wrongMatch = await comparePassword("WrongPassword456", hash);
            assert.equal(wrongMatch, false);
        });

        test("generateTempPassword generates 12-char secure random string", () => {
            const temp = generateTempPassword();
            assert.equal(typeof temp, "string");
            assert.equal(temp.length, 12);
            assert.match(temp, /[A-Z]/, "Must contain uppercase");
            assert.match(temp, /[a-z]/, "Must contain lowercase");
            assert.match(temp, /[0-9]/, "Must contain digits");
        });
    });

    describe("2. JWT Token Lifecycle & Cryptographic Integrity", () => {
        const payload = {
            userId: "usr-test-123",
            role: "COUNSELOR",
            branchId: "br-1",
            mustChangePassword: false,
        };

        test("signAccessToken and verifyAccessToken roundtrip claims accurately", () => {
            const token = signAccessToken(payload);
            const verified = verifyAccessToken(token);
            assert.equal(verified.userId, payload.userId);
            assert.equal(verified.role, payload.role);
            assert.equal(verified.branchId, payload.branchId);
            assert.equal(verified.mustChangePassword, false);
            assert.ok(verified.exp, "Token must have an expiration claim");
        });

        test("signRefreshToken and verifyRefreshToken roundtrip accurately", () => {
            const refresh = signRefreshToken({ userId: "usr-test-123" });
            const verified = verifyRefreshToken(refresh);
            assert.equal(verified.userId, "usr-test-123");
        });

        test("verifyAccessToken rejects tampered signatures", () => {
            const token = signAccessToken(payload);
            const tampered = token.slice(0, -5) + "abcde";
            assert.throws(() => verifyAccessToken(tampered), {
                name: "JsonWebTokenError",
            });
        });

        test("verifyAccessToken rejects expired tokens", () => {
            const secret = process.env.JWT_ACCESS_SECRET || "ds_access_super_secret_key_change_in_production_64chars_minimum";
            const expiredToken = jwt.sign(payload, secret, { expiresIn: "-1s" });
            assert.throws(() => verifyAccessToken(expiredToken), {
                name: "TokenExpiredError",
            });
        });

        test("hashToken returns SHA-256 hex digest for storage", () => {
            const token = "sample-refresh-token-12345";
            const digest = hashToken(token);
            assert.equal(digest.length, 64);
            assert.match(digest, /^[a-f0-9]{64}$/);
        });
    });

    describe("3. Authentication Middleware (requireAuth)", () => {
        test("rejects missing Authorization header with 401 NO_TOKEN", () => {
            const req = { headers: {} };
            const res = {};
            let receivedError = null;

            requireAuth(req, res, (err) => {
                receivedError = err;
            });

            assert.ok(receivedError);
            assert.equal(receivedError.statusCode, 401);
            assert.equal(receivedError.code, "NO_TOKEN");
        });

        test("rejects non-Bearer Authorization header with 401 NO_TOKEN", () => {
            const req = { headers: { authorization: "Basic dXNlcjpwYXNz" } };
            const res = {};
            let receivedError = null;

            requireAuth(req, res, (err) => {
                receivedError = err;
            });

            assert.ok(receivedError);
            assert.equal(receivedError.statusCode, 401);
            assert.equal(receivedError.code, "NO_TOKEN");
        });

        test("attaches req.user and proceeds for valid Bearer token", () => {
            const payload = { userId: "usr-456", role: "FRONT_DESK", branchId: "br-2", mustChangePassword: false };
            const token = signAccessToken(payload);
            const req = { headers: { authorization: `Bearer ${token}` } };
            const res = {};
            let calledNext = false;

            requireAuth(req, res, (err) => {
                assert.ifError(err);
                calledNext = true;
            });

            assert.equal(calledNext, true);
            assert.equal(req.user.userId, "usr-456");
            assert.equal(req.user.role, "FRONT_DESK");
        });

        test("rejects expired token with 401 TOKEN_EXPIRED", () => {
            const secret = process.env.JWT_ACCESS_SECRET || "ds_access_super_secret_key_change_in_production_64chars_minimum";
            const expiredToken = jwt.sign({ userId: "u1" }, secret, { expiresIn: "-10s" });
            const req = { headers: { authorization: `Bearer ${expiredToken}` } };
            let receivedError = null;

            requireAuth(req, {}, (err) => {
                receivedError = err;
            });

            assert.ok(receivedError);
            assert.equal(receivedError.statusCode, 401);
            assert.equal(receivedError.code, "TOKEN_EXPIRED");
        });
    });

    describe("4. Temporary Password Access Guard (requirePasswordChanged)", () => {
        test("blocks user if mustChangePassword is true with 403 PASSWORD_CHANGE_REQUIRED", () => {
            const req = { user: { userId: "u-temp", mustChangePassword: true } };
            let receivedError = null;

            requirePasswordChanged(req, {}, (err) => {
                receivedError = err;
            });

            assert.ok(receivedError);
            assert.equal(receivedError.statusCode, 403);
            assert.equal(receivedError.code, "PASSWORD_CHANGE_REQUIRED");
        });

        test("allows user if mustChangePassword is false", () => {
            const req = { user: { userId: "u-active", mustChangePassword: false } };
            let calledNext = false;

            requirePasswordChanged(req, {}, (err) => {
                assert.ifError(err);
                calledNext = true;
            });

            assert.equal(calledNext, true);
        });
    });

    describe("5. Role-Based Access Control (requireRole)", () => {
        test("denies unauthenticated request with 401 UNAUTHORIZED", () => {
            const middleware = requireRole("SUPER_ADMIN");
            const req = {}; // no req.user
            let receivedError = null;

            middleware(req, {}, (err) => {
                receivedError = err;
            });

            assert.ok(receivedError);
            assert.equal(receivedError.statusCode, 401);
            assert.equal(receivedError.code, "UNAUTHORIZED");
        });

        test("SUPER_ADMIN is allowed on super admin restricted routes", () => {
            const middleware = requireRole("SUPER_ADMIN");
            const req = { user: { role: "SUPER_ADMIN" } };
            let calledNext = false;

            middleware(req, {}, (err) => {
                assert.ifError(err);
                calledNext = true;
            });

            assert.equal(calledNext, true);
        });

        test("COUNSELOR is allowed on counselor-permitted workflows (e.g. visa-case deletion)", () => {
            const visaDeleteMiddleware = requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR");
            const req = { user: { role: "COUNSELOR" } };
            let calledNext = false;

            visaDeleteMiddleware(req, {}, (err) => {
                assert.ifError(err);
                calledNext = true;
            });

            assert.equal(calledNext, true);
        });

        test("FRONT_DESK is forbidden from visa-case deletion", () => {
            const visaDeleteMiddleware = requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR");
            const req = { user: { role: "FRONT_DESK" } };
            let receivedError = null;

            visaDeleteMiddleware(req, {}, (err) => {
                receivedError = err;
            });

            assert.ok(receivedError);
            assert.equal(receivedError.statusCode, 403);
            assert.equal(receivedError.code, "INSUFFICIENT_ROLE");
        });

        test("TEACHER is denied on student enrollment / pipeline changes", () => {
            const studentEditMiddleware = requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK");
            const req = { user: { role: "TEACHER" } };
            let receivedError = null;

            studentEditMiddleware(req, {}, (err) => {
                receivedError = err;
            });

            assert.ok(receivedError);
            assert.equal(receivedError.statusCode, 403);
            assert.equal(receivedError.code, "INSUFFICIENT_ROLE");
        });

        test("REFERRAL_AGENT is denied on user management and admin routes", () => {
            const userManageMiddleware = requireRole("SUPER_ADMIN", "BRANCH_ADMIN");
            const req = { user: { role: "REFERRAL_AGENT" } };
            let receivedError = null;

            userManageMiddleware(req, {}, (err) => {
                receivedError = err;
            });

            assert.ok(receivedError);
            assert.equal(receivedError.statusCode, 403);
            assert.equal(receivedError.code, "INSUFFICIENT_ROLE");
        });
    });

    describe("6. Student Portal Data Isolation (requireOwnStudentPortal)", () => {
        test("STUDENT can access their own student profile data", () => {
            const req = {
                user: { role: "STUDENT", studentId: "std-own-123" },
                params: { studentId: "std-own-123" },
            };
            let calledNext = false;

            requireOwnStudentPortal(req, {}, (err) => {
                assert.ifError(err);
                calledNext = true;
            });

            assert.equal(calledNext, true);
        });

        test("STUDENT is blocked with 403 when trying to access another student's record", () => {
            const req = {
                user: { role: "STUDENT", studentId: "std-own-123" },
                params: { studentId: "std-victim-999" },
            };
            let receivedError = null;

            requireOwnStudentPortal(req, {}, (err) => {
                receivedError = err;
            });

            assert.ok(receivedError);
            assert.equal(receivedError.statusCode, 403);
            assert.equal(receivedError.code, "STUDENT_PORTAL_ACCESS_DENIED");
        });

        test("Staff roles (COUNSELOR, SUPER_ADMIN) bypass student portal isolation", () => {
            const staffRoles = ["SUPER_ADMIN", "BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"];
            for (const role of staffRoles) {
                const req = {
                    user: { role, studentId: null },
                    params: { studentId: "std-any-456" },
                };
                let calledNext = false;

                requireOwnStudentPortal(req, {}, (err) => {
                    assert.ifError(err);
                    calledNext = true;
                });

                assert.equal(calledNext, true, `${role} must be able to view any student record`);
            }
        });
    });
});
