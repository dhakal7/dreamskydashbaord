// ── Shared enums ──────────────────────────────────────────────────────────

export type Role = 'super_admin' | 'front_desk' | 'counselor' | 'teacher' | 'student' | 'referral_agent'

export type UserStatus = 'active' | 'suspended' | 'invited'

export interface UserAccount {
  id: string
  name: string
  email: string
  role: Role
  status: UserStatus
  branchId?: string
  branchName?: string
  avatarColor: string
  lastLoginAt: string
  createdAt: string
  linkedId: string
}

export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export type LeadStage =
  | 'new'
  | 'contacted'
  | 'counseling'
  | 'interested'
  | 'application'
  | 'offer_letter'
  | 'visa'
  | 'travel'
  | 'completed'

export type LeadSource =
  | 'website'
  | 'facebook'
  | 'referral_agent'
  | 'walk_in'
  | 'education_fair'
  | 'google_ads'
  | 'instagram'

export type ApplicationStage =
  | 'submitted'
  | 'university_review'
  | 'conditional_offer'
  | 'unconditional_offer'
  | 'accepted'
  | 'rejected'

export type VisaStep =
  | 'medical'
  | 'biometric'
  | 'financial'
  | 'interview'
  | 'embassy_submission'
  | 'decision'

export type VisaStatus = 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'rejected'

export type FollowUpStatus = 'pending' | 'completed' | 'missed' | 'rescheduled'

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'

export type DocumentType =
  | 'passport'
  | 'citizenship'
  | 'academic'
  | 'cv'
  | 'sop'
  | 'recommendation'
  | 'financial'
  | 'offer_letter'
  | 'visa_letter'

export type StudyLevel = 'foundation' | 'diploma' | 'bachelor' | 'master' | 'phd'

// ── People ───────────────────────────────────────────────────────────────

export interface Counselor {
  id: string
  name: string
  email: string
  avatarColor: string
  role: 'counselor' | 'senior_counselor' | 'branch_manager' | 'admin'
  studentsHandled: number
  conversionRate: number
  branchId?: string
}

export interface Parent {
  id: string
  name: string
  relation: 'father' | 'mother' | 'guardian'
  phone: string
  email?: string
  occupation?: string
}

// ── Country / University / Course ───────────────────────────────────────

export interface Country {
  id: string
  name: string
  code: string
  flag: string
  universityCount: number
  studentCount: number
  popularCourses: string[]
  visaDifficulty: 'easy' | 'moderate' | 'strict'
  avgTuitionUsd: number
}

export interface University {
  id: string
  name: string
  countryId: string
  countryName: string
  flag: string
  city: string
  ranking: number
  logoInitial: string
  scholarshipAvailable: boolean
  scholarshipDetail?: string
  applicationDeadline: string
  acceptanceRate: number
  tuitionFromUsd: number
  intakes: string[]
  courseCount: number
}

export interface Course {
  id: string
  name: string
  universityId: string
  universityName: string
  countryName: string
  level: StudyLevel
  duration: string
  intake: string[]
  tuitionUsd: number
  field: string
}

// ── Student ──────────────────────────────────────────────────────────────

export type ProcessingType = 'self' | 'partner_consultancy'

export interface PartnerConsultancy {
  id: string
  name: string
  createdAt?: string
}

export interface EnglishTest {
  type: 'IELTS' | 'PTE' | 'TOEFL' | 'Duolingo' | 'None'
  overallScore?: number
  listening?: number
  reading?: number
  writing?: number
  speaking?: number
  testDate?: string
}

export interface AcademicRecord {
  level: string
  institution: string
  board: string
  gpaOrPercentage: string
  passedYear: string
}

export interface Student {
  id: string
  studentId: string // human readable ID e.g. EPC-2026-0001
  name: string
  photoColor: string
  email: string
  phone: string
  dob: string
  gender: 'male' | 'female' | 'other'
  nationality: string
  passportNumber: string
  address: string
  status: 'active' | 'inactive' | 'enrolled' | 'dropped'
  counselorId: string
  counselorName: string
  processingType?: ProcessingType
  partnerConsultancyId?: string
  partnerConsultancyName?: string
  selectedCountry?: string
  selectedCounselorId?: string
  selectedCounselorName?: string
  countryCounselorAssignments?: Array<{
    country: string
    counselorId: string
    counselorName: string
  }>
  preferredCountries: string[]
  preferredLevel: StudyLevel
  budgetUsd: number
  englishTest: EnglishTest
  academics: AcademicRecord[]
  parents: Parent[]
  documentsUploaded: number
  documentsRequired: number
  createdAt: string
  tags: string[]
  portalPassword?: string
}

export type StudentLifecycleStage =
  | 'lead_created'
  | 'inquiry'
  | 'counseling'
  | 'document_collection'
  | 'application_submission'
  | 'offer_letter'
  | 'payment'
  | 'visa_processing'
  | 'interview'
  | 'visa_approved'
  | 'pre_departure'
  | 'travel_completed'

export interface StudentLifecycleEvent {
  id: string
  stage: StudentLifecycleStage
  title: string
  description: string
  timestamp: string
}

// ── Lead ─────────────────────────────────────────────────────────────────

export interface Lead {
  id: string
  name: string
  email: string
  phone: string
  photoColor: string
  source: LeadSource
  stage: LeadStage
  counselorId: string
  counselorName: string
  selectedCountry?: string
  selectedCounselorId?: string
  selectedCounselorName?: string
  countryCounselorAssignments?: Array<{
    country: string
    counselorId: string
    counselorName: string
  }>
  interestedCountry: string
  interestedLevel: StudyLevel
  budgetUsd?: number
  address?: string
  priority: Priority
  referralAgentId?: string
  referralAgentName?: string
  lastContact: string
  nextFollowUp: string
  createdAt: string
  value: number
  notes: string
}

// ── Follow-up ────────────────────────────────────────────────────────────

export interface FollowUp {
  id: string
  studentId: string
  studentName: string
  counselorId: string
  counselorName: string
  reminder: string
  priority: Priority
  status: FollowUpStatus
  date: string
  time: string
  channel: 'call' | 'email' | 'whatsapp' | 'in_person' | 'sms'
  notes?: string
}

// ── Appointment ──────────────────────────────────────────────────────────

export interface Appointment {
  id: string
  title: string
  studentId: string
  studentName: string
  counselorId: string
  counselorName: string
  counselorIds?: string[]
  counselorNames?: string[]
  start: string // ISO datetime
  end: string // ISO datetime
  status: AppointmentStatus
  type: 'counseling' | 'document_review' | 'visa_prep' | 'follow_up' | 'orientation'
  location: 'branch_office' | 'video_call' | 'phone_call'
}

// ── Application ──────────────────────────────────────────────────────────

export interface Application {
  id: string
  applicationRef: string
  studentId: string
  studentName: string
  universityId: string
  universityName: string
  countryName: string
  courseName: string
  counselorName: string
  stage: ApplicationStage
  submittedDate: string
  intake: string
  tuitionUsd: number
  lastUpdate: string
}

// ── Visa ─────────────────────────────────────────────────────────────────

export interface VisaChecklistItem {
  step: VisaStep
  status: VisaStatus
  completedDate?: string
  notes?: string
}

export interface VisaCase {
  id: string
  studentId: string
  studentName: string
  countryName: string
  universityName: string
  checklist: VisaChecklistItem[]
  overallStatus: VisaStatus
  progress: number
  submissionDate?: string
  decisionDate?: string
  visaOfficer?: string
}

// ── Documents ────────────────────────────────────────────────────────────

export interface StudentDocument {
  id: string
  studentId: string
  studentName: string
  type: DocumentType
  fileName: string
  previewUrl?: string
  fileSizeKb: number
  version: number
  uploadedAt: string
  uploadedBy: string
  status: 'pending_review' | 'verified' | 'rejected'
}

// ── Activity / Timeline ─────────────────────────────────────────────────

export interface ActivityItem {
  id: string
  type: 'note' | 'status_change' | 'document' | 'call' | 'email' | 'application' | 'visa' | 'meeting'
  title: string
  description: string
  actor: string
  timestamp: string
  entityId: string
  entityType: 'student' | 'lead'
}

// ── Notifications ────────────────────────────────────────────────────────

export interface AppNotification {
  id: string
  title: string
  description: string
  timestamp: string
  read: boolean
  type: 'follow_up' | 'application' | 'visa' | 'document' | 'system' | 'fee_due'
  targetScope?: 'all_students' | 'staff_only' | 'individual'
  recipientIds?: string[]
  recipientCount?: number
  recipientEmails?: string[]
  sendEmail?: boolean | ((payload: { to: string[]; subject: string; body: string }) => boolean)
}

export interface NotificationTemplate {
  id: string
  title: string
  description: string
  type: AppNotification['type']
}

// ── Branch ───────────────────────────────────────────────────────────────

export interface Branch {
  id: string
  name: string
  city: string
  isHeadOffice: boolean
  managerName: string
  staffCount: number
  studentCount: number
  monthlyRevenueUsd: number
  monthlyTargetUsd: number
}

// ── Current / logged-in user (mock auth) ────────────────────────────────

export interface CurrentUser {
  id: string
  name: string
  email: string
  role: Role
  avatarColor: string
  branchId: string
  branchName: string
  linkedId: string // id into the role-specific collection (counselor/teacher/student/agent)
}

// ── Teacher / Class Module ──────────────────────────────────────────────

export interface Teacher {
  id: string
  name: string
  email: string
  avatarColor: string
  subjects: ('IELTS' | 'PTE' | 'TOEFL' | 'Spoken English' | 'Duolingo')[]
  classesHandled: number
  studentsHandled: number
  branchId?: string
}

export interface ClassSession {
  id: string
  name: string
  subject: 'IELTS' | 'PTE' | 'TOEFL' | 'Spoken English' | 'Duolingo'
  teacherId: string
  teacherName: string
  schedule: string // e.g. "Sun/Tue/Thu · 5:00 PM"
  startDate: string
  endDate: string
  room: string
  capacity: number
  enrolledCount: number
  status: 'upcoming' | 'ongoing' | 'completed'
  nextSessionAt: string
}

export interface Enrollment {
  id: string
  classId: string
  studentId: string
  studentName: string
  enrolledAt: string
  progress: number // 0-100
  attendancePct: number
}

export interface AttendanceRecord {
  id: string
  classId: string
  className: string
  date: string
  presentCount: number
  absentCount: number
  totalCount: number
}

export interface ClassMaterial {
  id: string
  classId: string
  title: string
  type: 'assignment' | 'material' | 'note'
  uploadedAt: string
  dueDate?: string
  fileName?: string
  fileSize?: number
  fileType?: string
  fileUrl?: string
}

// ── Events ─────────────────────────────────────────────────────────────

export type EventType = 'seminar' | 'uni_visit' | 'fair' | 'webinar' | 'meeting'
export type EventReminderSchedule = '-1mo' | '-1wk' | '-1d' | '0'
export type EventAudienceScope = 'staff' | 'student' | 'everyone'

export interface Event {
  id: string
  name: string
  type: EventType
  date: string
  location: string
  scope: EventAudienceScope
  audienceRoles: Role[]
  reminderSchedule: EventReminderSchedule[]
  notificationEnabled: boolean
}

// ── Referral Agent Portal ───────────────────────────────────────────────

export interface ReferralAgent {
  id: string
  name: string
  email: string
  phone: string
  avatarColor: string
  agencyName?: string
  referralCode: string
  totalReferrals: number
  convertedReferrals: number
  createdAt: string
}

export interface Referral {
  id: string
  agentId: string
  studentId: string
  studentName: string
  stage: LeadStage
  referredAt: string
  potentialCommissionUsd: number
}

// ── Commission Engine ────────────────────────────────────────────────────

export type CommissionRuleType = 'fixed' | 'percentage' | 'tiered'
export type CommissionTriggerStage = 'offer_received' | 'fee_paid' | 'visa_granted' | 'enrolled'
export type CommissionStatus = 'pending' | 'approved' | 'paid' | 'disputed'
export type CommissionMilestone = 'pending' | 'visa_granted' | 'travelled'

export interface CommissionRule {
  id: string
  name: string
  appliesToRole: 'counselor' | 'referral_agent'
  type: CommissionRuleType
  value: number // flat amount, percentage, or base tier value
  triggerStage: CommissionTriggerStage
  effectiveFrom: string
  effectiveTo?: string
  active: boolean
}

export interface Commission {
  id: string
  earnerType: 'counselor' | 'referral_agent'
  earnerId: string
  earnerName: string
  studentId: string
  studentName: string
  ruleId: string
  ruleSnapshot: Pick<CommissionRule, 'name' | 'type' | 'value' | 'triggerStage'>
  amountUsd: number
  status: CommissionStatus
  milestoneStatus?: CommissionMilestone
  milestoneReachedAt?: string
  generatedAt: string
  paidAt?: string
}
