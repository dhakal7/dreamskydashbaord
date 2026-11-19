/**
 * use-visa.ts  — Phase F3
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isMockMode } from '@/lib/api-client'
import { visaApi, type VisaCaseListParams, type CreateVisaCaseBody } from '@/api/visa-api'

export const visaKeys = {
  all: ['visa-cases'] as const,
  lists: () => [...visaKeys.all, 'list'] as const,
  list: (p: VisaCaseListParams) => [...visaKeys.lists(), p] as const,
  detail: (id: string) => [...visaKeys.all, 'detail', id] as const,
  granted: (p?: any) => [...visaKeys.all, 'granted', p] as const,
  grantedAnalytics: () => [...visaKeys.all, 'granted-analytics'] as const,
}

export function useVisaGrantedStudents(params: any = {}) {
  return useQuery({
    queryKey: visaKeys.granted(params),
    queryFn: () => visaApi.listGranted(params),
    enabled: !isMockMode(),
  })
}

export function useVisaGrantedAnalytics() {
  return useQuery({
    queryKey: visaKeys.grantedAnalytics(),
    queryFn: () => visaApi.grantedAnalytics(),
    enabled: !isMockMode(),
  })
}

export function useUpdateDeparture() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ studentId, body }: { studentId: string; body: any }) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return visaApi.updateDeparture(studentId, body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: visaKeys.all })
      qc.invalidateQueries({ queryKey: ['students'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['commissions'] })
      toast.success('Departure status updated successfully')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update departure status'),
  })
}

export function useVisaCases(params: VisaCaseListParams = {}) {
  return useQuery({
    queryKey: visaKeys.list(params),
    queryFn: () => visaApi.list(params),
    enabled: !isMockMode(),
  })
}

export function useVisaCase(id: string) {
  return useQuery({
    queryKey: visaKeys.detail(id),
    queryFn: () => visaApi.getOne(id),
    enabled: !isMockMode() && !!id,
  })
}

export function useCreateVisaCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateVisaCaseBody) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return visaApi.create(body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: visaKeys.lists() })
      qc.invalidateQueries({ queryKey: ['applications'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Visa case created')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useChangeVisaStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return visaApi.changeStatus(id, status)
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: visaKeys.detail(id) })
      qc.invalidateQueries({ queryKey: visaKeys.lists() })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Visa status updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteVisaCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => {
      if (isMockMode()) return Promise.resolve()
      return visaApi.remove(id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: visaKeys.lists() })
      qc.invalidateQueries({ queryKey: ['applications'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Visa case deleted')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || 'Failed to delete visa case'
      toast.error(msg)
    },
  })
}
