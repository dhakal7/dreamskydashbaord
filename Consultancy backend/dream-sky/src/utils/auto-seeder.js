const prisma = require("../prisma");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

/**
 * Standard staff user identities for initial system bootstrapping.
 * Plaintext passwords have been completely removed.
 * Initial credentials must be set via secure environment provisioning or CLI.
 */
const staffIdentities = [
    {
        id: "user-sa-1",
        email: "dreamskyadmission@gmail.com",
        firstName: "Ashish",
        lastName: "Shrestha",
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        branchId: "br-1"
    },
    {
        id: "cmsejoq9m0000z0tyq5vy1ytd",
        email: "dipshikha.dawadi@dreamsky.com",
        firstName: "Dipshikha",
        lastName: "Dawadi",
        role: "COUNSELOR",
        status: "ACTIVE",
        branchId: "br-1"
    },
    {
        id: "cmsejoqao0002z0tyce0e72ll",
        email: "amit.dhodari@dreamsky.com",
        firstName: "Amit",
        lastName: "Dhodari",
        role: "COUNSELOR",
        status: "ACTIVE",
        branchId: "br-1"
    },
    {
        id: "cmsejoqar0004z0tygo6vjk76",
        email: "vaibhav.joshi@dreamsky.com",
        firstName: "Vaibhav",
        lastName: "Joshi",
        role: "COUNSELOR",
        status: "ACTIVE",
        branchId: "br-1"
    },
    {
        id: "fd-1",
        email: "santona.khatri@dreamsky.com",
        firstName: "Santona",
        lastName: "Khatri",
        role: "FRONT_DESK",
        status: "ACTIVE",
        branchId: "br-1"
    },
    {
        id: "fd-2",
        email: "amisha.thapa@dreamsky.com",
        firstName: "Amisha",
        lastName: "Thapa",
        role: "FRONT_DESK",
        status: "ACTIVE",
        branchId: "br-1"
    },
    {
        id: "teacher-1",
        email: "teacher@dreamsky.internal",
        firstName: "EPT",
        lastName: "Instructor",
        role: "TEACHER",
        status: "ACTIVE",
        branchId: "br-1"
    }
];

const autoSeedUsers = async () => {
    // Strict confirmation guard: Only explicit environment confirmation is accepted
    // Function arguments (such as options.force) CANNOT bypass this check
    if (process.env.CONFIRM_STAFF_SEED !== "true") {
        console.warn("⚠️ autoSeedUsers: Execution skipped. Requires explicit CONFIRM_STAFF_SEED='true' environment variable.");
        return { skipped: true, reason: "CONFIRM_STAFF_SEED required" };
    }

    try {
        // Ensure default branch exists
        await prisma.branch.upsert({
            where: { id: "br-1" },
            update: { name: "Chabahil Branch", isActive: true },
            create: { id: "br-1", name: "Chabahil Branch", isActive: true }
        }).catch(() => {});

        // Purge old demo users from database if present
        await prisma.user.deleteMany({
            where: {
                email: {
                    in: [
                        "admin@dreamsky.edu.np",
                        "counselor@dreamsky.edu.np",
                        "frontdesk@dreamsky.edu.np",
                        "teacher@dreamsky.edu.np",
                        "student@dreamsky.edu.np",
                        "referral@dreamsky.edu.np"
                    ]
                }
            }
        }).catch(() => {});

        for (const u of staffIdentities) {
            const existing = await prisma.user.findUnique({ where: { email: u.email } });
            if (!existing) {
                // Generate high-entropy secret if none supplied via environment
                const initialSecret = process.env.STAFF_SEED_INITIAL_PASSWORD ||
                    crypto.randomBytes(24).toString("base64");
                const hash = await bcrypt.hash(initialSecret, 12);

                await prisma.user.create({
                    data: {
                        id: u.id,
                        email: u.email,
                        passwordHash: hash,
                        firstName: u.firstName,
                        lastName: u.lastName,
                        role: u.role,
                        status: u.status,
                        branchId: u.branchId,
                        mustChangePassword: true
                    }
                }).catch((err) => console.error(`Staff user creation error [${u.email}]:`, err.message));
                console.log(`✅ Seeded new staff account: ${u.email} (mustChangePassword: true)`);
            } else {
                console.log(`ℹ️ Preserved existing staff account: ${u.email} (password untouched)`);
            }
        }
        console.log("✅ Auto-seeder completed staff user check.");
        return { success: true };
    } catch (err) {
        console.error("Auto-seeder error:", err.message);
        throw err;
    }
};

if (require.main === module) {
    autoSeedUsers()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = { autoSeedUsers, staffIdentities };
