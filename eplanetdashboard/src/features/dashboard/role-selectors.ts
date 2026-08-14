import dayjs from 'dayjs'
import {
  students, leads, followUps,
  counselors, teachers, classes, enrollments, attendanceRecords,
  referralAgents, referrals, agentCommissions,
} from '@/mock'
import type { LeadStage } from '@/types'
import { useStudentsStore } from '@/features/students/store'
import { useDocumentsStore } from '@/features/documents/store'
import { useApplicationsStore } from '@/features/applications/store'
import { useVisaStore } from '@/features/visa/store'
import { useLeadsStore } from '@/features/leads/store'
import { useFollowUpsStore } from '@/features/followups/store'
import { useCommissionStore } from '@/features/commissions/store'

// ── Front Desk — operational queue across the whole client dataset ─────

export function getFrontDeskStats() {
  const today = dayjs()
  const newLeadsToday = leads.filter((l) => dayjs(l.createdAt).isSame(today, 'day')).length
  const todaysAppointments = 0 // sourced live from appointments store in the panel itself
  const feeCollectionQueue = leads.filter((l) => l.stage === 'offer_letter' || l.stage === 'visa').length
  const pendingFollowUps = followUps.filter((f) => f.status === 'pending').length
  return { newLeadsToday, todaysAppointments, feeCollectionQueue, pendingFollowUps }
}

export function getNewLeadsQueue(limit = 6) {
  return [...leads]
    .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf()).slice(0, limit)
}

export function getFeeCollectionQueue(limit = 6) {
  // Proxy until the Payments module ships: leads that have cleared offer/visa and are due to pay.
  return leads
    .filter((l) => l.stage === 'offer_letter' || l.stage === 'visa')
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

// ── Counselor — own students only ───────────────────────────────────────

export function getCounselorDashboard(counselorId: string) {
  const counselor = counselors.find((c) => c.id === counselorId)
  
  const activeStudents = useStudentsStore.getState().students
  const activeLeads = useLeadsStore.getState().leads
  const activeFollowUps = useFollowUpsStore.getState().followUps
  const activeCommissions = useCommissionStore.getState().commissions

  const myStudents = activeStudents.filter((s) => s.counselorId === counselorId)
  const myLeads = activeLeads.filter((l) => l.counselorId === counselorId)
  const myFollowUps = activeFollowUps.filter((f) => f.counselorId === counselorId && f.status === 'pending')
  const myCommissions = activeCommissions.filter((c) => c.earnerId === counselorId)

  const stageCounts = new Map<LeadStage, number>()
  myLeads.forEach((l) => stageCounts.set(l.stage, (stageCounts.get(l.stage) ?? 0) + 1))

  const earned = myCommissions.reduce((s, c) => s + c.amountUsd, 0)
  const paid = myCommissions.filter((c) => c.status === 'paid').reduce((s, c) => s + c.amountUsd, 0)
  const pending = myCommissions.filter((c) => c.status !== 'paid').reduce((s, c) => s + c.amountUsd, 0)

  return {
    counselor,
    totalStudents: myStudents.length,
    activeStudents: myStudents.filter((s) => s.status === 'active').length,
    totalLeads: myLeads.length,
    stageBreakdown: Array.from(stageCounts.entries()).map(([stage, count]) => ({ stage, count })),
    upcomingFollowUps: [...myFollowUps].sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf()).slice(0, 6),
    recentStudents: [...myStudents].sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf()).slice(0, 5),
    commission: { earned, paid, pending, count: myCommissions.length },
  }
}

// ── Teacher — own classes only ──────────────────────────────────────────

export function getTeacherDashboard(teacherId: string) {
  const teacher = teachers.find((t) => t.id === teacherId)
  const myClasses = classes.filter((c) => c.teacherId === teacherId)
  const myClassIds = new Set(myClasses.map((c) => c.id))
  const myEnrollments = enrollments.filter((e) => myClassIds.has(e.classId))
  const myAttendance = attendanceRecords
    .filter((a) => myClassIds.has(a.classId))
    .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf())

  const avgAttendancePct = myAttendance.length
    ? Math.round(myAttendance.reduce((s, a) => s + (a.presentCount / a.totalCount) * 100, 0) / myAttendance.length)
    : 0
  const avgProgress = myEnrollments.length
    ? Math.round(myEnrollments.reduce((s, e) => s + e.progress, 0) / myEnrollments.length)
    : 0

  return {
    teacher,
    classes: myClasses,
    ongoingCount: myClasses.filter((c) => c.status === 'ongoing').length,
    upcomingCount: myClasses.filter((c) => c.status === 'upcoming').length,
    totalStudents: myEnrollments.length,
    avgAttendancePct,
    avgProgress,
    recentAttendance: myAttendance.slice(0, 6),
    perClassProgress: myClasses.map((c) => {
      const roster = myEnrollments.filter((e) => e.classId === c.id)
      const progress = roster.length ? Math.round(roster.reduce((s, e) => s + e.progress, 0) / roster.length) : 0
      return { classId: c.id, className: c.name, progress, studentCount: roster.length }
    }),
  }
}

// ── Student — own record only ───────────────────────────────────────────

export function getStudentDashboard(studentId: string) {
  const activeStudents = useStudentsStore.getState().students
  const activeApplications = useApplicationsStore.getState().applications
  const activeVisaCases = useVisaStore.getState().visaCases
  const activeDocuments = useDocumentsStore.getState().documents

  const student = activeStudents.find((s) => s.id === studentId) || students.find((s) => s.id === studentId)
  const myApplications = activeApplications.filter((a) => a.studentId === studentId)
  const myVisaCase = activeVisaCases.find((v) => v.studentId === studentId)
  const myDocuments = activeDocuments.filter((d) => d.studentId === studentId)
  const myClasses = enrollments.filter((e) => e.studentId === studentId)

  return {
    student,
    applications: myApplications,
    visaCase: myVisaCase,
    documents: myDocuments,
    documentsVerified: myDocuments.filter((d) => d.status === 'verified').length,
    classes: myClasses,
  }
}

// ── Referral Agent — own referrals only ─────────────────────────────────

export function getAgentDashboard(agentId: string) {
  const agent = referralAgents.find((a) => a.id === agentId)
  const myReferrals = referrals.filter((r) => r.agentId === agentId)
  const myCommissions = agentCommissions.filter((c) => c.earnerId === agentId)

  const earned = myCommissions.reduce((s, c) => s + c.amountUsd, 0)
  const paid = myCommissions.filter((c) => c.status === 'paid').reduce((s, c) => s + c.amountUsd, 0)
  const pending = myCommissions.filter((c) => c.status !== 'paid').reduce((s, c) => s + c.amountUsd, 0)
  const converted = myReferrals.filter((r) => r.stage === 'completed' || r.stage === 'visa').length

  return {
    agent,
    referrals: [...myReferrals].sort((a, b) => dayjs(b.referredAt).valueOf() - dayjs(a.referredAt).valueOf()),
    conversionRate: myReferrals.length ? Math.round((converted / myReferrals.length) * 100) : 0,
    commission: { earned, paid, pending, count: myCommissions.length },
    commissions: [...myCommissions].sort((a, b) => dayjs(b.generatedAt).valueOf() - dayjs(a.generatedAt).valueOf()),
  }
}
