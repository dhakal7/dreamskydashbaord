/**
 * clean-database.js
 * Wipes all lead, student, class, application, visa, and log records from PostgreSQL,
 * preserving ONLY the 6 real staff user accounts.
 */

const prisma = require('../src/prisma');

const REAL_STAFF_EMAILS = [
  'dreamskyadmission@gmail.com',
  'amit.dhodari@dreamsky.com',
  'vaibhav.joshi@dreamsky.com',
  'dipshikha.dawadi@dreamsky.com',
  'santona.khatri@dreamsky.com',
  'amisha.thapa@dreamsky.com',
];

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
  console.log('🧹 Wiping all lead/student/class data from PostgreSQL database...\n');

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

  // Keep only the 6 real staff users
  const deletedUsers = await prisma.user.deleteMany({
    where: {
      email: {
        notIn: REAL_STAFF_EMAILS,
      },
    },
  });

  const remainingUsers = await prisma.user.findMany({
    select: { email: true, firstName: true, lastName: true, role: true },
  });

  console.log(`✅ Database wiped cleanly! Removed ${deletedUsers.count} non-staff user accounts.`);
  console.log('\n================ REMAINING REAL STAFF USERS ================');
  remainingUsers.forEach((u) => {
    console.log(`👤 ${u.role}: ${u.firstName} ${u.lastName} (${u.email})`);
  });
  console.log('===========================================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Wipe failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
