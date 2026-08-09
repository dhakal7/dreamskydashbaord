require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const fs = require("fs");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function cleanPhone(phone) {
    if (phone === null || phone === undefined) return null;
    let pStr = String(phone).trim();
    if (pStr.endsWith(".0")) pStr = pStr.slice(0, -2);
    if (["*", "", "none", "-", "na", "n/a"].includes(pStr.toLowerCase())) return null;
    return pStr;
}

function cleanEmail(email) {
    if (!email) return null;
    const emailStr = String(email).trim().toLowerCase();
    if (["*", "", "none", "-", "na", "n/a"].includes(emailStr) || !emailStr.includes("@")) return null;
    return emailStr;
}

function splitName(fullName) {
    if (!fullName) return { firstName: "Unknown", lastName: "Student" };
    const parts = String(fullName).trim().split(/\s+/);
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

async function run() {
    const jsonPath = "/Users/suyogdhakal/Desktop/eplanetcrm3/student_data.json";
    console.log("🔧 Starting Counselor Assignment Fix...\n");

    const fileContent = fs.readFileSync(jsonPath, "utf-8");
    const dbData = JSON.parse(fileContent);

    // ── Step 1: Load counselors from DB ────────────────────────────────────
    const dbCounselors = await prisma.user.findMany({ where: { role: "COUNSELOR" } });

    // Build lookup map: lowercase full name → user id
    const counselorNameToId = {};
    dbCounselors.forEach(u => {
        const key = `${u.firstName} ${u.lastName}`.toLowerCase().trim();
        counselorNameToId[key] = u.id;
        console.log(`  ✅ Counselor loaded: ${u.firstName} ${u.lastName} (${u.email}) → ID: ${u.id}`);
    });
    console.log();

    // ── Step 2: Process Lead Data records ──────────────────────────────────
    const leadRecords = dbData["Lead Data"]?.records || [];

    let fixed = 0;
    let alreadyCorrect = 0;
    let studentNotFound = 0;
    let noData = 0;

    for (const record of leadRecords) {
        const studentName = record["Student Name"];
        if (!studentName || String(studentName).trim() === "") { noData++; continue; }

        const rawCounselor = record["Counselor Assigned"];
        if (!rawCounselor || String(rawCounselor).trim().toLowerCase() === "unassigned") {
            // Explicitly set to null / unassigned
            const nameInfo = splitName(studentName);
            const cleanPh = cleanPhone(record["Contact Number"]);
            const email = cleanEmail(record["Email Address"]);

            let student = null;
            if (email) student = await prisma.student.findUnique({ where: { email } });
            if (!student && cleanPh) student = await prisma.student.findFirst({ where: { phone: cleanPh } });
            if (!student) student = await prisma.student.findFirst({
                where: {
                    firstName: { equals: nameInfo.firstName, mode: "insensitive" },
                    lastName: { equals: nameInfo.lastName, mode: "insensitive" }
                }
            });

            if (student && student.assignedCounselorId !== null) {
                await prisma.student.update({
                    where: { id: student.id },
                    data: { assignedCounselorId: null }
                });
                fixed++;
            }
            continue;
        }

        const counselorKey = String(rawCounselor).trim().toLowerCase();
        const counselorId = counselorNameToId[counselorKey];

        if (!counselorId) {
            console.warn(`  ⚠️  Unknown counselor: "${rawCounselor}" for student: ${studentName}`);
            continue;
        }

        // Find student in DB by email, phone, or name
        const nameInfo = splitName(studentName);
        const cleanPh = cleanPhone(record["Contact Number"]);
        const email = cleanEmail(record["Email Address"]);

        let student = null;
        if (email) student = await prisma.student.findUnique({ where: { email } });
        if (!student && cleanPh) student = await prisma.student.findFirst({ where: { phone: cleanPh } });
        if (!student) student = await prisma.student.findFirst({
            where: {
                firstName: { equals: nameInfo.firstName, mode: "insensitive" },
                lastName: { equals: nameInfo.lastName, mode: "insensitive" }
            }
        });

        if (!student) { studentNotFound++; continue; }

        if (student.assignedCounselorId === counselorId) {
            alreadyCorrect++;
            continue;
        }

        // Fix the assignment
        await prisma.student.update({
            where: { id: student.id },
            data: { assignedCounselorId: counselorId }
        });
        fixed++;
    }

    console.log("📊 Fix Summary:");
    console.log(`  ✅ Fixed / Updated:       ${fixed}`);
    console.log(`  ✔️  Already Correct:       ${alreadyCorrect}`);
    console.log(`  ❓ Student Not Found:      ${studentNotFound}`);
    console.log(`  ⏭️  Skipped (no name):     ${noData}`);

    // ── Step 3: Final DB verification ──────────────────────────────────────
    console.log("\n📋 Final Assignment Breakdown:");
    const counselors = await prisma.user.findMany({
        where: { role: "COUNSELOR" },
        include: { assignedStudents: true }
    });
    counselors.forEach(c => {
        console.log(`  ${c.firstName} ${c.lastName}: ${c.assignedStudents.length} students`);
    });
    const unassigned = await prisma.student.count({ where: { assignedCounselorId: null } });
    console.log(`  Unassigned: ${unassigned} students`);
    console.log("\n🎉 Counselor assignment fix complete!");
}

run()
    .catch(err => { console.error("💥 Error:", err); process.exit(1); })
    .finally(() => prisma.$disconnect());
