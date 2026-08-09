/**
 * followup-api.ts  — Phase F2
 *
 * Axios wrappers for dream-sky /follow-ups endpoints.
 */

import { api } from '@/lib/api-client'

export interface ApiFollowUp {
  id: string
  studentId: string
  authorId: string | null
  channel: string
  direction: string
  content: string
  nextFollowUpAt: string | null
  createdAt: string
  updatedAt: string
  student?: { id: string; firstName: string; lastName: string }
  author?: { id: string; firstName: string; lastName: string } | null
}

export interface FollowUpListParams {
  page?: number
  limit?: number
  studentId?: string
  authorId?: string
  channel?: string
  /** 'upcoming' → nextFollowUpAt in the future; 'overdue' → nextFollowUpAt in the past. */
  status?: 'upcoming' | 'overdue'
  from?: string
  to?: string
}

export interface FollowUpListResponse {
  followUps: ApiFollowUp[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface CreateFollowUpBody {
  studentId: string
  channel: string
  direction: string
  content: string
  nextFollowUpAt?: string
}

export interface UpdateFollowUpBody extends Partial<CreateFollowUpBody> {}

export const followUpApi = {
  /** GET /follow-ups */
  list(params?: FollowUpListParams): Promise<FollowUpListResponse> {
    return api.get('/follow-ups', { params })
  },

  /** GET /follow-ups/student/:studentId */
  getStudentTimeline(studentId: string): Promise<ApiFollowUp[]> {
    return api.get(`/follow-ups/student/${studentId}`)
  },

  /** GET /follow-ups/:id */
  getOne(id: string): Promise<ApiFollowUp> {
    return api.get(`/follow-ups/${id}`)
  },

  /** POST /follow-ups */
  create(body: CreateFollowUpBody): Promise<ApiFollowUp> {
    return api.post('/follow-ups', body)
  },

  /** PUT /follow-ups/:id */
  update(id: string, body: UpdateFollowUpBody): Promise<ApiFollowUp> {
    return api.put(`/follow-ups/${id}`, body)
  },

  /** DELETE /follow-ups/:id */
  remove(id: string): Promise<void> {
    return api.delete(`/follow-ups/${id}`)
  },
}
