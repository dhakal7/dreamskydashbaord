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

async function main() {
  console.log('🧹 Wiping all lead/student/class data from PostgreSQL database...\n');

  await prisma.communicationLog.deleteMany({});
  await prisma.attendanceRecord.deleteMany({});
  await prisma.enrollment.deleteMany({});
  await prisma.classContent.deleteMany({});
  await prisma.classNotice.deleteMany({});
  await prisma.classStudentNote.deleteMany({});
  await prisma.classMaterial.deleteMany({});
  await prisma.class.deleteMany({});
  await prisma.visaDocument.deleteMany({});
  await prisma.visaMilestone.deleteMany({});
  await prisma.visaCase.deleteMany({});
  await prisma.offerLetter.deleteMany({});
  await prisma.application.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.pipelineStageHistory.deleteMany({});
  await prisma.appointment.deleteMany({});
  await prisma.student.deleteMany({});

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
