require('dotenv').config();
const bcrypt = require('bcryptjs');
const { assertDisposableTarget } = require('../src/config');

// Pre-import guard: Execution blocked unless positively targeting disposable test DB
assertDisposableTarget(process.env.DATABASE_URL, process.env.ALLOW_DESTRUCTIVE_OPERATIONS);

const prisma = require('../src/prisma');

async function setTeacherPassword() {
  assertDisposableTarget(process.env.DATABASE_URL, process.env.ALLOW_DESTRUCTIVE_OPERATIONS);
  const newPassword = process.env.TEACHER_PASSWORD;
  if (!newPassword) {
    console.error("TEACHER_PASSWORD environment variable is required.");
    process.exit(1);
  }
  const hash = await bcrypt.hash(newPassword, 12);

  const teacher = await prisma.user.upsert({
    where: { email: 'teacher@dreamsky.internal' },
    update: {
      passwordHash: hash,
      status: 'ACTIVE',
      role: 'TEACHER',
      mustChangePassword: true,
    },
    create: {
      email: 'teacher@dreamsky.internal',
      passwordHash: hash,
      firstName: 'EPT',
      lastName: 'Instructor',
      role: 'TEACHER',
      status: 'ACTIVE',
      branchId: 'br-1',
      mustChangePassword: true,
    },
  });

  console.log('✅ Successfully updated teacher account credentials (mustChangePassword: true).');
  console.log('User Email:', teacher.email);
}

setTeacherPassword()
  .catch((err) => {
    console.error('Error updating teacher password:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
