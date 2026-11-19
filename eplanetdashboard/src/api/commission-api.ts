/**
 * commission-api.ts  — Phase F4
 *
 * Axios wrappers for dream-sky /commissions endpoints.
 *
 * CRITICAL architecture rule: commission amounts are ALWAYS read from
 * the record's own `ruleSnapshot` field — never from the live CommissionRule.
 * The ruleSnapshot is an immutable JSON copy captured at generation time.
 */

import { api } from '@/lib/api-client'

export interface ApiCommissionRule {
  id: string
  name: string
  type: string
  role: string
  triggerStage: string
  amountType: string
  amount: number
  scopeUniversityId: string | null
  effectiveFrom: string | null
  effectiveTo: string | null
  isActive: boolean
  createdAt: string
}

export interface ApiCommission {
  id: string
  recipientId: string
  studentId: string
  ruleId: string | null
  /**
   * IMMUTABLE snapshot of the CommissionRule at generation time.
   * Always read commission amounts from here — never from the live rule.
   */
  ruleSnapshot: ApiCommissionRule
  amount: number
  status: string
  generatedAt: string
  paidAt: string | null
  notes: string | null
  recipient?: { id: string; firstName: string; lastName: string }
  student?: { id: string; firstName: string; lastName: string }
}

export interface CommissionListParams {
  page?: number
  limit?: number
  status?: string
  recipientId?: string
}

export interface CommissionRuleListParams {
  page?: number
  limit?: number
  isActive?: boolean
}

export interface CommissionRuleListResponse {
  rules: ApiCommissionRule[]
  total: number
}

export interface CounselorCommissionProfile {
  counselor: {
    id: string
    name: string
    email: string
    branchName: string
  }
  performance: {
    totalAssigned: number
    totalCounseled: number
    totalApplications: number
    totalVisaApplications: number
    totalVisaApproved: number
    totalDeparted: number
    conversionRate: number
  }
  financials: {
    totalEligible: number
    totalEarned: number
    totalPaid: number
    totalOutstanding: number
    totalPending?: number
    totalDisputed: number
    currency: string
  }
  students: Array<{
    studentId: string
    studentRefId?: string
    studentName: string
    email: string | null
    phone: string | null
    destinationCountry: string
    universityName: string
    courseName: string
    intake: string
    visaStatus: string
    visaGrantDate: string | null
    departureStatus: string
    isCommissionEligible: boolean
    isEligible?: boolean
    commissionAmount: number
    commissionStatus: string
    commissionId: string | null
  }>
  commissionHistory: Array<{
    id: string
    studentId: string
    studentName: string
    amount: number
    currency: string
    status: string
    triggerStage: string
    generatedAt: string
    paidAt: string | null
  }>
}

export interface ReferralAgentCommissionProfile {
  agent: {
    profileId: string
    userId: string
    name: string
    email: string
    referralCode: string
    bankDetails: any
  }
  performance: {
    totalReferred: number
    totalProcessed: number
    totalVisaApplications: number
    totalVisaApproved: number
    totalDeparted: number
    conversionRate: number
  }
  financials: {
    totalEarned: number
    totalPaid: number
    totalOutstanding: number
    currency: string
  }
  referrals: Array<{
    studentId: string
    studentName: string
    email: string | null
    phone: string | null
    referralDate: string
    counselorName: string
    destinationCountry: string
    universityName: string
    courseName: string
    visaStatus: string
    visaGrantDate: string | null
    departureStatus: string
    commissionAmount: number
    commissionStatus: string
    commissionId: string | null
  }>
  commissionHistory: Array<{
    id: string
    studentId: string
    studentName: string
    amount: number
    currency: string
    status: string
    generatedAt: string
    paidAt: string | null
  }>
}

export interface AnnualSettlementData {
  year: number
  summary: {
    totalGenerated: number
    totalPaid: number
    totalOutstanding: number
    currency: string
    commissionsCount: number
  }
  counselors: Array<{
    id: string
    name: string
    email: string
    role: string
    branch?: { id: string; name: string } | null
    approvedCount?: number
    departedCount?: number
    totalCommissionsCount: number
    totalGenerated?: number
    totalEarned: number
    totalPaid: number
    totalOutstanding: number
    currency?: string
    commissionIds: string[]
    pendingCommissionIds?: string[]
  }>
  referralAgents: Array<{
    id: string
    profileId?: string
    name: string
    email: string
    role: string
    referralCode?: string
    approvedCount?: number
    departedCount?: number
    totalCommissionsCount: number
    totalGenerated?: number
    totalEarned: number
    totalPaid: number
    totalOutstanding: number
    currency?: string
    commissionIds: string[]
    pendingCommissionIds?: string[]
  }>
  agents?: Array<{
    id: string
    profileId?: string
    name: string
    email: string
    role: string
    referralCode?: string
    approvedCount?: number
    departedCount?: number
    totalCommissionsCount?: number
    totalGenerated?: number
    totalEarned?: number
    totalPaid: number
    totalOutstanding: number
    currency?: string
    commissionIds?: string[]
    pendingCommissionIds?: string[]
  }>
  commissions: Array<{
    id: string
    recipientId: string
    recipientName: string
    recipientRole: string
    studentId: string
    studentName: string
    amount: number
    currency: string
    status: string
    generatedAt: string
    paidAt: string | null
    paymentReference: string | null
  }>
}

export interface SettleAnnualBody {
  commissionIds: string[]
  paymentReference: string
  paidAt?: string
  notes?: string
}

export const commissionApi = {
  // ── Commission Rules ─────────────────────────────────────────────────────
  listRules(params?: CommissionRuleListParams): Promise<CommissionRuleListResponse> {
    return api.get('/commissions/rules', { params })
  },
  getRule(id: string): Promise<ApiCommissionRule> {
    return api.get(`/commissions/rules/${id}`)
  },
  createRule(body: Omit<ApiCommissionRule, 'id' | 'createdAt'>): Promise<ApiCommissionRule> {
    return api.post('/commissions/rules', body)
  },
  updateRule(id: string, body: Partial<ApiCommissionRule>): Promise<ApiCommissionRule> {
    return api.put(`/commissions/rules/${id}`, body)
  },
  deleteRule(id: string): Promise<void> {
    return api.delete(`/commissions/rules/${id}`)
  },

  // ── Commissions ───────────────────────────────────────────────────────────
  /** GET /commissions — returns a plain array (envelope `data` is the array). */
  list(params?: CommissionListParams): Promise<ApiCommission[]> {
    return api.get('/commissions', { params })
  },
  getOne(id: string): Promise<ApiCommission> {
    return api.get(`/commissions/${id}`)
  },
  markPaid(id: string): Promise<ApiCommission> {
    return api.patch(`/commissions/${id}/mark-paid`, {})
  },
  dispute(id: string, reason: string): Promise<ApiCommission> {
    return api.patch(`/commissions/${id}/dispute`, { reason })
  },

  // ── Commission Profiles & Settlements ─────────────────────────────────────
  async getCounselorProfile(id: string): Promise<CounselorCommissionProfile> {
    try {
      const res = await api.get<CounselorCommissionProfile>(`/commissions/counselor/${id}/profile`)
      if (res && res.counselor) return res
    } catch (err) {
      console.warn('Could not fetch counselor commission profile from live backend:', err)
    }
    return {
      counselor: { id, name: 'Counselor Profile', email: '', branchName: 'Head Office' },
      performance: {
        totalAssigned: 0,
        totalCounseled: 0,
        totalApplications: 0,
        totalVisaApplications: 0,
        totalVisaApproved: 0,
        totalDeparted: 0,
        conversionRate: 0,
      },
      financials: {
        totalEligible: 0,
        totalEarned: 0,
        totalPaid: 0,
        totalOutstanding: 0,
        totalPending: 0,
        totalDisputed: 0,
        currency: 'NPR',
      },
      students: [],
      commissionHistory: [],
    }
  },

  async getReferralAgentProfile(id: string): Promise<ReferralAgentCommissionProfile> {
    try {
      const res = await api.get<ReferralAgentCommissionProfile>(`/commissions/referral-agent/${id}/profile`)
      if (res && res.agent) return res
    } catch (err) {
      console.warn('Could not fetch referral agent commission profile from live backend:', err)
    }
    return {
      agent: { profileId: id, userId: id, name: 'Referral Agent', email: '', referralCode: '', bankDetails: null },
      performance: {
        totalReferred: 0,
        totalProcessed: 0,
        totalVisaApplications: 0,
        totalVisaApproved: 0,
        totalDeparted: 0,
        conversionRate: 0,
      },
      financials: {
        totalEarned: 0,
        totalPaid: 0,
        totalOutstanding: 0,
        currency: 'NPR',
      },
      referrals: [],
      commissionHistory: [],
    }
  },

  getAnnualSettlement(year?: number): Promise<AnnualSettlementData> {
    const targetYear = year || new Date().getFullYear()
    return api.get('/commissions/settlements/annual', { params: { year: targetYear } })
  },

  settleAnnual(body: SettleAnnualBody): Promise<{ settledCount: number; paymentReference: string }> {
    return api.post('/commissions/settlements/annual/pay', body)
  },
}
