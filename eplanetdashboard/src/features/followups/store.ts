import { create } from 'zustand'
import { toast } from 'sonner'
import type { FollowUp } from '@/types'
import { followUps as seedFollowUps } from '@/mock'

interface FollowUpsState {
  followUps: FollowUp[]
  addFollowUp: (data: Omit<FollowUp, 'id' | 'status'>) => FollowUp
  markComplete: (id: string) => void
  reschedule: (id: string, date: string, time: string) => void
  addNote: (id: string, notes: string) => void
}

export const useFollowUpsStore = create<FollowUpsState>((set) => ({
  followUps: seedFollowUps,
  addFollowUp: (data) => {
    const newFollowUp: FollowUp = {
      ...data,
      id: (() => {
        const ids = seedFollowUps
          .map((f) => parseInt(f.id.replace('fu-', ''), 10))
          .filter((n) => !isNaN(n))
        return `fu-${String(Math.max(...ids, 0) + 1).padStart(3, '0')}`
      })(),
      status: 'pending',
    }
    set((state) => ({ followUps: [...state.followUps, newFollowUp] }))
    toast.success(`Follow-up created for ${newFollowUp.studentName}.`)
    return newFollowUp
  },
  markComplete: (id) =>
    set((state) => {
      const followup = state.followUps.find((f) => f.id === id)
      if (followup) {
        toast.success(`Follow-up for ${followup.studentName} marked as completed.`)
      }
      return {
        followUps: state.followUps.map((f) =>
          f.id === id ? { ...f, status: 'completed' } : f
        ),
      }
    }),
  reschedule: (id, date, time) =>
    set((state) => {
      const followup = state.followUps.find((f) => f.id === id)
      if (followup) {
        toast.success(`Follow-up for ${followup.studentName} rescheduled.`)
      }
      return {
        followUps: state.followUps.map((f) =>
          f.id === id ? { ...f, date, time, status: 'rescheduled' } : f
        ),
      }
    }),
  addNote: (id, notes) =>
    set((state) => {
      const followup = state.followUps.find((f) => f.id === id)
      if (followup) {
        toast.success(`Notes updated for ${followup.studentName}'s follow-up.`)
      }
      return {
        followUps: state.followUps.map((f) =>
          f.id === id ? { ...f, notes } : f
        ),
      }
    }),
}))
