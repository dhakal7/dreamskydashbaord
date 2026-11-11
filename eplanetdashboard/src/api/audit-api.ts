import { api } from '@/lib/api-client'

export interface ApiAuditLog {
  id: string
  actorId: string | null
  actorName: string
  actorEmail: string | null
  actorRole: string
  entity: string
  entityId: string
  field: string | null
  oldValue: string | null
  newValue: string | null
  timestamp: string
}

export interface AuditLogsParams {
  page?: number
  limit?: number
  search?: string
  actorId?: string
  entity?: string
  field?: string
  fromDate?: string
  toDate?: string
}

export interface AuditLogsResponse {
  data: ApiAuditLog[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export const auditApi = {
  /** GET /audit-logs — paginated & filterable immutable audit logs */
  list(params?: AuditLogsParams): Promise<AuditLogsResponse> {
    return api.get('/audit-logs', { params })
  },
}

