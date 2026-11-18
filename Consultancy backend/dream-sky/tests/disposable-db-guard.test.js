/**
 * Disposable Database Safety Guard tests.
 *
 * Uses a stubbed pg.Pool in require.cache — never connects to PostgreSQL.
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
    assertSafeDatabaseConnection,
    APPROVED_TEST_SOCKET_DIR,
    isLoopbackHost,
} = require("../src/prisma");

const ENCODED_APPROVED_SOCKET = encodeURIComponent(APPROVED_TEST_SOCKET_DIR);
const VALID_ENCODED_URL =
    `postgresql://postgres:pass@${ENCODED_APPROVED_SOCKET}:5433/dreamsky_test_disposable`;
const VALID_POSTGRES_SCHEME_URL =
    `postgres://postgres:pass@${ENCODED_APPROVED_SOCKET}:5433/dreamsky_test_disposable`;

const validEnv = () => ({
    NODE_ENV: "test",
    ALLOW_INTEGRATION_TEST_DB: "true",
});

/**
 * Loads a fresh copy of src/prisma/index.js with a stubbed pg.Pool so we can
 * verify both direct getClient() and the default prisma Proxy without
 * ever opening a PostgreSQL connection.
 */
const loadPrismaWithStubbedPool = (envOverrides) => {
    const prismaPath = require.resolve("../src/prisma/index.js");
    const pgPath = require.resolve("pg");

    const origPrisma = require.cache[prismaPath];
    const origPg = require.cache[pgPath];
    const prevEnv = { ...process.env };
    const prevGlobalPrisma = global.prisma;

    let poolCreatedCount = 0;
    class StubPool {
        constructor(opts) {
            poolCreatedCount += 1;
            this.options = opts;
        }
        on() {}
        end() { return Promise.resolve(); }
    }

    delete require.cache[prismaPath];
    delete global.prisma;
    require.cache[pgPath] = { id: pgPath, filename: pgPath, loaded: true, exports: { Pool: StubPool } };

    for (const k of [
        "NODE_ENV",
        "ALLOW_INTEGRATION_TEST_DB",
        "ALLOW_DESTRUCTIVE_OPERATIONS",
        "DATABASE_URL",
        "PGHOST",
        "PGHOSTADDR",
        "PGPORT",
        "PGDATABASE",
        "PGSERVICE",
    ]) {
        delete process.env[k];
    }
    Object.assign(process.env, envOverrides);

    try {
        const freshPrisma = require("../src/prisma/index.js");
        return {
            prisma: freshPrisma,
            getPoolCreatedCount: () => poolCreatedCount,
            cleanup() {
                if (origPrisma) require.cache[prismaPath] = origPrisma;
                else delete require.cache[prismaPath];
                if (origPg) require.cache[pgPath] = origPg;
                else delete require.cache[pgPath];
                global.prisma = prevGlobalPrisma;
                for (const k of Object.keys(process.env)) {
                    if (!(k in prevEnv)) delete process.env[k];
                }
                Object.assign(process.env, prevEnv);
            },
        };
    } catch (err) {
        if (origPrisma) require.cache[prismaPath] = origPrisma;
        if (origPg) require.cache[pgPath] = origPg;
        global.prisma = prevGlobalPrisma;
        Object.assign(process.env, prevEnv);
        throw err;
    }
};

describe("Disposable Database Safety Guard", () => {
    describe("1. Accepted configurations", () => {
        test("permits encoded Unix socket URL with NODE_ENV=test and ALLOW_INTEGRATION_TEST_DB=true", () => {
            assert.doesNotThrow(() => assertSafeDatabaseConnection(VALID_ENCODED_URL, validEnv()));
        });

        test("permits postgres:// scheme with encoded Unix socket URL when authorized", () => {
            assert.doesNotThrow(() => assertSafeDatabaseConnection(VALID_POSTGRES_SCHEME_URL, validEnv()));
        });

        test("accepts .env.test.disposable.example DATABASE_URL socket path when authorized", () => {
            const exampleEnv = fs.readFileSync(path.join(__dirname, "../.env.test.disposable.example"), "utf8");
            const match = exampleEnv.match(/^DATABASE_URL=(.+)$/m);
            assert.ok(match, ".env.test.disposable.example must define DATABASE_URL");
            assert.doesNotThrow(() => assertSafeDatabaseConnection(match[1].trim(), validEnv()));
        });

        test("permits normal production/development URLs when not in test/flagged mode", () => {
            assert.doesNotThrow(() =>
                assertSafeDatabaseConnection("postgresql://u:p@db.example.com:5432/dreamsky_DreamSky", {
                    NODE_ENV: "production",
                })
            );
            assert.doesNotThrow(() =>
                assertSafeDatabaseConnection("postgresql://u:p@127.0.0.1:5432/dreamsky_db", {
                    NODE_ENV: "development",
                })
            );
        });
    });

    describe("2. Rejected database names, ports, hosts, and URLs", () => {
        test("rejects production and dev database names in test mode", () => {
            for (const db of ["dreamsky_DreamSky", "dreamsky_db", "postgres", ""]) {
                const url = `postgresql://u:p@%2FUsers%2Fsuyogdhakal%2F.dreamsky_sock_5433:5433/${db}`;
                assert.throws(() => assertSafeDatabaseConnection(url, validEnv()), /DB SAFETY GUARD/);
            }
        });

        test("rejects port 5432, 5434, and omitted port in test mode", () => {
            for (const port of [":5432", ":5434", ""]) {
                const url = `postgresql://u:p@%2FUsers%2Fsuyogdhakal%2F.dreamsky_sock_5433${port}/dreamsky_test_disposable`;
                assert.throws(() => assertSafeDatabaseConnection(url, validEnv()), /DB SAFETY GUARD/);
            }
        });

        test("rejects TCP loopback connections (127.0.0.1, localhost, ::1)", () => {
            for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
                const url = `postgresql://u:p@${host}:5433/dreamsky_test_disposable`;
                assert.throws(() => assertSafeDatabaseConnection(url, validEnv()), /DB SAFETY GUARD/);
            }
        });

        test("rejects remote hosts", () => {
            const url = "postgresql://u:p@prod-db.internal:5433/dreamsky_test_disposable";
            assert.throws(() => assertSafeDatabaseConnection(url, validEnv()), /DB SAFETY GUARD/);
        });

        test("rejects unapproved Unix socket directory (including /tmp/dreamsky_sock_5433)", () => {
            for (const sock of ["%2Ftmp%2Fdreamsky_sock_5433", "%2Ftmp%2Fevil_sock"]) {
                const url = `postgresql://u:p@${sock}:5433/dreamsky_test_disposable`;
                assert.throws(() => assertSafeDatabaseConnection(url, validEnv()), /DB SAFETY GUARD/);
            }
        });

        test("0.0.0.0 is not classified as loopback", () => {
            assert.equal(isLoopbackHost("0.0.0.0"), false);
            assert.throws(
                () => assertSafeDatabaseConnection("postgresql://u:p@0.0.0.0:5433/dreamsky_test_disposable", validEnv()),
                /DB SAFETY GUARD/
            );
        });

        test("rejects malformed URLs, missing URL, and non-postgres protocols", () => {
            assert.throws(() => assertSafeDatabaseConnection("", validEnv()), /CONFIG ERROR/);
            assert.throws(() => assertSafeDatabaseConnection("not-a-url", validEnv()), /CONFIG ERROR/);
            assert.throws(
                () => assertSafeDatabaseConnection("mysql://u:p@localhost:5433/dreamsky_test_disposable", validEnv()),
                /CONFIG ERROR/
            );
        });
    });

    describe("3. Rejected alternate host and connection overrides", () => {
        test("rejects ?host= override alongside hostname", () => {
            const url = `${VALID_ENCODED_URL}?host=/tmp/other`;
            assert.throws(() => assertSafeDatabaseConnection(url, validEnv()), /DB SAFETY GUARD/);
        });

        test("rejects hostaddr, port, dbname, or duplicate host query params", () => {
            for (const q of [
                "?hostaddr=127.0.0.1",
                "?port=5432",
                "?dbname=dreamsky_DreamSky",
            ]) {
                assert.throws(() => assertSafeDatabaseConnection(`${VALID_ENCODED_URL}${q}`, validEnv()), /DB SAFETY GUARD/);
            }
            const dupHost = `${VALID_ENCODED_URL}?host=${encodeURIComponent(APPROVED_TEST_SOCKET_DIR)}&host=/tmp/other`;
            assert.throws(() => assertSafeDatabaseConnection(dupHost, validEnv()), /DB SAFETY GUARD/);
        });

        test("rejects PGHOST / PGHOSTADDR / PGPORT / PGDATABASE / PGSERVICE env overrides", () => {
            for (const k of ["PGHOST", "PGHOSTADDR", "PGPORT", "PGDATABASE", "PGSERVICE"]) {
                assert.throws(
                    () => assertSafeDatabaseConnection(VALID_ENCODED_URL, { ...validEnv(), [k]: "override" }),
                    /DB SAFETY GUARD/
                );
            }
        });
    });

    describe("4. Authorization flags and ALLOW_DESTRUCTIVE_OPERATIONS", () => {
        test("rejects missing ALLOW_INTEGRATION_TEST_DB in NODE_ENV=test", () => {
            assert.throws(
                () => assertSafeDatabaseConnection(VALID_ENCODED_URL, { NODE_ENV: "test" }),
                /DB SAFETY GUARD/
            );
        });

        test("ALLOW_DESTRUCTIVE_OPERATIONS=true alone is NOT sufficient authorization", () => {
            assert.throws(
                () =>
                    assertSafeDatabaseConnection(VALID_ENCODED_URL, {
                        NODE_ENV: "test",
                        ALLOW_DESTRUCTIVE_OPERATIONS: "true",
                    }),
                /DB SAFETY GUARD/
            );
            assert.throws(
                () =>
                    assertSafeDatabaseConnection("postgresql://u:p@127.0.0.1:5432/dreamsky_db", {
                        NODE_ENV: "development",
                        ALLOW_DESTRUCTIVE_OPERATIONS: "true",
                    }),
                /DB SAFETY GUARD/
            );
        });

        test("rejects disposable DB when NODE_ENV is not test even if ALLOW_INTEGRATION_TEST_DB=true", () => {
            assert.throws(
                () =>
                    assertSafeDatabaseConnection(VALID_ENCODED_URL, {
                        NODE_ENV: "production",
                        ALLOW_INTEGRATION_TEST_DB: "true",
                    }),
                /DB SAFETY GUARD/
            );
        });
    });

    describe("5. Enforcement before Pool creation for both default Proxy and getClient()", () => {
        test("rejects unsafe config in direct getClient() BEFORE creating Pool", () => {
            const h = loadPrismaWithStubbedPool({
                NODE_ENV: "test",
                ALLOW_INTEGRATION_TEST_DB: "true",
                DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/dreamsky_DreamSky",
            });
            try {
                assert.throws(() => h.prisma.getClient(), /DB SAFETY GUARD/);
                assert.equal(h.getPoolCreatedCount(), 0, "Pool must NOT be created when guard rejects");
            } finally {
                h.cleanup();
            }
        });

        test("rejects unsafe config on default prisma Proxy BEFORE creating Pool", () => {
            const h = loadPrismaWithStubbedPool({
                NODE_ENV: "test",
                ALLOW_DESTRUCTIVE_OPERATIONS: "true",
                DATABASE_URL: VALID_ENCODED_URL,
            });
            try {
                assert.throws(() => h.prisma.student, /DB SAFETY GUARD/);
                assert.equal(h.getPoolCreatedCount(), 0, "Pool must NOT be created when guard rejects");
            } finally {
                h.cleanup();
            }
        });

        test("allows valid disposable config for both getClient() and default prisma Proxy", () => {
            const h = loadPrismaWithStubbedPool({
                NODE_ENV: "test",
                ALLOW_INTEGRATION_TEST_DB: "true",
                DATABASE_URL: VALID_ENCODED_URL,
            });
            try {
                const client = h.prisma.getClient();
                assert.ok(client);
                assert.ok(h.prisma.student);
                assert.equal(h.getPoolCreatedCount(), 2);
            } finally {
                h.cleanup();
            }
        });
    });
});
