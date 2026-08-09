import { create } from 'zustand'
import type { Commission, CommissionStatus } from '@/types'
import { allCommissions as seedCommissions } from '@/mock/commissions'

export type CommissionMilestone = 'pending' | 'visa_granted' | 'travelled'

interface CommissionState {
  commissions: Commission[]
  addCommission: (data: Omit<Commission, 'id' | 'status' | 'generatedAt' | 'milestoneStatus' | 'milestoneReachedAt'>) => Commission
  updateCommissionStatus: (id: string, status: CommissionStatus) => void
  markMilestone: (id: string, milestone: CommissionMilestone) => void
}

const initialCommissions: Commission[] = seedCommissions.map((commission) => ({
  ...commission,
  milestoneStatus: 'pending',
  milestoneReachedAt: undefined,
}))

export const useCommissionStore = create<CommissionState>((set) => ({
  commissions: initialCommissions,

  addCommission: (data) => {
    const commission: Commission = {
      ...data,
      id: `comm-${Date.now()}`,
      status: 'pending',
      generatedAt: new Date().toISOString(),
      milestoneStatus: 'pending',
      milestoneReachedAt: undefined,
    }

    set((state) => ({ commissions: [commission, ...state.commissions] }))
    return commission
  },

  updateCommissionStatus: (id, status) => {
    set((state) => ({
      commissions: state.commissions.map((commission) => commission.id === id ? { ...commission, status } : commission),
    }))
  },

  markMilestone: (id, milestone) => {
    const now = new Date().toISOString()
    set((state) => ({
      commissions: state.commissions.map((commission) => {
        if (commission.id !== id) return commission

        if (milestone === 'visa_granted') {
          return {
            ...commission,
            milestoneStatus: 'visa_granted',
            milestoneReachedAt: now,
            status: 'approved',
          }
        }

        return {
          ...commission,
          milestoneStatus: 'travelled',
          milestoneReachedAt: now,
          status: 'paid',
        }
      }),
    }))
  },
}))
