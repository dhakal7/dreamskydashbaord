require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const bcrypt = require("bcryptjs");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "dreamskyadmission@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "dreamskyconsultancy@2025";
const ADMIN_FIRST_NAME = process.env.ADMIN_FIRST_NAME || "Ashis";
const ADMIN_LAST_NAME = process.env.ADMIN_LAST_NAME || "Shrestha";

async function seed() {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const user = await prisma.user.upsert({
        where: { email: ADMIN_EMAIL },
        update: { passwordHash: hash, firstName: ADMIN_FIRST_NAME, lastName: ADMIN_LAST_NAME, role: "SUPER_ADMIN", status: "ACTIVE" },
        create: {
            email: ADMIN_EMAIL,
            passwordHash: hash,
            firstName: ADMIN_FIRST_NAME,
            lastName: ADMIN_LAST_NAME,
            role: "SUPER_ADMIN",
            status: "ACTIVE",
        },
    });
    console.log("Admin user ready:", user.email, "| name:", user.firstName, user.lastName, "| role:", user.role);
    await prisma.$disconnect();
}

seed().catch((e) => { console.error(e); process.exit(1); });
