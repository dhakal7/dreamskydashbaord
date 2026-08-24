require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/prisma');

async function setTeacherPassword() {
  const newPassword = 'dreamskyteacher@2025';
  const hash = await bcrypt.hash(newPassword, 12);

  const teacher = await prisma.user.upsert({
    where: { email: 'teacher@dreamsky.internal' },
    update: {
      passwordHash: hash,
      status: 'ACTIVE',
      role: 'TEACHER',
      mustChangePassword: false,
    },
    create: {
      email: 'teacher@dreamsky.internal',
      passwordHash: hash,
      firstName: 'EPT',
      lastName: 'Instructor',
      role: 'TEACHER',
      status: 'ACTIVE',
      branchId: 'br-1',
      mustChangePassword: false,
    },
  });

  console.log('✅ Successfully updated teacher account password!');
  console.log('User Email:', teacher.email);
  console.log('New Password:', newPassword);
}

setTeacherPassword()
  .catch((err) => {
    console.error('Error updating teacher password:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
