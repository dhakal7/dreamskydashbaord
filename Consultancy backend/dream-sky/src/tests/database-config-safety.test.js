const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  validateDatabaseUrl,
  resolveApprovedTestDirs,
  DEFAULT_PERSISTENT_TEST_SOCKET_DIR,
  DEFAULT_PERSISTENT_TEST_CLUSTER_DIR,
  PERSISTENT_TEST_SOCKET_DIR,
  PERSISTENT_TEST_CLUSTER_DIR,
  PERSISTENT_TEST_UPLOAD_DIR,
} = require("../config");

// ── 1. Missing and Empty DATABASE_URL Validation ─────────────────────────────
test("DATABASE_URL validation - fails when DATABASE_URL is missing or empty in non-test mode", () => {
  assert.throws(
    () => validateDatabaseUrl(undefined, "development"),
    /DATABASE_URL environment variable is required but missing/
  );
  assert.throws(
    () => validateDatabaseUrl("", "development"),
    /DATABASE_URL environment variable is required but missing/
  );
  assert.throws(
    () => validateDatabaseUrl("   ", "production"),
    /DATABASE_URL environment variable is required but missing/
  );
});

test("DATABASE_URL validation - fails when DATABASE_URL is missing or empty in test mode", () => {
  assert.throws(
    () => validateDatabaseUrl(undefined, "test"),
    /In test mode \(NODE_ENV=test\), real database initialization is disabled by default/
  );
  assert.throws(
    () => validateDatabaseUrl("", "test"),
    /In test mode \(NODE_ENV=test\), real database initialization is disabled by default/
  );
});

// ── 2. Invalid Protocol and URL Validation ──────────────────────────────────
test("DATABASE_URL validation - rejects malformed and non-PostgreSQL URLs", () => {
  assert.throws(
    () => validateDatabaseUrl("not-a-valid-url", "development"),
    /DATABASE_URL is not a valid, parseable URL/
  );
  assert.throws(
    () => validateDatabaseUrl("mysql://user:pass@localhost:3306/dreamsky_db", "development"),
    /Invalid database protocol 'mysql:'/
  );
  assert.throws(
    () => validateDatabaseUrl("http://localhost:5432/dreamsky_db", "development"),
    /Invalid database protocol 'http:'/
  );
  assert.throws(
    () => validateDatabaseUrl("mongodb://localhost:27017/dreamsky_db", "development"),
    /Invalid database protocol 'mongodb:'/
  );
  assert.throws(
    () => validateDatabaseUrl("postgresql://user:pass@localhost:5432", "development"),
    /DATABASE_URL must specify a target database name/
  );
  assert.throws(
    () => validateDatabaseUrl("postgresql://user:pass@localhost:5432/", "development"),
    /DATABASE_URL must specify a target database name/
  );
});

// ── 3. Test Mode Isolation and Safeguards ───────────────────────────────────
test("Test mode isolation - blocks connection when ALLOW_INTEGRATION_TEST_DB is not true", () => {
  const previousOptIn = process.env.ALLOW_INTEGRATION_TEST_DB;
  delete process.env.ALLOW_INTEGRATION_TEST_DB;

  try {
    assert.throws(
      () => validateDatabaseUrl("postgresql://user:pass@127.0.0.1:5433/dreamsky_test_disposable", "test"),
      /Real database connection blocked in test mode/
    );
  } finally {
    if (previousOptIn !== undefined) {
      process.env.ALLOW_INTEGRATION_TEST_DB = previousOptIn;
    }
  }
});

test("Test mode isolation - rejects remote hosts even with integration opt-in", () => {
  const previousOptIn = process.env.ALLOW_INTEGRATION_TEST_DB;
  process.env.ALLOW_INTEGRATION_TEST_DB = "true";

  try {
    assert.throws(
      () => validateDatabaseUrl("postgresql://user:pass@render.com:5433/dreamsky_test_disposable", "test"),
      /Integration test database host 'render.com' is rejected/
    );
    assert.throws(
      () => validateDatabaseUrl("postgresql://user:pass@supabase.co:5433/dreamsky_test_disposable", "test"),
      /Integration test database host 'supabase.co' is rejected/
    );
    assert.throws(
      () => validateDatabaseUrl("postgresql://user:pass@192.168.1.50:5433/dreamsky_test_disposable", "test"),
      /Integration test database host '192.168.1.50' is rejected/
    );
  } finally {
    if (previousOptIn !== undefined) {
      process.env.ALLOW_INTEGRATION_TEST_DB = previousOptIn;
    } else {
      delete process.env.ALLOW_INTEGRATION_TEST_DB;
    }
  }
});

test("Test mode isolation - strictly requires explicit port 5433 (rejects missing, 5432, or unexpected ports)", () => {
  const previousOptIn = process.env.ALLOW_INTEGRATION_TEST_DB;
  process.env.ALLOW_INTEGRATION_TEST_DB = "true";

  try {
    // Missing port
    assert.throws(
      () => validateDatabaseUrl("postgresql://user:pass@127.0.0.1/dreamsky_test_disposable", "test"),
      /Integration test database must explicitly specify port 5433/
    );
    // Port 5432 (running existing instance)
    assert.throws(
      () => validateDatabaseUrl("postgresql://user:pass@127.0.0.1:5432/dreamsky_test_disposable", "test"),
      /Integration test database must strictly target port 5433\. Port '5432' is forbidden/
    );
    // Unexpected port
    assert.throws(
      () => validateDatabaseUrl("postgresql://user:pass@127.0.0.1:5434/dreamsky_test_disposable", "test"),
      /Integration test database must strictly target port 5433\. Port '5434' is forbidden/
    );
    // Dangerous search parameter overrides
    assert.throws(
      () => validateDatabaseUrl("postgresql://user:pass@127.0.0.1:5433/dreamsky_test_disposable?host=remote-host", "test"),
      /URL search parameters 'host' and 'port' are forbidden in test mode/
    );
    assert.throws(
      () => validateDatabaseUrl("postgresql://user:pass@127.0.0.1:5433/dreamsky_test_disposable?port=5432", "test"),
      /URL search parameters 'host' and 'port' are forbidden in test mode/
    );
  } finally {
    if (previousOptIn !== undefined) {
      process.env.ALLOW_INTEGRATION_TEST_DB = previousOptIn;
    } else {
      delete process.env.ALLOW_INTEGRATION_TEST_DB;
    }
  }
});

test("Test mode isolation - strictly requires exact disposable database name", () => {
  const previousOptIn = process.env.ALLOW_INTEGRATION_TEST_DB;
  process.env.ALLOW_INTEGRATION_TEST_DB = "true";

  try {
    assert.throws(
      () => validateDatabaseUrl("postgresql://user:pass@127.0.0.1:5433/other_test_db", "test"),
      /Integration test database name must be exactly 'dreamsky_test_disposable'/
    );
    assert.throws(
      () => validateDatabaseUrl("postgresql://user:pass@localhost:5433/test_db", "test"),
      /Integration test database name must be exactly 'dreamsky_test_disposable'/
    );
  } finally {
    if (previousOptIn !== undefined) {
      process.env.ALLOW_INTEGRATION_TEST_DB = previousOptIn;
    } else {
      delete process.env.ALLOW_INTEGRATION_TEST_DB;
    }
  }
});

test("Test mode isolation - strictly rejects production database names", () => {
  const previousOptIn = process.env.ALLOW_INTEGRATION_TEST_DB;
  process.env.ALLOW_INTEGRATION_TEST_DB = "true";

  try {
    assert.throws(
      () => validateDatabaseUrl("postgresql://user:pass@127.0.0.1:5433/dreamsky_db", "test"),
      /Integration test database name must be exactly 'dreamsky_test_disposable'/
    );
    assert.throws(
      () => validateDatabaseUrl("postgresql://user:pass@127.0.0.1:5433/dreamsky_DreamSky", "test"),
      /Integration test database name must be exactly 'dreamsky_test_disposable'/
    );
  } finally {
    if (previousOptIn !== undefined) {
      process.env.ALLOW_INTEGRATION_TEST_DB = previousOptIn;
    } else {
      delete process.env.ALLOW_INTEGRATION_TEST_DB;
    }
  }
});

test("Test mode isolation - succeeds only when all disposable criteria are satisfied", () => {
  const previousOptIn = process.env.ALLOW_INTEGRATION_TEST_DB;
  process.env.ALLOW_INTEGRATION_TEST_DB = "true";

  try {
    const validUrl1 = "postgresql://test_user:test_pass@127.0.0.1:5433/dreamsky_test_disposable?schema=public";
    const res1 = validateDatabaseUrl(validUrl1, "test");
    assert.equal(res1, validUrl1);

    const validUrl2 = "postgres://test_user:test_pass@localhost:5433/dreamsky_test_disposable";
    const res2 = validateDatabaseUrl(validUrl2, "test");
    assert.equal(res2, validUrl2);
  } finally {
    if (previousOptIn !== undefined) {
      process.env.ALLOW_INTEGRATION_TEST_DB = previousOptIn;
    } else {
      delete process.env.ALLOW_INTEGRATION_TEST_DB;
    }
  }
});

// ── 4. Non-Test Valid Configurations ─────────────────────────────────────────
test("DATABASE_URL validation - allows valid development PostgreSQL URLs", () => {
  const devUrl = "postgresql://postgres:postgres@127.0.0.1:5432/dreamsky_dev?schema=public";
  const result = validateDatabaseUrl(devUrl, "development");
  assert.equal(result, devUrl);
});

// ── 5. Runtime Construction Safety ──────────────────────────────────────────
test("Runtime construction safety - requiring src/prisma in unmocked test mode throws fail-closed error", () => {
  const prismaPath = require.resolve("../prisma");
  const previousCache = require.cache[prismaPath];
  const previousEnv = process.env.NODE_ENV;
  const previousOptIn = process.env.ALLOW_INTEGRATION_TEST_DB;

  try {
    delete require.cache[prismaPath];
    delete global.prisma;
    process.env.NODE_ENV = "test";
    delete process.env.ALLOW_INTEGRATION_TEST_DB;

    assert.throws(
      () => require("../prisma"),
      /\[DATABASE CONFIG ERROR\]/
    );
  } finally {
    delete require.cache[prismaPath];
    if (previousCache) require.cache[prismaPath] = previousCache;
    process.env.NODE_ENV = previousEnv;
    if (previousOptIn !== undefined) process.env.ALLOW_INTEGRATION_TEST_DB = previousOptIn;
  }
});

// ── 6. Static Inspection of Source Code ──────────────────────────────────────
test("Static safety inspection - no hardcoded credentials or filesystem heuristics in src/prisma/index.js", () => {
  const prismaSource = fs.readFileSync(path.join(__dirname, "../prisma/index.js"), "utf8");
  assert.doesNotMatch(prismaSource, /__dirname\.startsWith\("\/Users\/"\)/, "Must not contain macOS path heuristic");
  assert.doesNotMatch(prismaSource, /suyogdhakal/, "Must not contain username heuristic");
  assert.doesNotMatch(prismaSource, /DreamskyPass/, "Must not contain hardcoded passwords");
  assert.doesNotMatch(prismaSource, /dreamsky_database/, "Must not contain hardcoded usernames");
  assert.doesNotMatch(prismaSource, /productionUrl\s*=/, "Must not declare a hardcoded productionUrl");
  assert.doesNotMatch(prismaSource, /localUrl\s*=/, "Must not declare a hardcoded localUrl");
});

test("Static safety inspection - prisma.config.ts has no hardcoded fallback URL", () => {
  const prismaConfigSource = fs.readFileSync(path.join(__dirname, "../../prisma.config.ts"), "utf8");
  assert.doesNotMatch(prismaConfigSource, /postgres:postgres@127\.0\.0\.1/, "Must not contain hardcoded fallback connection string");
  assert.doesNotMatch(prismaConfigSource, /\?\?\s*["']postgresql:/, "Must not contain ?? fallback URL");
});

test("Static safety inspection - .env.example uses PostgreSQL syntax with generic placeholders", () => {
  const exampleSource = fs.readFileSync(path.join(__dirname, "../../.env.example"), "utf8");
  assert.match(exampleSource, /postgresql:\/\/db_user:db_password@127\.0\.0\.1:5432\/dreamsky_dev_db/, "Must show generic PostgreSQL placeholder");
  assert.doesNotMatch(exampleSource, /mysql:\/\//, "Must not contain legacy MySQL example");
});

// ── 7. Destructive Operations Safety Guard (Phase 9C.5) ──────────────────────
const { assertDisposableTarget } = require("../config");

test("Destructive guard - blocks execution by default without authorization flag", () => {
  assert.throws(
    () => assertDisposableTarget("postgresql://user:pass@127.0.0.1:5433/dreamsky_test_disposable", undefined),
    /Destructive operations are blocked by default/
  );
  assert.throws(
    () => assertDisposableTarget("postgresql://user:pass@127.0.0.1:5433/dreamsky_test_disposable", "false"),
    /Destructive operations are blocked by default/
  );
});

test("Destructive guard - rejects missing or invalid DATABASE_URL", () => {
  assert.throws(
    () => assertDisposableTarget("", "true"),
    /DATABASE_URL is required to verify the target database/
  );
  assert.throws(
    () => assertDisposableTarget("invalid-url", "true"),
    /DATABASE_URL is not a valid URL/
  );
  assert.throws(
    () => assertDisposableTarget("mysql://user:pass@127.0.0.1:3306/dreamsky_test_disposable", "true"),
    /Invalid protocol 'mysql:'/
  );
});

test("Destructive guard - strictly rejects remote hosts even with authorization", () => {
  assert.throws(
    () => assertDisposableTarget("postgresql://user:pass@render.com:5433/dreamsky_test_disposable", "true"),
    /Destructive operations are strictly forbidden on remote host 'render.com'/
  );
  assert.throws(
    () => assertDisposableTarget("postgresql://user:pass@supabase.co:5433/dreamsky_test_disposable", "true"),
    /Destructive operations are strictly forbidden on remote host 'supabase.co'/
  );
});

test("Destructive guard - strictly requires explicit port 5433 (rejects missing, 5432, or unexpected ports)", () => {
  // Missing port
  assert.throws(
    () => assertDisposableTarget("postgresql://user:pass@127.0.0.1/dreamsky_test_disposable", "true"),
    /Disposable database target must explicitly specify port 5433/
  );
  // Port 5432 (running existing instance)
  assert.throws(
    () => assertDisposableTarget("postgresql://user:pass@127.0.0.1:5432/dreamsky_test_disposable", "true"),
    /Destructive operations are strictly restricted to isolated port 5433\. Port '5432' is rejected/
  );
  // Unexpected port
  assert.throws(
    () => assertDisposableTarget("postgresql://user:pass@127.0.0.1:5434/dreamsky_test_disposable", "true"),
    /Destructive operations are strictly restricted to isolated port 5433\. Port '5434' is rejected/
  );
  // Dangerous parameter overrides
  assert.throws(
    () => assertDisposableTarget("postgresql://user:pass@127.0.0.1:5433/dreamsky_test_disposable?host=remote-host", "true"),
    /URL search parameters 'host' and 'port' are forbidden/
  );
});

test("Destructive guard - strictly requires exact disposable database name", () => {
  assert.throws(
    () => assertDisposableTarget("postgresql://user:pass@127.0.0.1:5433/dreamsky_db", "true"),
    /Destructive operations are strictly forbidden on database 'dreamsky_db'/
  );
  assert.throws(
    () => assertDisposableTarget("postgresql://user:pass@127.0.0.1:5433/dreamsky_DreamSky", "true"),
    /Destructive operations are strictly forbidden on database 'dreamsky_DreamSky'/
  );
  assert.throws(
    () => assertDisposableTarget("postgresql://user:pass@localhost:5433/other_test_db", "true"),
    /Destructive operations are strictly forbidden on database 'other_test_db'/
  );
});

test("Destructive guard - succeeds only when all disposable criteria are satisfied", () => {
  const result1 = assertDisposableTarget("postgresql://test:test@127.0.0.1:5433/dreamsky_test_disposable?schema=public", "true");
  assert.equal(result1, true);

  const result2 = assertDisposableTarget("postgres://test:test@localhost:5433/dreamsky_test_disposable", "true");
  assert.equal(result2, true);

  // Unix domain socket on verified persistent path
  const validSocketUrl = `postgresql://dreamsky_test_user:pass@${encodeURIComponent(PERSISTENT_TEST_SOCKET_DIR)}:5433/dreamsky_test_disposable?schema=public`;
  const resultSocket = assertDisposableTarget(validSocketUrl, "true");
  assert.equal(resultSocket, true);

  // Reject wrong Unix socket path
  assert.throws(
    () => assertDisposableTarget("postgresql://dreamsky_test_user:pass@%2Ftmp%2Fother_sock:5433/dreamsky_test_disposable", "true"),
    /Destructive operations are strictly forbidden on remote host '%2ftmp%2fother_sock'/
  );
});

test("Test mode isolation - permits verified persistent Unix socket and rejects invalid sockets", () => {
  const previousOptIn = process.env.ALLOW_INTEGRATION_TEST_DB;
  process.env.ALLOW_INTEGRATION_TEST_DB = "true";

  try {
    const validSocketUrl = `postgresql://dreamsky_test_user:pass@${encodeURIComponent(PERSISTENT_TEST_SOCKET_DIR)}:5433/dreamsky_test_disposable?schema=public`;
    const validated = validateDatabaseUrl(validSocketUrl, "test");
    assert.equal(validated, validSocketUrl);

    // Reject unverified socket path
    assert.throws(
      () => validateDatabaseUrl("postgresql://dreamsky_test_user:pass@%2Ftmp%2Funauthorized_sock:5433/dreamsky_test_disposable", "test"),
      /Integration test database host '%2ftmp%2funauthorized_sock' is rejected/
    );
  } finally {
    if (previousOptIn !== undefined) {
      process.env.ALLOW_INTEGRATION_TEST_DB = previousOptIn;
    } else {
      delete process.env.ALLOW_INTEGRATION_TEST_DB;
    }
  }
});

// ── 8. Maintenance Scripts Safety Hardening (Phase 9C.5) ─────────────────────
test("Maintenance scripts - direct constructors removed from maintenance scripts", () => {
  const scriptsDir = path.join(__dirname, "../../scripts");
  const directConstructorScripts = [
    "verify-import.js",
    "fix-counselor-assignments.js",
    "import-excel-data.js",
    "seed-test-user.js",
  ];

  for (const scriptName of directConstructorScripts) {
    const content = fs.readFileSync(path.join(scriptsDir, scriptName), "utf8");
    assert.doesNotMatch(content, /new\s+PrismaPg/, `${scriptName} must not directly instantiate PrismaPg`);
    assert.doesNotMatch(content, /new\s+PrismaClient/, `${scriptName} must not directly instantiate PrismaClient`);
    assert.match(content, /require\(["']\.\.\/src\/prisma["']\)/, `${scriptName} must require central src/prisma singleton`);
  }
});

test("Maintenance scripts - sync-db.js disabled by default and free of hardcoded credentials", () => {
  const syncDbSource = fs.readFileSync(path.join(__dirname, "../../scripts/sync-db.js"), "utf8");
  assert.match(syncDbSource, /\[BLOCKED\]/, "sync-db.js must be explicitly blocked");
  assert.match(syncDbSource, /process\.exit\(1\)/, "sync-db.js must exit immediately");
  assert.doesNotMatch(syncDbSource, /DreamskyPass/, "sync-db.js must not contain hardcoded passwords");
  assert.doesNotMatch(syncDbSource, /dreamsky_database/, "sync-db.js must not contain hardcoded usernames");
  assert.doesNotMatch(syncDbSource, /new\s+Pool/, "sync-db.js must not instantiate Pool");
});

test("Maintenance scripts - seed-production-users.js disabled by default", () => {
  const seedProdSource = fs.readFileSync(path.join(__dirname, "../../scripts/seed-production-users.js"), "utf8");
  assert.match(seedProdSource, /\[BLOCKED\]/, "seed-production-users.js must be explicitly blocked");
  assert.match(seedProdSource, /process\.exit\(1\)/, "seed-production-users.js must exit immediately");
});

test("Maintenance scripts - all data-writing and destructive scripts invoke assertDisposableTarget before requiring prisma", () => {
  const scriptsDir = path.join(__dirname, "../../scripts");
  const dataWritingScripts = [
    "clean-database.js",
    "import-recent-excel-data.js",
    "import-json-data.js",
    "fix-counselor-assignments.js",
    "import-excel-data.js",
    "seed-test-user.js",
    "seed-universities-courses.js",
    "seed-uni.js",
    "set-teacher-password.js",
    "test-email-flows.js",
  ];

  for (const scriptName of dataWritingScripts) {
    const content = fs.readFileSync(path.join(scriptsDir, scriptName), "utf8");
    assert.match(content, /assertDisposableTarget\(/, `${scriptName} must invoke assertDisposableTarget`);
    const guardIndex = content.indexOf("assertDisposableTarget(");
    const prismaMatch = content.match(/require\(["']\.\.\/src\/prisma["']\)/);
    assert.ok(prismaMatch, `${scriptName} must require central src/prisma singleton`);
    const prismaIndex = prismaMatch.index;
    assert.ok(guardIndex < prismaIndex, `${scriptName} must call assertDisposableTarget before requiring src/prisma`);
  }
});

test("Maintenance scripts - check-counselor-counts.js validates connection string before pg.Client", () => {
  const checkSource = fs.readFileSync(path.join(__dirname, "../../scripts/check-counselor-counts.js"), "utf8");
  assert.match(checkSource, /validateDatabaseUrl\(/, "check-counselor-counts.js must invoke validateDatabaseUrl");
  const validateIndex = checkSource.indexOf("validateDatabaseUrl(");
  const clientIndex = checkSource.indexOf("new Client(");
  assert.ok(validateIndex < clientIndex, "check-counselor-counts.js must validate URL before constructing pg.Client");
});

test("Maintenance scripts - all scripts requiring prisma are classified and protected", () => {
  const scriptsDir = path.join(__dirname, "../../scripts");
  const allScriptFiles = fs.readdirSync(scriptsDir).filter(f => f.endsWith(".js"));

  const knownDisabled = new Set(["sync-db.js", "seed-production-users.js"]);
  const knownDataWriting = new Set([
    "clean-database.js",
    "import-recent-excel-data.js",
    "import-json-data.js",
    "fix-counselor-assignments.js",
    "import-excel-data.js",
    "seed-test-user.js",
    "seed-universities-courses.js",
    "seed-uni.js",
    "set-teacher-password.js",
    "test-email-flows.js",
  ]);
  const knownReadOnly = new Set([
    "check-counselor-counts.js",
    "check-health.js",
    "export-data-for-dashboard.js",
    "verify-import.js",
    "call-students-api.js",
    "test-email-send.js",
  ]);

  for (const file of allScriptFiles) {
    const content = fs.readFileSync(path.join(scriptsDir, file), "utf8");
    const requiresPrisma = /require\(["']\.\.\/src\/prisma["']\)/.test(content) || /require\(["']\.\/src\/prisma["']\)/.test(content);

    if (requiresPrisma) {
      if (knownDisabled.has(file)) {
        assert.match(content, /process\.exit\(1\)/, `${file} must be disabled with process.exit(1)`);
      } else if (knownDataWriting.has(file)) {
        assert.match(content, /assertDisposableTarget\(/, `${file} must be protected by assertDisposableTarget`);
      } else if (knownReadOnly.has(file)) {
        // Read-only scripts must not contain any mutating Prisma operations
        assert.doesNotMatch(content, /\.create\(/, `${file} is classified as read-only but calls .create()`);
        assert.doesNotMatch(content, /\.createMany\(/, `${file} is classified as read-only but calls .createMany()`);
        assert.doesNotMatch(content, /\.update\(/, `${file} is classified as read-only but calls .update()`);
        assert.doesNotMatch(content, /\.updateMany\(/, `${file} is classified as read-only but calls .updateMany()`);
        assert.doesNotMatch(content, /\.upsert\(/, `${file} is classified as read-only but calls .upsert()`);
        assert.doesNotMatch(content, /\.delete\(/, `${file} is classified as read-only but calls .delete()`);
        assert.doesNotMatch(content, /\.deleteMany\(/, `${file} is classified as read-only but calls .deleteMany()`);
      } else {
        assert.fail(`Unclassified maintenance script importing prisma: ${file}`);
      }
    }
  }
});

// ── 9. Dedicated Test Launcher & Environment Isolation ───────────────────────
const { loadDisposableTestEnv, parseEnvContent } = require("../utils/test-launcher");

test("Test launcher - parseEnvContent parses keys, comments, and quoted values", () => {
  const sample = `
    # Comment line
    NODE_ENV=test
    PORT="5002"
    DATABASE_URL='postgresql://user:pass@127.0.0.1:5433/dreamsky_test_disposable'
    EMPTY_VAL=
  `;
  const parsed = parseEnvContent(sample);
  assert.equal(parsed.NODE_ENV, "test");
  assert.equal(parsed.PORT, "5002");
  assert.equal(parsed.DATABASE_URL, "postgresql://user:pass@127.0.0.1:5433/dreamsky_test_disposable");
  assert.equal(parsed.EMPTY_VAL, "");
});

test("Test launcher - loadDisposableTestEnv fails closed when config file is missing", () => {
  assert.throws(
    () => loadDisposableTestEnv({ configPath: "/path/to/nonexistent/file.env" }),
    /Disposable test configuration file not found/
  );
});

test("Test launcher - loadDisposableTestEnv fails closed when required test keys are missing", () => {
  const tmpDir = path.join(__dirname, "../temp-test-dir-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const incompletePath = path.join(tmpDir, "incomplete.env");

  try {
    fs.writeFileSync(incompletePath, "NODE_ENV=test\nPORT=5002\n");
    assert.throws(
      () => loadDisposableTestEnv({ configPath: incompletePath }),
      /Missing required test configuration key 'DATABASE_URL'/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Test launcher - loadDisposableTestEnv rejects port 5432 or non-disposable target in config", () => {
  const tmpDir = path.join(__dirname, "../temp-test-dir-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const unsafePath = path.join(tmpDir, "unsafe.env");

  try {
    fs.writeFileSync(
      unsafePath,
      `NODE_ENV=test\nPORT=5002\nALLOW_INTEGRATION_TEST_DB=true\nALLOW_DESTRUCTIVE_OPERATIONS=true\nUPLOAD_DIR=${PERSISTENT_TEST_UPLOAD_DIR}\nDATABASE_URL=postgresql://user:pass@127.0.0.1:5432/dreamsky_test_disposable\n`
    );
    assert.throws(
      () => loadDisposableTestEnv({ configPath: unsafePath }),
      /Integration test database must strictly target port 5433\. Port '5432' is forbidden/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Test launcher - loadDisposableTestEnv succeeds with valid configuration and redacts secrets", () => {
  const tmpDir = path.join(__dirname, "../temp-test-dir-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const validPath = path.join(tmpDir, "valid.env");

  const prevEnv = { ...process.env };

  try {
    fs.writeFileSync(
      validPath,
      `NODE_ENV=test\nPORT=5002\nALLOW_INTEGRATION_TEST_DB=true\nALLOW_DESTRUCTIVE_OPERATIONS=true\nUPLOAD_DIR=${PERSISTENT_TEST_UPLOAD_DIR}\nDATABASE_URL=postgresql://test_user:super_secret_password@127.0.0.1:5433/dreamsky_test_disposable?schema=public\n`
    );
    const summary = loadDisposableTestEnv({ configPath: validPath });

    assert.equal(summary.loaded, true);
    assert.equal(summary.targetPort, "5433");
    assert.equal(summary.targetDatabase, "dreamsky_test_disposable");
    assert.equal(summary.nodeEnv, "test");
    // Ensure password is not present in sanitized URL
    assert.doesNotMatch(summary.sanitizedUrl, /super_secret_password/);
    assert.match(summary.sanitizedUrl, /test_user:\*\*\*@127\.0\.0\.1:5433/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Restore process.env
    for (const key of Object.keys(process.env)) {
      if (!(key in prevEnv)) delete process.env[key];
    }
    Object.assign(process.env, prevEnv);
  }
});

// ── 10. API Mutation Gate Middleware ─────────────────────────────────────────
const {
  apiMutationGate,
  authorizeDisposableSession,
  revokeDisposableSession,
  isDisposableSessionAuthorized,
} = require("../middleware/api-mutation-gate");

test("API mutation gate - non-mutating methods (GET, HEAD, OPTIONS) pass in all modes", () => {
  const prevEnv = process.env.NODE_ENV;
  revokeDisposableSession();

  try {
    process.env.NODE_ENV = "test";
    const nonMutatingMethods = ["GET", "HEAD", "OPTIONS"];

    for (const method of nonMutatingMethods) {
      let nextCalled = false;
      let resStatus = null;

      const req = { method };
      const res = {
        status: (s) => { resStatus = s; return res; },
        json: () => res,
      };
      const next = () => { nextCalled = true; };

      apiMutationGate(req, res, next);
      assert.equal(nextCalled, true, `${method} must call next() without blocking`);
      assert.equal(resStatus, null);
    }
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});

test("API mutation gate - mutating methods pass in non-test environments (production/development)", () => {
  const prevEnv = process.env.NODE_ENV;
  revokeDisposableSession();

  try {
    process.env.NODE_ENV = "production";
    const mutatingMethods = ["POST", "PUT", "PATCH", "DELETE"];

    for (const method of mutatingMethods) {
      let nextCalled = false;
      const req = { method };
      const res = {};
      const next = () => { nextCalled = true; };

      apiMutationGate(req, res, next);
      assert.equal(nextCalled, true, `${method} in production must call next() for standard auth`);
    }
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});

test("API mutation gate - mutating methods in test mode without verified session are blocked with 403", () => {
  const prevEnv = process.env.NODE_ENV;
  revokeDisposableSession();

  try {
    process.env.NODE_ENV = "test";
    const mutatingMethods = ["POST", "PUT", "PATCH", "DELETE"];

    for (const method of mutatingMethods) {
      let nextCalled = false;
      let statusCode = null;
      let responseBody = null;

      const req = { method };
      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (body) => { responseBody = body; }
          };
        }
      };
      const next = () => { nextCalled = true; };

      apiMutationGate(req, res, next);
      assert.equal(nextCalled, false, `${method} must be blocked`);
      assert.equal(statusCode, 403, `${method} must return HTTP 403`);
      assert.equal(responseBody.code, "API_MUTATION_GATE_BLOCKED");
    }
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});

test("API mutation gate - authorizeDisposableSession rejects invalid port or database", () => {
  revokeDisposableSession();

  // Reject port 5432
  assert.throws(
    () => authorizeDisposableSession({ sessionToken: "tok-1", targetPort: "5432", targetDatabase: "dreamsky_test_disposable" }),
    /Mutation gate requires target port 5433/
  );

  // Reject wrong database
  assert.throws(
    () => authorizeDisposableSession({ sessionToken: "tok-1", targetPort: "5433", targetDatabase: "dreamsky_db" }),
    /Mutation gate requires target database 'dreamsky_test_disposable'/
  );

  // Reject missing token
  assert.throws(
    () => authorizeDisposableSession({ sessionToken: "", targetPort: "5433", targetDatabase: "dreamsky_test_disposable" }),
    /Mutation gate requires a valid sessionToken/
  );
});

test("API mutation gate - mutating methods in test mode succeed once authorized with port 5433", () => {
  const prevEnv = process.env.NODE_ENV;
  revokeDisposableSession();

  try {
    process.env.NODE_ENV = "test";

    authorizeDisposableSession({
      sessionToken: "valid-test-session-token",
      targetPort: "5433",
      targetDatabase: "dreamsky_test_disposable",
    });

    assert.equal(isDisposableSessionAuthorized(), true);

    const mutatingMethods = ["POST", "PUT", "PATCH", "DELETE"];
    for (const method of mutatingMethods) {
      let nextCalled = false;
      const req = { method };
      const res = {};
      const next = () => { nextCalled = true; };

      apiMutationGate(req, res, next);
      assert.equal(nextCalled, true, `${method} must call next() when verified disposable session is active`);
    }

    revokeDisposableSession();
    assert.equal(isDisposableSessionAuthorized(), false);
  } finally {
    revokeDisposableSession();
    process.env.NODE_ENV = prevEnv;
  }
});

// ── Clean Disposable Cluster & Socket Override Safety Tests (Phase D.3.2B.2) ──
test("Approved clean test directories - preserves original defaults when overrides are unset", () => {
  const prevSock = process.env.PERSISTENT_TEST_SOCKET_DIR;
  const prevCluster = process.env.PERSISTENT_TEST_CLUSTER_DIR;
  delete process.env.PERSISTENT_TEST_SOCKET_DIR;
  delete process.env.PERSISTENT_TEST_CLUSTER_DIR;

  try {
    const resolved = resolveApprovedTestDirs("test");
    assert.equal(resolved.socketDir, DEFAULT_PERSISTENT_TEST_SOCKET_DIR);
    assert.equal(resolved.clusterDir, DEFAULT_PERSISTENT_TEST_CLUSTER_DIR);
    assert.equal(PERSISTENT_TEST_SOCKET_DIR, DEFAULT_PERSISTENT_TEST_SOCKET_DIR);
    assert.equal(PERSISTENT_TEST_CLUSTER_DIR, DEFAULT_PERSISTENT_TEST_CLUSTER_DIR);
  } finally {
    if (prevSock !== undefined) process.env.PERSISTENT_TEST_SOCKET_DIR = prevSock;
    if (prevCluster !== undefined) process.env.PERSISTENT_TEST_CLUSTER_DIR = prevCluster;
  }
});

test("Approved clean test directories - clean paths work in test mode only", () => {
  const prevSock = process.env.PERSISTENT_TEST_SOCKET_DIR;
  const prevCluster = process.env.PERSISTENT_TEST_CLUSTER_DIR;
  const prevOptIn = process.env.ALLOW_INTEGRATION_TEST_DB;

  try {
    process.env.PERSISTENT_TEST_SOCKET_DIR = "/Users/suyogdhakal/.dreamsky_sock_5433_clean";
    process.env.PERSISTENT_TEST_CLUSTER_DIR = "/Users/suyogdhakal/.dreamsky_disposable_cluster_5433_clean";
    process.env.ALLOW_INTEGRATION_TEST_DB = "true";

    const resolved = resolveApprovedTestDirs("test");
    assert.equal(resolved.socketDir, "/Users/suyogdhakal/.dreamsky_sock_5433_clean");
    assert.equal(resolved.clusterDir, "/Users/suyogdhakal/.dreamsky_disposable_cluster_5433_clean");

    const cleanSocketUrl = `postgresql://dreamsky_test_user:pass@${encodeURIComponent("/Users/suyogdhakal/.dreamsky_sock_5433_clean")}:5433/dreamsky_test_disposable?schema=public`;
    assert.equal(validateDatabaseUrl(cleanSocketUrl, "test"), cleanSocketUrl);
  } finally {
    if (prevSock !== undefined) process.env.PERSISTENT_TEST_SOCKET_DIR = prevSock;
    else delete process.env.PERSISTENT_TEST_SOCKET_DIR;
    if (prevCluster !== undefined) process.env.PERSISTENT_TEST_CLUSTER_DIR = prevCluster;
    else delete process.env.PERSISTENT_TEST_CLUSTER_DIR;
    if (prevOptIn !== undefined) process.env.ALLOW_INTEGRATION_TEST_DB = prevOptIn;
    else delete process.env.ALLOW_INTEGRATION_TEST_DB;
  }
});

test("Approved clean test directories - rejects arbitrary cluster and socket paths", () => {
  const prevSock = process.env.PERSISTENT_TEST_SOCKET_DIR;
  const prevCluster = process.env.PERSISTENT_TEST_CLUSTER_DIR;
  const prevOptIn = process.env.ALLOW_INTEGRATION_TEST_DB;

  try {
    process.env.ALLOW_INTEGRATION_TEST_DB = "true";
    process.env.PERSISTENT_TEST_SOCKET_DIR = "/tmp/arbitrary_sock";
    delete process.env.PERSISTENT_TEST_CLUSTER_DIR;
    assert.throws(() => resolveApprovedTestDirs("test"), /Unauthorized test socket directory/);

    delete process.env.PERSISTENT_TEST_SOCKET_DIR;
    process.env.PERSISTENT_TEST_CLUSTER_DIR = "/tmp/arbitrary_cluster";
    assert.throws(() => resolveApprovedTestDirs("test"), /Unauthorized test cluster directory/);
  } finally {
    if (prevSock !== undefined) process.env.PERSISTENT_TEST_SOCKET_DIR = prevSock;
    else delete process.env.PERSISTENT_TEST_SOCKET_DIR;
    if (prevCluster !== undefined) process.env.PERSISTENT_TEST_CLUSTER_DIR = prevCluster;
    else delete process.env.PERSISTENT_TEST_CLUSTER_DIR;
    if (prevOptIn !== undefined) process.env.ALLOW_INTEGRATION_TEST_DB = prevOptIn;
    else delete process.env.ALLOW_INTEGRATION_TEST_DB;
  }
});

test("Approved clean test directories - production and non-test modes reject disposable overrides", () => {
  const prevSock = process.env.PERSISTENT_TEST_SOCKET_DIR;
  const prevCluster = process.env.PERSISTENT_TEST_CLUSTER_DIR;

  try {
    process.env.PERSISTENT_TEST_SOCKET_DIR = "/Users/suyogdhakal/.dreamsky_sock_5433_clean";
    process.env.PERSISTENT_TEST_CLUSTER_DIR = "/Users/suyogdhakal/.dreamsky_disposable_cluster_5433_clean";

    assert.throws(() => resolveApprovedTestDirs("production"), /strictly forbidden in 'production' mode/);
    assert.throws(() => resolveApprovedTestDirs("development"), /strictly forbidden in 'development' mode/);
    assert.throws(
      () => validateDatabaseUrl("postgresql://user:pass@db.example.com:5432/prod_db", "production"),
      /strictly forbidden in 'production' mode/
    );
  } finally {
    if (prevSock !== undefined) process.env.PERSISTENT_TEST_SOCKET_DIR = prevSock;
    else delete process.env.PERSISTENT_TEST_SOCKET_DIR;
    if (prevCluster !== undefined) process.env.PERSISTENT_TEST_CLUSTER_DIR = prevCluster;
    else delete process.env.PERSISTENT_TEST_CLUSTER_DIR;
  }
});

test("Approved clean test directories - port 5432, remote hosts, and unauthorized DBs remain rejected even with clean overrides", () => {
  const prevSock = process.env.PERSISTENT_TEST_SOCKET_DIR;
  const prevCluster = process.env.PERSISTENT_TEST_CLUSTER_DIR;
  const prevOptIn = process.env.ALLOW_INTEGRATION_TEST_DB;

  try {
    process.env.PERSISTENT_TEST_SOCKET_DIR = "/Users/suyogdhakal/.dreamsky_sock_5433_clean";
    process.env.PERSISTENT_TEST_CLUSTER_DIR = "/Users/suyogdhakal/.dreamsky_disposable_cluster_5433_clean";
    process.env.ALLOW_INTEGRATION_TEST_DB = "true";

    const encodedClean = encodeURIComponent("/Users/suyogdhakal/.dreamsky_sock_5433_clean");
    assert.throws(
      () => validateDatabaseUrl(`postgresql://dreamsky_test_user:pass@${encodedClean}:5432/dreamsky_test_disposable`, "test"),
      /must strictly target port 5433/
    );
    assert.throws(
      () => validateDatabaseUrl(`postgresql://dreamsky_test_user:pass@db.remote.com:5433/dreamsky_test_disposable`, "test"),
      /is rejected/
    );
    assert.throws(
      () => validateDatabaseUrl(`postgresql://dreamsky_test_user:pass@${encodedClean}:5433/dreamsky_db`, "test"),
      /must be exactly 'dreamsky_test_disposable'/
    );
  } finally {
    if (prevSock !== undefined) process.env.PERSISTENT_TEST_SOCKET_DIR = prevSock;
    else delete process.env.PERSISTENT_TEST_SOCKET_DIR;
    if (prevCluster !== undefined) process.env.PERSISTENT_TEST_CLUSTER_DIR = prevCluster;
    else delete process.env.PERSISTENT_TEST_CLUSTER_DIR;
    if (prevOptIn !== undefined) process.env.ALLOW_INTEGRATION_TEST_DB = prevOptIn;
    else delete process.env.ALLOW_INTEGRATION_TEST_DB;
  }
});

