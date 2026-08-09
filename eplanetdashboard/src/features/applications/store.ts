import { create } from 'zustand'
import { toast } from 'sonner'
import type { Application, ApplicationStage } from '@/types'
import { applications as seedApplications } from '@/mock'
import { applicationStageMeta } from '@/components/shared/status-badges'

interface ApplicationsState {
  applications: Application[]
  moveApplication: (id: string, stage: ApplicationStage) => void
}

export const useApplicationsStore = create<ApplicationsState>((set) => ({
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
}))
