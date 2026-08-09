/**
 * application-api.ts  — Phase F3
 *
 * Axios wrappers for dream-sky /applications endpoints.
 */

import { api } from '@/lib/api-client'

export interface ApiApplication {
  id: string
  studentId: string
  universityId: string | null
  courseId: string | null
  status: string
  intakeMonth: string | null
  intakeYear: number | null
  submittedAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  student?: { id: string; firstName: string; lastName: string }
  university?: { id: string; name: string } | null
  course?: { id: string; name: string } | null
  offers?: ApiOffer[]
}

export interface ApiOffer {
  id: string
  applicationId: string
  type: string
  conditions: string | null
  deadline: string | null
  receivedAt: string
}

export interface ApplicationListParams {
  page?: number
  limit?: number
  studentId?: string
  status?: string
  counselorId?: string
}

export interface ApplicationListResponse {
  applications: ApiApplication[]
  total: number
  page: number
  limit: number
}

export interface CreateApplicationBody {
  studentId: string
  universityId?: string
  courseId?: string
  intakeMonth?: string
  intakeYear?: number
  notes?: string
}

export const applicationApi = {
  list(params?: ApplicationListParams): Promise<ApplicationListResponse> {
    return api.get('/applications', { params })
  },
  getOne(id: string): Promise<ApiApplication> {
    return api.get(`/applications/${id}`)
  },
  create(body: CreateApplicationBody): Promise<ApiApplication> {
    return api.post('/applications', body)
  },
  update(id: string, body: Partial<CreateApplicationBody>): Promise<ApiApplication> {
    return api.put(`/applications/${id}`, body)
  },
  changeStatus(id: string, status: string): Promise<ApiApplication> {
    return api.patch(`/applications/${id}/status`, { status })
  },
  recordOffer(id: string, offer: { type: string; conditions?: string; deadline?: string }): Promise<ApiOffer> {
    return api.post(`/applications/${id}/offers`, offer)
  },
  remove(id: string): Promise<void> {
    return api.delete(`/applications/${id}`)
  },
}
