/**
 * import-recent-excel-data.js
 * Clean importer for Recent Excel Datasets:
 *  1. Recent_Lead_Data.json (208 Leads -> /leads)
 *  2. Recent_Class_Students.json (49 Students -> /students & /classes)
 *
 * Preserves ONLY the 6 Real Staff User accounts.
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const prisma = require('../src/prisma');

const REAL_STAFF_EMAILS = [
  'dreamskyadmission@gmail.com',
  'amit.dhodari@dreamsky.com',
  'vaibhav.joshi@dreamsky.com',
  'dipshikha.dawadi@dreamsky.com',
  'santona.khatri@dreamsky.com',
  'amisha.thapa@dreamsky.com',
];

function parseName(fullName, fallbackId) {
  if (!fullName || typeof fullName !== 'string' || fullName.trim().length === 0) {
    return { firstName: 'Lead', lastName: fallbackId ? `#${fallbackId}` : 'Inquiry' };
  }
  const clean = fullName.trim().replace(/\(.*\)/, '').trim();
  const parts = clean.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0] || 'Unknown', lastName: 'Student' };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function parsePhone(phoneVal) {
  if (!phoneVal) return null;
  const str = String(phoneVal).replace(/\D/g, '');
  return str.length >= 7 ? str : null;
}

function mapStatusToStage(statusStr) {
  if (!statusStr) return 'LEAD';
  const s = String(statusStr).toUpperCase();
  if (s.includes('HOT')) return 'PROSPECT';
  if (s.includes('WARM')) return 'PROSPECT';
  if (s.includes('COLD')) return 'LEAD';
  return 'LEAD';
}

async function safeDelete(modelName) {
  try {
    if (prisma[modelName] && typeof prisma[modelName].deleteMany === 'function') {
      await prisma[modelName].deleteMany({});
    }
  } catch (e) {
    // Ignore optional relation delete errors
  }
}

async function main() {
  console.log('🚀 Starting Clean Excel Data Import into PostgreSQL...\n');

  const defaultPassword = await bcrypt.hash('Password123!', 10);
  const portalPassword = await bcrypt.hash('DreamSky@2026', 10);

  // 0. Ensure Main Branch exists
  let branch = await prisma.branch.findFirst({});
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        name: 'DreamSky Head Office',
        address: 'Kathmandu, Nepal',
        phone: '01-4000000',
        email: 'info@dreamsky.com.np',
      },
    });
  }

  // 1. Clean Database (Delete old data, preserve 6 real staff users)
  console.log('🧹 Purging old leads/students, preserving 6 real staff users...');
  await safeDelete('communicationLog');
  await safeDelete('attendanceRecord');
  await safeDelete('enrollment');
  await safeDelete('classContent');
  await safeDelete('classNotice');
  await safeDelete('classStudentNote');
  await safeDelete('classMaterial');
  await safeDelete('class');
  await safeDelete('visaDocument');
  await safeDelete('visaMilestone');
  await safeDelete('visaCase');
  await safeDelete('offerLetter');
  await safeDelete('application');
  await safeDelete('document');
  await safeDelete('pipelineStageHistory');
  await safeDelete('appointment');
  await safeDelete('notification');
  await safeDelete('auditLog');
  await safeDelete('student');

  await prisma.user.deleteMany({
    where: {
      email: {
        notIn: REAL_STAFF_EMAILS,
      },
    },
  });

  // Get Counselor User map
  const counselors = await prisma.user.findMany({
    where: { role: 'COUNSELOR' },
    select: { id: true, firstName: true, lastName: true },
  });

  const counselorMap = new Map();
  counselors.forEach((c) => {
    const fullName = `${c.firstName} ${c.lastName}`.toLowerCase().trim();
    counselorMap.set(fullName, c.id);
    counselorMap.set(c.firstName.toLowerCase().trim(), c.id);
  });

  // Default Teacher user for classes
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

  // 2. Import 208 Leads from Recent_Lead_Data.json
  console.log('\n📋 Importing 208 Real Leads from Recent_Lead_Data.json...');
  const leadsPath = path.join(__dirname, '..', 'Recent_Lead_Data.json');
  let leadsImported = 0;

  if (fs.existsSync(leadsPath)) {
    const leadData = JSON.parse(fs.readFileSync(leadsPath, 'utf8'));
    const usedEmails = new Set();

    for (const item of leadData) {
      const rawName = item['Student Name'];
      const phone = parsePhone(item['Contact Number']);
      const remarks = item['Follow up remarks'] || item['Next Follow up remarks'];

      if (!rawName && !phone && !remarks) continue; // Skip completely blank row

      const { firstName, lastName } = parseName(rawName, item.ID || leadsImported + 1);
      let email = item['Email Address'];

      if (!email || email === '*' || !email.includes('@')) {
        const phoneSlug = phone || Math.floor(100000 + Math.random() * 900000);
        email = `student_${phoneSlug}_${leadsImported + 1}@dreamsky.com`;
      } else {
        email = email.trim().toLowerCase();
        if (usedEmails.has(email)) {
          email = email.replace('@', `_${leadsImported + 1}@`);
        }
      }
      usedEmails.add(email);

      const counselorName = item['Counselor Assigned'] ? String(item['Counselor Assigned']).trim().toLowerCase() : '';
      const counselorId = counselorMap.get(counselorName) || null;
      const stage = mapStatusToStage(item.Status);

      const academicBg = {
        qualification: item['Latest Academic Qualification'] || null,
        details: item['Academic Details'] || null,
        address: item['Current Address'] || null,
        countriesInterested: item['Countries Interested'] || item['Main Country'] || null,
        officeVisit: item['Office visit'] || null,
        agents: item['Agents '] || null,
      };

      const leadCreatedAt = item['Lead Date'] ? new Date(item['Lead Date']) : new Date();

      try {
        const student = await prisma.student.create({
          data: {
            email,
            firstName,
            lastName,
            phone,
            currentStage: stage,
            source: item['Leads Source'] || 'Walk In',
            assignedCounselorId: counselorId,
            academicBackground: academicBg,
            notes: item['Follow up remarks'] || item['Next Follow up remarks'] || undefined,
            createdAt: leadCreatedAt,
          },
        });

        // Add follow-up log if present
        const remarks = item['Follow up remarks'] || item['Next Follow up remarks'];
        if (remarks && String(remarks).trim().length > 2) {
          await prisma.communicationLog.create({
            data: {
              studentId: student.id,
              authorId: counselorId,
              channel: 'PHONE',
              direction: 'OUTBOUND',
              content: String(remarks).trim(),
              createdAt: leadCreatedAt,
            },
          });
        }

        leadsImported++;
      } catch (err) {
        // Skip duplicate emails if any
      }
    }
  }
  console.log(`✅ Imported ${leadsImported} Leads into Leads section.`);

  // 3. Import 49 Enrolled Students & Create PTE / IELTS Classes from Recent_Class_Students.json
  console.log('\n📚 Importing 49 Class Students & Building PTE / IELTS Classes...');
  const classStudentsPath = path.join(__dirname, '..', 'Recent_Class_Students.json');
  const classMap = new Map(); // "PTE_08:00-09:00 AM" -> classId
  let classStudentsImported = 0;

  if (fs.existsSync(classStudentsPath)) {
    const classStudentsData = JSON.parse(fs.readFileSync(classStudentsPath, 'utf8'));

    for (const row of classStudentsData) {
      const rawName = row['Student Name'];
      if (!rawName) continue;

      const subject = row.subject || 'PTE';
      const timing = row['Class Timing'] || 'General Batch';
      const key = `${subject}_${timing}`;

      // Create Class Batch if it doesn't exist yet
      let classObj = classMap.get(key);
      if (!classObj) {
        classObj = await prisma.class.create({
          data: {
            name: `${subject} Class (${timing})`,
            subject: subject,
            schedule: { timing },
            teacherId: teacherUser.id,
            branchId: branch.id,
          },
        });
        classMap.set(key, classObj);
      }

      const { firstName, lastName } = parseName(rawName);
      const phone = parsePhone(row['Contact no.']);
      let email = row['Email Address'];

      if (!email || email === '*' || !email.includes('@')) {
        const phoneSlug = phone || Math.floor(100000 + Math.random() * 900000);
        email = `student_${phoneSlug}@dreamsky.com`;
      }

      const joiningDate = row['Date of Joining'] ? new Date(row['Date of Joining']) : new Date();

      try {
        const student = await prisma.student.upsert({
          where: { email },
          update: { currentStage: 'ENROLLED' },
          create: {
            email,
            firstName,
            lastName,
            phone,
            currentStage: 'ENROLLED',
            source: row['Lead Source'] || 'Class Enrollment',
            createdAt: joiningDate,
          },
        });

        // Create class enrollment
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
            enrolledAt: joiningDate,
          },
        });

        classStudentsImported++;
      } catch (err) {
        // Skip duplicate enrollments
      }
    }
  }
  console.log(`✅ Imported ${classStudentsImported} Enrolled Class Students & created ${classMap.size} Classes.`);

  // 4. Final Summary Report
  const totalStaff = await prisma.user.count({ where: { role: { not: 'TEACHER' } } });
  const totalLeads = await prisma.student.count({ where: { currentStage: { in: ['LEAD', 'PROSPECT'] } } });
  const totalEnrolled = await prisma.student.count({ where: { currentStage: 'ENROLLED' } });
  const totalClasses = await prisma.class.count();
  const totalEnrollments = await prisma.enrollment.count();

  console.log('\n================ FINAL CLEAN IMPORT SUMMARY ================');
  console.log(`👥 Real Staff Users (Preserved):       ${totalStaff}`);
  console.log(`📋 Total Leads (Leads Section):         ${totalLeads}`);
  console.log(`🎓 Total Enrolled Students (Students): ${totalEnrolled}`);
  console.log(`🏫 Total EPT Classes Created:           ${totalClasses}`);
  console.log(`📝 Total Class Enrollments:            ${totalEnrollments}`);
  console.log('===========================================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Data import failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
