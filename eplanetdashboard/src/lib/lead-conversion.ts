import { useLeadsStore } from '@/features/leads/store'
import { useStudentsStore } from '@/features/students/store'
import { useCommissionStore } from '@/features/commissions/store'
import { useAuthStore } from '@/store/auth-store'
import { commissionRules } from '@/mock'
import { studentApi } from '@/api/student-api'
import { studentKeys } from '@/hooks/use-students'
import { queryClient } from '@/lib/query-client'
import { isMockMode } from '@/lib/api-client'
import type { Lead } from '@/types'

/**
 * Converts a lead to a permanent student.
 *
 * REAL mode: the lead already exists in the backend as a student with
 * currentStage=LEAD or PROSPECT. We simply promote them to ENROLLED via
 * PATCH /students/:id/pipeline — the backend provisions the portal account
 * and emails temporary credentials from dreamskyadmission@gmail.com.
 *
 * MOCK mode: maps Lead fields to Student fields locally (no backend).
 */
export interface LeadConversionResult {
  studentId: string
  email: string
  /** Only populated in mock mode — in real mode credentials are emailed. */
  portalPassword: string | null
}

/**
 * Accepts the full Lead object to avoid the "lead not found in local store"
 * bug that occurred in live mode where leads come from the backend, not local store.
 */
export async function convertLeadToStudent(lead: Lead, emailOverride?: string): Promise<LeadConversionResult | null> {
  if (!lead) {
    console.warn('[lead-conversion] No lead provided')
    return null
  }

  const currentUser = useAuthStore.getState().currentUser
  if (
    currentUser.role !== 'super_admin' &&
    currentUser.role !== 'front_desk' &&
    currentUser.role !== 'counselor'
  ) {
    console.warn('[lead-conversion] Only front desk, counselors, and super admin can register leads as permanent students')
    return null
  }

  const finalEmail = (emailOverride?.trim() || lead.email)?.trim()

  // ── REAL MODE: promote the existing backend record to ENROLLED ─────────────
  if (!isMockMode()) {
    // The lead is already stored in the backend as a student at LEAD/PROSPECT stage.
    // Promote pipeline stage to ENROLLED with the mandatory student email.
    // The backend provisions the student portal account and emails temporary credentials.
    await studentApi.changePipeline(lead.id, {
      stage: 'ENROLLED',
      email: finalEmail || undefined,
    })

    // Clean up any persisted frontend stage override for this lead
    useLeadsStore.getState().clearStageOverride(lead.id)

    // Invalidate ALL student queries — this refreshes:
    //   1. The leads list (LEAD/PROSPECT) so the card disappears from Leads page
    //   2. The students list (ENROLLED+) so the student appears on Students page
    //   3. The dashboard stats
    queryClient.invalidateQueries({ queryKey: studentKeys.all })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })

    return {
      studentId: lead.id,
      email: finalEmail,
      portalPassword: null,
    }
  }

  // ── MOCK MODE: keep full local-store behavior (no backend) ─────────────────
  const leadsState = useLeadsStore.getState()
  const addStudent = useStudentsStore.getState().addStudent
  const addCommission = useCommissionStore.getState().addCommission

  const selectedCounselorId = lead.selectedCounselorId ?? lead.counselorId
  const selectedCounselorName = lead.selectedCounselorName ?? lead.counselorName
  const selectedCountry = lead.selectedCountry ?? lead.interestedCountry
  const assignment = lead.countryCounselorAssignments?.find((item) => item.country === selectedCountry) ?? {
    country: selectedCountry,
    counselorId: selectedCounselorId,
    counselorName: selectedCounselorName,
  }

  const portalPassword = `DreamSky@${(lead.phone.replace(/\D/g, '').slice(-4) || '0000')}`
  const newStudent = addStudent({
    name: lead.name,
    email: finalEmail || lead.email,
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
    englishTest: { type: 'None' },
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

  // Remove the lead from the local leads list — they are now a student.
  leadsState.removeLead(lead.id)

  return {
    studentId: newStudent.id,
    email: lead.email,
    portalPassword,
  }
}
