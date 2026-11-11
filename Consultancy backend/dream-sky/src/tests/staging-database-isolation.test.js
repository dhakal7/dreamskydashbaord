const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { validateDatabaseUrl } = require("../config");

// Synthetic test constants
const APPROVED_STAGING_HOST = "staging-db.internal";
const APPROVED_STAGING_HOST_ALT = "db-replica.staging.internal";
const VALID_STAGING_ALLOWLIST = `${APPROVED_STAGING_HOST},${APPROVED_STAGING_HOST_ALT}`;
const VALID_STAGING_URL = `postgresql://staging_user:staging_pass@${APPROVED_STAGING_HOST}:5432/dreamsky_staging_db`;

// Helper to run with scoped process.env
function withEnv(envVars, fn) {
  const original = {};
  for (const k of Object.keys(envVars)) {
    original[k] = process.env[k];
    if (envVars[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = envVars[k];
    }
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(envVars)) {
      if (original[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = original[k];
      }
    }
  }
}

// ── 1. Valid staging database name and approved host ────────────────────────
test("1. Valid staging database name and approved host passes validation", () => {
  withEnv({ STAGING_DB_ALLOWED_HOSTS: VALID_STAGING_ALLOWLIST }, () => {
    const result = validateDatabaseUrl(VALID_STAGING_URL, "staging");
    assert.strictEqual(result, VALID_STAGING_URL);
  });
});

// ── 2. dreamsky_db rejection ────────────────────────────────────────────────
test("2. Rejects dreamsky_db in staging mode", () => {
  withEnv({ STAGING_DB_ALLOWED_HOSTS: VALID_STAGING_ALLOWLIST }, () => {
    const prodTargetUrl = `postgresql://staging_user:staging_pass@${APPROVED_STAGING_HOST}:5432/dreamsky_db`;
    assert.throws(
      () => validateDatabaseUrl(prodTargetUrl, "staging"),
      /Production database targets \('dreamsky_db', 'dreamsky_dreamsky'\) are strictly forbidden in staging mode/
    );
  });
});

// ── 3. dreamsky_dreamsky rejection ──────────────────────────────────────────
test("3. Rejects dreamsky_dreamsky in staging mode", () => {
  withEnv({ STAGING_DB_ALLOWED_HOSTS: VALID_STAGING_ALLOWLIST }, () => {
    const prodTargetUrl = `postgresql://staging_user:staging_pass@${APPROVED_STAGING_HOST}:5432/dreamsky_dreamsky`;
    assert.throws(
      () => validateDatabaseUrl(prodTargetUrl, "staging"),
      /Production database targets \('dreamsky_db', 'dreamsky_dreamsky'\) are strictly forbidden in staging mode/
    );
  });
});

// ── 4. dreamsky_test_disposable rejection ───────────────────────────────────
test("4. Rejects dreamsky_test_disposable in staging mode", () => {
  withEnv({ STAGING_DB_ALLOWED_HOSTS: VALID_STAGING_ALLOWLIST }, () => {
    const testTargetUrl = `postgresql://staging_user:staging_pass@${APPROVED_STAGING_HOST}:5432/dreamsky_test_disposable`;
    assert.throws(
      () => validateDatabaseUrl(testTargetUrl, "staging"),
      /Test database targets \('dreamsky_test_disposable'\) are strictly forbidden in staging mode/
    );
  });
});

// ── 5. Unexpected database name rejection ───────────────────────────────────
test("5. Rejects unexpected database names in staging mode", () => {
  withEnv({ STAGING_DB_ALLOWED_HOSTS: VALID_STAGING_ALLOWLIST }, () => {
    const rogueDbUrl = `postgresql://staging_user:staging_pass@${APPROVED_STAGING_HOST}:5432/random_db`;
    assert.throws(
      () => validateDatabaseUrl(rogueDbUrl, "staging"),
      /Staging database name must be exactly 'dreamsky_staging_db'\. Target database 'random_db' is strictly forbidden/
    );
  });
});

// ── 6. Missing database URL ─────────────────────────────────────────────────
test("6. Rejects missing or empty database URL in staging mode", () => {
  withEnv({ STAGING_DB_ALLOWED_HOSTS: VALID_STAGING_ALLOWLIST }, () => {
    assert.throws(
      () => validateDatabaseUrl(undefined, "staging"),
      /DATABASE_URL environment variable is required but missing/
    );
    assert.throws(
      () => validateDatabaseUrl("", "staging"),
      /DATABASE_URL environment variable is required but missing/
    );
    assert.throws(
      () => validateDatabaseUrl("   ", "staging"),
      /DATABASE_URL environment variable is required but missing/
    );
  });
});

// ── 7. Malformed database URL ───────────────────────────────────────────────
test("7. Rejects malformed or non-parseable database URLs in staging mode", () => {
  withEnv({ STAGING_DB_ALLOWED_HOSTS: VALID_STAGING_ALLOWLIST }, () => {
    assert.throws(
      () => validateDatabaseUrl("not-a-valid-url", "staging"),
      /DATABASE_URL is not a valid, parseable URL/
    );
    assert.throws(
      () => validateDatabaseUrl("mysql://staging-db.internal:3306/dreamsky_staging_db", "staging"),
      /Invalid database protocol 'mysql:'/
    );
  });
});

// ── 8. Missing hostname ─────────────────────────────────────────────────────
test("8. Rejects database URLs with missing hostname in staging mode", () => {
  withEnv({ STAGING_DB_ALLOWED_HOSTS: VALID_STAGING_ALLOWLIST }, () => {
    assert.throws(
      () => validateDatabaseUrl("postgresql:///dreamsky_staging_db", "staging"),
      /DATABASE_URL must specify a valid host/
    );
  });
});

// ── 9. Localhost staging target rejection ───────────────────────────────────
test("9. Rejects localhost staging targets in staging mode", () => {
  withEnv({ STAGING_DB_ALLOWED_HOSTS: "localhost,127.0.0.1" }, () => {
    const localhostUrl = "postgresql://staging_user:staging_pass@localhost:5432/dreamsky_staging_db";
    assert.throws(
      () => validateDatabaseUrl(localhostUrl, "staging"),
      /Staging database host cannot be localhost or loopback \('localhost'\)/
    );
  });
});

// ── 10. Loopback staging target rejection ───────────────────────────────────
test("10. Rejects loopback staging targets (127.0.0.1, ::1, 0.0.0.0) in staging mode", () => {
  withEnv({ STAGING_DB_ALLOWED_HOSTS: "127.0.0.1,::1,0.0.0.0" }, () => {
    assert.throws(
      () => validateDatabaseUrl("postgresql://staging_user:staging_pass@127.0.0.1:5432/dreamsky_staging_db", "staging"),
      /Staging database host cannot be localhost or loopback \('127.0.0.1'\)/
    );
    assert.throws(
      () => validateDatabaseUrl("postgresql://staging_user:staging_pass@[::1]:5432/dreamsky_staging_db", "staging"),
      /Staging database host cannot be localhost or loopback/
    );
    assert.throws(
      () => validateDatabaseUrl("postgresql://staging_user:staging_pass@0.0.0.0:5432/dreamsky_staging_db", "staging"),
      /Staging database host cannot be localhost or loopback \('0.0.0.0'\)/
    );
  });
});

// ── 11. Unapproved hostname rejection ───────────────────────────────────────
test("11. Rejects unapproved hostnames not in STAGING_DB_ALLOWED_HOSTS", () => {
  withEnv({ STAGING_DB_ALLOWED_HOSTS: APPROVED_STAGING_HOST }, () => {
    const unapprovedUrl = "postgresql://staging_user:staging_pass@unapproved-host.internal:5432/dreamsky_staging_db";
    assert.throws(
      () => validateDatabaseUrl(unapprovedUrl, "staging"),
      /Staging database host 'unapproved-host\.internal' is not in the approved STAGING_DB_ALLOWED_HOSTS allowlist/
    );
  });
});

// ── 12. Approved hostname acceptance ────────────────────────────────────────
test("12. Accepts any host configured in STAGING_DB_ALLOWED_HOSTS allowlist", () => {
  withEnv({ STAGING_DB_ALLOWED_HOSTS: VALID_STAGING_ALLOWLIST }, () => {
    const altUrl = `postgresql://staging_user:staging_pass@${APPROVED_STAGING_HOST_ALT}:5432/dreamsky_staging_db`;
    const result = validateDatabaseUrl(altUrl, "staging");
    assert.strictEqual(result, altUrl);
  });
});

// ── 13. Hostname case normalization ────────────────────────────────────────
test("13. Normalizes hostname casing (case-insensitive comparison)", () => {
  withEnv({ STAGING_DB_ALLOWED_HOSTS: "staging-db.internal" }, () => {
    const upperHostUrl = "postgresql://staging_user:staging_pass@STAGING-DB.INTERNAL:5432/dreamsky_staging_db";
    const result = validateDatabaseUrl(upperHostUrl, "staging");
    assert.ok(result);
  });
});

// ── 14. Trailing-dot hostname normalization ────────────────────────────────
test("14. Normalizes trailing dots in hostname and allowlist", () => {
  withEnv({ STAGING_DB_ALLOWED_HOSTS: "staging-db.internal." }, () => {
    const urlWithDot = "postgresql://staging_user:staging_pass@staging-db.internal.:5432/dreamsky_staging_db";
    const result = validateDatabaseUrl(urlWithDot, "staging");
    assert.ok(result);
  });
});

// ── 15. Missing staging hostname allowlist ──────────────────────────────────
test("15. Fails closed when STAGING_DB_ALLOWED_HOSTS is missing or empty", () => {
  withEnv({ STAGING_DB_ALLOWED_HOSTS: undefined }, () => {
    assert.throws(
      () => validateDatabaseUrl(VALID_STAGING_URL, "staging"),
      /STAGING_DB_ALLOWED_HOSTS environment variable is required when NODE_ENV=staging/
    );
  });

  withEnv({ STAGING_DB_ALLOWED_HOSTS: "   " }, () => {
    assert.throws(
      () => validateDatabaseUrl(VALID_STAGING_URL, "staging"),
      /STAGING_DB_ALLOWED_HOSTS environment variable is required when NODE_ENV=staging/
    );
  });
});

// ── 16. Startup rejection before Prisma initialization ──────────────────────
test("16. Application startup in staging fails before Prisma is initialized when target is invalid", () => {
  const backendDir = path.resolve(__dirname, "../..");
  // Attempt to require src/app in a child process with an invalid staging target
  const child = spawnSync(
    process.execPath,
    [
      "-e",
      `
      process.env.NODE_ENV = "staging";
      process.env.STAGING_DB_ALLOWED_HOSTS = "staging-db.internal";
      process.env.DATABASE_URL = "postgresql://user:pass@staging-db.internal:5432/dreamsky_db";
      process.env.JWT_ACCESS_SECRET = "test-secret-at-least-32-chars-long-012345";
      process.env.JWT_REFRESH_SECRET = "test-refresh-secret-at-least-32-chars-long-012";
      process.env.DOCUMENT_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      process.env.CORS_ALLOWED_ORIGINS = "https://staging.dreamskycrm.com";
      process.env.CORS_ORIGIN = "https://staging.dreamskycrm.com";

      try {
        require("./src/app");
      } catch (err) {
        console.error("CAUGHT_ERROR:" + err.message);
        process.exit(42);
      }
      `
    ],
    {
      cwd: backendDir,
      encoding: "utf8",
    }
  );

  assert.strictEqual(child.status, 42, "Child process must exit with status 42 indicating error was caught before startup");
  assert.match(child.stderr, /CAUGHT_ERROR:\[DATABASE CONFIG ERROR\] Production database targets/);
});

// ── 17. Password and credential redaction in errors/logs ────────────────────
test("17. Passwords and credentials are redacted from error messages", () => {
  const secretPassword = "SUPER_SECRET_COMPLEX_PASSWORD_9988!!";
  const urlWithPassword = `postgresql://admin:${secretPassword}@rogue-host.internal:5432/dreamsky_staging_db`;

  withEnv({ STAGING_DB_ALLOWED_HOSTS: APPROVED_STAGING_HOST }, () => {
    try {
      validateDatabaseUrl(urlWithPassword, "staging");
      assert.fail("Expected validateDatabaseUrl to throw for rogue host");
    } catch (err) {
      assert.strictEqual(
        err.message.includes(secretPassword),
        false,
        "Error message must NOT leak database password"
      );
      assert.match(err.message, /rogue-host\.internal/);
    }
  });
});

// ── 18. Development/test behavior regression checks ────────────────────────
test("18. Development and test configurations maintain existing safeguards without regression", () => {
  // Development mode allows valid local postgres
  const devUrl = "postgresql://dev_user:dev_pass@localhost:5432/dreamsky_db";
  const devResult = validateDatabaseUrl(devUrl, "development");
  assert.strictEqual(devResult, devUrl);

  // Test mode strictly requires port 5433 and dreamsky_test_disposable with opt-in
  withEnv({ ALLOW_INTEGRATION_TEST_DB: "true" }, () => {
    const validTestUrl = "postgresql://test_user:test_pass@127.0.0.1:5433/dreamsky_test_disposable";
    const testResult = validateDatabaseUrl(validTestUrl, "test");
    assert.strictEqual(testResult, validTestUrl);

    // Test mode rejects production database
    assert.throws(
      () => validateDatabaseUrl("postgresql://test_user:test_pass@127.0.0.1:5433/dreamsky_db", "test"),
      /Target database 'dreamsky_db' is forbidden/
    );
  });
});
