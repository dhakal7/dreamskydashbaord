import { useLeadsStore } from '@/features/leads/store'
import { useStudentsStore } from '@/features/students/store'
import { useCommissionStore } from '@/features/commissions/store'
import { useAuthStore } from '@/store/auth-store'
import { commissionRules } from '@/mock'
import { studentApi, type CreateStudentBody } from '@/api/student-api'
import { studentKeys } from '@/hooks/use-students'
import { queryClient } from '@/lib/query-client'
import { isMockMode } from '@/lib/api-client'

/**
 * Converts a lead to a permanent student.
 *
 * REAL mode: creates the student in the backend (POST /students), then moves
 * them to ENROLLED (PATCH /students/:id/pipeline) which makes the backend
 * provision the student portal account and email the temporary credentials
 * from dreamskyadmission@gmail.com.
 *
 * MOCK mode: maps Lead fields to Student fields locally (no backend).
 */
export interface LeadConversionResult {
  studentId: string
  email: string
  /** Only populated in mock mode — in real mode credentials are emailed. */
  portalPassword: string | null
}

export async function convertLeadToStudent(leadId: string): Promise<LeadConversionResult | null> {
  const leadsState = useLeadsStore.getState()
  const lead = leadsState.leads.find((l) => l.id === leadId)
  if (!lead) {
    console.warn(`[lead-conversion] Lead ${leadId} not found`)
    return null
  }

  const currentUser = useAuthStore.getState().currentUser
  if (currentUser.role !== 'super_admin' && currentUser.role !== 'front_desk' && currentUser.role !== 'counselor') {
    console.warn('[lead-conversion] Only front desk, counselors, and super admin can register leads as permanent students')
    return null
  }

  const selectedCounselorId = lead.selectedCounselorId ?? lead.counselorId
  const selectedCounselorName = lead.selectedCounselorName ?? lead.counselorName
  const selectedCountry = lead.selectedCountry ?? lead.interestedCountry
  const assignment = lead.countryCounselorAssignments?.find((item) => item.country === selectedCountry) ?? {
    country: selectedCountry,
    counselorId: selectedCounselorId,
    counselorName: selectedCounselorName,
  }

  let backendStudentId: string | null = null

  // ── REAL MODE: persist the student and enroll them so the welcome email fires ──
    const nameParts = lead.name.trim().split(/\s+/)
    const firstName = nameParts[0] || 'Unknown'
    const lastName = nameParts.slice(1).join(' ') || firstName || 'Student'
    const body: CreateStudentBody = {
      firstName,
      lastName,
      email: lead.email && lead.email.trim() ? lead.email.trim() : undefined,
      phone: lead.phone?.trim() || undefined,
      nationality: 'Nepali',
      source: 'OTHER',
      assignedCounselorId: selectedCounselorId ?? undefined,
      referredByAgentId: lead.referralAgentId ?? undefined,
    }

    const created = await studentApi.create(body)
    await studentApi.changePipeline(created.id, { stage: 'ENROLLED' })
    backendStudentId = created.id

    // Refresh the students list so the new student appears immediately.
    queryClient.invalidateQueries({ queryKey: studentKeys.lists() })
  }

  // ── LOCAL STORE: keep the UI consistent in both modes ──────────────────────────
  const addStudent = useStudentsStore.getState().addStudent
  const addCommission = useCommissionStore.getState().addCommission
  const portalPassword = `DreamSky@${(lead.phone.replace(/\D/g, '').slice(-4) || '0000')}`
  const newStudent = addStudent({
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    photoColor: lead.photoColor,
    dob: '2000-01-01',
    gender: 'other',
    nationality: 'Nepali',
    passportNumber: 'PENDING',
    address: lead.address ?? 'TBD',
    status: 'active',
    counselorId: selectedCounselorId,
    counselorName: selectedCounselorName,
    selectedCountry,
    selectedCounselorId,
    selectedCounselorName,
    countryCounselorAssignments: lead.countryCounselorAssignments ?? [assignment],
    preferredCountries: [selectedCountry],
    preferredLevel: lead.interestedLevel,
    budgetUsd: lead.budgetUsd ?? 0,
    englishTest: {
      type: 'None',
    },
    academics: [],
    parents: [],
    tags: [],
    portalPassword,
  })

  const counselorRule = commissionRules.find((rule) => rule.appliesToRole === 'counselor' && rule.active)
  if (counselorRule && selectedCounselorId) {
    const amount = counselorRule.type === 'fixed'
      ? counselorRule.value
      : Math.round((lead.budgetUsd ?? 0) * counselorRule.value / 100)
    addCommission({
      earnerType: 'counselor',
      earnerId: selectedCounselorId,
      earnerName: selectedCounselorName,
      studentId: newStudent.id,
      studentName: newStudent.name,
      ruleId: counselorRule.id,
      ruleSnapshot: { name: counselorRule.name, type: counselorRule.type, value: counselorRule.value, triggerStage: counselorRule.triggerStage },
      amountUsd: amount,
    })
  }

  if (lead.referralAgentId) {
    const agentRule = commissionRules.find((rule) => rule.appliesToRole === 'referral_agent' && rule.active)
    if (agentRule) {
      const amount = agentRule.type === 'fixed'
        ? agentRule.value
        : Math.round((lead.budgetUsd ?? 0) * agentRule.value / 100)
      addCommission({
        earnerType: 'referral_agent',
        earnerId: lead.referralAgentId,
        earnerName: lead.referralAgentName ?? 'Referral Agent',
        studentId: newStudent.id,
        studentName: newStudent.name,
        ruleId: agentRule.id,
        ruleSnapshot: { name: agentRule.name, type: agentRule.type, value: agentRule.value, triggerStage: agentRule.triggerStage },
        amountUsd: amount,
      })
    }
  }

  // Remove the lead from the leads list entirely — they are now a student.
  // In mock mode this keeps the stores in sync.
  // In real mode the lead was never in the backend, so only the local store needs updating.
  leadsState.removeLead(leadId)

  return {
    studentId: backendStudentId ?? newStudent.id,
    email: lead.email,
    portalPassword: isMockMode() ? portalPassword : null,
  }
}
