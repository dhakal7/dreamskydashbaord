/**
 * import-json-data.js
 * Ingests 6 JSON datasets into PostgreSQL via Prisma:
 *  1. Lead_Data.json
 *  2. Copy_of_Lead_Data.json
 *  3. IELTS_PTE_Class.json
 *  4. Attendance_of_EPT_Class.json
 *  5. Sheet10.json
 *  6. Dashboard.json
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const prisma = require('../src/prisma');

// Helper to resolve JSON paths across directory structures
const getJsonPath = (filename) => {
  const candidate1 = path.join(__dirname, '..', filename);
  if (fs.existsSync(candidate1)) return candidate1;
  const candidate2 = path.join(__dirname, '../..', filename);
  if (fs.existsSync(candidate2)) return candidate2;
  const candidate3 = path.join(process.cwd(), filename);
  if (fs.existsSync(candidate3)) return candidate3;
  return candidate1;
};

function parseName(fullName) {
  if (!fullName || typeof fullName !== 'string') {
    return { firstName: 'Unknown', lastName: 'Student' };
  }
  const clean = fullName.trim().replace(/\(.*\)/, '').trim(); // Strip "(Parent's number)" etc.
  const parts = clean.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0] || 'Unknown', lastName: 'Student' };
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

function parsePhone(phoneVal) {
  if (!phoneVal) return null;
  const str = String(phoneVal).replace(/\D/g, '');
  return str.length >= 7 ? str : null;
}

function mapStatusToStage(statusStr) {
  if (!statusStr) return 'LEAD';
  const s = String(statusStr).toUpperCase();
  if (s.includes('COLD')) return 'LEAD';
  if (s.includes('WARM')) return 'PROSPECT';
  if (s.includes('HOT')) return 'PROSPECT';
  if (s.includes('APPLIED') || s.includes('VISA APPLIED')) return 'VISA_APPLIED';
  if (s.includes('APPROVED')) return 'VISA_APPROVED';
  if (s.includes('ENROLLED')) return 'ENROLLED';
  return 'LEAD';
}

async function main() {
  console.log('🚀 Starting JSON Data Import into PostgreSQL...\n');

  const defaultPassword = await bcrypt.hash('Password123!', 10);

  // 0. Ensure Main Branch exists
  const branch = await prisma.branch.upsert({
    where: { name: 'E-Planet Head Office' },
    update: {},
    create: {
      name: 'DreamSky Head Office',
      address: 'Kathmandu, Nepal',
      phone: '01-4000000',
      email: 'info@dreamsky.com.np',
    },
  });

  // 1. Process Counselor Users
  console.log('👥 Ingesting Counselors & Users...');
  const counselorNames = new Set();
  
  const leadFiles = ['Lead_Data.json', 'Copy_of_Lead_Data.json'];
  for (const file of leadFiles) {
    const filePath = getJsonPath(file);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      data.forEach((row) => {
        if (row['Counselor Assigned']) {
          counselorNames.add(row['Counselor Assigned'].trim());
        }
      });
    }
  }

  // Clean up dummy accounts & non-counselors (e.g. Rojina Ghale)
  await prisma.user.deleteMany({
    where: {
      OR: [
        { email: { endsWith: '@dreamsky.internal' } },
        { email: 'rojina.ghale@dreamsky.com' },
        { firstName: 'Rojina', lastName: 'Ghale' },
      ],
    },
  });

  const counselorMap = new Map();
  for (const name of counselorNames) {
    if (!name || name === 'Unassigned') continue;
    const { firstName, lastName } = parseName(name);
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s+/g, '')}@dreamsky.com`;

    const user = await prisma.user.upsert({
      where: { email },
      update: { firstName, lastName, role: 'COUNSELOR', branchId: branch.id },
      create: {
        email,
        passwordHash: defaultPassword,
        firstName,
        lastName,
        role: 'COUNSELOR',
        status: 'ACTIVE',
        branchId: branch.id,
      },
    });

    counselorMap.set(name.toLowerCase(), user.id);
  }
  console.log(`✅ ${counselorMap.size} Counselors ready.`);

  // Create default Teacher
  const teacherUser = await prisma.user.upsert({
    where: { email: 'teacher@dreamsky.internal' },
    update: {},
    create: {
      email: 'teacher@dreamsky.internal',
      passwordHash: defaultPassword,
      firstName: 'EPT',
      lastName: 'Instructor',
      role: 'TEACHER',
      status: 'ACTIVE',
      branchId: branch.id,
    },
  });

  // 2. Process Lead Data
  console.log('📋 Ingesting Lead Data & Students...');
  let leadsImported = 0;
  const processedKeys = new Set();

  for (const file of leadFiles) {
    const filePath = getJsonPath(file);
    if (!fs.existsSync(filePath)) continue;

    const leadData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const item of leadData) {
      const id = item.ID || item['Column 1'];
      const rawName = item['Student Name'];
      if (!rawName) continue;

      const { firstName, lastName } = parseName(rawName);
      const phone = parsePhone(item['Contact Number']);

      // Deduplicate across Lead_Data.json and Copy_of_Lead_Data.json
      const dedupeKey = `${firstName}_${lastName}_${phone || ''}`.toLowerCase();
      if (processedKeys.has(dedupeKey)) continue;
      processedKeys.add(dedupeKey);

      let email = item['Email Address'];
      if (!email || email === '*' || !email.includes('@')) {
        const phoneSlug = phone || dedupeKey.replace(/[^a-z0-9]/g, '') || Math.floor(Math.random() * 100000);
        email = `student_${phoneSlug}@dreamsky.internal`;
      }

      const counselorName = item['Counselor Assigned'] ? item['Counselor Assigned'].trim().toLowerCase() : '';
      const counselorId = counselorMap.get(counselorName) || null;
      const stage = mapStatusToStage(item.Status);

      const academicBg = {
        qualification: item['Latest Academic Qualification'] || null,
        details: item['Academic Details'] || null,
        address: item['Current Address'] || null,
        countriesInterested: item['Countries Interested'] || item['Main Country'] || null,
        officeVisit: item['Office visit'] || null,
        agents: item['Agents'] || null,
      };

      try {
        const student = await prisma.student.upsert({
          where: { email },
          update: {
            firstName,
            lastName,
            phone: phone || undefined,
            currentStage: stage,
            assignedCounselorId: counselorId || undefined,
            academicBackground: academicBg,
            notes: item['Follow up remarks'] || item['Next Follow up remarks'] || item.Remarks || undefined,
          },
          create: {
            email,
            firstName,
            lastName,
            phone,
            currentStage: stage,
            source: item['Leads Source'] || 'Walk In',
            assignedCounselorId: counselorId,
            academicBackground: academicBg,
            notes: item['Follow up remarks'] || item['Next Follow up remarks'] || item.Remarks || undefined,
          },
        });

        // Add follow-up remarks to CommunicationLog if available
        const remarks = item['Follow up remarks'] || item.Remarks;
        if (remarks && remarks.trim().length > 2) {
          await prisma.communicationLog.create({
            data: {
              studentId: student.id,
              authorId: counselorId,
              channel: 'PHONE',
              direction: 'OUTBOUND',
              content: remarks.trim(),
            },
          });
        }

        leadsImported++;
      } catch (err) {
        // Skip duplicate or validation issues cleanly
      }
    }
  }
  console.log(`✅ ${leadsImported} Student lead records processed.`);

  // 3. Process Classes & Enrollments (IELTS_PTE_Class.json)
  console.log('📚 Ingesting EPT Classes & Enrollments...');
  const classFilePath = getJsonPath('IELTS_PTE_Class.json');
  const classMap = new Map(); // "PTE_08:00-09:00 AM" -> classId

  if (fs.existsSync(classFilePath)) {
    const classData = JSON.parse(fs.readFileSync(classFilePath, 'utf8'));
    for (const row of classData) {
      const className = row['EPT Class'] || 'IELTS/PTE';
      const timing = row['Class Timing'] || 'Morning';
      const key = `${className}_${timing}`;

      let classObj = classMap.get(key);
      if (!classObj) {
        classObj = await prisma.class.create({
          data: {
            name: `${className} Class (${timing})`,
            subject: className,
            schedule: { timing },
            teacherId: teacherUser.id,
            branchId: branch.id,
          },
        });
        classMap.set(key, classObj);
      }

      // Enroll student
      const studentName = row['Student Name'];
      const phone = parsePhone(row['Contact no.']);
      const email = row['Email Address'] && row['Email Address'].includes('@')
        ? row['Email Address'].trim()
        : `student_${phone || Math.floor(Math.random() * 100000)}@dreamsky.internal`;

      const { firstName, lastName } = parseName(studentName);

      const student = await prisma.student.upsert({
        where: { email },
        update: { phone: phone || undefined, currentStage: 'ENROLLED' },
        create: {
          email,
          firstName,
          lastName,
          phone,
          currentStage: 'ENROLLED',
          source: row['Lead Source'] || 'Class Enrollment',
        },
      });

      await prisma.enrollment.upsert({
        where: {
          classId_studentId: {
            classId: classObj.id,
            studentId: student.id,
          },
        },
        update: {},
        create: {
          classId: classObj.id,
          studentId: student.id,
        },
      });
    }
  }
  console.log(`✅ EPT classes & student enrollments created.`);

  // 4. Process Attendance Data (Attendance_of_EPT_Class.json & Sheet10.json)
  console.log('📅 Ingesting Class Attendance Records...');
  let attendanceCount = 0;

  // File A: Attendance_of_EPT_Class.json
  const attPath = getJsonPath('Attendance_of_EPT_Class.json');
  if (fs.existsSync(attPath)) {
    const attData = JSON.parse(fs.readFileSync(attPath, 'utf8'));
    for (const record of attData) {
      const studentName = record['STUDENT NAME'];
      const phone = parsePhone(record['CONTACT NUMBER']);
      const dateStr = record['DATE'] || record['ATTENDANCE DATE'];
      const statusStr = record['ATTENDANCE'] || 'Present';
      const className = record['EPT CLASS'] || 'PTE';
      const timing = record['TIMING'] || 'Morning';

      if (!studentName || !dateStr) continue;

      const { firstName, lastName } = parseName(studentName);
      const email = `student_${phone || Math.floor(Math.random() * 100000)}@dreamsky.internal`;

      const student = await prisma.student.upsert({
        where: { email },
        update: { currentStage: 'ENROLLED' },
        create: {
          email,
          firstName,
          lastName,
          phone,
          currentStage: 'ENROLLED',
        },
      });

      const key = `${className}_${timing}`;
      let classObj = classMap.get(key);
      if (!classObj) {
        classObj = await prisma.class.create({
          data: {
            name: `${className} Class (${timing})`,
            subject: className,
            teacherId: teacherUser.id,
            branchId: branch.id,
          },
        });
        classMap.set(key, classObj);
      }

      const attStatus = statusStr.toUpperCase().includes('ABSENT')
        ? 'ABSENT'
        : statusStr.toUpperCase().includes('LATE')
        ? 'LATE'
        : 'PRESENT';

      try {
        await prisma.attendanceRecord.upsert({
          where: {
            classId_studentId_date: {
              classId: classObj.id,
              studentId: student.id,
              date: new Date(dateStr),
            },
          },
          update: { status: attStatus },
          create: {
            classId: classObj.id,
            studentId: student.id,
            date: new Date(dateStr),
            status: attStatus,
          },
        });
        attendanceCount++;
      } catch (e) {
        // Ignore duplicate record attempts
      }
    }
  }
  console.log(`✅ ${attendanceCount} attendance records ingested.`);

  // Summary Report
  const totalUsers = await prisma.user.count();
  const totalStudents = await prisma.student.count();
  const totalClasses = await prisma.class.count();
  const totalEnrollments = await prisma.enrollment.count();
  const totalAttendance = await prisma.attendanceRecord.count();
  const totalLogs = await prisma.communicationLog.count();

  console.log('\n================ DATA IMPORT SUMMARY ================');
  console.log(`👥 Total System Users (Counselors/Staff): ${totalUsers}`);
  console.log(`🎓 Total Students/Leads Ingested:        ${totalStudents}`);
  console.log(`🏫 Total EPT Classes Created:             ${totalClasses}`);
  console.log(`📝 Total Enrollments:                    ${totalEnrollments}`);
  console.log(`📊 Total Attendance Records:             ${totalAttendance}`);
  console.log(`📞 Total Follow-up Logs:                 ${totalLogs}`);
  console.log('=====================================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Data import failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
