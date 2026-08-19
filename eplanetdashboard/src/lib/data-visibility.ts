import type {
  Appointment, Application, ClassSession, Commission, CurrentUser, FollowUp,
  Lead, Referral, Student, StudentDocument, VisaCase,
} from '@/types'
import { referralAgents, teachers } from '@/mock/staff'
import { enrollments } from '@/mock/classes'
import { counselors } from '@/mock/reference'

export type SearchScope = 'students' | 'leads' | 'counselors' | 'teachers' | 'referral_agents' | 'universities'

export const searchScopesByRole: Record<CurrentUser['role'], readonly SearchScope[]> = {
  super_admin: ['students', 'leads', 'counselors', 'teachers', 'referral_agents', 'universities'],
  front_desk: ['students', 'leads'],
  counselor: ['students', 'leads'],
  teacher: ['students', 'leads'],
  student: [],
  referral_agent: ['students', 'leads'],
}

function isSuperAdmin(user: CurrentUser) {
  return user.role === 'super_admin'
}

export function getCounselorScopeId(user: CurrentUser): string | null {
  if (user.role !== 'counselor') return null
  const matched = counselors.find(
    (c) =>
      c.id === user.linkedId ||
      (c.email && user.email && c.email.toLowerCase() === user.email.toLowerCase()) ||
      (c.name && user.name && (c.name.toLowerCase().includes(user.name.split(' ')[0].toLowerCase()) || user.name.toLowerCase().includes(c.name.split(' ')[0].toLowerCase()))),
  )
  return matched?.id ?? user.linkedId
}

export function canViewStudent(user: CurrentUser, student: Student) {
  if (isSuperAdmin(user)) return true
  if (user.role === 'student') return student.id === user.linkedId
  // All staff roles (front_desk, counselor, teacher, referral_agent) can view student profiles
  return user.role === 'front_desk' || user.role === 'counselor' || user.role === 'teacher' || user.role === 'referral_agent'
}

export function canViewLead(user: CurrentUser, _lead: Lead) {
  if (user.role === 'student') return false
  // No branches: every staff role shares the full lead dataset.
  return isSuperAdmin(user) || ['front_desk', 'counselor', 'teacher', 'referral_agent'].includes(user.role)
}

export function visibleStudents(user: CurrentUser, records: readonly Student[]) {
  return records.filter((student) => canViewStudent(user, student))
}

export function visibleLeads(user: CurrentUser, records: readonly Lead[]) {
  return records.filter((lead) => canViewLead(user, lead))
}

export function visibleFollowUps(user: CurrentUser, records: readonly FollowUp[]) {
  return records.filter((followUp) => {
    if (isSuperAdmin(user) || user.role === 'front_desk') return true
    if (user.role === 'counselor') return followUp.counselorId === user.linkedId
    return false
  })
}

export function visibleAppointments(user: CurrentUser, records: readonly Appointment[]) {
  return records.filter((appointment) => {
    if (isSuperAdmin(user) || user.role === 'front_desk') return true
    if (user.role === 'counselor') return appointment.counselorId === user.linkedId
    if (user.role === 'student') return appointment.studentId === user.linkedId
    return false
  })
}

function canViewStudentOwned(user: CurrentUser, studentId: string, students: readonly Student[]) {
  const student = students.find((candidate) => candidate.id === studentId)
  return Boolean(student && canViewStudent(user, student))
}

export function visibleApplications(user: CurrentUser, records: readonly Application[], students: readonly Student[]) {
  return records.filter((record) => canViewStudentOwned(user, record.studentId, students))
}

export function visibleVisaCases(user: CurrentUser, records: readonly VisaCase[], students: readonly Student[]) {
  return records.filter((record) => canViewStudentOwned(user, record.studentId, students))
}

export function visibleDocuments(user: CurrentUser, records: readonly StudentDocument[], students: readonly Student[]) {
  return records.filter((record) => canViewStudentOwned(user, record.studentId, students))
}

export function visibleClasses(user: CurrentUser, records: readonly ClassSession[]) {
  if (isSuperAdmin(user)) return records
  if (user.role === 'teacher') return records.filter((classSession) => classSession.teacherId === user.linkedId)
  if (user.role === 'student') {
    const classIds = new Set(enrollments.filter((enrollment) => enrollment.studentId === user.linkedId).map((enrollment) => enrollment.classId))
    return records.filter((classSession) => classIds.has(classSession.id))
  }
  return []
}

export function visibleCommissions(user: CurrentUser, records: readonly Commission[]) {
  if (isSuperAdmin(user)) return records
  if (user.role === 'counselor' || user.role === 'referral_agent') return records.filter((record) => record.earnerId === user.linkedId)
  return []
}

export function visibleReferrals(user: CurrentUser, records: readonly Referral[]) {
  if (isSuperAdmin(user)) return records
  if (user.role === 'referral_agent') return records.filter((record) => record.agentId === user.linkedId)
  return []
}

export function visibleCounselors(user: CurrentUser) {
  if (isSuperAdmin(user)) return counselors
  if (user.role === 'counselor') return counselors.filter((counselor) => counselor.id === user.linkedId)
  return []
}

export function visibleTeachers(user: CurrentUser) {
  if (isSuperAdmin(user)) return teachers
  if (user.role === 'teacher') return teachers.filter((teacher) => teacher.id === user.linkedId)
  return []
}

export function visibleReferralAgents(user: CurrentUser) {
  if (isSuperAdmin(user)) return referralAgents
  if (user.role === 'referral_agent') return referralAgents.filter((agent) => agent.id === user.linkedId)
  return []
}