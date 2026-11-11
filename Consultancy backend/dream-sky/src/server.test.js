/**
 * server.test.js — Dedicated Test Server Entrypoint
 *
 * Keeps ordinary production server (src/server.js) completely isolated from
 * integration test server workflows.
 *
 * Enforces fail-closed pre-listen validation:
 * 1. Loads configuration strictly via test-launcher (rejecting .env fallback).
 * 2. Asserts disposable target criteria on port 5433.
 * 3. Authorizes API mutation gate only upon verified initialization.
 * 4. Fails closed before listening if any condition is not met.
 */

const { loadDisposableTestEnv } = require("./utils/test-launcher");
const { assertDisposableTarget } = require("./config");
const { authorizeDisposableSession } = require("./middleware/api-mutation-gate");

/**
 * Initializes and starts the dedicated test server.
 * @param {object} [options]
 * @param {string} [options.configPath] - Path to .env.test.disposable
 * @param {number} [options.port] - Server listen port (defaults to test config PORT)
 * @returns {Promise<import('http').Server>}
 */
async function startTestServer(options = {}) {
    // 1. Explicitly load and enforce disposable test environment
    const testConfig = loadDisposableTestEnv({ configPath: options.configPath });

    // 2. Validate disposable target (port 5433, loopback, dreamsky_test_disposable)
    assertDisposableTarget(process.env.DATABASE_URL, process.env.ALLOW_DESTRUCTIVE_OPERATIONS);

    // 3. Authorize API mutation gate with an ephemeral session token
    const sessionToken = `test-server-session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    authorizeDisposableSession({
        sessionToken,
        targetPort: "5433",
        targetDatabase: "dreamsky_test_disposable",
    });

    // 4. Require app only AFTER environment and gate are fully secured
    const app = require("./app");

    const port = options.port || parseInt(process.env.PORT, 10) || 5002;

    return new Promise((resolve, reject) => {
        const server = app.listen(port, () => {
            console.log(`[TEST SERVER] Disposable integration test server running on port ${port}`);
            console.log(`[TEST SERVER] Target: ${testConfig.sanitizedUrl}`);
            resolve(server);
        });
        server.on("error", reject);
    });
}

// If invoked directly from CLI (e.g. node src/server.test.js)
if (require.main === module) {
    startTestServer().catch((err) => {
        console.error("[TEST SERVER FATAL] Failed to start test server:", err.message);
        process.exit(1);
    });
}

module.exports = { startTestServer };
