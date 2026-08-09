require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const fs = require("fs");
const path = require("path");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function run() {
    const outputPath = path.resolve(__dirname, "../../../eplanetdashboard/src/mock/imported-data.json");
    console.log(`📤 Starting export of DB data for dashboard to: ${outputPath}`);

    // 1. Fetch Counselors from User model
    const dbCounselors = await prisma.user.findMany({
        where: { role: "COUNSELOR" },
        include: { assignedStudents: true }
    });

    const colors = ['#2563EB', '#7C3AED', '#0EA5E9', '#16A34A', '#D97706', '#DB2777'];

    const counselors = dbCounselors.map((c, i) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        email: c.email,
        avatarColor: colors[i % colors.length],
        role: i === 0 ? "senior_counselor" : "counselor",
        studentsHandled: c.assignedStudents.length,
        conversionRate: 65,
        branchId: "br-1"
    }));

    console.log(`👥 Exported ${counselors.length} real counselor profiles.`);

    // 2. Fetch Students with all relations
    const dbStudents = await prisma.student.findMany({
        include: {
            assignedCounselor: true,
            testScores: true,
            enrollments: {
                include: {
                    class: true
                }
            },
            communicationLogs: true,
            appointments: true
        }
    });

    console.log(`🎓 Found ${dbStudents.length} students in the database.`);

    const students = [];
    const leads = [];
    const followUps = [];
    const appointments = [];
    const applications = [];
    const visaCases = [];
    const studentDocuments = [];

    const pickColor = (name) => {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    const pad = (num, size) => {
        let s = num + "";
        while (s.length < size) s = "0" + s;
        return s;
    };

    dbStudents.forEach((student, idx) => {
        const studentName = `${student.firstName} ${student.lastName}`;
        const photoColor = pickColor(studentName);
        const counselorName = student.assignedCounselor 
            ? `${student.assignedCounselor.firstName} ${student.assignedCounselor.lastName}`
            : "Unassigned";
        const counselorId = student.assignedCounselorId || "unassigned";
        
        let priority = "medium";
        let budgetUsd = 12000;
        if (student.notes) {
            if (student.notes.includes("Status: Hot")) priority = "high";
            else if (student.notes.includes("Status: Cold")) priority = "low";
            else if (student.notes.includes("Status: Warm")) priority = "medium";

            if (student.notes.includes("Budget:")) {
                const match = student.notes.match(/Budget:\s*([0-9]+)/);
                if (match && match[1]) {
                    budgetUsd = parseInt(match[1]);
                }
            }
        }

        const isEnrolled = student.enrollments && student.enrollments.length > 0;
        const status = isEnrolled ? "enrolled" : (student.isActive ? "active" : "inactive");

        let englishTest = { type: "None" };
        if (student.testScores && student.testScores.length > 0) {
            const ts = student.testScores[0];
            englishTest = {
                type: ts.type.toUpperCase().includes("IELTS") ? "IELTS" : (ts.type.toUpperCase().includes("PTE") ? "PTE" : "None"),
                overallScore: ts.score || 6.5,
                testDate: ts.testDate.toISOString().slice(0, 10)
            };
        }

        let parsedAcademics = [];
        if (student.academicBackground) {
            parsedAcademics.push({
                level: student.academicBackground.qualification || "+2 / High School",
                institution: "Trinity International College",
                board: "NEB",
                gpaOrPercentage: student.academicBackground.details || "3.2 GPA",
                passedYear: "2024"
            });
        } else {
            parsedAcademics.push({
                level: "+2 / High School",
                institution: "St. Xaviers College",
                board: "NEB",
                gpaOrPercentage: "3.4 GPA",
                passedYear: "2024"
            });
        }

        // Student Profile
        const stuObj = {
            id: student.id,
            studentId: `EPC-2026-${pad(idx + 1, 4)}`,
            name: studentName,
            photoColor: photoColor,
            email: student.email,
            phone: student.phone || "9800000000",
            dob: "2002-05-15",
            gender: "male",
            nationality: "Nepali",
            passportNumber: `N${pad(Math.floor(Math.random() * 900000) + 100000, 6)}`,
            address: student.notes && student.notes.includes("Address:") ? student.notes.match(/Address:\s*([^\n]+)/)?.[1] || "Kathmandu" : "Kathmandu",
            status: status,
            counselorId: counselorId,
            counselorName: counselorName,
            preferredCountries: student.nationality ? [student.nationality] : ["Australia"],
            preferredLevel: "bachelor",
            budgetUsd: budgetUsd,
            englishTest: englishTest,
            academics: parsedAcademics,
            parents: [
                {
                    id: `p-${student.id}`,
                    name: `Hari ${student.lastName}`,
                    relation: "father",
                    phone: "9851000000"
                }
            ],
            documentsUploaded: isEnrolled ? 3 : 1,
            documentsRequired: 7,
            createdAt: student.createdAt.toISOString(),
            tags: isEnrolled ? ["Class Enrolled"] : ["Lead Profile"]
        };
        students.push(stuObj);

        // Lead Card
        let leadStage = "new";
        if (student.currentStage === "LEAD") leadStage = "new";
        else if (student.currentStage === "PROSPECT") leadStage = "counseling";
        else if (student.currentStage === "ENROLLED") leadStage = "completed";
        else if (student.currentStage === "APPLIED") leadStage = "application";
        else if (student.currentStage === "VISA_APPLIED") leadStage = "visa";
        else if (student.currentStage === "VISA_APPROVED") leadStage = "travel";

        leads.push({
            id: student.id,
            name: studentName,
            email: student.email,
            phone: student.phone || "9800000000",
            photoColor: photoColor,
            source: student.source ? student.source.toLowerCase().replace(" ", "_") : "walk_in",
            stage: leadStage,
            counselorId: counselorId,
            counselorName: counselorName,
            interestedCountry: student.nationality || "Australia",
            interestedLevel: "bachelor",
            budgetUsd: budgetUsd,
            priority: priority,
            lastContact: student.updatedAt.toISOString(),
            nextFollowUp: new Date(Date.now() + 7 * 86400000).toISOString(),
            createdAt: student.createdAt.toISOString(),
            value: Math.floor(budgetUsd * 0.10),
            notes: student.notes || ""
        });

        // Communication logs -> Follow-ups
        if (student.communicationLogs && student.communicationLogs.length > 0) {
            student.communicationLogs.forEach((log) => {
                if (log.nextFollowUpAt) {
                    followUps.push({
                        id: `fu-${log.id}`,
                        studentId: student.id,
                        studentName: studentName,
                        counselorId: counselorId,
                        counselorName: counselorName,
                        reminder: log.content.split("\n")[0] || "Follow up call",
                        priority: priority,
                        status: log.nextFollowUpAt < new Date() ? "completed" : "pending",
                        date: log.nextFollowUpAt.toISOString().slice(0, 10),
                        time: "11:00",
                        channel: log.channel.toLowerCase() === "phone" ? "call" : log.channel.toLowerCase()
                    });
                }
            });
        }

        // Appointments
        if (student.appointments && student.appointments.length > 0) {
            student.appointments.forEach((appt) => {
                appointments.push({
                    id: appt.id,
                    title: `${appt.type.replace('_', ' ')} — ${studentName}`,
                    studentId: student.id,
                    studentName: studentName,
                    counselorId: counselorId,
                    counselorName: counselorName,
                    start: appt.datetime.toISOString(),
                    end: new Date(appt.datetime.getTime() + appt.durationMin * 60000).toISOString(),
                    status: appt.status.toLowerCase() === "scheduled" ? "confirmed" : appt.status.toLowerCase(),
                    type: appt.type.toLowerCase().includes("consultation") ? "counseling" : "follow_up",
                    location: "branch_office"
                });
            });
        }

        // Applications & Visa cases
        if (isEnrolled || idx % 8 === 0) {
            const uniName = student.notes && student.notes.includes("University Interest:")
                ? student.notes.match(/University Interest:\s*([^\n]+)/)?.[1] || "University of Sydney"
                : "University of Sydney";

            applications.push({
                id: `app-${student.id}`,
                applicationRef: `EPC-APP-${pad(idx + 1, 5)}`,
                studentId: student.id,
                studentName: studentName,
                universityId: "uni-sydney",
                universityName: uniName,
                countryName: student.nationality || "Australia",
                courseName: student.notes && student.notes.includes("Course Interest:")
                    ? student.notes.match(/Course Interest:\s*([^\n]+)/)?.[1] || "Bachelor of IT"
                    : "Bachelor of Business Administration",
                counselorName: counselorName,
                stage: isEnrolled ? "accepted" : "submitted",
                submittedDate: student.createdAt.toISOString().slice(0, 10),
                intake: "July 2026",
                tuitionUsd: budgetUsd,
                lastUpdate: student.updatedAt.toISOString()
            });

            if (isEnrolled) {
                visaCases.push({
                    id: `visa-${student.id}`,
                    studentId: student.id,
                    studentName: studentName,
                    countryName: student.nationality || "Australia",
                    universityName: uniName,
                    checklist: [
                        { step: "medical", status: "approved", completedDate: student.createdAt.toISOString() },
                        { step: "biometric", status: "approved", completedDate: student.createdAt.toISOString() },
                        { step: "financial", status: "approved", completedDate: student.createdAt.toISOString() },
                        { step: "interview", status: "approved", completedDate: student.createdAt.toISOString() },
                        { step: "embassy_submission", status: "in_progress" },
                        { step: "decision", status: "not_started" }
                    ],
                    overallStatus: "in_progress",
                    progress: 66,
                    submissionDate: student.createdAt.toISOString()
                });
            }

            studentDocuments.push({
                id: `doc-${student.id}-1`,
                studentId: student.id,
                studentName: studentName,
                type: "passport",
                fileName: `passport_${student.id}.pdf`,
                fileSizeKb: 1024,
                version: 1,
                uploadedAt: student.createdAt.toISOString(),
                uploadedBy: counselorName,
                status: "verified"
            });
            studentDocuments.push({
                id: `doc-${student.id}-2`,
                studentId: student.id,
                studentName: studentName,
                type: "academic",
                fileName: `transcript_${student.id}.pdf`,
                fileSizeKb: 2048,
                version: 1,
                uploadedAt: student.createdAt.toISOString(),
                uploadedBy: counselorName,
                status: "verified"
            });
        }
    });

    const outputData = {
        counselors,
        students,
        leads,
        followUps,
        appointments,
        applications,
        visaCases,
        studentDocuments
    };

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), "utf-8");

    console.log(`🚀 Exported successfully!`);
    console.log(`   - Counselors: ${counselors.length}`);
    console.log(`   - Students: ${students.length}`);
    console.log(`   - Leads: ${leads.length}`);
    console.log(`   - Followups: ${followUps.length}`);
    console.log(`   - Appointments: ${appointments.length}`);
    console.log(`   - Applications: ${applications.length}`);
    console.log(`   - Visa Cases: ${visaCases.length}`);
    console.log(`   - Documents: ${studentDocuments.length}`);
}

run()
    .catch((err) => {
        console.error("💥 Critical error running exporter script:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
