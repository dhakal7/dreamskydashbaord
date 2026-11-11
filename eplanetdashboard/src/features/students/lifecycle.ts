import dayjs from 'dayjs'
import type { Student, StudentLifecycleEvent, StudentLifecycleStage } from '@/types'

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

export const studentLifecycleStageMeta: Record<
  StudentLifecycleStage,
  { label: string; description: string; variant: 'slate' | 'info' | 'warning' | 'success' }
> = {
  lead_created: { label: 'Lead Created', description: 'The inquiry entered the CRM and was assigned.', variant: 'slate' },
  inquiry: { label: 'Inquiry', description: 'Study preferences and initial requirements documented.', variant: 'info' },
  counseling: { label: 'Counseling', description: 'Academic counseling session conducted.', variant: 'info' },
  document_collection: { label: 'Document Collection', description: 'Academic and identification documents submitted.', variant: 'warning' },
  application_submission: { label: 'Application Submission', description: 'University applications submitted to institutions.', variant: 'warning' },
  offer_letter: { label: 'Offer Letter', description: 'Admission offer received from institution.', variant: 'warning' },
  payment: { label: 'Payment', description: 'Tuition or consultancy payment recorded.', variant: 'warning' },
  visa_processing: { label: 'Visa Processing', description: 'Visa application prepared and submitted.', variant: 'warning' },
  interview: { label: 'Interview', description: 'Embassy or university interview recorded.', variant: 'warning' },
  visa_approved: { label: 'Visa Approved', description: 'Official visa decision granted.', variant: 'success' },
  pre_departure: { label: 'Pre Departure', description: 'Pre-departure briefing and travel preparation.', variant: 'success' },
  travel_completed: { label: 'Travel Completed', description: 'Departure and journey completion recorded.', variant: 'success' },
}

const PRISMA_STAGE_TO_INDEX: Record<string, number> = {
  LEAD: 0,
  PROSPECT: 1,
  ENROLLED: 3,
  APPLIED: 4,
  OFFER_RECEIVED: 5,
  VISA_APPLIED: 7,
  VISA_APPROVED: 9,
  DEPARTED: 11,
  LOST: 0,
}

function mapPrismaStageToLifecycle(stage?: string): StudentLifecycleStage {
  const norm = (stage || '').toUpperCase()
  switch (norm) {
    case 'LEAD': return 'lead_created'
    case 'PROSPECT': return 'inquiry'
    case 'ENROLLED': return 'document_collection'
    case 'APPLIED': return 'application_submission'
    case 'OFFER_RECEIVED': return 'offer_letter'
    case 'VISA_APPLIED': return 'visa_processing'
    case 'VISA_APPROVED': return 'visa_approved'
    case 'DEPARTED': return 'travel_completed'
    default: return 'lead_created'
  }
}

function formatStageLabel(stage?: string): string {
  if (!stage) return 'Lead'
  return stage.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

export interface VerifiedLifecycleContext {
  stageHistory?: Array<{
    id: string
    stage?: string
    toStage?: string
    fromStage?: string | null
    changedAt: string
    notes?: string | null
    changedBy?: { firstName?: string; lastName?: string } | null
  }>
  applications?: Array<{
    id: string
    university?: { name?: string } | null
    course?: { name?: string } | null
    status?: string
    submittedAt?: string | null
    createdAt?: string
  }>
  visaCases?: Array<{
    id: string
    country?: string | null
    status?: string
    submittedAt?: string | null
    decisionDate?: string | null
    createdAt?: string
  }>
  documents?: Array<{
    id: string
    originalName?: string
    fileName?: string
    category?: string
    type?: string
    createdAt?: string
    uploadedAt?: string
  }>
}

export function getStudentLifecycleState(student: Student, context?: VerifiedLifecycleContext) {
  // Determine index from real recorded stage
  const rawStage = (student.tags && student.tags[0]) || (student as any).currentStage || 'LEAD'
  const stageUpper = String(rawStage).toUpperCase()
  let currentIndex = PRISMA_STAGE_TO_INDEX[stageUpper] ?? 0

  // Advance index only if verified downstream records exist in database
  if (context?.applications && context.applications.length > 0) {
    currentIndex = Math.max(currentIndex, 4)
  }
  if (context?.visaCases && context.visaCases.length > 0) {
    currentIndex = Math.max(currentIndex, 7)
    if (context.visaCases.some((v) => v.status === 'APPROVED')) {
      currentIndex = Math.max(currentIndex, 9)
    }
  }

  const finalIndex = Math.min(currentIndex, studentLifecycleStageOrder.length - 1)
  const normalizedSteps = studentLifecycleStageOrder.map((key, index) => ({
    key,
    completed: index < finalIndex,
    active: index === finalIndex,
    ...studentLifecycleStageMeta[key],
  }))

  const progress = Math.round((finalIndex / (studentLifecycleStageOrder.length - 1)) * 100)
  const activeStep = normalizedSteps[finalIndex] ?? normalizedSteps[0]

  // Construct history solely from verified records
  const history: StudentLifecycleEvent[] = []

  // 1. Initial Registration
  history.push({
    id: `reg-${student.id}`,
    stage: 'lead_created',
    title: 'Profile Registered',
    description: `${student.name} entered the CRM${student.counselorName ? ` and was assigned to ${student.counselorName}` : ''}.`,
    timestamp: student.createdAt || new Date().toISOString(),
  })

  // 2. Verified Stage History from database
  if (context?.stageHistory && context.stageHistory.length > 0) {
    context.stageHistory.forEach((sh) => {
      const stageName = sh.stage || sh.toStage || 'Updated'
      history.push({
        id: `sh-${sh.id}`,
        stage: mapPrismaStageToLifecycle(stageName),
        title: `Stage: ${formatStageLabel(stageName)}`,
        description: `Student stage updated to ${formatStageLabel(stageName)}${sh.changedBy ? ` by ${sh.changedBy.firstName || ''} ${sh.changedBy.lastName || ''}`.trim() : ''}.`,
        timestamp: sh.changedAt,
      })
    })
  }

  // 3. Verified Documentation
  if (context?.documents && context.documents.length > 0) {
    const sortedDocs = [...context.documents].sort(
      (a, b) => dayjs(a.createdAt || a.uploadedAt).valueOf() - dayjs(b.createdAt || b.uploadedAt).valueOf()
    )
    history.push({
      id: `doc-${sortedDocs[0].id}`,
      stage: 'document_collection',
      title: 'Documentation Milestone',
      description: `${context.documents.length} verified document${context.documents.length > 1 ? 's' : ''} uploaded.`,
      timestamp: sortedDocs[0].createdAt || sortedDocs[0].uploadedAt || student.createdAt,
    })
  }

  // 4. Verified Applications
  if (context?.applications && context.applications.length > 0) {
    context.applications.forEach((app) => {
      const uName = app.university?.name || 'Institution'
      const cName = app.course?.name || 'Selected Program'
      history.push({
        id: `app-${app.id}`,
        stage: 'application_submission',
        title: `Application: ${uName}`,
        description: `Application for ${cName} (Status: ${app.status || 'SUBMITTED'}).`,
        timestamp: app.submittedAt || app.createdAt || student.createdAt,
      })
    })
  }

  // 5. Verified Visa Cases
  if (context?.visaCases && context.visaCases.length > 0) {
    context.visaCases.forEach((vc) => {
      const country = vc.country || 'Destination'
      history.push({
        id: `visa-${vc.id}`,
        stage: vc.status === 'APPROVED' ? 'visa_approved' : 'visa_processing',
        title: `Visa Case: ${country}`,
        description: `Visa processing record for ${country} (Status: ${vc.status || 'PREPARING'}).`,
        timestamp: vc.decisionDate || vc.submittedAt || vc.createdAt || student.createdAt,
      })
    })
  }

  return {
    activeStep,
    progress,
    steps: normalizedSteps,
    history: history.sort((a, b) => dayjs(a.timestamp).valueOf() - dayjs(b.timestamp).valueOf()),
  }
}

