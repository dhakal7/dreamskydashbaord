/**
 * student-api.ts  — Phase F2
 *
 * Axios wrappers for all dream-sky /students endpoints.
 * Every function returns the unwrapped data (envelope stripped by api-client).
 */

import { api } from '@/lib/api-client'

// ─── Types (backend shapes) ───────────────────────────────────────────────────

export interface ApiStudent {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  dateOfBirth: string | null
  nationality: string | null
  currentStage: string
  source: string | null
  assignedCounselorId: string | null
  referredByAgentId: string | null
  academicBackground: Record<string, unknown> | null
  financialBackground: Record<string, unknown> | null
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  // B2B Partner fields
  processingType: 'SELF' | 'PARTNER_CONSULTANCY'
  partnerConsultancyId: string | null
  partnerConsultancy: { id: string; name: string } | null
  // Populated relations (from controller includes)
  assignedCounselor?: { id: string; firstName: string; lastName: string } | null
  stageHistory?: ApiPipelineHistory[]
}

export interface ApiPipelineHistory {
  id: string
  studentId: string
  fromStage: string | null
  toStage: string
  changedAt: string
  notes: string | null
}

export interface StudentsListParams {
  page?: number
  limit?: number
  search?: string
  stage?: string
  /** Comma-separated list of stages to match (backend expands into `currentStage in [...]`). */
  stageIn?: string
  /** ISO datetime — include only students created on/after this instant. */
  createdFrom?: string
  /** ISO datetime — include only students created on/before this instant. */
  createdTo?: string
  branchId?: string
  counselorId?: string
  isActive?: boolean
}

export interface StudentsListResponse {
  students: ApiStudent[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface CreateStudentBody {
  firstName: string
  lastName: string
  email: string
  phone?: string
  nationality?: string
  source?: string
  assignedCounselorId?: string
  referredByAgentId?: string
  notes?: string
  academicBackground?: Record<string, unknown>
  financialBackground?: Record<string, unknown>
  /** 'SELF' = DreamSky handles directly, 'PARTNER_CONSULTANCY' = referred to B2B partner */
  processingType?: 'SELF' | 'PARTNER_CONSULTANCY'
  /** ID of an existing PartnerConsultancy record */
  partnerConsultancyId?: string
  /** Name of partner — backend will auto-create if not found */
  partnerConsultancyName?: string
}

export interface UpdateStudentBody extends Partial<CreateStudentBody> {}

export interface ChangePipelineBody {
  stage: string
  notes?: string
}

// ─── API functions ────────────────────────────────────────────────────────────

export const studentApi = {
  /** GET /students — paginated + filtered list */
  list(params?: StudentsListParams): Promise<StudentsListResponse> {
    return api.get('/students', { params })
  },

  /** GET /students/:id — full student record with stage history */
  getOne(id: string): Promise<ApiStudent> {
    return api.get(`/students/${id}`)
  },

  /** GET /students/:id/timeline */
  getTimeline(id: string): Promise<ApiPipelineHistory[]> {
    return api.get(`/students/${id}/timeline`)
  },

  /** POST /students — create new lead */
  create(body: CreateStudentBody): Promise<ApiStudent> {
    return api.post('/students', body)
  },

  /** PUT /students/:id — full update */
  update(id: string, body: UpdateStudentBody): Promise<ApiStudent> {
    return api.put(`/students/${id}`, body)
  },

  /** PATCH /students/:id/pipeline — move to new pipeline stage */
  changePipeline(id: string, body: ChangePipelineBody): Promise<ApiStudent> {
    return api.patch(`/students/${id}/pipeline`, body)
  },

  /** DELETE /students/:id */
  remove(id: string): Promise<void> {
    return api.delete(`/students/${id}`)
  },
}
