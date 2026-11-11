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
  leadStage?: string
  source: string | null
  assignedCounselorId: string | null
  referredByAgentId: string | null
  academicBackground: Record<string, unknown> | null
  financialBackground: Record<string, unknown> | null
  familyBackground?: Record<string, unknown> | null
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  // B2B Partner fields
  processingType: 'SELF' | 'PARTNER_CONSULTANCY'
  partnerConsultancyId: string | null
  partnerConsultancy: { id: string; name: string } | null
  // Populated relations (from controller includes)
  assignedCounselor?: { id: string; firstName: string; lastName: string; branchId?: string | null } | null
  referredByAgent?: {
    id: string
    referralCode: string
    user?: { id: string; firstName: string; lastName: string; email: string } | null
  } | null
  stageHistory?: ApiPipelineHistory[]
  trashReason?: string | null
  trashedAt?: string | null
  trashedById?: string | null
  trashedBy?: { id: string; name: string; email?: string | null } | null
  isClassOnly?: boolean

  /** Present after an ENROLLED transition — reports the portal credentials email status. */
  _portalProvision?: {
    success: boolean
    reason?: string
    error?: string
    mailResult?: { error?: string; skipped?: boolean; reason?: string }
  } | null
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
  /** 'all' returns all stages including pre-enrollment leads; 'leads' returns LEAD/PROSPECT; 'class_only' returns class inquiries */
  type?: 'all' | 'leads' | 'class_only' | string
  /** Dedicated filter to return only class-only students (via academicBackground JSON metadata) */
  isClassOnly?: boolean | string
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
    isFallback?: boolean
    isTruncated?: boolean
    candidatesEvaluated?: number
  }
}

export interface CreateStudentBody {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  dateOfBirth?: string
  nationality?: string
  source?: string
  currentStage?: string
  assignedCounselorId?: string | null
  referredByAgentId?: string | null
  notes?: string
  academicBackground?: Record<string, unknown>
  financialBackground?: Record<string, unknown>
  familyBackground?: Record<string, unknown>
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
  leadStage?: string
  followUpDate?: string
  followUpTime?: string
  durationMin?: number
  meetingMode?: string
  notes?: string
  reasonCode?: string
  email?: string
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

  /** DELETE /students/:id (Soft-delete / move to Trash with required reason in request body) */
  remove(id: string, reason: string): Promise<void> {
    const trimmed = typeof reason === 'string' ? reason.trim() : ''
    if (!trimmed) {
      return Promise.reject(new Error('A non-empty reason is required to move a record to Trash.'))
    }
    return api.delete(`/students/${id}`, {
      data: { reason: trimmed },
    })
  },

  /** GET /students/trash — paginated list of trashed students */
  listTrash(params?: StudentsListParams): Promise<StudentsListResponse> {
    return api.get('/students/trash', { params })
  },

  /** PATCH /students/:id/restore — restore trashed student */
  restore(id: string): Promise<ApiStudent> {
    return api.patch(`/students/${id}/restore`, {})
  },

  /** PATCH /students/:id/assign — assign lead to counselor */
  assignCounselor(id: string, counselorId: string): Promise<ApiStudent> {
    return api.patch(`/students/${id}/assign`, {
      assignedCounselorId: counselorId,
      counselorId,
    })
  },

  /** PATCH /students/:id/transfer-branch — transfer student to destination branch (Super Admin only) */
  transferBranch(
    id: string,
    body: { destinationBranchId: string; newAssignedCounselorId?: string | null }
  ): Promise<ApiStudent> {
    return api.patch(`/students/${id}/transfer-branch`, body)
  },

  /** POST /students/:id/resend-credentials */
  resendCredentials(id: string): Promise<{ success: boolean; message: string }> {
    return api.post(`/students/${id}/resend-credentials`, {})
  },
}
