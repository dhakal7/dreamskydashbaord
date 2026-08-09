require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function verify() {
    console.log("=== DB IMPORT VERIFICATION REPORT ===\n");

    const userCount = await prisma.user.count();
    const counselorCount = await prisma.user.count({ where: { role: "COUNSELOR" } });
    const studentCount = await prisma.student.count();
    const classCount = await prisma.class.count();
    const enrollmentCount = await prisma.enrollment.count();
    const attendanceCount = await prisma.attendanceRecord.count();
    const testScoreCount = await prisma.testScore.count();
    const commLogCount = await prisma.communicationLog.count();
    const appointmentCount = await prisma.appointment.count();

    console.log(`👤 Users in database:          ${userCount}`);
    console.log(`   └─ Counselor role users:    ${counselorCount}`);
    console.log(`🎓 Students in database:       ${studentCount}`);
    console.log(`🏫 Classes in database:        ${classCount}`);
    console.log(`📝 Class Enrollments:          ${enrollmentCount}`);
    console.log(`📅 Class Attendance Records:   ${attendanceCount}`);
    console.log(`📊 Test Scores recorded:       ${testScoreCount}`);
    console.log(`📞 Communication Logs (Notes): ${commLogCount}`);
    console.log(`⏰ Appointments scheduled:     ${appointmentCount}\n`);

    console.log("--- Student Assignment Breakdown ---");
    const counselors = await prisma.user.findMany({
        where: { role: "COUNSELOR" },
        include: {
            assignedStudents: true
        }
    });

    for (const counselor of counselors) {
        console.log(`Counselor: ${counselor.firstName} ${counselor.lastName} (${counselor.email})`);
        console.log(`   └─ Assigned Students: ${counselor.assignedStudents.length}`);
    }

    const unassignedCount = await prisma.student.count({
        where: { assignedCounselorId: null }
    });
    console.log(`Unassigned Students: ${unassignedCount}\n`);

    console.log("--- Sample Students ---");
    const sampleStudents = await prisma.student.findMany({
        take: 3,
        include: {
            assignedCounselor: true,
            enrollments: {
                include: {
                    class: true
                }
            }
        }
    });

    sampleStudents.forEach((s, idx) => {
        console.log(`[Sample #${idx + 1}]`);
        console.log(`  Name:   ${s.firstName} ${s.lastName}`);
        console.log(`  Email:  ${s.email}`);
        console.log(`  Phone:  ${s.phone}`);
        console.log(`  Source: ${s.source}`);
        console.log(`  Assigned Counselor: ${s.assignedCounselor ? `${s.assignedCounselor.firstName} ${s.assignedCounselor.lastName}` : "None"}`);
        console.log(`  Enrolled in: ${s.enrollments.map(e => e.class.name).join(", ") || "No classes"}`);
        console.log("  Notes Snippet:");
        console.log(`    ${s.notes ? s.notes.split("\n").slice(0, 3).join("\n    ") : "None"}\n`);
    });
}

verify()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
