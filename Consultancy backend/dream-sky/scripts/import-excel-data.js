require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ==========================================
// HELPERS & CONFIG
// ==========================================

// Helper: Split full name into firstName and lastName
function splitName(fullName) {
    if (!fullName) return { firstName: "Unknown", lastName: "Student" };
    const parts = String(fullName).trim().split(/\s+/);
    if (parts.length === 1) {
        return { firstName: parts[0], lastName: "" };
    }
    const firstName = parts[0];
    const lastName = parts.slice(1).join(" ");
    return { firstName, lastName };
}

// Helper: Clean phone number format
function cleanPhone(phone) {
    if (phone === null || phone === undefined) return null;
    let pStr = String(phone).trim();
    if (pStr.endsWith(".0")) {
        pStr = pStr.slice(0, -2);
    }
    // If it's empty or placeholder
    if (["*", "", "none", "-", "na", "n/a"].includes(pStr.toLowerCase())) {
        return null;
    }
    return pStr;
}

// Helper: Parse Date values from Excel (handles Date, string, and serial number)
function parseExcelDate(val) {
    if (!val) return null;
    if (val instanceof Date) {
        return isNaN(val.getTime()) ? null : val;
    }
    if (typeof val === "string") {
        const cleanVal = val.trim();
        if (["*", "", "none", "-", "na", "n/a"].includes(cleanVal.toLowerCase())) {
            return null;
        }
        const d = new Date(cleanVal);
        return isNaN(d.getTime()) ? null : d;
    }
    if (typeof val === "number") {
        // Excel serial date code
        const date = new Date((val - 25569) * 86400 * 1000);
        return isNaN(date.getTime()) ? null : date;
    }
    return null;
}

// Helper: Generate a unique email placeholder if email is missing
function generatePlaceholderEmail(fullName, phone) {
    const cleanName = String(fullName)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ".")
        .replace(/\.+/g, ".");
    const cleanPh = phone ? cleanPhone(phone) : null;
    const suffix = cleanPh || Math.random().toString(36).substring(2, 8);
    return `${cleanName}.${suffix}@no-email.eplanet.com`;
}

// Helper: Standard clean email checker
function cleanEmail(email) {
    if (!email) return null;
    const emailStr = String(email).trim().toLowerCase();
    if (["*", "", "none", "-", "na", "n/a"].includes(emailStr) || !emailStr.includes("@")) {
        return null;
    }
    return emailStr;
}

// Helper: Find student by Email, Phone, or Full Name matching
async function findExistingStudent(nameInfo, email, phone) {
    if (email) {
        const s = await prisma.student.findUnique({ where: { email } });
        if (s) return s;
    }
    if (phone) {
        const s = await prisma.student.findFirst({ where: { phone } });
        if (s) return s;
    }
    // Match by first & last name (case-insensitive)
    const s = await prisma.student.findFirst({
        where: {
            firstName: { equals: nameInfo.firstName, mode: "insensitive" },
            lastName: { equals: nameInfo.lastName, mode: "insensitive" }
        }
    });
    return s;
}

// ==========================================
// MAIN IMPORT TASK
// ==========================================
async function run() {
    const jsonPath = "/Users/suyogdhakal/Desktop/eplanetcrm3/student_data.json";
    console.log(`🚀 Starting Import from JSON: ${jsonPath}`);

    if (!fs.existsSync(jsonPath)) {
        throw new Error(`File not found: ${jsonPath}`);
    }

    const fileContent = fs.readFileSync(jsonPath, "utf-8");
    const dbData = JSON.parse(fileContent);
    
    // ------------------------------------------
    // 1. AUTO-CREATE COUNSELOR USERS
    // ------------------------------------------
    console.log("\n👥 Step 1: Setting up Counselor User Accounts...");
    const counselorsMap = {
        "dipshikha dawadi": { email: "dipshikha.dawadi@dreamsky.com", firstName: "Dipshikha", lastName: "Dawadi" },
        "amit dhodari": { email: "amit.dhodari@dreamsky.com", firstName: "Amit", lastName: "Dhodari" },
        "vaibhav joshi": { email: "vaibhav.joshi@dreamsky.com", firstName: "Vaibhav", lastName: "Joshi" }
    };
    
    const counselorHash = await bcrypt.hash("Counselor@123", 12);
    const counselorNameToId = {};
    
    for (const [keyName, info] of Object.entries(counselorsMap)) {
        const user = await prisma.user.upsert({
            where: { email: info.email },
            update: {},
            create: {
                email: info.email,
                passwordHash: counselorHash,
                firstName: info.firstName,
                lastName: info.lastName,
                role: "COUNSELOR",
                status: "ACTIVE"
            }
        });
        
        await prisma.counselorProfile.upsert({
            where: { userId: user.id },
            update: {},
            create: {
                userId: user.id,
                specialization: "General Studies"
            }
        });
        
        counselorNameToId[keyName] = user.id;
        console.log(`   - Counselor account ready: ${info.firstName} ${info.lastName} (${user.email})`);
    }

    // Default class teacher is Amit Dhodari
    const defaultTeacherId = counselorNameToId["amit dhodari"];

    // ------------------------------------------
    // 2. PARSE LEAD DATA SHEET
    // ------------------------------------------
    console.log("\n📋 Step 2: Importing Student Lead Data...");
    const leadRecords = dbData["Lead Data"]?.records || [];
    
    let leadSuccessCount = 0;
    let leadUpdateCount = 0;
    let leadFailCount = 0;
    
    for (let i = 0; i < leadRecords.length; i++) {
        const record = leadRecords[i];
        if (!record) continue;
        
        const studentName = record["Student Name"];
        if (!studentName || String(studentName).trim() === "") continue; // skip if student name is empty
        
        try {
            const rawLeadDate = record["Lead Date"];
            const leadsSource = record["Leads Source"];
            const counselorName = record["Counselor Assigned"];
            const status = record["Status"];
            const currentAddress = record["Current Address"];
            const contactNumber = record["Contact Number"];
            const emailAddress = record["Email Address"];
            const latestAcademic = record["Latest Academic Qualification"];
            const academicDetails = record["Academic Details"];
            const courseInterested = record["Course Interested"];
            const mainCountry = record["Main Country"];
            const countriesInterested = record["Countries Interested"];
            const intake = record["Intake"];
            const university = record["University"];
            const followUpRemarks = record["Follow up remarks"];
            const appointmentVal = record["Appointment"];
            const nextFollowUpRemarks = record["Next Follow up remarks"];
            const officeVisit = record["Office visit"];
            const agentName = record["Agents"];
            const lastFollowUpDate = record["Last follow up date"];
            const nextFollowUpDate = record["Next follow up date"];
            const documentation = record["Documentation"];
            const documentationDetails = record["Documentation Details"];
            const processStatus = record["Process Status"];
            const callCount = record["Call count"];

            const nameInfo = splitName(studentName);
            const cleanPh = cleanPhone(contactNumber);
            const email = cleanEmail(emailAddress) || generatePlaceholderEmail(studentName, cleanPh);
            
            // Resolve Counselor
            let assignedCounselorId = null;
            if (counselorName) {
                const cleanCName = String(counselorName).trim().toLowerCase();
                if (counselorNameToId[cleanCName]) {
                    assignedCounselorId = counselorNameToId[cleanCName];
                }
            }

            // Create robust notes string
            let notesParts = [];
            if (status) notesParts.push(`Status: ${status}`);
            if (processStatus) notesParts.push(`Process Status: ${processStatus}`);
            if (currentAddress) notesParts.push(`Address: ${currentAddress}`);
            if (latestAcademic) notesParts.push(`Latest Academic: ${latestAcademic}`);
            if (academicDetails) notesParts.push(`Academic Details: ${academicDetails}`);
            if (courseInterested) notesParts.push(`Course Interest: ${courseInterested}`);
            if (university) notesParts.push(`University Interest: ${university}`);
            if (intake) notesParts.push(`Intake: ${intake}`);
            if (officeVisit) notesParts.push(`Office Visit: ${officeVisit}`);
            if (callCount) notesParts.push(`Call Count: ${callCount}`);
            if (documentationDetails) notesParts.push(`Documentation Details: ${documentationDetails}`);
            const notes = notesParts.length > 0 ? notesParts.join("\n") : null;

            // Prepare student fields
            const studentPayload = {
                firstName: nameInfo.firstName,
                lastName: nameInfo.lastName,
                email: email,
                phone: cleanPh,
                nationality: mainCountry ? String(mainCountry).trim() : (countriesInterested ? String(countriesInterested).split(",")[0].trim() : null),
                source: agentName ? `Agent - ${String(agentName).trim()}` : (leadsSource ? String(leadsSource).trim() : "Walk In"),
                assignedCounselorId: assignedCounselorId,
                notes: notes,
                academicBackground: {
                    qualification: latestAcademic ? String(latestAcademic).trim() : null,
                    details: academicDetails ? String(academicDetails).trim() : null
                },
                createdAt: parseExcelDate(rawLeadDate) || new Date()
            };

            // Check if student exists
            const existing = await findExistingStudent(nameInfo, email, cleanPh);
            let dbStudent;
            
            if (existing) {
                // Update
                dbStudent = await prisma.student.update({
                    where: { id: existing.id },
                    data: {
                        phone: cleanPh || existing.phone,
                        notes: notes ? `${existing.notes || ""}\n\n[Imported Update]:\n${notes}` : existing.notes,
                        assignedCounselorId: assignedCounselorId || existing.assignedCounselorId,
                        updatedAt: new Date()
                    }
                });
                leadUpdateCount++;
            } else {
                // Create
                dbStudent = await prisma.student.create({
                    data: studentPayload
                });
                leadSuccessCount++;
            }

            // Create Stage History
            await prisma.pipelineStageHistory.create({
                data: {
                    studentId: dbStudent.id,
                    stage: "LEAD",
                    changedById: assignedCounselorId,
                    reasonCode: "EXCEL_IMPORT"
                }
            });

            // Create Communication Logs for follow-ups
            if (followUpRemarks || nextFollowUpRemarks) {
                const remarksContent = [
                    followUpRemarks ? `Remarks: ${followUpRemarks}` : null,
                    nextFollowUpRemarks ? `Next Action: ${nextFollowUpRemarks}` : null
                ].filter(Boolean).join("\n");

                await prisma.communicationLog.create({
                    data: {
                        studentId: dbStudent.id,
                        authorId: assignedCounselorId,
                        channel: "PHONE",
                        direction: "OUTBOUND",
                        content: remarksContent || "Counselor follow up remarks imported.",
                        nextFollowUpAt: parseExcelDate(nextFollowUpDate),
                        createdAt: parseExcelDate(lastFollowUpDate) || parseExcelDate(rawLeadDate) || new Date()
                    }
                });
            }

            // Create Appointment if listed
            const apptDate = parseExcelDate(appointmentVal);
            if (apptDate) {
                await prisma.appointment.create({
                    data: {
                        studentId: dbStudent.id,
                        counselorId: assignedCounselorId,
                        datetime: apptDate,
                        type: "INITIAL_CONSULTATION",
                        notes: "Imported appointment from Excel."
                    }
                });
            }

        } catch (err) {
            console.error(`   ❌ Failed to import lead row ${i} (${studentName}):`, err.message);
            leadFailCount++;
        }
    }
    console.log(`   ✅ Leads Import Summary: Created ${leadSuccessCount}, Updated/Merged ${leadUpdateCount}, Failed ${leadFailCount}`);

    // ------------------------------------------
    // 3. PARSE IELTS PTE CLASS SHEET
    // ------------------------------------------
    console.log("\n📚 Step 3: Importing IELTS/PTE Class Enrollments...");
    const classRecords = dbData["IELTS PTE Class"]?.records || [];
    
    let classSuccessCount = 0;
    let classMergeCount = 0;
    let classFailCount = 0;
    
    // Keep track of created Classes to avoid duplicates
    const createdClasses = {};

    for (let i = 0; i < classRecords.length; i++) {
        const record = classRecords[i];
        if (!record) continue;
        
        const studentName = record["Student Name"];
        if (!studentName || String(studentName).trim() === "") continue;
        
        try {
            const leadSource = record["Lead Source"];
            const dateOfJoining = record["Date of Joining"];
            const contactNo = record["Contact no."];
            const address = record["Address"];
            const emailAddress = record["Email Address"];
            const countryInterest = record["Interested country"];
            const classTiming = record["Class Timing"];
            const eptClass = record["EPT Class"]; // e.g. "PTE" or "IELTS"
            const dateOfCompletion = record["Date of Completion"];
            const classFeePayment = record["Class fee payment"];
            const paymentMethod = record["Paymemt Method"];
            const remarks = record["Remarks"];
            const testDateBookingPayment = record["Test Date booking payment"];
            const testDate = record["Test Date"];

            const nameInfo = splitName(studentName);
            const cleanPh = cleanPhone(contactNo);
            const email = cleanEmail(emailAddress) || generatePlaceholderEmail(studentName, cleanPh);

            // Find if student already exists from Lead Data sheet
            const existing = await findExistingStudent(nameInfo, email, cleanPh);
            let dbStudent;
            
            let classNotes = `Class Details: ${eptClass || "EPT"} Class\nTiming: ${classTiming || "TBD"}\nAddress: ${address || "TBD"}\nFee Status: ${classFeePayment || "TBD"}\nPayment Method: ${paymentMethod || "TBD"}\nRemarks: ${remarks || "None"}`;
            if (testDateBookingPayment) classNotes += `\nTest Booking Payment: ${testDateBookingPayment}`;
            if (testDate) classNotes += `\nTest Date: ${parseExcelDate(testDate)?.toLocaleDateString() || testDate}`;

            if (existing) {
                // Merge student details
                dbStudent = await prisma.student.update({
                    where: { id: existing.id },
                    data: {
                        phone: existing.phone || cleanPh,
                        notes: `${existing.notes || ""}\n\n[Class Info Merged]:\n${classNotes}`,
                        updatedAt: new Date()
                    }
                });
                classMergeCount++;
            } else {
                // Create new Student record
                dbStudent = await prisma.student.create({
                    data: {
                        firstName: nameInfo.firstName,
                        lastName: nameInfo.lastName,
                        email: email,
                        phone: cleanPh,
                        nationality: countryInterest ? String(countryInterest).trim() : null,
                        source: leadSource ? String(leadSource).trim() : "Social Media",
                        notes: classNotes,
                        createdAt: parseExcelDate(dateOfJoining) || new Date()
                    }
                });
                classSuccessCount++;
            }

            // Upsert Test Scores if test score details exist
            if (testDate) {
                await prisma.testScore.create({
                    data: {
                        studentId: dbStudent.id,
                        type: eptClass || "EPT",
                        score: 0.0, // default placeholder
                        testDate: parseExcelDate(testDate) || new Date()
                    }
                });
            }

            // Resolve EPT Class name
            const className = `${eptClass || "EPT"} Class (${classTiming || "General Timing"})`;
            const classKey = className.toLowerCase().trim();
            let dbClass = createdClasses[classKey];

            if (!dbClass) {
                // Check if class exists in database
                let existingClass = await prisma.class.findFirst({
                    where: { name: className }
                });

                if (!existingClass) {
                    // Create new Class
                    existingClass = await prisma.class.create({
                        data: {
                            name: className,
                            subject: eptClass || "EPT",
                            teacherId: defaultTeacherId,
                            schedule: classTiming ? { timing: classTiming } : null,
                            isActive: true
                        }
                    });
                }
                dbClass = existingClass;
                createdClasses[classKey] = dbClass;
            }

            // Enroll Student in Class
            await prisma.enrollment.upsert({
                where: {
                    classId_studentId: { classId: dbClass.id, studentId: dbStudent.id }
                },
                update: {},
                create: {
                    classId: dbClass.id,
                    studentId: dbStudent.id,
                    enrolledAt: parseExcelDate(dateOfJoining) || new Date()
                }
            });

        } catch (err) {
            console.error(`   ❌ Failed to import class enrollment row ${i} (${studentName}):`, err.message);
            classFailCount++;
        }
    }
    console.log(`   ✅ Class Enrollments Summary: Created ${classSuccessCount}, Merged ${classMergeCount}, Failed ${classFailCount}`);

    // ------------------------------------------
    // 4. PARSE ATTENDANCE OF EPT CLASS SHEET
    // ------------------------------------------
    console.log("\n📅 Step 4: Importing Class Attendance Records...");
    const attendanceRecords = dbData["Attendance of EPT Class"]?.records || [];
    
    let attSuccessCount = 0;
    let attFailCount = 0;

    for (let i = 0; i < attendanceRecords.length; i++) {
        const record = attendanceRecords[i];
        if (!record) continue;

        const studentName = record["STUDENT NAME"];
        if (!studentName || String(studentName).trim() === "") continue;

        try {
            const rawDate = record["DATE"];
            const eptClass = record["EPT CLASS"];
            const contactNo = record["CONTACT NUMBER"];
            const timing = record["TIMING"];
            const attendanceStatus = record["ATTENDANCE"]; // e.g. "Absent", "Present "
            const rawAttDate = record["ATTENDANCE DATE"];

            const nameInfo = splitName(studentName);
            const cleanPh = cleanPhone(contactNo);
            
            // Find student in DB
            let student = await findExistingStudent(nameInfo, null, cleanPh);
            if (!student) {
                // Auto-create student
                const email = generatePlaceholderEmail(studentName, cleanPh);
                student = await prisma.student.create({
                    data: {
                        firstName: nameInfo.firstName,
                        lastName: nameInfo.lastName,
                        email: email,
                        phone: cleanPh,
                        source: "Class Attendance Sheet",
                        notes: `Auto-created during class attendance import. EPT Class: ${eptClass || 'EPT'}`,
                        createdAt: parseExcelDate(rawDate) || parseExcelDate(rawAttDate) || new Date()
                    }
                });
            }

            // Find matching class
            const className = `${eptClass || "EPT"} Class (${timing || "General Timing"})`;
            let dbClass = await prisma.class.findFirst({
                where: { name: className }
            });

            if (!dbClass) {
                // Auto-create class on the fly
                dbClass = await prisma.class.create({
                    data: {
                        name: className,
                        subject: eptClass || "EPT",
                        teacherId: defaultTeacherId,
                        schedule: timing ? { timing } : null,
                        isActive: true
                    }
                });
            }

            // Map status
            let status = "PRESENT";
            if (attendanceStatus && String(attendanceStatus).trim().toLowerCase() === "absent") {
                status = "ABSENT";
            }

            const attendanceDate = parseExcelDate(rawDate) || parseExcelDate(rawAttDate) || new Date();

            // Create Attendance Record
            await prisma.attendanceRecord.upsert({
                where: {
                    classId_studentId_date: {
                        classId: dbClass.id,
                        studentId: student.id,
                        date: attendanceDate
                    }
                },
                update: {
                    status: status
                },
                create: {
                    classId: dbClass.id,
                    studentId: student.id,
                    date: attendanceDate,
                    status: status,
                    markedById: defaultTeacherId
                }
            });
            attSuccessCount++;

        } catch (err) {
            console.error(`   ❌ Failed to import attendance row ${i} (${studentName}):`, err.message);
            attFailCount++;
        }
    }
    console.log(`   ✅ Attendance Summary: Imported ${attSuccessCount} records, Failed ${attFailCount}`);

    console.log("\n🎉 JSON import process completed successfully!");
}

run()
    .catch((err) => {
        console.error("💥 Critical error running importer script:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
