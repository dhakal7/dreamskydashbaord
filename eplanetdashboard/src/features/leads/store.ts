import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { toast } from 'sonner'
import type { Lead, LeadStage } from '@/types'
import { leads as seedLeads } from '@/mock'
import { isMockMode } from '@/lib/api-client'
import { leadStageMeta } from '@/components/shared/status-badges'

interface LeadsState {
  leads: Lead[]
  /**
   * Persisted map of leadId → frontend stage override.
   *
   * Used in live mode to remember frontend sub-stages (new, contacted, interested)
   * that don't exist as separate backend stages. Without this, every React Query
   * refetch would snap leads back to 'new' or 'counseling' because the backend only
   * knows LEAD and PROSPECT.
   */
  stageOverrides: Record<string, LeadStage>
  addLead: (data: Omit<Lead, 'id' | 'createdAt' | 'lastContact' | 'nextFollowUp' | 'value'>) => Lead
  moveLead: (id: string, stage: LeadStage) => void
  updateLead: (id: string, data: Partial<Lead>) => void
  /** Permanently remove a lead from the list — used after converting a lead to a student. */
  removeLead: (id: string) => void
  /** Save a frontend stage override so it survives React Query refetches. */
  setStageOverride: (id: string, stage: LeadStage) => void
  /** Remove stage override (called when lead is deleted or converted). */
  clearStageOverride: (id: string) => void
}

export const useLeadsStore = create<LeadsState>()(
  persist(
    (set, get) => ({
      leads: isMockMode() ? seedLeads : [],
      stageOverrides: {},

      addLead: (data) => {
        const current = get().leads
        const numericIds = current
          .map((l) => parseInt(l.id.replace('lead-', ''), 10))
          .filter((n) => !isNaN(n))
        const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0
        const nextNum = maxId + 1

        const now = new Date().toISOString()
        const newLead: Lead = {
          ...data,
          id: `lead-${String(nextNum).padStart(4, '0')}`,
          lastContact: now,
          nextFollowUp: new Date(Date.now() + 7 * 86400000).toISOString(),
          value: Math.floor((data.budgetUsd ?? 5000) * 0.12),
          createdAt: now,
        }
        set({ leads: [...current, newLead] })
        toast.success(`${newLead.name} added as a lead.`)
        return newLead
      },

      moveLead: (id, stage) =>
        set((state) => {
          const lead = state.leads.find((l) => l.id === id)
          if (lead && lead.stage !== stage) {
            const meta = leadStageMeta[stage]
            toast.success(`${lead.name} moved to ${meta?.label ?? stage}`)
          }
          return {
            leads: state.leads.map((l) => (l.id === id ? { ...l, stage } : l)),
          }
        }),

      updateLead: (id, data) =>
        set((state) => {
          const updated = state.leads.map((l) => (l.id === id ? { ...l, ...data } : l))
          toast.success(`Lead details updated successfully`)
          return { leads: updated }
        }),

      removeLead: (id) =>
        set((state) => {
          // Also clean up any stage override for this lead
          const overrides = { ...state.stageOverrides }
          delete overrides[id]
          return {
            leads: state.leads.filter((l) => l.id !== id),
            stageOverrides: overrides,
          }
        }),

      setStageOverride: (id, stage) =>
        set((state) => ({
          stageOverrides: { ...state.stageOverrides, [id]: stage },
        })),

      clearStageOverride: (id) =>
        set((state) => {
          const overrides = { ...state.stageOverrides }
          delete overrides[id]
          return { stageOverrides: overrides }
        }),
    }),
    {
      name: 'dreamsky-leads-store',
    }
  )
)
