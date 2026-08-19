/**
 * use-appointments.ts  — Phase F2
 *
 * TanStack React Query hooks for appointment data.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isMockMode } from '@/lib/api-client'
import { appointmentApi, type AppointmentListParams, type CreateAppointmentBody, type UpdateAppointmentBody } from '@/api/appointment-api'

export const appointmentKeys = {
  all: ['appointments'] as const,
  lists: () => [...appointmentKeys.all, 'list'] as const,
  list: (params: AppointmentListParams) => [...appointmentKeys.lists(), params] as const,
  detail: (id: string) => [...appointmentKeys.all, 'detail', id] as const,
}

export function useAppointments(params: AppointmentListParams = {}) {
  return useQuery({
    queryKey: appointmentKeys.list(params),
    queryFn: () => appointmentApi.list(params),
    enabled: !isMockMode(),
  })
}

export function useAppointment(id: string) {
  return useQuery({
    queryKey: appointmentKeys.detail(id),
    queryFn: () => appointmentApi.getOne(id),
    enabled: !isMockMode() && !!id,
  })
}

export function useCreateAppointment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateAppointmentBody) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return appointmentApi.create(body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Appointment scheduled')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateAppointment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateAppointmentBody }) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return appointmentApi.update(id, body)
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: appointmentKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Appointment updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useChangeAppointmentStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return appointmentApi.changeStatus(id, status)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Status updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
