require('dotenv').config()
const prisma = require('../src/prisma')
const { createFollowUp } = require('../src/services/followup.service')
const { createAppointment, changeStatus: changeApptStatus } = require('../src/services/appointment.service')
const { verifyDocument } = require('../src/services/document.service')
const { createVisaCase, changeStatus: changeVisaStatus } = require('../src/services/visa.service')
const { generateCommission, markCommissionPaid } = require('../src/services/commission.service')

const TEST_EMAIL = 'dreamskyadmission@gmail.com'

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: TEST_EMAIL } })
  if (!admin) throw new Error('admin not found')

  const student = await prisma.student.create({
    data: { firstName: 'EmailFlow', lastName: 'Tester', email: `flowtest_${Date.now()}@dreamsky.com` },
  })

  const counselor = await prisma.user.create({
    data: {
      firstName: 'Flow', lastName: 'Counselor', email: `counselor_${Date.now()}@dreamsky.com`,
      passwordHash: 'x', role: 'COUNSELOR',
    },
  })

  const country = await prisma.country.create({ data: { name: `FlowCountry_${Date.now()}`, code: `FC${Date.now().toString().slice(-6)}` } })
  const university = await prisma.university.create({ data: { name: `FlowUni_${Date.now()}`, countryId: country.id } })
  const course = await prisma.course.create({ data: { name: `FlowCourse_${Date.now()}`, universityId: university.id } })

  const application = await prisma.application.create({
    data: { studentId: student.id, universityId: university.id, courseId: course.id, status: 'ACCEPTED' },
  })

  const document = await prisma.document.create({
    data: { studentId: student.id, type: 'PASSPORT', fileUrl: `students/${student.id}/flowtest.enc` },
  })

  const rule = await prisma.commissionRule.create({
    data: { role: 'COUNSELOR', type: 'FIXED', triggerStage: 'ENROLLED', fixedAmount: 5000, effectiveFrom: new Date() },
  })

  const results = {}

  // 1. Follow-up (EMAIL channel)
  await createFollowUp({ studentId: student.id, channel: 'EMAIL', direction: 'OUTBOUND', content: 'Please send your updated transcript.' }, admin.id)

  // 2. Appointment create + status change
  const appt = await createAppointment({
    studentId: student.id, counselorId: counselor.id,
    datetime: new Date(Date.now() + 2 * 60 * 60 * 1000), type: 'INITIAL_CONSULTATION', meetingMode: 'OFFICE',
  })
  await changeApptStatus(appt.id, { status: 'NO_SHOW' })

  // 3. Document verify
  await verifyDocument(document.id, { status: 'VERIFIED' }, admin.id)

  // 4. Visa case create + status change
  const visaCase = await createVisaCase({ applicationId: application.id, visaType: 'STUDENT', embassy: 'Kathmandu' })
  await changeVisaStatus(visaCase.id, { status: 'PREPARING' })
  await changeVisaStatus(visaCase.id, { status: 'SUBMITTED' })

  // 5. Commission generate + mark paid
  const commission = await generateCommission(student.id, counselor.id, 'ENROLLED', null, university.id, 100000, 'NPR')
  if (commission) await markCommissionPaid(commission.id, admin.id)
  results.commissionGenerated = !!commission

  // Cleanup after emails flush
  setTimeout(async () => {
    await prisma.commission.deleteMany({ where: { studentId: student.id } })
    await prisma.commissionRule.deleteMany({ where: { id: rule.id } })
    await prisma.visaCase.deleteMany({ where: { applicationId: application.id } })
    await prisma.offer.deleteMany({ where: { applicationId: application.id } })
    await prisma.application.deleteMany({ where: { id: application.id } })
    await prisma.document.deleteMany({ where: { id: document.id } })
    await prisma.appointment.deleteMany({ where: { id: appt.id } })
    await prisma.communicationLog.deleteMany({ where: { studentId: student.id } })
    await prisma.course.deleteMany({ where: { id: course.id } })
    await prisma.university.deleteMany({ where: { id: university.id } })
    await prisma.country.deleteMany({ where: { id: country.id } })
    await prisma.user.deleteMany({ where: { id: counselor.id } })
    await prisma.student.deleteMany({ where: { id: student.id } })
    console.log('cleanup done')
    await prisma.$disconnect()
    process.exit(0)
  }, 12000)
}

main().catch((e) => { console.error(e); process.exit(1) })
