import { useQuery } from '@tanstack/react-query'
import { isMockMode } from '@/lib/api-client'
import { userApi, type ReferralAgentOption } from '@/api/user-api'
import { referralAgents as mockReferralAgents } from '@/mock'

export const referralAgentKeys = {
  all: ['referral-agents'] as const,
  list: (search?: string) => [...referralAgentKeys.all, 'list', search ?? ''] as const,
}

export function useReferralAgents(search?: string, enabled = true) {
  return useQuery<ReferralAgentOption[]>({
    queryKey: referralAgentKeys.list(search),
    queryFn: async () => {
      if (isMockMode()) {
        const query = (search ?? '').toLowerCase().trim()
        const mockList: ReferralAgentOption[] = mockReferralAgents.map((a) => ({
          id: a.id,
          userId: a.id,
          profileId: a.id,
          name: a.name,
          email: a.email,
          phone: a.phone,
          referralCode: a.referralCode,
        }))
        if (!query) return mockList.slice(0, 10)
        return mockList.filter(
          (a) =>
            a.name.toLowerCase().includes(query) ||
            a.email.toLowerCase().includes(query) ||
            (a.referralCode && a.referralCode.toLowerCase().includes(query))
        )
      }
      return userApi.getReferralAgents(search)
    },
    enabled,
    staleTime: 60 * 1000,
  })
}
