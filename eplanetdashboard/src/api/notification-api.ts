/**
 * notification-api.ts  — Phase F4
 *
 * Axios wrappers for dream-sky /notifications endpoints.
 * SUPER_ADMIN sees all notifications; other roles see only their own (enforced in controller).
 */

import { api } from '@/lib/api-client'

export interface ApiNotification {
  id: string
  recipientId: string
  templateId: string | null
  channel: string
  status: string
  title: string
  body: string
  sentAt: string | null
  readAt: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface ApiNotificationTemplate {
  id: string
  name: string
  channel: string
  subject: string | null
  body: string
  approvalStatus: string
  createdById: string | null
  createdAt: string
  updatedAt: string
}

export interface NotificationListParams {
  page?: number
  limit?: number
  status?: string
  channel?: string
}

export interface NotificationListResponse {
  notifications: ApiNotification[]
  total: number
  page: number
  limit: number
}

export const notificationApi = {
  // ── Notifications ─────────────────────────────────────────────────────────
  list(params?: NotificationListParams): Promise<NotificationListResponse> {
    return api.get('/notifications', { params })
  },

  // ── Templates (SUPER_ADMIN only) ──────────────────────────────────────────
  listTemplates(): Promise<ApiNotificationTemplate[]> {
    return api.get('/notifications/templates')
  },
  getTemplate(id: string): Promise<ApiNotificationTemplate> {
    return api.get(`/notifications/templates/${id}`)
  },
  createTemplate(body: Omit<ApiNotificationTemplate, 'id' | 'createdAt' | 'updatedAt' | 'approvalStatus' | 'createdById'>): Promise<ApiNotificationTemplate> {
    return api.post('/notifications/templates', body)
  },
  updateTemplate(id: string, body: Partial<ApiNotificationTemplate>): Promise<ApiNotificationTemplate> {
    return api.put(`/notifications/templates/${id}`, body)
  },
  deleteTemplate(id: string): Promise<void> {
    return api.delete(`/notifications/templates/${id}`)
  },
}
