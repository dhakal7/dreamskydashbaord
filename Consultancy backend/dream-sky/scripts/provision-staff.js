/**
 * provision-staff.js
 *
 * Dedicated, secure staff provisioning utility for DreamSky CRM.
 *
 * Requirements & Safeguards:
 * 1. Must never execute automatically on module import.
 * 2. Requires explicit operator authorization (CONFIRM_STAFF_PROVISION="true").
 * 3. Never contains hardcoded credentials.
 * 4. Accepts password via environment (STAFF_PASSWORD) or generates a cryptographically secure temporary password.
 * 5. Strictly validates password complexity (min 10 chars, uppercase, lowercase, number, symbol).
 * 6. Never defaults to SUPER_ADMIN; role must be explicitly specified and validated.
 * 7. Fails closed and refuses to overwrite an existing account.
 * 8. Never logs or prints passwords, activation tokens, or password hashes.
 * 9. Enforces mustChangePassword: true on the created account.
 */

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");

// Allowed staff roles matching the Prisma schema Role enum
const ALLOWED_STAFF_ROLES = Object.freeze([
    "SUPER_ADMIN",
    "BRANCH_ADMIN",
    "COUNSELOR",
    "FRONT_DESK",
    "TEACHER",
    "REFERRAL_AGENT",
]);

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Validates password complexity:
 * - At least 10 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special symbol
 */
function validatePasswordComplexity(password) {
    if (typeof password !== "string" || password.length < 10) {
        return { valid: false, error: "Password must be at least 10 characters long." };
    }
    if (!/[A-Z]/.test(password)) {
        return { valid: false, error: "Password must contain at least one uppercase letter." };
    }
    if (!/[a-z]/.test(password)) {
        return { valid: false, error: "Password must contain at least one lowercase letter." };
    }
    if (!/[0-9]/.test(password)) {
        return { valid: false, error: "Password must contain at least one numeric digit." };
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
        return { valid: false, error: "Password must contain at least one special character." };
    }
    return { valid: true };
}

/**
 * Generates a cryptographically strong temporary password that satisfies complexity requirements.
 */
function generateSecureTempPassword() {
    const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lowercase = "abcdefghijkmnopqrstuvwxyz";
    const numbers = "23456789";
    const symbols = "!@#$%^&*()-_=+";
    const allChars = uppercase + lowercase + numbers + symbols;

    // Guarantee at least one from each required pool
    const guaranteed = [
        uppercase[crypto.randomInt(uppercase.length)],
        lowercase[crypto.randomInt(lowercase.length)],
        numbers[crypto.randomInt(numbers.length)],
        symbols[crypto.randomInt(symbols.length)],
    ];

    // Fill remaining characters up to length 16
    const remaining = [];
    for (let i = 0; i < 12; i++) {
        remaining.push(allChars[crypto.randomInt(allChars.length)]);
    }

    // Shuffle characters securely using Fisher-Yates
    const combined = [...guaranteed, ...remaining];
    for (let i = combined.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [combined[i], combined[j]] = [combined[j], combined[i]];
    }

    return combined.join("");
}

/**
 * Main provisioning function.
 * Accepts an optional prismaClient dependency for test isolation.
 */
async function provisionStaff(params = {}, dependencies = {}) {
    // 1. Authorization check: must be explicitly confirmed
    const isAuthorized = process.env.CONFIRM_STAFF_PROVISION === "true" || params.confirm === true;
    if (!isAuthorized) {
        throw new Error(
            "Provisioning blocked: Requires explicit authorization. Set CONFIRM_STAFF_PROVISION='true' or supply confirm: true."
        );
    }

    const {
        email,
        firstName,
        lastName,
        role,
        branchId = null,
        password: providedPassword,
    } = params;

    // 2. Validate email
    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
        throw new Error(`Invalid email address format: "${email}".`);
    }
    const normalizedEmail = email.trim().toLowerCase();

    // 3. Validate names
    if (!firstName || typeof firstName !== "string" || !firstName.trim()) {
        throw new Error("Staff first name is required.");
    }
    if (!lastName || typeof lastName !== "string" || !lastName.trim()) {
        throw new Error("Staff last name is required.");
    }

    // 4. Validate role: No default to SUPER_ADMIN!
    if (!role || typeof role !== "string") {
        throw new Error(`Staff role is required. Allowed roles: ${ALLOWED_STAFF_ROLES.join(", ")}`);
    }
    const normalizedRole = role.trim().toUpperCase();
    if (!ALLOWED_STAFF_ROLES.includes(normalizedRole)) {
        throw new Error(
            `Invalid role "${role}". Must be one of: ${ALLOWED_STAFF_ROLES.join(", ")}`
        );
    }

    // 5. Determine and validate password
    const rawPassword = providedPassword || process.env.STAFF_PASSWORD || generateSecureTempPassword();
    const complexityCheck = validatePasswordComplexity(rawPassword);
    if (!complexityCheck.valid) {
        throw new Error(`Password complexity failed: ${complexityCheck.error}`);
    }

    // 6. Obtain Prisma client
    const prisma = dependencies.prisma || global.prisma || require(path.resolve(__dirname, "../src/prisma"));

    // 7. Check if user already exists — NEVER overwrite
    const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, email: true, role: true, status: true },
    });
    if (existingUser) {
        throw new Error(
            `Cannot provision staff: Account with email "${normalizedEmail}" already exists (Role: ${existingUser.role}, Status: ${existingUser.status}). Overwriting existing accounts is strictly prohibited.`
        );
    }

    // 8. If branchId is supplied, verify branch existence
    if (branchId) {
        const branch = await prisma.branch.findUnique({
            where: { id: branchId },
            select: { id: true, name: true },
        });
        if (!branch) {
            throw new Error(`Branch with id "${branchId}" does not exist.`);
        }
    }

    // 9. Hash password securely
    const passwordHash = await bcrypt.hash(rawPassword, 12);

    // 10. Persist user with mustChangePassword: true
    const createdUser = await prisma.user.create({
        data: {
            email: normalizedEmail,
            passwordHash,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            role: normalizedRole,
            status: "ACTIVE",
            branchId: branchId || null,
            mustChangePassword: true,
        },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
            branchId: true,
            mustChangePassword: true,
            createdAt: true,
        },
    });

    console.log(`[provision-staff] Successfully created staff account for ${createdUser.email} (Role: ${createdUser.role}).`);

    return {
        success: true,
        user: createdUser,
    };
}

// CLI runner — only runs when explicitly invoked directly from command line
if (require.main === module) {
    const email = process.env.STAFF_EMAIL || process.argv[2];
    const role = process.env.STAFF_ROLE || process.argv[3];
    const firstName = process.env.STAFF_FIRST_NAME || process.argv[4];
    const lastName = process.env.STAFF_LAST_NAME || process.argv[5];
    const branchId = process.env.STAFF_BRANCH_ID || process.argv[6] || null;

    if (!email || !role || !firstName || !lastName) {
        console.error("Usage: CONFIRM_STAFF_PROVISION=true node scripts/provision-staff.js <email> <role> <firstName> <lastName> [branchId]");
        console.error("Or configure environment variables: STAFF_EMAIL, STAFF_ROLE, STAFF_FIRST_NAME, STAFF_LAST_NAME, STAFF_PASSWORD.");
        process.exit(1);
    }

    provisionStaff({
        email,
        role,
        firstName,
        lastName,
        branchId,
    })
        .then(() => {
            console.log("Staff provisioning completed successfully.");
            process.exit(0);
        })
        .catch((err) => {
            console.error("Provisioning failed:", err.message);
            process.exit(1);
        });
}

module.exports = {
    provisionStaff,
    validatePasswordComplexity,
    generateSecureTempPassword,
    ALLOWED_STAFF_ROLES,
};
