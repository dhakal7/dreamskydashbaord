/**
 * test-launcher.js — Dedicated Test Launcher and Environment Isolation Module
 *
 * Enforces fail-closed configuration loading for disposable database integration testing.
 * Prevents ambient or development .env values from leaking into test runs.
 */

const fs = require("fs");
const path = require("path");
const { validateDatabaseUrl, PERSISTENT_TEST_UPLOAD_DIR } = require("../config");

const REQUIRED_TEST_KEYS = [
    "DATABASE_URL",
    "ALLOW_INTEGRATION_TEST_DB",
    "ALLOW_DESTRUCTIVE_OPERATIONS",
    "NODE_ENV",
    "PORT",
    "UPLOAD_DIR",
];

const DISPOSABLE_TEST_UPLOAD_DIR = PERSISTENT_TEST_UPLOAD_DIR;

/**
 * Parses a simple .env formatted string without executing external dotenv side-effects.
 * @param {string} content
 * @returns {Record<string, string>}
 */
function parseEnvContent(content) {
    const result = {};
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)$/);
        if (match) {
            let value = match[2].trim();
            // Remove wrapping quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            result[match[1]] = value;
        }
    }
    return result;
}

/**
 * Loads and validates disposable test environment configuration.
 * Injects validated settings into process.env before any application module is loaded.
 *
 * @param {object} [options]
 * @param {string} [options.configPath] - Explicit path to .env.test.disposable
 * @param {boolean} [options.enforcePort5433=true] - Require port 5433
 * @returns {object} Sanitized summary of loaded configuration (passwords redacted)
 */
function loadDisposableTestEnv(options = {}) {
    const defaultPath = path.resolve(__dirname, "../../.env.test.disposable");
    const targetPath = options.configPath || defaultPath;

    if (!fs.existsSync(targetPath)) {
        throw new Error(
            `[TEST LAUNCHER ERROR] Disposable test configuration file not found at '${targetPath}'. ` +
            "Copy .env.test.disposable.example to .env.test.disposable and configure for disposable testing."
        );
    }

    const fileContent = fs.readFileSync(targetPath, "utf8");
    const parsed = parseEnvContent(fileContent);

    // Verify all required test keys are present in the test configuration file
    for (const key of REQUIRED_TEST_KEYS) {
        if (!parsed[key] || !String(parsed[key]).trim()) {
            throw new Error(
                `[TEST LAUNCHER ERROR] Missing required test configuration key '${key}' in '${targetPath}'.`
            );
        }
    }

    if (parsed.NODE_ENV !== "test") {
        throw new Error(
            `[TEST LAUNCHER ERROR] Test configuration must define NODE_ENV=test. Received '${parsed.NODE_ENV}'.`
        );
    }

    if (parsed.ALLOW_INTEGRATION_TEST_DB !== "true") {
        throw new Error(
            "[TEST LAUNCHER ERROR] Test configuration must define ALLOW_INTEGRATION_TEST_DB=true."
        );
    }

    if (parsed.ALLOW_DESTRUCTIVE_OPERATIONS !== "true") {
        throw new Error(
            "[TEST LAUNCHER ERROR] Test configuration must define ALLOW_DESTRUCTIVE_OPERATIONS=true."
        );
    }

    if (parsed.UPLOAD_DIR !== DISPOSABLE_TEST_UPLOAD_DIR) {
        throw new Error(
            `[TEST LAUNCHER ERROR] Test configuration must define UPLOAD_DIR=${DISPOSABLE_TEST_UPLOAD_DIR}. Received '${parsed.UPLOAD_DIR}'.`
        );
    }

    // Set test isolation flags in process.env before validation
    process.env.ALLOW_INTEGRATION_TEST_DB = parsed.ALLOW_INTEGRATION_TEST_DB;
    process.env.ALLOW_DESTRUCTIVE_OPERATIONS = parsed.ALLOW_DESTRUCTIVE_OPERATIONS;
    process.env.UPLOAD_DIR = DISPOSABLE_TEST_UPLOAD_DIR;

    // Validate the target database URL through authoritative fail-closed rules
    const validatedUrl = validateDatabaseUrl(parsed.DATABASE_URL, "test");

    // Point DOTENV_CONFIG_PATH to the test file so subsequent require('dotenv').config()
    // calls throughout the backend do not read the root .env file
    process.env.DOTENV_CONFIG_PATH = targetPath;

    // Explicitly inject test variables into process.env
    for (const [key, val] of Object.entries(parsed)) {
        process.env[key] = val;
    }

    // Explicitly enforce test mode flags in environment
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = validatedUrl;

    // Build sanitized diagnostic summary (passwords and secrets redacted)
    const urlObj = new URL(validatedUrl);
    const sanitizedUrl = `${urlObj.protocol}//${urlObj.username ? urlObj.username + ":***@" : ""}${urlObj.hostname}:${urlObj.port}${urlObj.pathname}`;

    return {
        loaded: true,
        configPath: targetPath,
        nodeEnv: process.env.NODE_ENV,
        port: process.env.PORT,
        targetDatabase: urlObj.pathname.replace(/^\//, ""),
        targetHost: urlObj.hostname,
        targetPort: urlObj.port,
        sanitizedUrl,
    };
}

module.exports = {
    loadDisposableTestEnv,
    parseEnvContent,
    REQUIRED_TEST_KEYS,
    DISPOSABLE_TEST_UPLOAD_DIR,
};
