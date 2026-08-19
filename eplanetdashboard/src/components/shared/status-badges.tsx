import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type {
  ApplicationStage, AppointmentStatus, FollowUpStatus, LeadStage, Priority, Student, StudentDocument, VisaStatus, ClassSession,
} from '@/types'

type LeadStageMetaVariant = 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'slate'

export const leadStageMeta: Record<LeadStage, { label: string; variant: LeadStageMetaVariant }> = {
  new: { label: 'New', variant: 'slate' },
  contacted: { label: 'Contacted', variant: 'info' },
  counseling: { label: 'Counseling', variant: 'info' },
  interested: { label: 'Interested', variant: 'default' },
  application: { label: 'Application', variant: 'warning' },
  offer_letter: { label: 'Offer Letter', variant: 'warning' },
  visa: { label: 'Visa', variant: 'info' },
  travel: { label: 'Travel', variant: 'secondary' },
  completed: { label: 'Completed', variant: 'success' },
}

// Only these 4 stages are shown in the pipeline view.
// After 'interested', leads are converted to students via the pipeline card action.
export const leadStageOrder: LeadStage[] = [
  'new', 'contacted', 'counseling', 'interested',
]

export const priorityMeta: Record<Priority, { label: string; variant: 'slate' | 'info' | 'warning' | 'danger'; dot: string }> = {
  low: { label: 'Low', variant: 'slate', dot: '#94a3b8' },
  medium: { label: 'Medium', variant: 'info', dot: '#3b82f6' },
  high: { label: 'High', variant: 'warning', dot: '#f59e0b' },
  urgent: { label: 'Urgent', variant: 'danger', dot: '#ef4444' },
}

export const applicationStageMeta: Record<ApplicationStage, { label: string; variant: 'slate' | 'info' | 'warning' | 'success' | 'danger' }> = {
  submitted: { label: 'Submitted', variant: 'slate' },
  university_review: { label: 'University Review', variant: 'info' },
  conditional_offer: { label: 'Conditional Offer', variant: 'warning' },
  unconditional_offer: { label: 'Unconditional Offer', variant: 'warning' },
  accepted: { label: 'Accepted', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
}

export const visaStatusMeta: Record<VisaStatus, { label: string; variant: 'slate' | 'info' | 'warning' | 'success' | 'danger' }> = {
  not_started: { label: 'Not Started', variant: 'slate' },
  in_progress: { label: 'In Progress', variant: 'info' },
  submitted: { label: 'Submitted', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
}

export const followUpStatusMeta: Record<FollowUpStatus, { label: string; variant: 'slate' | 'success' | 'danger' | 'warning' }> = {
  pending: { label: 'Pending', variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  missed: { label: 'Missed', variant: 'danger' },
  rescheduled: { label: 'Rescheduled', variant: 'slate' },
}

export const appointmentStatusMeta: Record<AppointmentStatus, { label: string; variant: 'slate' | 'info' | 'success' | 'danger' | 'warning' }> = {
  scheduled: { label: 'Scheduled', variant: 'info' },
  confirmed: { label: 'Confirmed', variant: 'success' },
  completed: { label: 'Completed', variant: 'slate' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
  no_show: { label: 'No Show', variant: 'warning' },
}

export const studentStatusMeta: Record<Student['status'], { label: string; variant: 'success' | 'slate' | 'info' | 'danger' }> = {
  active: { label: 'Active', variant: 'success' },
  inactive: { label: 'Inactive', variant: 'slate' },
  enrolled: { label: 'Enrolled', variant: 'info' },
  dropped: { label: 'Dropped', variant: 'danger' },
}

export const documentStatusMeta: Record<StudentDocument['status'], { label: string; variant: 'warning' | 'success' | 'danger' | 'info' | 'secondary' | 'slate' }> = {
  uploaded: { label: 'Uploaded', variant: 'info' },
  pending_student_review: { label: 'Pending Student Review', variant: 'warning' },
  changes_requested: { label: 'Changes Requested', variant: 'danger' },
  re_uploaded: { label: 'Re-uploaded', variant: 'secondary' },
  verified: { label: 'Verified', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
  pending_review: { label: 'Pending Review', variant: 'warning' },
  pending: { label: 'Pending', variant: 'slate' },
}

export function DocumentStatusBadge({ status, className }: { status: StudentDocument['status']; className?: string }) {
  const normalizedStatus = (status || 'pending').toLowerCase() as StudentDocument['status']
  const meta = documentStatusMeta[normalizedStatus] ?? {
    label: normalizedStatus.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    variant: 'slate' as const,
  }
  return (
    <Badge variant={meta.variant} className={cn(className)}>
      {meta.label}
    </Badge>
  )
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const meta = priorityMeta[priority]
  return (
    <Badge variant={meta.variant} dot className={cn(className)}>
      {meta.label}
    </Badge>
  )
}

export function LeadStageBadge({ stage, className }: { stage: LeadStage; className?: string }) {
  const meta = leadStageMeta[stage] ?? {
    label: stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    variant: 'slate' as const,
  }
  return (
    <Badge variant={meta.variant} className={cn(className)}>
      {meta.label}
    </Badge>
  )
}

export function ApplicationStageBadge({ stage, className }: { stage: ApplicationStage; className?: string }) {
  const meta = applicationStageMeta[stage]
  return (
    <Badge variant={meta.variant} className={cn(className)}>
      {meta.label}
    </Badge>
  )
}

export function VisaStatusBadge({ status, className }: { status: VisaStatus; className?: string }) {
  const meta = visaStatusMeta[status]
  return (
    <Badge variant={meta.variant} className={cn(className)}>
      {meta.label}
    </Badge>
  )
}

export function StudentStatusBadge({ status, className }: { status: Student['status']; className?: string }) {
  const meta = studentStatusMeta[status]
  return (
    <Badge variant={meta.variant} className={cn(className)}>
      {meta.label}
    </Badge>
  )
}

export function FollowUpStatusBadge({ status, className }: { status: FollowUpStatus; className?: string }) {
  const meta = followUpStatusMeta[status]
  return (
    <Badge variant={meta.variant} className={cn(className)}>
      {meta.label}
    </Badge>
  )
}

export function DocumentStatusBadge({ status, className }: { status: StudentDocument['status']; className?: string }) {
  const meta = documentStatusMeta[status]
  return (
    <Badge variant={meta.variant} className={cn(className)}>
      {meta.label}
    </Badge>
  )
}

export const classStatusMeta: Record<ClassSession['status'], { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'slate' }> = {
  upcoming: { label: 'Upcoming', variant: 'info' },
  ongoing: { label: 'Ongoing', variant: 'success' },
  completed: { label: 'Completed', variant: 'slate' },
}

export function ClassStatusBadge({ status, className }: { status: ClassSession['status']; className?: string }) {
  const meta = classStatusMeta[status]
  return (
    <Badge variant={meta.variant} className={cn(className)}>
      {meta.label}
    </Badge>
  )
}
