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
  counselorProfile: (id: string) => [...commissionKeys.all, 'counselor-profile', id] as const,
  agentProfile: (id: string) => [...commissionKeys.all, 'agent-profile', id] as const,
  annualSettlement: (year?: number) => [...commissionKeys.all, 'annual-settlement', year] as const,
}

export function useCounselorCommissionProfile(counselorId: string) {
  return useQuery({
    queryKey: commissionKeys.counselorProfile(counselorId),
    queryFn: () => commissionApi.getCounselorProfile(counselorId),
    enabled: Boolean(counselorId),
  })
}

export function useReferralAgentCommissionProfile(agentId: string) {
  return useQuery({
    queryKey: commissionKeys.agentProfile(agentId),
    queryFn: () => commissionApi.getReferralAgentProfile(agentId),
    enabled: Boolean(agentId),
  })
}

export function useAnnualSettlement(year?: number) {
  return useQuery({
    queryKey: commissionKeys.annualSettlement(year),
    queryFn: () => commissionApi.getAnnualSettlement(year),
  })
}

export function useSettleAnnualCommissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: any) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return commissionApi.settleAnnual(body)
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: commissionKeys.all })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`Successfully settled ${data?.settledCount ?? ''} commissions`)
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to settle commissions'),
  })
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

export function useCreateCommissionRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return commissionApi.createRule(body as any)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commissionKeys.rules() })
      toast.success('Commission rule created')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create commission rule'),
  })
}

export function useUpdateCommissionRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return commissionApi.updateRule(id, body as any)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commissionKeys.rules() })
      toast.success('Commission rule updated')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update commission rule'),
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
    mutationFn: ({ id, reason, notes }: { id: string; reason?: string; notes?: string }) => {
      if (isMockMode()) return Promise.resolve(null as never)
      const disputeReason = (reason || notes || '').trim()
      return commissionApi.dispute(id, disputeReason)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commissionKeys.lists() })
      toast.success('Commission dispute filed')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
