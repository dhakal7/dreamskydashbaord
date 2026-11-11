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
  branch_admin: ['students', 'leads', 'counselors', 'teachers', 'referral_agents', 'universities'],
  front_desk: ['students', 'leads'],
  counselor: ['students', 'leads'],
  teacher: [],
  student: [],
  referral_agent: ['students', 'leads'],
}

export interface BranchVisibilityOptions {
  verifiedBranchScopedApi?: boolean
}

function isValidNonEmptyBranchId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isSuperAdmin(user: CurrentUser): boolean {
  return user.role === 'super_admin'
}

export function isBranchAdmin(user: CurrentUser): boolean {
  return user.role === 'branch_admin'
}

export function canBranchAdminViewRecord(
  user: CurrentUser | null | undefined,
  record?: { branchId?: unknown } | null,
  options?: BranchVisibilityOptions,
): boolean {
  if (!user || !isBranchAdmin(user)) return false
  if (!isValidNonEmptyBranchId(user.branchId)) return false
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false

  const hasExplicitBranchId =
    Object.prototype.hasOwnProperty.call(record, 'branchId') &&
    record.branchId !== undefined

  if (hasExplicitBranchId) {
    if (!isValidNonEmptyBranchId(record.branchId)) return false
    return record.branchId === user.branchId
  }

  if (options?.verifiedBranchScopedApi === true) {
    return true
  }

  return false
}

export function canBranchAdminViewVerifiedApiRecord(
  user: CurrentUser | null | undefined,
  record?: { branchId?: unknown } | null,
): boolean {
  return canBranchAdminViewRecord(user, record, { verifiedBranchScopedApi: true })
}

export function getCounselorScopeId(user: CurrentUser): string | null {
  if (!user || user.role !== 'counselor') return null
  const matched = counselors.find(
    (c) =>
      c.id === user.linkedId ||
      (c.email && user.email && c.email.toLowerCase() === user.email.toLowerCase()) ||
      (c.name && user.name && (c.name.toLowerCase().includes(user.name.split(' ')[0].toLowerCase()) || user.name.toLowerCase().includes(c.name.split(' ')[0].toLowerCase()))),
  )
  return matched?.id ?? user.linkedId
}

export function canViewStudent(
  user: CurrentUser,
  student: Student | null | undefined,
  options?: BranchVisibilityOptions,
) {
  if (!user || !student || typeof student !== 'object' || Array.isArray(student)) return false
  if (isSuperAdmin(user)) return true
  if (isBranchAdmin(user)) return canBranchAdminViewRecord(user, student as Student & { branchId?: unknown }, options)
  if (user.role === 'student') return student.id === user.linkedId
  // Policy C: Teachers may only view students in their assigned classes, not branch-wide student profiles
  return user.role === 'front_desk' || user.role === 'counselor' || user.role === 'referral_agent'
}

export function canViewLead(
  user: CurrentUser,
  lead: Lead | null | undefined,
  options?: BranchVisibilityOptions,
) {
  if (!user || !lead || typeof lead !== 'object' || Array.isArray(lead)) return false
  if (user.role === 'student' || user.role === 'teacher') return false
  if (isSuperAdmin(user)) return true
  if (isBranchAdmin(user)) return canBranchAdminViewRecord(user, lead as Lead & { branchId?: unknown }, options)
  if (user.role === 'front_desk') return true
  if (user.role === 'counselor') {
    if (lead.stage === 'not_contracted' || lead.stage === 'new') return false
    return lead.counselorId === user.linkedId || lead.selectedCounselorId === user.linkedId
  }
  return user.role === 'referral_agent'
}

export function visibleStudents(
  user: CurrentUser,
  records: readonly Student[],
  options?: BranchVisibilityOptions,
) {
  if (!Array.isArray(records)) return []
  return records.filter((student) => Boolean(student) && canViewStudent(user, student, options))
}

export function visibleLeads(
  user: CurrentUser,
  records: readonly Lead[],
  options?: BranchVisibilityOptions,
) {
  if (!Array.isArray(records)) return []
  return records.filter((lead) => Boolean(lead) && canViewLead(user, lead, options))
}

export function visibleFollowUps(
  user: CurrentUser,
  records: readonly FollowUp[],
  options?: BranchVisibilityOptions,
) {
  if (!Array.isArray(records)) return []
  return records.filter((followUp) => {
    if (!user || !followUp || typeof followUp !== 'object' || Array.isArray(followUp)) return false
    if (isSuperAdmin(user)) return true
    if (isBranchAdmin(user)) return canBranchAdminViewRecord(user, followUp as FollowUp & { branchId?: unknown }, options)
    if (user.role === 'front_desk') return true
    if (user.role === 'counselor') return followUp.counselorId === user.linkedId
    return false
  })
}

export function visibleAppointments(
  user: CurrentUser,
  records: readonly Appointment[],
  options?: BranchVisibilityOptions,
) {
  if (!Array.isArray(records)) return []
  return records.filter((appointment) => {
    if (!user || !appointment || typeof appointment !== 'object' || Array.isArray(appointment)) return false
    if (isSuperAdmin(user)) return true
    if (isBranchAdmin(user)) return canBranchAdminViewRecord(user, appointment as Appointment & { branchId?: unknown }, options)
    if (user.role === 'front_desk') return true
    if (user.role === 'counselor') return appointment.counselorId === user.linkedId
    if (user.role === 'student') return appointment.studentId === user.linkedId
    return false
  })
}

function canViewStudentOwned(
  user: CurrentUser,
  studentId: string,
  students: readonly Student[],
  options?: BranchVisibilityOptions,
) {
  if (!Array.isArray(students) || !studentId) return false
  const student = students.find((candidate) => Boolean(candidate) && candidate.id === studentId)
  return Boolean(student && canViewStudent(user, student, options))
}

export function visibleApplications(
  user: CurrentUser,
  records: readonly Application[],
  students: readonly Student[],
  options?: BranchVisibilityOptions,
) {
  if (!Array.isArray(records)) return []
  return records.filter((record) => Boolean(record) && canViewStudentOwned(user, record.studentId, students, options))
}

export function visibleVisaCases(
  user: CurrentUser,
  records: readonly VisaCase[],
  students: readonly Student[],
  options?: BranchVisibilityOptions,
) {
  if (!Array.isArray(records)) return []
  return records.filter((record) => Boolean(record) && canViewStudentOwned(user, record.studentId, students, options))
}

export function visibleDocuments(
  user: CurrentUser,
  records: readonly StudentDocument[],
  students: readonly Student[],
  options?: BranchVisibilityOptions,
) {
  if (!Array.isArray(records)) return []
  return records.filter((record) => Boolean(record) && canViewStudentOwned(user, record.studentId, students, options))
}

export function visibleClasses(
  user: CurrentUser,
  records: readonly ClassSession[],
  options?: BranchVisibilityOptions,
) {
  if (!Array.isArray(records) || !user) return []
  const validRecords = records.filter(
    (classSession): classSession is ClassSession =>
      Boolean(classSession && typeof classSession === 'object' && !Array.isArray(classSession)),
  )
  if (isSuperAdmin(user)) return validRecords
  if (isBranchAdmin(user)) {
    return validRecords.filter((classSession) =>
      canBranchAdminViewRecord(user, classSession as ClassSession & { branchId?: unknown }, options),
    )
  }
  if (user.role === 'teacher') return validRecords.filter((classSession) => classSession.teacherId === user.linkedId)
  if (user.role === 'student') {
    const classIds = new Set(enrollments.filter((enrollment) => enrollment.studentId === user.linkedId).map((enrollment) => enrollment.classId))
    return validRecords.filter((classSession) => classIds.has(classSession.id))
  }
  return []
}

export function visibleCommissions(
  user: CurrentUser,
  records: readonly Commission[],
  options?: BranchVisibilityOptions,
) {
  if (!Array.isArray(records) || !user) return []
  const validRecords = records.filter(
    (record): record is Commission =>
      Boolean(record && typeof record === 'object' && !Array.isArray(record)),
  )
  if (isSuperAdmin(user)) return validRecords
  if (isBranchAdmin(user)) {
    return validRecords.filter((record) =>
      canBranchAdminViewRecord(user, record as Commission & { branchId?: unknown }, options),
    )
  }
  if (user.role === 'counselor' || user.role === 'referral_agent') return validRecords.filter((record) => record.earnerId === user.linkedId)
  return []
}

export function visibleReferrals(
  user: CurrentUser,
  records: readonly Referral[],
  options?: BranchVisibilityOptions,
) {
  if (!Array.isArray(records) || !user) return []
  const validRecords = records.filter(
    (record): record is Referral =>
      Boolean(record && typeof record === 'object' && !Array.isArray(record)),
  )
  if (isSuperAdmin(user)) return validRecords
  if (isBranchAdmin(user)) {
    return validRecords.filter((record) =>
      canBranchAdminViewRecord(user, record as Referral & { branchId?: unknown }, options),
    )
  }
  if (user.role === 'referral_agent') return validRecords.filter((record) => record.agentId === user.linkedId)
  return []
}

export function visibleCounselors(
  user: CurrentUser,
  records: readonly ((typeof counselors)[number] & { branchId?: unknown })[] = counselors,
  options?: BranchVisibilityOptions,
) {
  if (!Array.isArray(records) || !user) return []
  const validRecords = records.filter((counselor) => Boolean(counselor && typeof counselor === 'object' && !Array.isArray(counselor)))
  if (isSuperAdmin(user)) return validRecords
  if (isBranchAdmin(user)) {
    return validRecords.filter((counselor) =>
      canBranchAdminViewRecord(user, counselor, options),
    )
  }
  if (user.role === 'counselor') return validRecords.filter((counselor) => counselor.id === user.linkedId)
  return []
}

export function visibleTeachers(
  user: CurrentUser,
  records: readonly ((typeof teachers)[number] & { branchId?: unknown })[] = teachers,
  options?: BranchVisibilityOptions,
) {
  if (!Array.isArray(records) || !user) return []
  const validRecords = records.filter((teacher) => Boolean(teacher && typeof teacher === 'object' && !Array.isArray(teacher)))
  if (isSuperAdmin(user)) return validRecords
  if (isBranchAdmin(user)) {
    return validRecords.filter((teacher) =>
      canBranchAdminViewRecord(user, teacher, options),
    )
  }
  if (user.role === 'teacher') return validRecords.filter((teacher) => teacher.id === user.linkedId)
  return []
}

export function visibleReferralAgents(
  user: CurrentUser,
  records: readonly ((typeof referralAgents)[number] & { branchId?: unknown })[] = referralAgents,
  options?: BranchVisibilityOptions,
) {
  if (!Array.isArray(records) || !user) return []
  const validRecords = records.filter((agent) => Boolean(agent && typeof agent === 'object' && !Array.isArray(agent)))
  if (isSuperAdmin(user)) return validRecords
  if (isBranchAdmin(user)) {
    return validRecords.filter((agent) =>
      canBranchAdminViewRecord(user, agent, options),
    )
  }
  if (user.role === 'referral_agent') return validRecords.filter((agent) => agent.id === user.linkedId)
  return []
}