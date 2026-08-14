const prisma = require('../src/prisma');
(async () => {
  let country = await prisma.country.findFirst({ where: { code: 'AU' } });
  if (!country) country = await prisma.country.create({ data: { name: 'Australia', code: 'AU' } });
  let uni = await prisma.university.findFirst({ where: { name: 'University of Melbourne' } });
  if (!uni) uni = await prisma.university.create({ data: { name: 'University of Melbourne', countryId: country.id, website: 'https://unimelb.edu.au' } });
  let course = await prisma.course.findFirst({ where: { name: 'Master of IT', universityId: uni.id } });
  if (!course) course = await prisma.course.create({ data: { name: 'Master of IT', universityId: uni.id, level: 'MASTER', durationMonths: 24, tuitionFee: 48000 } });
  console.log(JSON.stringify({ countryId: country.id, universityId: uni.id, courseId: course.id }));
  process.exit(0);
})();
