import { create } from 'zustand'
import type { CommissionRuleType, CommissionTriggerStage } from '@/types'
import { referralAgents } from '@/mock/staff'
import { commissionRules as defaultCommissionRules } from '@/mock/commissions'

export interface AgentCommissionRule {
  agentId: string
  agentName: string
  type: CommissionRuleType
  value: number
  triggerStage: CommissionTriggerStage
  active: boolean
}

interface CommissionSettingsState {
  counselorType: CommissionRuleType
  counselorValue: number
  counselorTrigger: CommissionTriggerStage

  agentRules: AgentCommissionRule[]

  setCounselorType: (type: CommissionRuleType) => void
  setCounselorValue: (value: number) => void
  setCounselorTrigger: (trigger: CommissionTriggerStage) => void

  updateAgentRule: (agentId: string, field: keyof AgentCommissionRule, value: string | number | boolean) => void
}

function getInitialAgentRules(): AgentCommissionRule[] {
  const existingRule = defaultCommissionRules.find(
    (r) => r.appliesToRole === 'referral_agent' && r.active,
  )
  return referralAgents.map((agent) => ({
    agentId: agent.id,
    agentName: agent.name,
    type: existingRule?.type ?? 'fixed',
    value: existingRule?.value ?? 100,
    triggerStage: existingRule?.triggerStage ?? 'fee_paid',
    active: true,
  }))
}

export const useCommissionSettingsStore = create<CommissionSettingsState>((set) => {
  const existingCounselorRule = defaultCommissionRules.find(
    (r) => r.appliesToRole === 'counselor' && r.active,
  )

  return {
    counselorType: existingCounselorRule?.type ?? 'fixed',
    counselorValue: existingCounselorRule?.value ?? 150,
    counselorTrigger: existingCounselorRule?.triggerStage ?? 'enrolled',

    agentRules: getInitialAgentRules(),

    setCounselorType: (type) => set({ counselorType: type }),
    setCounselorValue: (value) => set({ counselorValue: value }),
    setCounselorTrigger: (trigger) => set({ counselorTrigger: trigger }),

    updateAgentRule: (agentId, field, value) =>
      set((prev) => ({
        agentRules: prev.agentRules.map((r) =>
          r.agentId === agentId ? { ...r, [field]: value } : r,
        ),
      })),
  }
})
