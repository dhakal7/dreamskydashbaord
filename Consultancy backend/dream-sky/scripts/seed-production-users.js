require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

// We can instantiate PrismaClient directly or use pg adapter if required.
// Let's import the database client just like in the app src/prisma.js or fallback to direct client.
let prisma;
try {
    const { PrismaPg } = require("@prisma/adapter-pg");
    const { Pool } = require("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
} catch (e) {
    // Fallback to default direct client
    prisma = new PrismaClient();
}

const usersToSeed = [
    {
        id: "user-sa-1",
        email: "dreamskyadmission@gmail.com",
        firstName: "Ashish",
        lastName: "Shrestha",
        password: "dreamskyconsultancy@2025",
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        branchId: "br-1"
    },
    {
        id: "cmsejoq9m0000z0tyq5vy1ytd",
        email: "dipshikha.dawadi@dreamsky.com",
        firstName: "Dipshikha",
        lastName: "Dawadi",
        password: "DreamSky@Counselor2025!",
        role: "COUNSELOR",
        status: "ACTIVE",
        branchId: "br-1"
    },
    {
        id: "cmsejoqao0002z0tyce0e72ll",
        email: "amit.dhodari@dreamsky.com",
        firstName: "Amit",
        lastName: "Dhodari",
        password: "DreamSky@Counselor2025!",
        role: "COUNSELOR",
        status: "ACTIVE",
        branchId: "br-1"
    },
    {
        id: "cmsejoqar0004z0tygo6vjk76",
        email: "vaibhav.joshi@dreamsky.com",
        firstName: "Vaibhav",
        lastName: "Joshi",
        password: "DreamSky@Counselor2025!",
        role: "COUNSELOR",
        status: "ACTIVE",
        branchId: "br-1"
    },
    {
        id: "fd-1",
        email: "santona.khatri@dreamsky.com",
        firstName: "Santona",
        lastName: "Khatri",
        password: "dreamskyfrontdesk@2025",
        role: "FRONT_DESK",
        status: "ACTIVE",
        branchId: "br-1"
    },
    {
        id: "fd-2",
        email: "amisha.thapa@dreamsky.com",
        firstName: "Amisha",
        lastName: "Thapa",
        password: "dreamskyfrontdesk@2025",
        role: "FRONT_DESK",
        status: "ACTIVE",
        branchId: "br-1"
    }
];

async function seed() {
    console.log("Starting production user seeding...");

    // 1. Ensure the default branch (br-1) exists
    const defaultBranch = await prisma.branch.upsert({
        where: { id: "br-1" },
        update: { name: "Chabahil Branch", isActive: true },
        create: {
            id: "br-1",
            name: "Chabahil Branch",
            isActive: true
        }
    });
    console.log("Default branch ready:", defaultBranch.name);

    // Clean up mock users not in the active seed list
    const activeEmails = usersToSeed.map((u) => u.email);
    const deleteResult = await prisma.user.deleteMany({
        where: {
            email: { notIn: activeEmails }
        }
    });
    console.log(`Cleaned up ${deleteResult.count} old mock user accounts.`);

    // 2. Seed/upsert users
    for (const u of usersToSeed) {
        const hash = await bcrypt.hash(u.password, 12);
        const user = await prisma.user.upsert({
            where: { email: u.email },
            update: {
                id: u.id,
                passwordHash: hash,
                firstName: u.firstName,
                lastName: u.lastName,
                role: u.role,
                status: u.status,
                branchId: u.branchId,
                mustChangePassword: true
            },
            create: {
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
        });
        console.log(`User created/updated: ${user.email} | Role: ${user.role}`);
    }

    console.log("Production user seeding completed successfully.");
    await prisma.$disconnect();
}

seed().catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
});
