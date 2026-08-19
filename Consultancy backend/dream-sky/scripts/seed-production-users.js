require("dotenv").config();
const bcrypt = require("bcryptjs");
const prisma = require("../src/prisma");

const realStaffUsers = [
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
    console.log("Starting real staff user seeding...");

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

    // 2. Purge old demo users
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

    // 3. Seed real staff users
    for (const u of realStaffUsers) {
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
        console.log(`Synced staff user: ${user.email} (${user.role})`);
    }

    console.log("All real staff accounts synced successfully.");
}

seed()
    .catch((e) => {
        console.error("Seeding error:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
