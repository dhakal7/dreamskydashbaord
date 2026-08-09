import type {
  Application, ApplicationStage, Appointment, AppointmentStatus, FollowUp, FollowUpStatus,
  Lead, LeadSource, LeadStage, PartnerConsultancy, Priority, Student, StudentDocument, StudyLevel, VisaCase, VisaStatus, VisaStep,
} from '@/types'

export const partnerConsultancies: PartnerConsultancy[] = [
  { id: 'partner-1', name: 'Global Horizon Education' },
  { id: 'partner-2', name: 'Apex Pathway International' },
  { id: 'partner-3', name: 'Zenith Academic Consultancy' },
]

import { counselors, countries, courses, universities } from './reference'
import {
  daysAgo, daysFromNow, pad, pick, pickMany, randFloat, randInt, randomDateWithinDays,
  randomEmail, randomFullName, randomPassport, randomPhone,
} from './generators'
import importedData from './imported-data.json'

const levels: StudyLevel[] = ['bachelor', 'master', 'diploma', 'foundation']
const sources: LeadSource[] = ['website', 'facebook', 'referral_agent', 'walk_in', 'education_fair', 'google_ads', 'instagram']
const priorities: Priority[] = ['low', 'medium', 'high', 'urgent']
const leadStages: LeadStage[] = ['new', 'contacted', 'counseling', 'interested']

function randomCounselor() {
  return pick(counselors)
}

// ── Students (with fallback) ────────────────────────────────────────────
export const students: Student[] = importedData.students && importedData.students.length > 0
  ? (importedData.students as Student[])
  : Array.from({ length: 50 }).map((_, i) => {
      const { name, gender } = randomFullName()
      const counselor = randomCounselor()
      const level = pick(levels)
      const docsRequired = randInt(6, 9)
      return {
        id: `stu-${pad(i + 1, 3)}`,
        studentId: `EPC-2026-${pad(i + 1, 4)}`,
        name,
        photoColor: pick(['#2563EB', '#7C3AED', '#0EA5E9', '#16A34A', '#D97706', '#DB2777']),
        email: randomEmail(name),
        phone: randomPhone(),
        dob: `${randInt(1998, 2007)}-${pad(randInt(1, 12), 2)}-${pad(randInt(1, 28), 2)}`,
        gender,
        nationality: 'Nepali',
        passportNumber: randomPassport(),
        address: `${pick(['Baneshwor', 'Kalanki', 'Lakeside', 'New Road', 'Chabahil', 'Butwal', 'Pokhara-8', 'Itahari'])}, Nepal`,
        status: pick(['active', 'active', 'active', 'enrolled', 'inactive']),
        counselorId: counselor.id,
        counselorName: counselor.name,
        preferredCountries: pickMany(countries.map((c) => c.name), randInt(1, 3)),
        preferredLevel: level,
        budgetUsd: randInt(8000, 40000),
        englishTest: {
          type: pick(['IELTS', 'PTE', 'TOEFL', 'Duolingo', 'None']),
          overallScore: randFloat(5.5, 8.5, 1),
          listening: randFloat(5, 9, 1),
          reading: randFloat(5, 9, 1),
          writing: randFloat(5, 9, 1),
          speaking: randFloat(5, 9, 1),
          testDate: daysAgo(randInt(10, 300)),
        },
        academics: [
          {
            level: '+2 / High School',
            institution: pick(['Trinity International College', 'St. Xaviers College', 'Kathmandu Model College', 'Global College']),
            board: 'NEB',
            gpaOrPercentage: `${randFloat(2.6, 3.9, 2)} GPA`,
            passedYear: `${randInt(2020, 2025)}`,
          },
        ],
        parents: [
          { id: `p-${i}-1`, name: `${pick(['Ram', 'Hari', 'Shyam', 'Krishna', 'Gopal'])} ${name.split(' ')[1]}`, relation: 'father', phone: randomPhone(), occupation: pick(['Business', 'Teacher', 'Foreign Employment', 'Government Service', 'Farmer']) },
        ],
        documentsUploaded: randInt(0, docsRequired),
        documentsRequired: docsRequired,
        createdAt: daysAgo(randInt(5, 400)),
        tags: pickMany(['Scholarship Track', 'Fast Track', 'Loan Required', 'IELTS Pending', 'VIP Referral'], randInt(0, 2)),
      }
    })

// ── Leads (with fallback) ───────────────────────────────────────────────
export const leads: Lead[] = importedData.leads && importedData.leads.length > 0
  ? (importedData.leads as Lead[])
  : Array.from({ length: 200 }).map((_, i) => {
      const { name } = randomFullName()
      const counselor = randomCounselor()
      const stage = pick(leadStages)
      return {
        id: `lead-${pad(i + 1, 4)}`,
        name,
        email: randomEmail(name),
        phone: randomPhone(),
        photoColor: pick(['#2563EB', '#7C3AED', '#0EA5E9', '#16A34A', '#D97706', '#DB2777']),
        source: pick(sources),
        stage,
        counselorId: counselor.id,
        counselorName: counselor.name,
        interestedCountry: pick(countries).name,
        interestedLevel: pick(levels),
        budgetUsd: randInt(6000, 35000),
        priority: pick(priorities),
        lastContact: daysAgo(randInt(0, 30)),
        nextFollowUp: randomDateWithinDays(14),
        createdAt: daysAgo(randInt(0, 180)),
        value: randInt(500, 4000),
        notes: pick([
          'Interested in scholarship options, needs IELTS guidance.',
          'Waiting on financial documents from parents.',
          'Very responsive, ready to proceed with application.',
          'Comparing offers from two consultancies.',
          'Requested call back next week.',
          'Needs SOP review before submission.',
        ]),
      }
    })

// ── Follow-ups (with fallback) ──────────────────────────────────────────
const followUpStatuses: FollowUpStatus[] = ['pending', 'completed', 'missed', 'rescheduled']
export const followUps: FollowUp[] = importedData.followUps && importedData.followUps.length > 0
  ? (importedData.followUps as FollowUp[])
  : Array.from({ length: 100 }).map((_, i) => {
      const student = pick(students)
      const counselor = randomCounselor()
      const dt = randomDateWithinDays(10)
      return {
        id: `fu-${pad(i + 1, 3)}`,
        studentId: student.id,
        studentName: student.name,
        counselorId: counselor.id,
        counselorName: counselor.name,
        reminder: pick([
          'Call to confirm IELTS booking',
          'Follow up on financial documents',
          'Discuss university shortlist',
          'Remind about visa interview prep',
          'Check offer letter acceptance',
          'Send SOP draft for review',
          'Confirm appointment for document submission',
        ]),
        priority: pick(priorities),
        status: pick(followUpStatuses),
        date: dt.slice(0, 10),
        time: `${pad(randInt(9, 17), 2)}:${pick(['00', '15', '30', '45'])}`,
        channel: pick(['call', 'email', 'whatsapp', 'in_person', 'sms']),
      }
    })

// ── Appointments (with fallback) ────────────────────────────────────────
const apptStatuses: AppointmentStatus[] = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']
const apptTypes: Appointment['type'][] = ['counseling', 'document_review', 'visa_prep', 'follow_up', 'orientation']
export const appointments: Appointment[] = importedData.appointments && importedData.appointments.length > 0
  ? (importedData.appointments as Appointment[])
  : Array.from({ length: 30 }).map((_, i) => {
      const student = pick(students)
      const counselor = randomCounselor()
      const startOffset = randInt(-5, 14)
      const base = startOffset >= 0 ? new Date(daysFromNow(startOffset)) : new Date(daysAgo(-startOffset))
      base.setHours(randInt(9, 16), pick([0, 15, 30, 45]), 0, 0)
      const end = new Date(base.getTime() + randInt(1, 2) * 30 * 60000)
      const type = pick(apptTypes)
      return {
        id: `appt-${pad(i + 1, 3)}`,
        title: `${type.replace('_', ' ')} — ${student.name}`,
        studentId: student.id,
        studentName: student.name,
        counselorId: counselor.id,
        counselorName: counselor.name,
        start: base.toISOString(),
        end: end.toISOString(),
        status: pick(apptStatuses),
        type,
        location: pick(['branch_office', 'video_call', 'phone_call']),
      }
    })

// ── Applications (with fallback) ────────────────────────────────────────
const appStages: ApplicationStage[] = ['submitted', 'university_review', 'conditional_offer', 'unconditional_offer', 'accepted', 'rejected']
export const applications: Application[] = importedData.applications && importedData.applications.length > 0
  ? (importedData.applications as Application[])
  : Array.from({ length: 50 }).map((_, i) => {
      const student = pick(students)
      const uni = pick(universities)
      const course = courses.find((c) => c.universityId === uni.id) ?? pick(courses)
      return {
        id: `app-${pad(i + 1, 3)}`,
        applicationRef: `EPC-APP-${pad(i + 1, 5)}`,
        studentId: student.id,
        studentName: student.name,
        universityId: uni.id,
        universityName: uni.name,
        countryName: uni.countryName,
        courseName: course.name,
        counselorName: student.counselorName,
        stage: pick(appStages),
        submittedDate: daysAgo(randInt(5, 200)),
        intake: pick(uni.intakes),
        tuitionUsd: uni.tuitionFromUsd,
        lastUpdate: daysAgo(randInt(0, 20)),
      }
    })

// ── Visa Cases (with fallback) ──────────────────────────────────────────
const visaSteps: VisaStep[] = ['medical', 'biometric', 'financial', 'interview', 'embassy_submission', 'decision']
export const visaCases: VisaCase[] = importedData.visaCases && importedData.visaCases.length > 0
  ? (importedData.visaCases as VisaCase[])
  : Array.from({ length: 20 }).map((_, i) => {
      const student = pick(students)
      const app = pick(applications)
      const completedCount = randInt(1, 6)
      const checklist = visaSteps.map((step, idx) => ({
        step,
        status: (idx < completedCount ? 'approved' : idx === completedCount ? 'in_progress' : 'not_started') as VisaStatus,
        completedDate: idx < completedCount ? daysAgo(randInt(1, 60)) : undefined,
      }))
      const progress = Math.round((completedCount / visaSteps.length) * 100)
      return {
        id: `visa-${pad(i + 1, 3)}`,
        studentId: student.id,
        studentName: student.name,
        countryName: app.countryName,
        universityName: app.universityName,
        checklist,
        overallStatus: progress === 100 ? 'approved' : progress === 0 ? 'not_started' : 'in_progress',
        progress,
        submissionDate: progress > 50 ? daysAgo(randInt(5, 40)) : undefined,
        decisionDate: progress === 100 ? daysAgo(randInt(1, 15)) : undefined,
        visaOfficer: progress > 70 ? pick(['S. Williams', 'M. Chen', 'R. Patel', 'A. Thompson']) : undefined,
      }
    })

// ── Documents (with fallback) ───────────────────────────────────────────
const docTypes: StudentDocument['type'][] = ['passport', 'citizenship', 'academic', 'cv', 'sop', 'recommendation', 'financial', 'offer_letter', 'visa_letter']
export const studentDocuments: StudentDocument[] = importedData.studentDocuments && importedData.studentDocuments.length > 0
  ? (importedData.studentDocuments as StudentDocument[])
  : Array.from({ length: 140 }).map((_, i) => {
      const student = pick(students)
      const type = pick(docTypes)
      return {
        id: `doc-${pad(i + 1, 3)}`,
        studentId: student.id,
        studentName: student.name,
        type,
        fileName: `${type}_${student.studentId}.pdf`,
        fileSizeKb: randInt(120, 4800),
        version: randInt(1, 3),
        uploadedAt: daysAgo(randInt(0, 120)),
        uploadedBy: student.counselorName,
        status: pick(['pending_review', 'verified', 'verified', 'rejected']),
      }
    })
