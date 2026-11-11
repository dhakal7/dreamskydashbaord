/**
 * referral-api.ts
 *
 * Axios wrappers for dream-sky /referrals and /users/referral-agents endpoints.
 */

import { api } from '@/lib/api-client'
import type { Referral, ReferralAgent } from '@/types'

export interface ReferralListParams {
  search?: string
  stage?: string
  agentId?: string
}

export const referralApi = {
  async list(params?: ReferralListParams): Promise<Referral[]> {
    const res = await api.get<any>('/referrals', { params })
    return Array.isArray(res) ? res : (res?.data ?? [])
  },

  async listAgents(params?: { search?: string }): Promise<ReferralAgent[]> {
    const res = await api.get<any>('/users/referral-agents', { params })
    const list = Array.isArray(res) ? res : (res?.data ?? [])
    return list.map((a: any) => ({
      id: a.id || a.userId,
      name: a.name || `${a.firstName || ''} ${a.lastName || ''}`.trim() || 'Agent',
      email: a.email || '',
      phone: a.phone || '',
      avatarColor: '#2563EB',
      agencyName: a.agencyName || 'Independent',
      referralCode: a.referralCode || 'N/A',
      totalReferrals: a.totalReferrals || 0,
      convertedReferrals: a.convertedReferrals || 0,
      createdAt: a.createdAt || new Date().toISOString(),
    }))
  },
}

