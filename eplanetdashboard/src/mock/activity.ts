import type { ActivityItem, AppNotification } from '@/types'
import { students, leads, applications, visaCases, followUps } from './entities'
import { daysAgo, pad, pick, randInt } from './generators'

const activityTemplates: Array<{ type: ActivityItem['type']; title: string; description: string }> = [
  { type: 'note', title: 'Note added', description: 'Discussed university shortlist and budget constraints.' },
  { type: 'status_change', title: 'Stage updated', description: 'Lead moved to Counseling stage.' },
  { type: 'document', title: 'Document uploaded', description: 'Academic transcripts uploaded for review.' },
  { type: 'call', title: 'Call logged', description: 'Phone call regarding IELTS preparation timeline.' },
  { type: 'email', title: 'Email sent', description: 'Application checklist emailed to student.' },
  { type: 'application', title: 'Application submitted', description: 'Application submitted to university admissions.' },
  { type: 'visa', title: 'Visa step completed', description: 'Biometric appointment completed successfully.' },
  { type: 'meeting', title: 'Meeting held', description: 'In-person counseling session completed at branch office.' },
]

export const activities: ActivityItem[] = Array.from({ length: 120 }).map((_, i) => {
  const template = pick(activityTemplates)
  const useStudent = i % 2 === 0
  const entity = useStudent ? pick(students) : pick(leads)
  return {
    id: `act-${pad(i + 1, 3)}`,
    type: template.type,
    title: template.title,
    description: template.description,
    actor: 'name' in entity ? entity.counselorName ?? 'System' : 'System',
    timestamp: daysAgo(randInt(0, 45)),
    entityId: entity.id,
    entityType: useStudent ? 'student' : 'lead',
  }
})

export const activityNotifications: AppNotification[] = [
  ...followUps.slice(0, 4).map((f, i) => ({
    id: `notif-fu-${i}`,
    title: `Follow-up due: ${f.studentName}`,
    description: f.reminder,
    timestamp: daysAgo(randInt(0, 2)),
    read: i > 1,
    type: 'follow_up' as const,
  })),
  ...applications.slice(0, 3).map((a, i) => ({
    id: `notif-app-${i}`,
    title: `Application update: ${a.studentName}`,
    description: `${a.universityName} moved to ${a.stage.replace('_', ' ')}.`,
    timestamp: daysAgo(randInt(0, 3)),
    read: i > 0,
    type: 'application' as const,
  })),
  ...visaCases.slice(0, 2).map((v, i) => ({
    id: `notif-visa-${i}`,
    title: `Visa progress: ${v.studentName}`,
    description: `Case now at ${v.progress}% completion.`,
    timestamp: daysAgo(randInt(0, 4)),
    read: false,
    type: 'visa' as const,
  })),
  {
    id: 'notif-sys-1',
    title: 'Weekly report ready',
    description: 'Your counselor performance report for this week is ready to view.',
    timestamp: daysAgo(1),
    read: true,
    type: 'system',
  },
]

export const notifications = activityNotifications
