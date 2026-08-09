import dayjs from 'dayjs'
import type { Student, StudentLifecycleEvent, StudentLifecycleStage } from '@/types'
import { applications, studentDocuments, visaCases } from '@/mock'

export const studentLifecycleStageOrder: StudentLifecycleStage[] = [
  'lead_created',
  'inquiry',
  'counseling',
  'document_collection',
  'application_submission',
  'offer_letter',
  'payment',
  'visa_processing',
  'interview',
  'visa_approved',
  'pre_departure',
  'travel_completed',
]

export const studentLifecycleStageMeta: Record<StudentLifecycleStage, { label: string; description: string; variant: 'slate' | 'info' | 'warning' | 'success' }> = {
  lead_created: { label: 'Lead Created', description: 'The inquiry enters the CRM and is assigned to a counselor.', variant: 'slate' },
  inquiry: { label: 'Inquiry', description: 'The lead confirms study goals and destination preferences.', variant: 'info' },
  counseling: { label: 'Counseling', description: 'A counseling session aligns the student with the right plan.', variant: 'info' },
  document_collection: { label: 'Document Collection', description: 'Key academic and identity documents are gathered.', variant: 'warning' },
  application_submission: { label: 'Application Submission', description: 'University applications are submitted and tracked.', variant: 'warning' },
  offer_letter: { label: 'Offer Letter', description: 'The university issues an offer and next steps are reviewed.', variant: 'warning' },
  payment: { label: 'Payment', description: 'The student completes the required financial milestone.', variant: 'warning' },
  visa_processing: { label: 'Visa Processing', description: 'Visa documents are prepared and submitted for review.', variant: 'warning' },
  interview: { label: 'Interview', description: 'The student prepares for and attends the visa interview.', variant: 'warning' },
  visa_approved: { label: 'Visa Approved', description: 'The embassy issues the visa and travel planning begins.', variant: 'success' },
  pre_departure: { label: 'Pre Departure', description: 'The student completes travel preparation and final readiness steps.', variant: 'success' },
  travel_completed: { label: 'Travel Completed', description: 'The student has reached their destination and the journey closes.', variant: 'success' },
}

export function getStudentLifecycleState(student: Student) {
  const studentApplications = applications.filter((app) => app.studentId === student.id).sort((a, b) => dayjs(a.submittedDate).valueOf() - dayjs(b.submittedDate).valueOf())
  const studentVisaCases = visaCases.filter((visa) => visa.studentId === student.id).sort((a, b) => dayjs(a.submissionDate ?? a.decisionDate ?? student.createdAt).valueOf() - dayjs(b.submissionDate ?? b.decisionDate ?? student.createdAt).valueOf())
  const studentDocumentsList = studentDocuments.filter((doc) => doc.studentId === student.id).sort((a, b) => dayjs(a.uploadedAt).valueOf() - dayjs(b.uploadedAt).valueOf())

  let currentIndex = 0
  const steps = studentLifecycleStageOrder.map((key, index) => {
    const completed = index < currentIndex
    const active = index === currentIndex
    return { key, completed, active, ...studentLifecycleStageMeta[key] }
  })

  const history: StudentLifecycleEvent[] = [
    {
      id: 'lead-created',
      stage: 'lead_created',
      title: 'Lead created',
      description: `${student.name} entered the CRM and was assigned to ${student.counselorName}.`,
      timestamp: student.createdAt,
    },
  ]

  const hasDocuments = studentDocumentsList.length > 0
  if (hasDocuments) {
    currentIndex = Math.max(currentIndex, 3)
    history.push({
      id: 'documents',
      stage: 'document_collection',
      title: 'Documents collected',
      description: `${studentDocumentsList[0].fileName} was uploaded for review.`,
      timestamp: studentDocumentsList[0].uploadedAt,
    })
  }

  const hasApplications = studentApplications.length > 0
  if (hasApplications) {
    currentIndex = Math.max(currentIndex, 4)
    const firstApplication = studentApplications[0]
    history.push({
      id: 'application',
      stage: 'application_submission',
      title: 'Application submitted',
      description: `Submitted to ${firstApplication.universityName} for ${firstApplication.courseName}.`,
      timestamp: firstApplication.submittedDate,
    })
  }

  const hasOffer = studentApplications.some((app) => ['conditional_offer', 'unconditional_offer', 'accepted'].includes(app.stage))
  if (hasOffer) {
    currentIndex = Math.max(currentIndex, 5)
    history.push({
      id: 'offer',
      stage: 'offer_letter',
      title: 'Offer received',
      description: 'An offer letter or admission update was received from the university.',
      timestamp: studentApplications.find((app) => ['conditional_offer', 'unconditional_offer', 'accepted'].includes(app.stage))?.lastUpdate ?? student.createdAt,
    })
  }

  const hasPayment = student.status === 'enrolled' || studentApplications.some((app) => app.stage === 'accepted')
  if (hasPayment) {
    currentIndex = Math.max(currentIndex, 6)
    history.push({
      id: 'payment',
      stage: 'payment',
      title: 'Payment milestone reached',
      description: 'The student completed the financial milestone for the next step.',
      timestamp: studentApplications.find((app) => app.stage === 'accepted')?.lastUpdate ?? student.createdAt,
    })
  }

  const hasVisaProgress = studentVisaCases.some((visa) => visa.progress > 0 || visa.overallStatus !== 'not_started')
  if (hasVisaProgress) {
    currentIndex = Math.max(currentIndex, 7)
    const firstVisa = studentVisaCases[0]
    history.push({
      id: 'visa-processing',
      stage: 'visa_processing',
      title: 'Visa processing started',
      description: `Visa preparation began for ${firstVisa.universityName}.`,
      timestamp: firstVisa.submissionDate ?? firstVisa.decisionDate ?? student.createdAt,
    })
  }

  const hasInterview = studentVisaCases.some((visa) => visa.checklist.some((item) => item.step === 'interview' && item.status !== 'not_started'))
  if (hasInterview) {
    currentIndex = Math.max(currentIndex, 8)
    history.push({
      id: 'interview',
      stage: 'interview',
      title: 'Interview recorded',
      description: 'The visa interview stage is now active.',
      timestamp: studentVisaCases.find((visa) => visa.checklist.some((item) => item.step === 'interview' && item.status !== 'not_started'))?.decisionDate ?? student.createdAt,
    })
  }

  const hasVisaApproval = studentVisaCases.some((visa) => visa.overallStatus === 'approved' || Boolean(visa.decisionDate))
  if (hasVisaApproval) {
    currentIndex = Math.max(currentIndex, 9)
    history.push({
      id: 'visa-approved',
      stage: 'visa_approved',
      title: 'Visa approved',
      description: 'The visa decision has been granted and travel preparation can begin.',
      timestamp: studentVisaCases.find((visa) => visa.overallStatus === 'approved' || Boolean(visa.decisionDate))?.decisionDate ?? student.createdAt,
    })
  }

  const hasDeparturePrep = hasVisaApproval && (student.status === 'enrolled' || student.tags.includes('Fast Track'))
  if (hasDeparturePrep) {
    currentIndex = Math.max(currentIndex, 10)
    history.push({
      id: 'pre-departure',
      stage: 'pre_departure',
      title: 'Pre-departure checklist active',
      description: 'Travel and onboarding tasks are now in motion.',
      timestamp: student.createdAt,
    })
  }

  const hasTravelCompleted = student.status === 'enrolled' && hasVisaApproval
  if (hasTravelCompleted) {
    currentIndex = Math.max(currentIndex, 11)
    history.push({
      id: 'travel-completed',
      stage: 'travel_completed',
      title: 'Travel completed',
      description: 'The student successfully completed travel and the workflow is closed.',
      timestamp: student.createdAt,
    })
  }

  const finalIndex = Math.min(currentIndex, studentLifecycleStageOrder.length - 1)
  const normalizedSteps = steps.map((step, index) => ({
    ...step,
    completed: index < finalIndex,
    active: index === finalIndex,
  }))

  const progress = Math.round((finalIndex / (studentLifecycleStageOrder.length - 1)) * 100)
  const activeStep = normalizedSteps[finalIndex] ?? normalizedSteps[0]

  return {
    activeStep,
    progress,
    steps: normalizedSteps,
    history: history.sort((a, b) => dayjs(a.timestamp).valueOf() - dayjs(b.timestamp).valueOf()),
  }
}
