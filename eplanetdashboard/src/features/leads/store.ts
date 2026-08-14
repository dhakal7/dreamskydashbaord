import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { toast } from 'sonner'
import type { Lead, LeadStage } from '@/types'
import { leads as seedLeads } from '@/mock'
import { leadStageMeta } from '@/components/shared/status-badges'

interface LeadsState {
  leads: Lead[]
  addLead: (data: Omit<Lead, 'id' | 'createdAt' | 'lastContact' | 'nextFollowUp' | 'value'>) => Lead
  moveLead: (id: string, stage: LeadStage) => void
  updateLead: (id: string, data: Partial<Lead>) => void
  /** Permanently remove a lead from the list — used after converting a lead to a student. */
  removeLead: (id: string) => void
}

export const useLeadsStore = create<LeadsState>()(
  persist(
    (set, get) => ({
      leads: seedLeads,

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
        set((state) => ({
          leads: state.leads.filter((l) => l.id !== id),
        })),
    }),
    {
      name: 'dreamsky-leads-store',
    }
  )
)
