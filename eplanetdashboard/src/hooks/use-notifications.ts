/**
 * use-notifications.ts  — Phase F4
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isMockMode } from '@/lib/api-client'
import { notificationApi, type NotificationListParams } from '@/api/notification-api'

export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (p: NotificationListParams) => [...notificationKeys.lists(), p] as const,
  templates: () => [...notificationKeys.all, 'templates'] as const,
}

export function useNotifications(params: NotificationListParams = {}) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () => notificationApi.list(params),
    enabled: !isMockMode(),
    // Poll every 60s for new notifications (lightweight polling)
    refetchInterval: isMockMode() ? false : 60_000,
  })
}

export function useNotificationTemplates() {
  return useQuery({
    queryKey: notificationKeys.templates(),
    queryFn: () => notificationApi.listTemplates(),
    enabled: !isMockMode(),
  })
}

export function useCreateNotificationTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Parameters<typeof notificationApi.createTemplate>[0]) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return notificationApi.createTemplate(body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.templates() })
      toast.success('Template created')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
