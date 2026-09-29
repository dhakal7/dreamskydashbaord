/**
 * use-applications.ts  — Phase F3
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isMockMode } from '@/lib/api-client'
import {
  applicationApi,
  type ApplicationListParams,
  type CreateApplicationBody,
} from '@/api/application-api'
import { useApplicationsStore } from '@/features/applications/store'

export const applicationKeys = {
  all: ['applications'] as const,
  lists: () => [...applicationKeys.all, 'list'] as const,
  list: (p: ApplicationListParams) => [...applicationKeys.lists(), p] as const,
  detail: (id: string) => [...applicationKeys.all, 'detail', id] as const,
}

export function useApplications(params: ApplicationListParams = {}) {
  return useQuery({
    queryKey: applicationKeys.list(params),
    queryFn: () => applicationApi.list(params),
    enabled: !isMockMode(),
  })
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: applicationKeys.detail(id),
    queryFn: () => applicationApi.getOne(id),
    enabled: !isMockMode() && !!id,
  })
}

export function useCreateApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateApplicationBody) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return applicationApi.create(body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: applicationKeys.lists() })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Application created')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useChangeApplicationStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return applicationApi.changeStatus(id, status)
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: applicationKeys.detail(id) })
      qc.invalidateQueries({ queryKey: applicationKeys.lists() })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Application status updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useRecordOffer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, offer }: { id: string; offer: { type: string; conditions?: string; deadline?: string } }) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return applicationApi.recordOffer(id, offer)
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: applicationKeys.detail(id) })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Offer recorded')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteApplication() {
  const qc = useQueryClient()
  // Subscribe to the store so we can call removeApplication in mock mode
  const removeFromStore = useApplicationsStore((s) => s.removeApplication)

  return useMutation({
    mutationFn: (id: string) => {
      if (isMockMode()) {
        removeFromStore(id)
        return Promise.resolve()
      }
      return applicationApi.remove(id)
    },
    onSuccess: (_d, id) => {
      if (!isMockMode()) {
        // Only invalidate React Query in real mode; mock mode updates via zustand
        qc.invalidateQueries({ queryKey: applicationKeys.lists() })
        qc.invalidateQueries({ queryKey: applicationKeys.detail(id) })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
      }
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
