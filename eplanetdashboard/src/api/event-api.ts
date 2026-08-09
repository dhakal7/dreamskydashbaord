/**
 * event-api.ts  — Phase F4
 *
 * Axios wrappers for dream-sky /events endpoints.
 */

import { api } from '@/lib/api-client'

export interface ApiEvent {
  id: string
  title: string
  type: string
  description: string | null
  location: string | null
  startDate: string
  endDate: string | null
  approvalStatus: string
  audienceRoles: string[]
  createdById: string | null
  branchId: string | null
  createdAt: string
  updatedAt: string
  createdBy?: { id: string; firstName: string; lastName: string } | null
  reminders?: ApiEventReminder[]
}

export interface ApiEventReminder {
  id: string
  eventId: string
  offset: string
  status: string
  sentAt: string | null
}

export interface EventListParams {
  page?: number
  limit?: number
  type?: string
  approvalStatus?: string
  from?: string
  to?: string
}

export interface EventListResponse {
  events: ApiEvent[]
  total: number
  page: number
  limit: number
}

export interface CreateEventBody {
  title: string
  type: string
  description?: string
  location?: string
  startDate: string
  endDate?: string
  audienceRoles?: string[]
  branchId?: string
}

export const eventApi = {
  list(params?: EventListParams): Promise<EventListResponse> {
    return api.get('/events', { params })
  },
  /** GET /events/calendar — returns events in calendar-friendly format */
  getCalendar(params?: { from?: string; to?: string }): Promise<ApiEvent[]> {
    return api.get('/events/calendar', { params })
  },
  getOne(id: string): Promise<ApiEvent> {
    return api.get(`/events/${id}`)
  },
  create(body: CreateEventBody): Promise<ApiEvent> {
    return api.post('/events', body)
  },
  update(id: string, body: Partial<CreateEventBody>): Promise<ApiEvent> {
    return api.put(`/events/${id}`, body)
  },
  remove(id: string): Promise<void> {
    return api.delete(`/events/${id}`)
  },
  approve(id: string): Promise<ApiEvent> {
    return api.patch(`/events/${id}/approve`, {})
  },
  reject(id: string, reason?: string): Promise<ApiEvent> {
    return api.patch(`/events/${id}/reject`, { reason })
  },
}
