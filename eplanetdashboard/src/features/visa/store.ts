import { create } from 'zustand'
import { toast } from 'sonner'
import type { VisaCase, VisaStep, VisaStatus } from '@/types'
import { visaCases as seedVisaCases } from '@/mock'

interface VisaState {
  visaCases: VisaCase[]
  updateChecklistItem: (caseId: string, step: VisaStep, status: VisaStatus) => void
  updateOverallStatus: (caseId: string, status: VisaStatus) => void
}

function recalcProgress(checklist: VisaCase['checklist']): number {
  const completed = checklist.filter((item) => item.status === 'approved').length
  return Math.round((completed / checklist.length) * 100)
}

function deriveOverallStatus(progress: number, checklist: VisaCase['checklist']): VisaStatus {
  if (progress === 100) return 'approved'
  if (progress === 0) return 'not_started'
  const hasRejected = checklist.some((item) => item.status === 'rejected')
  if (hasRejected) return 'rejected'
  const hasSubmitted = checklist.some((item) => item.status === 'submitted')
  if (hasSubmitted) return 'submitted'
  return 'in_progress'
}

export const useVisaStore = create<VisaState>((set) => ({
  visaCases: [...seedVisaCases],

  updateChecklistItem: (caseId, step, status) =>
    set((state) => {
      const visaCase = state.visaCases.find((vc) => vc.id === caseId)
      if (!visaCase) return state

      const todayStr = new Date().toISOString().split('T')[0]
      const newChecklist = visaCase.checklist.map((item) =>
        item.step === step
          ? {
              ...item,
              status,
              completedDate: status === 'approved' ? todayStr : item.completedDate,
            }
          : item
      )
      const progress = recalcProgress(newChecklist)
      const overallStatus = deriveOverallStatus(progress, newChecklist)

      toast.success(`Step "${step.replace(/_/g, ' ')}" updated to ${status.replace(/_/g, ' ')}`)
      return {
        visaCases: state.visaCases.map((vc) =>
          vc.id === caseId
            ? { ...vc, checklist: newChecklist, progress, overallStatus }
            : vc
        ),
      }
    }),

  updateOverallStatus: (caseId, status) =>
    set((state) => {
      const visaCase = state.visaCases.find((vc) => vc.id === caseId)
      if (!visaCase) return state

      const todayStr = new Date().toISOString().split('T')[0]
      toast.success(`Visa case overall status updated to ${status.replace(/_/g, ' ')}`)
      return {
        visaCases: state.visaCases.map((vc) =>
          vc.id === caseId
            ? {
                ...vc,
                overallStatus: status,
                decisionDate: status === 'approved' || status === 'rejected' ? todayStr : vc.decisionDate,
              }
            : vc
        ),
      }
    }),
}))
