const bcrypt = require("bcryptjs");
const { assertDisposableTarget } = require("../src/config");

// Pre-import guard: Execution blocked unless positively targeting disposable test DB
assertDisposableTarget(process.env.DATABASE_URL, process.env.ALLOW_DESTRUCTIVE_OPERATIONS);

const prisma = require("../src/prisma");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "dreamskyadmission@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
    console.error("ADMIN_PASSWORD environment variable is required.");
    process.exit(1);
}
const ADMIN_FIRST_NAME = process.env.ADMIN_FIRST_NAME || "Ashish";
const ADMIN_LAST_NAME = process.env.ADMIN_LAST_NAME || "Shrestha";

async function seed() {
    assertDisposableTarget(process.env.DATABASE_URL, process.env.ALLOW_DESTRUCTIVE_OPERATIONS);
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
