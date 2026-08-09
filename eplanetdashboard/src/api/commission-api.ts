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
  dispute(id: string, notes: string): Promise<ApiCommission> {
    return api.patch(`/commissions/${id}/dispute`, { notes })
  },
}
