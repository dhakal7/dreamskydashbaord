/**
 * visa-api.ts  — Phase F3
 *
 * Axios wrappers for dream-sky /visa-cases endpoints.
 */

import { api } from '@/lib/api-client'

export interface ApiVisaCase {
  id: string
  studentId: string
  applicationId: string | null
  status: string
  country: string | null
  visaType: string | null
  submittedAt: string | null
  appointmentDate: string | null
  decisionDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  student?: { id: string; firstName: string; lastName: string }
}

export interface VisaCaseListParams {
  page?: number
  limit?: number
  studentId?: string
  status?: string
}

export interface VisaCaseListResponse {
  visaCases: ApiVisaCase[]
  total: number
  page: number
  limit: number
}

export interface CreateVisaCaseBody {
  studentId: string
  applicationId?: string
  country?: string
  visaType?: string
  notes?: string
}

export const visaApi = {
  list(params?: VisaCaseListParams): Promise<VisaCaseListResponse> {
    return api.get('/visa-cases', { params })
  },
  getOne(id: string): Promise<ApiVisaCase> {
    return api.get(`/visa-cases/${id}`)
  },
  create(body: CreateVisaCaseBody): Promise<ApiVisaCase> {
    return api.post('/visa-cases', body)
  },
  update(id: string, body: Partial<CreateVisaCaseBody>): Promise<ApiVisaCase> {
    return api.put(`/visa-cases/${id}`, body)
  },
  changeStatus(id: string, status: string): Promise<ApiVisaCase> {
    return api.patch(`/visa-cases/${id}/status`, { status })
  },
  remove(id: string): Promise<void> {
    return api.delete(`/visa-cases/${id}`)
  },
}
