/**
 * appointment-api.ts  — Phase F2
 *
 * Axios wrappers for dream-sky /appointments endpoints.
 */

import { api } from '@/lib/api-client'

export interface ApiAppointment {
  id: string
  studentId: string
  counselorId: string | null
  type: string
  status: string
  datetime: string
  durationMin: number
  meetingMode: string
  meetingLink: string | null
  notes: string | null
  outcome: string | null
  createdAt: string
  updatedAt: string
  student?: { id: string; firstName: string; lastName: string }
  counselor?: { id: string; firstName: string; lastName: string } | null
}

export interface AppointmentListParams {
  page?: number
  limit?: number
  studentId?: string
  counselorId?: string
  status?: string
  from?: string
  to?: string
}

export interface AppointmentListResponse {
  appointments: ApiAppointment[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface CreateAppointmentBody {
  studentId: string
  counselorId?: string
  type: string
  datetime: string
  durationMin?: number
  meetingMode?: string
  meetingLink?: string
  notes?: string
}

export interface UpdateAppointmentBody extends Partial<CreateAppointmentBody> {}

export const appointmentApi = {
  /** GET /appointments */
  list(params?: AppointmentListParams): Promise<AppointmentListResponse> {
    return api.get('/appointments', { params })
  },

  /** GET /appointments/:id */
  getOne(id: string): Promise<ApiAppointment> {
    return api.get(`/appointments/${id}`)
  },

  /** POST /appointments */
  create(body: CreateAppointmentBody): Promise<ApiAppointment> {
    return api.post('/appointments', body)
  },

  /** PUT /appointments/:id */
  update(id: string, body: UpdateAppointmentBody): Promise<ApiAppointment> {
    return api.put(`/appointments/${id}`, body)
  },

  /** PATCH /appointments/:id/status */
  changeStatus(id: string, status: string): Promise<ApiAppointment> {
    return api.patch(`/appointments/${id}/status`, { status })
  },

  /** DELETE /appointments/:id */
  remove(id: string): Promise<void> {
    return api.delete(`/appointments/${id}`)
  },
}
