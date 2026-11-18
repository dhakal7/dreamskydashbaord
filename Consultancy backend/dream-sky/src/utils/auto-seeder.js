/**
 * Manual Administrative Seeder Utility (DEPRECATED & SAFEGUARDED)
 *
 * SAFETY GUARANTEES:
 * 1. Automatic execution during server startup is strictly removed.
 * 2. Destructive user deletion (deleteMany) is permanently removed.
 * 3. Static default passwords have been removed to prevent credential exposure.
 * 4. Automatic staff password resets and branch modifications are disabled.
 * 5. Existing user, client, branch, and staff records are strictly preserved.
 */

const autoSeedUsers = async () => {
    throw new Error(
        "[SECURITY ERROR] Automated seeding on server startup is disabled to protect production data and prevent unauthorized credential overwrites. User creation must be performed via the authenticated administrative console or explicit administrative scripts."
    );
};

module.exports = { autoSeedUsers };
