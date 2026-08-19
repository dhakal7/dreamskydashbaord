require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = require("../src/prisma");

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
        id: "user-sa-demo",
        email: "admin@dreamsky.edu.np",
        firstName: "System",
        lastName: "Administrator",
        password: "dreamsky-demo",
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
        id: "user-counselor-demo",
        email: "counselor@dreamsky.edu.np",
        firstName: "Anjali",
        lastName: "Sharma",
        password: "dreamsky-demo",
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
    },
    {
        id: "user-fd-demo",
        email: "frontdesk@dreamsky.edu.np",
        firstName: "Frontdesk",
        lastName: "Officer",
        password: "dreamsky-demo",
        role: "FRONT_DESK",
        status: "ACTIVE",
        branchId: "br-1"
    },
    {
        id: "user-teacher-demo",
        email: "teacher@dreamsky.edu.np",
        firstName: "Bikash",
        lastName: "Gurung",
        password: "dreamsky-demo",
        role: "TEACHER",
        status: "ACTIVE",
        branchId: "br-1"
    },
    {
        id: "user-student-demo",
        email: "student@dreamsky.edu.np",
        firstName: "Aarav",
        lastName: "Sharma",
        password: "dreamsky-demo",
        role: "STUDENT",
        status: "ACTIVE",
        branchId: "br-1"
    },
    {
        id: "user-referral-demo",
        email: "referral@dreamsky.edu.np",
        firstName: "Rohan",
        lastName: "Adhikari",
        password: "dreamsky-demo",
        role: "REFERRAL_AGENT",
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

    // Clean up mock users not in the active seed list (disabled to preserve FK integrity)
    // const activeEmails = usersToSeed.map((u) => u.email);
    // const deleteResult = await prisma.user.deleteMany({ where: { email: { notIn: activeEmails } } });

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
                mustChangePassword: false
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
                mustChangePassword: false
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
