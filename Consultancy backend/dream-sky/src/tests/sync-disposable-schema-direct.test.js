/**
 * sync-disposable-schema-direct.test.js — Pure Static Unit Tests
 *
 * SAFETY INVARIANTS:
 * - Purely in-memory: zero database connections.
 * - Does not connect to port 5433 or port 5432.
 * - Verifies URL parsing, object definition comparison, and error-handling logic.
 */

const assert = require("assert");
const {
    validateDirectSyncUrl,
    validateTableSchemaDefinitions,
} = require("../../scripts/sync-disposable-schema-direct");
const { PERSISTENT_TEST_SOCKET_DIR } = require("../config");

function runStaticTests() {
    console.log("=== RUNNING PURE IN-MEMORY STATIC UNIT TESTS ===");

    // Test 1: Valid URL targeting Unix socket on port 5433
    const validUrl = `postgresql://dreamsky_test_user:pass@${encodeURIComponent(PERSISTENT_TEST_SOCKET_DIR)}:5433/dreamsky_test_disposable`;
    const res = validateDirectSyncUrl(validUrl);
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.dbName, "dreamsky_test_disposable");
    assert.strictEqual(res.port, "5433");
    console.log("PASS: Valid URL targeting socket on port 5433 accepted.");

    // Test 2: Reject port 5432
    const port5432Url = "postgresql://dreamsky_test_user:pass@127.0.0.1:5432/dreamsky_test_disposable";
    assert.throws(
        () => validateDirectSyncUrl(port5432Url),
        /Port '5432' is forbidden|Development database or port 5432 is strictly prohibited|SOCKET_REQUIRED/
    );
    console.log("PASS: Port 5432 rejected.");

    // Test 3: Reject dreamsky_db
    const devDbUrl = `postgresql://dreamsky_test_user:pass@${encodeURIComponent(PERSISTENT_TEST_SOCKET_DIR)}:5433/dreamsky_db`;
    assert.throws(
        () => validateDirectSyncUrl(devDbUrl),
        /Integration test database name must be exactly 'dreamsky_test_disposable'|DATABASE_NAME_MISMATCH|Development database or port 5432 is strictly prohibited|rejected/
    );
    console.log("PASS: Database 'dreamsky_db' rejected.");

    // Test 4: Reject TCP host
    const tcpUrl = "postgresql://dreamsky_test_user:pass@127.0.0.1:5433/dreamsky_test_disposable";
    assert.throws(
        () => validateDirectSyncUrl(tcpUrl),
        /Must strictly target persistent test socket directory|SOCKET_REQUIRED/
    );
    console.log("PASS: TCP host rejected.");

    // Test 5: Table Schema Definition - Compatible columns
    const existingCols = [
        { column_name: "id", data_type: "text", is_nullable: "NO" },
        { column_name: "appointmentId", data_type: "text", is_nullable: "NO" },
        { column_name: "offset", data_type: "text", is_nullable: "NO" },
        { column_name: "scheduledFor", data_type: "timestamp without time zone", is_nullable: "NO" },
        { column_name: "status", data_type: "text", is_nullable: "NO" },
        { column_name: "sentAt", data_type: "timestamp without time zone", is_nullable: "YES" },
        { column_name: "createdAt", data_type: "timestamp without time zone", is_nullable: "NO" },
        { column_name: "updatedAt", data_type: "timestamp without time zone", is_nullable: "NO" },
    ];
    const expectedCols = {
        id: { dataType: "text", isNullable: "NO" },
        appointmentId: { dataType: "text", isNullable: "NO" },
        offset: { dataType: "text", isNullable: "NO" },
        scheduledFor: { dataType: "timestamp", isNullable: "NO" },
        status: { dataType: "text", isNullable: "NO" },
        sentAt: { dataType: "timestamp", isNullable: "YES" },
        createdAt: { dataType: "timestamp", isNullable: "NO" },
        updatedAt: { dataType: "timestamp", isNullable: "NO" },
    };
    assert.strictEqual(validateTableSchemaDefinitions(existingCols, expectedCols), true);
    console.log("PASS: Compatible table schema validated successfully.");

    // Test 6: Table Schema Definition - Missing column throws
    assert.throws(
        () => validateTableSchemaDefinitions(existingCols.slice(1), expectedCols),
        /Required column 'id' is missing/
    );
    console.log("PASS: Missing column triggers fail-closed error.");

    // Test 7: Table Schema Definition - Type mismatch throws
    const mismatchedTypeCols = existingCols.map((c) =>
        c.column_name === "offset" ? { ...c, data_type: "integer" } : c
    );
    assert.throws(
        () => validateTableSchemaDefinitions(mismatchedTypeCols, expectedCols),
        /Column 'offset' type mismatch/
    );
    console.log("PASS: Column type mismatch triggers fail-closed error.");

    // Test 8: Table Schema Definition - Nullability mismatch throws
    const mismatchedNullCols = existingCols.map((c) =>
        c.column_name === "sentAt" ? { ...c, is_nullable: "NO" } : c
    );
    assert.throws(
        () => validateTableSchemaDefinitions(mismatchedNullCols, expectedCols),
        /Column 'sentAt' nullability mismatch/
    );
    console.log("PASS: Nullability mismatch triggers fail-closed error.");

    // Test 9: Reject empty or invalid input to validateDirectSyncUrl
    assert.throws(
        () => validateDirectSyncUrl(""),
        /Database URL must be a non-empty string/
    );
    assert.throws(
        () => validateDirectSyncUrl(null),
        /Database URL must be a non-empty string/
    );
    assert.throws(
        () => validateDirectSyncUrl(12345),
        /Database URL must be a non-empty string/
    );
    console.log("PASS: Empty, null, and non-string database URLs rejected.");

    // Test 10: Reject remote host / non-socket hostname
    const remoteUrl = "postgresql://dreamsky_test_user:pass@db.example.com:5433/dreamsky_test_disposable";
    assert.throws(
        () => validateDirectSyncUrl(remoteUrl),
        /Integration test database host 'db.example.com' is rejected|Must strictly target persistent test socket directory|SOCKET_REQUIRED/
    );
    console.log("PASS: Remote host URL rejected.");

    // Test 11: Reject wrong port on Unix socket path (e.g. 5434)
    const wrongPortUrl = `postgresql://dreamsky_test_user:pass@${encodeURIComponent(PERSISTENT_TEST_SOCKET_DIR)}:5434/dreamsky_test_disposable`;
    assert.throws(
        () => validateDirectSyncUrl(wrongPortUrl),
        /Integration test database must strictly target port 5433|port mismatch/
    );
    console.log("PASS: Port 5434 rejected.");

    // Test 12: Reject unexpected database name on Unix socket (e.g. production_crm)
    const wrongDbNameUrl = `postgresql://dreamsky_test_user:pass@${encodeURIComponent(PERSISTENT_TEST_SOCKET_DIR)}:5433/production_crm`;
    assert.throws(
        () => validateDirectSyncUrl(wrongDbNameUrl),
        /Integration test database name must be exactly 'dreamsky_test_disposable'|Database 'production_crm' is rejected/
    );
    console.log("PASS: Unexpected database name 'production_crm' rejected.");

    console.log("ALL STATIC IN-MEMORY TESTS (12/12) PASSED PERFECTLY!");
}

if (require.main === module) {
    runStaticTests();
}

module.exports = { runStaticTests };
