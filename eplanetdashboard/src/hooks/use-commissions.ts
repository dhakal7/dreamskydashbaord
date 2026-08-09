/**
 * use-commissions.ts  — Phase F4
 *
 * TanStack React Query hooks for commissions and commission rules.
 *
 * IMPORTANT: All commission amounts MUST be read from ruleSnapshot, never
 * from the live CommissionRule. This is enforced in the API layer and
 * documented here so hook consumers don't accidentally bypass it.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isMockMode } from '@/lib/api-client'
import { commissionApi, type CommissionListParams, type CommissionRuleListParams } from '@/api/commission-api'

export const commissionKeys = {
  all: ['commissions'] as const,
  lists: () => [...commissionKeys.all, 'list'] as const,
  list: (p: CommissionListParams) => [...commissionKeys.lists(), p] as const,
  detail: (id: string) => [...commissionKeys.all, 'detail', id] as const,
  rules: () => [...commissionKeys.all, 'rules'] as const,
  ruleList: (p: CommissionRuleListParams) => [...commissionKeys.rules(), p] as const,
}

export function useCommissions(params: CommissionListParams = {}) {
  return useQuery({
    queryKey: commissionKeys.list(params),
    queryFn: () => commissionApi.list(params),
    enabled: !isMockMode(),
  })
}

export function useCommissionRules(params: CommissionRuleListParams = {}) {
  return useQuery({
    queryKey: commissionKeys.ruleList(params),
    queryFn: () => commissionApi.listRules(params),
    enabled: !isMockMode(),
  })
}

export function useMarkCommissionPaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return commissionApi.markPaid(id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commissionKeys.lists() })
      toast.success('Commission marked as paid')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDisputeCommission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return commissionApi.dispute(id, notes)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commissionKeys.lists() })
      toast.success('Commission dispute filed')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
