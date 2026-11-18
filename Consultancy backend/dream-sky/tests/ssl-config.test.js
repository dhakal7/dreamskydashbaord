const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { getSslConfig, isLoopbackHost, isUnixSocket } = require("../src/prisma");

describe("PostgreSQL SSL Configuration and Database URL Parser", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        delete process.env.DB_USE_SSL;
        delete process.env.DB_CA_CERT;
        delete process.env.DB_CA_CERT_PATH;
        delete process.env.PGSSLROOTCERT;
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    describe("1. Local Loopback Connections", () => {
        test("127.0.0.1 loopback defaults to non-SSL (false)", () => {
            const ssl = getSslConfig("postgresql://user:pass@127.0.0.1:5432/dreamsky_db");
            assert.equal(ssl, false);
        });

        test("arbitrary 127.x.x.x IPv4 loopback defaults to non-SSL (false)", () => {
            const ssl = getSslConfig("postgresql://user:pass@127.0.0.42:5432/dreamsky_db");
            assert.equal(ssl, false);
        });

        test("localhost defaults to non-SSL (false)", () => {
            const ssl = getSslConfig("postgresql://user:pass@localhost:5432/dreamsky_db");
            assert.equal(ssl, false);
        });

        test("IPv6 ::1 loopback defaults to non-SSL (false)", () => {
            const ssl = getSslConfig("postgresql://user:pass@[::1]:5432/dreamsky_db");
            assert.equal(ssl, false);
        });

        test("0.0.0.0 is not loopback and defaults to TLS (rejectUnauthorized: true)", () => {
            const ssl = getSslConfig("postgresql://user:pass@0.0.0.0:5432/dreamsky_db");
            assert.deepEqual(ssl, { rejectUnauthorized: true });
        });
    });

    describe("2. Unix Domain Sockets", () => {
        test("URL-encoded socket directory path (%2F) defaults to non-SSL (false)", () => {
            const ssl = getSslConfig("postgresql://user:pass@%2Ftmp%2Fpg_socket:5432/dreamsky_db");
            assert.equal(ssl, false);
        });

        test("cPanel / home socket path defaults to non-SSL (false)", () => {
            const ssl = getSslConfig("postgresql://user:pass@%2FUsers%2Fsuyogdhakal%2F.dreamsky_sock_5433:5433/dreamsky_test_disposable");
            assert.equal(ssl, false);
        });

        test("empty hostname with socket query parameter defaults to non-SSL (false)", () => {
            const ssl = getSslConfig("postgresql:///dreamsky_db?host=/var/run/postgresql");
            assert.equal(ssl, false);
        });

        test("empty hostname without query params defaults to non-SSL (false)", () => {
            const ssl = getSslConfig("postgresql:///dreamsky_db");
            assert.equal(ssl, false);
        });
    });

    describe("3. Arbitrary Remote Hosts (TLS Enforced by Default)", () => {
        test("arbitrary custom domain requires TLS with rejectUnauthorized: true", () => {
            const ssl = getSslConfig("postgresql://user:pass@db.customconsultancy.com:5432/dreamsky_prod");
            assert.deepEqual(ssl, { rejectUnauthorized: true });
        });

        test("remote private/public IP requires TLS with rejectUnauthorized: true", () => {
            const ssl = getSslConfig("postgresql://user:pass@192.168.1.100:5432/dreamsky_prod");
            assert.deepEqual(ssl, { rejectUnauthorized: true });
        });

        test("cloud database (Neon) requires TLS with rejectUnauthorized: true", () => {
            const ssl = getSslConfig("postgresql://user:pass@ep-cool-db.neon.tech/dreamsky_prod");
            assert.deepEqual(ssl, { rejectUnauthorized: true });
        });

        test("cloud database (Supabase) requires TLS with rejectUnauthorized: true", () => {
            const ssl = getSslConfig("postgresql://user:pass@db.supabase.co:5432/postgres");
            assert.deepEqual(ssl, { rejectUnauthorized: true });
        });

        test("cloud database (AWS RDS) requires TLS with rejectUnauthorized: true", () => {
            const ssl = getSslConfig("postgresql://user:pass@database-1.c123456789.us-east-1.rds.amazonaws.com:5432/dreamsky");
            assert.deepEqual(ssl, { rejectUnauthorized: true });
        });
    });

    describe("4. Explicit SSL Settings", () => {
        test("remote host rejects sslmode=disable, ssl=false, and ssl=0", () => {
            for (const q of ["sslmode=disable", "ssl=false", "ssl=0"]) {
                assert.throws(
                    () => getSslConfig(`postgresql://user:pass@db.customconsultancy.com:5432/dreamsky_prod?${q}`),
                    /SECURITY CONFIG ERROR/
                );
            }
        });

        test("local connection retains explicit SSL disable (sslmode=disable, ssl=false, ssl=0)", () => {
            for (const url of [
                "postgresql://user:pass@127.0.0.1:5432/dreamsky_db?sslmode=disable",
                "postgresql://user:pass@localhost:5432/dreamsky_db?ssl=false",
                "postgresql://user:pass@%2Ftmp%2Fpgsock:5432/dreamsky_db?ssl=0",
            ]) {
                assert.equal(getSslConfig(url), false);
            }
        });

        test("local connection with sslmode=require enables TLS with rejectUnauthorized: true", () => {
            const ssl = getSslConfig("postgresql://user:pass@127.0.0.1:5432/dreamsky_db?sslmode=require");
            assert.deepEqual(ssl, { rejectUnauthorized: true });
        });

        test("local connection with sslmode=verify-full enables TLS with rejectUnauthorized: true", () => {
            const ssl = getSslConfig("postgresql://user:pass@localhost:5432/dreamsky_db?sslmode=verify-full");
            assert.deepEqual(ssl, { rejectUnauthorized: true });
        });

        test("local connection with DB_USE_SSL=true enables TLS with rejectUnauthorized: true", () => {
            process.env.DB_USE_SSL = "true";
            const ssl = getSslConfig("postgresql://user:pass@127.0.0.1:5432/dreamsky_db");
            assert.deepEqual(ssl, { rejectUnauthorized: true });
        });
    });

    describe("5. Custom CA Certificate Support", () => {
        test("custom CA certificate via DB_CA_CERT string is attached to ssl options", () => {
            process.env.DB_CA_CERT = "-----BEGIN CERTIFICATE-----\nTEST_CERT_DATA\n-----END CERTIFICATE-----";
            const ssl = getSslConfig("postgresql://user:pass@db.customconsultancy.com:5432/dreamsky_prod");
            assert.deepEqual(ssl, {
                rejectUnauthorized: true,
                ca: "-----BEGIN CERTIFICATE-----\nTEST_CERT_DATA\n-----END CERTIFICATE-----"
            });
        });

        test("custom CA certificate via DB_CA_CERT_PATH file is read and attached", () => {
            const tmpFile = path.join(os.tmpdir(), `test-ca-${Date.now()}.crt`);
            fs.writeFileSync(tmpFile, "-----BEGIN CERTIFICATE-----\nFILE_CERT_DATA\n-----END CERTIFICATE-----");
            try {
                process.env.DB_CA_CERT_PATH = tmpFile;
                const ssl = getSslConfig("postgresql://user:pass@db.customconsultancy.com:5432/dreamsky_prod");
                assert.deepEqual(ssl, {
                    rejectUnauthorized: true,
                    ca: "-----BEGIN CERTIFICATE-----\nFILE_CERT_DATA\n-----END CERTIFICATE-----"
                });
            } finally {
                fs.unlinkSync(tmpFile);
            }
        });

        test("custom CA certificate via PGSSLROOTCERT file is read and attached", () => {
            const tmpFile = path.join(os.tmpdir(), `test-pgsslroot-${Date.now()}.crt`);
            fs.writeFileSync(tmpFile, "-----BEGIN CERTIFICATE-----\nPG_ROOT_CERT_DATA\n-----END CERTIFICATE-----");
            try {
                process.env.PGSSLROOTCERT = tmpFile;
                const ssl = getSslConfig("postgresql://user:pass@db.customconsultancy.com:5432/dreamsky_prod");
                assert.deepEqual(ssl, {
                    rejectUnauthorized: true,
                    ca: "-----BEGIN CERTIFICATE-----\nPG_ROOT_CERT_DATA\n-----END CERTIFICATE-----"
                });
            } finally {
                fs.unlinkSync(tmpFile);
            }
        });
    });

    describe("6. Missing CA Files (Fails Safely)", () => {
        test("DB_CA_CERT_PATH pointing to non-existent file throws descriptive error", () => {
            process.env.DB_CA_CERT_PATH = "/tmp/non-existent-ca-file-12345.crt";
            assert.throws(
                () => getSslConfig("postgresql://user:pass@db.customconsultancy.com:5432/dreamsky_prod"),
                (err) => {
                    assert.match(err.message, /\[CONFIG ERROR\] Database CA certificate file specified in environment does not exist/);
                    assert.match(err.message, /non-existent-ca-file-12345\.crt/);
                    return true;
                }
            );
        });

        test("PGSSLROOTCERT pointing to non-existent file throws descriptive error", () => {
            process.env.PGSSLROOTCERT = "/tmp/non-existent-pgsslroot-67890.crt";
            assert.throws(
                () => getSslConfig("postgresql://user:pass@db.customconsultancy.com:5432/dreamsky_prod"),
                (err) => {
                    assert.match(err.message, /\[CONFIG ERROR\] Database CA certificate file specified in environment does not exist/);
                    assert.match(err.message, /non-existent-pgsslroot-67890\.crt/);
                    return true;
                }
            );
        });
    });

    describe("7. Malformed and Invalid URLs (Fails Safely)", () => {
        test("completely malformed URL throws descriptive error", () => {
            assert.throws(
                () => getSslConfig("not a valid url at all"),
                (err) => {
                    assert.match(err.message, /\[CONFIG ERROR\] Malformed DATABASE_URL/);
                    return true;
                }
            );
        });

        test("unsupported protocol (e.g. http://) throws descriptive protocol error", () => {
            assert.throws(
                () => getSslConfig("http://user:pass@localhost:5432/db"),
                (err) => {
                    assert.match(err.message, /\[CONFIG ERROR\] Invalid protocol in DATABASE_URL/);
                    return true;
                }
            );
        });

        test("empty string throws missing DATABASE_URL error", () => {
            assert.throws(
                () => getSslConfig("   "),
                (err) => {
                    assert.match(err.message, /\[CONFIG ERROR\] DATABASE_URL is missing or empty/);
                    return true;
                }
            );
        });

        test("null or undefined throws missing DATABASE_URL error", () => {
            assert.throws(
                () => getSslConfig(null),
                (err) => {
                    assert.match(err.message, /\[CONFIG ERROR\] DATABASE_URL is missing or empty/);
                    return true;
                }
            );
        });
    });
});
