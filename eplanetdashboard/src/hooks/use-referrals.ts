/**
 * use-referrals.ts
 *
 * React Query hooks for referrals and referral agents.
 */

import { useQuery } from '@tanstack/react-query'
import { isMockMode } from '@/lib/api-client'
import { referralApi, type ReferralListParams } from '@/api/referral-api'

export const referralKeys = {
  all: ['referrals'] as const,
  lists: () => [...referralKeys.all, 'list'] as const,
  list: (params?: ReferralListParams) => [...referralKeys.lists(), params] as const,
  agents: () => [...referralKeys.all, 'agents'] as const,
}

export function useReferrals(params?: ReferralListParams) {
  return useQuery({
    queryKey: referralKeys.list(params),
    queryFn: () => referralApi.list(params),
    enabled: !isMockMode(),
    staleTime: 60_000,
  })
}

export function useReferralAgents() {
  return useQuery({
    queryKey: referralKeys.agents(),
    queryFn: () => referralApi.listAgents(),
    enabled: !isMockMode(),
    staleTime: 5 * 60_000,
  })
}

