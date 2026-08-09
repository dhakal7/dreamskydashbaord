/**
 * use-events.ts  — Phase F4
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isMockMode } from '@/lib/api-client'
import { eventApi, type EventListParams, type CreateEventBody } from '@/api/event-api'

export const eventKeys = {
  all: ['events'] as const,
  lists: () => [...eventKeys.all, 'list'] as const,
  list: (p: EventListParams) => [...eventKeys.lists(), p] as const,
  detail: (id: string) => [...eventKeys.all, 'detail', id] as const,
  calendar: (p?: { from?: string; to?: string }) => [...eventKeys.all, 'calendar', p] as const,
}

export function useEvents(params: EventListParams = {}) {
  return useQuery({
    queryKey: eventKeys.list(params),
    queryFn: () => eventApi.list(params),
    enabled: !isMockMode(),
  })
}

export function useCalendarEvents(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: eventKeys.calendar(params),
    queryFn: () => eventApi.getCalendar(params),
    enabled: !isMockMode(),
  })
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: eventKeys.detail(id),
    queryFn: () => eventApi.getOne(id),
    enabled: !isMockMode() && !!id,
  })
}

export function useCreateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateEventBody) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return eventApi.create(body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: eventKeys.lists() })
      qc.invalidateQueries({ queryKey: eventKeys.calendar() })
      toast.success('Event created')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useApproveEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return eventApi.approve(id)
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: eventKeys.detail(id) })
      qc.invalidateQueries({ queryKey: eventKeys.lists() })
      toast.success('Event approved')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useRejectEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return eventApi.reject(id, reason)
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: eventKeys.detail(id) })
      qc.invalidateQueries({ queryKey: eventKeys.lists() })
      toast.success('Event rejected')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
