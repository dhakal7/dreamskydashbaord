import { create } from 'zustand'
import { toast } from 'sonner'
import type { Application, ApplicationStage } from '@/types'
import { applications as seedApplications } from '@/mock'

import { applicationStageMeta } from '@/components/shared/status-badges'

interface ApplicationsState {
  applications: Application[]
  moveApplication: (id: string, stage: ApplicationStage) => void
  addApplication: (data: Omit<Application, 'id' | 'applicationRef' | 'submittedDate' | 'lastUpdate'>) => void
  removeApplication: (id: string) => void
}

export const useApplicationsStore = create<ApplicationsState>((set, get) => ({
  applications: seedApplications,
  moveApplication: (id, stage) =>
    set((state) => {
      const app = state.applications.find((a) => a.id === id)
      if (app && app.stage !== stage) {
        const todayStr = new Date().toISOString().split('T')[0]
        toast.success(`Application ${app.applicationRef} moved to ${applicationStageMeta[stage].label}`)
        return {
          applications: state.applications.map((a) =>
            a.id === id ? { ...a, stage, lastUpdate: todayStr } : a
          ),
        }
      }
      return { applications: state.applications }
    }),
  addApplication: (data) => {
    const current = get().applications
    const nextNum = current.length + 1
    const todayStr = new Date().toISOString().split('T')[0]
    const newApp: Application = {
      ...data,
      id: `app-${String(nextNum).padStart(3, '0')}`,
      applicationRef: `EPC-APP-${String(nextNum).padStart(5, '0')}`,
      submittedDate: todayStr,
      lastUpdate: todayStr,
    }
    set({ applications: [...current, newApp] })
    toast.success(`Application created for ${newApp.studentName}`)
  },
  removeApplication: (id) =>
    set((state) => {
      const app = state.applications.find((item) => item.id === id)
      if (app) {
        toast.success(`Application ${app.applicationRef} deleted.`)
      }
      return {
        applications: state.applications.filter((item) => item.id !== id),
      }
    }),
}))
