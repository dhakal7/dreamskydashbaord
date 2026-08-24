const prisma = require("../prisma");
const bcrypt = require("bcryptjs");

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
    },
    {
        id: "teacher-1",
        email: "teacher@dreamsky.internal",
        firstName: "EPT",
        lastName: "Instructor",
        password: "dreamskyteacher@2025",
        role: "TEACHER",
        status: "ACTIVE",
        branchId: "br-1"
    }
];

const autoSeedUsers = async () => {
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

        for (const u of realStaffUsers) {
            const existing = await prisma.user.findUnique({ where: { email: u.email } });
            let needUpdate = !existing;
            if (existing) {
                const matches = await bcrypt.compare(u.password, existing.passwordHash).catch(() => false);
                if (!matches) needUpdate = true;
            }
            if (needUpdate) {
                const hash = await bcrypt.hash(u.password, 10);
                await prisma.user.upsert({
                    where: { email: u.email },
                    update: {
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
                }).catch((err) => console.error(`Staff user sync error [${u.email}]:`, err.message));

                if (u.email === 'teacher@dreamsky.internal') {
                    await prisma.user.updateMany({
                        where: { email: u.email },
                        data: { passwordHash: hash, status: 'ACTIVE', role: 'TEACHER' }
                    }).catch(() => {});
                }
            }
        }
        console.log("✅ Auto-seeder completed real staff user sync.");
    } catch (err) {
        console.error("Auto-seeder error:", err.message);
    }
};

module.exports = { autoSeedUsers };
