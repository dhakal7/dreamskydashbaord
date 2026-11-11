import { useEffect } from 'react'
import { Bell, CalendarClock, FileStack, PlaneTakeoff, Settings2, Wallet } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useNotificationsStore } from '@/store/notifications-store'
import { useNotifications, useMarkNotificationAsRead, useMarkAllNotificationsAsRead } from '@/hooks/use-notifications'
import { isMockMode } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import type { AppNotification } from '@/types'

dayjs.extend(relativeTime)

const iconByType = {
  follow_up: CalendarClock,
  application: FileStack,
  visa: PlaneTakeoff,
  document: FileStack,
  system: Settings2,
  fee_due: Wallet,
}

export function NotificationCenter() {
  const storeNotifications = useNotificationsStore((s) => s.notifications)
  const markAsRead = useNotificationsStore((s) => s.markAsRead)
  const markAllAsRead = useNotificationsStore((s) => s.markAllAsRead)
  const {
    data: apiNotifyData,
    isLoading: isNotifyLoading,
    isError: isNotifyError,
    refetch: refetchNotifications,
  } = useNotifications()
  const markAsReadMutation = useMarkNotificationAsRead()
  const markAllAsReadMutation = useMarkAllNotificationsAsRead()
  const isMock = isMockMode()

  // Sync backend notifications when real mode API data arrives.
  // In live mode, the server response is authoritative so synthetic local or mock-template
  // notifications persisted in localStorage never leak into the live notification center.
  useEffect(() => {
    if (isMock || apiNotifyData === undefined) return

    const list = Array.isArray(apiNotifyData)
      ? apiNotifyData
      : (apiNotifyData as { notifications?: any[] })?.notifications

    if (Array.isArray(list)) {
      const mapped: AppNotification[] = list.map((n: any) => {
        const isFollowUp =
          n.metadata?.action ||
          n.payload?.action ||
          String(n.title || n.subject || '').toLowerCase().includes('follow-up')
        return {
          id: n.id,
          type: (isFollowUp ? 'follow_up' : 'system') as AppNotification['type'],
          title: n.title || n.subject || 'Notification',
          description: n.body,
          timestamp: n.createdAt,
          read: Boolean(n.read || n.readAt),
        }
      })

      useNotificationsStore.setState((state) => {
        const optimisticReadIds = new Set(
          state.notifications.filter((x) => x.read).map((x) => x.id)
        )
        const reconciled = mapped.map((serverItem) => ({
          ...serverItem,
          read: Boolean(serverItem.read || optimisticReadIds.has(serverItem.id)),
        }))
        return {
          notifications: reconciled,
        }
      })
    }
  }, [apiNotifyData, isMock])

  const visibleNotifications = isMock
    ? storeNotifications
    : apiNotifyData !== undefined
      ? storeNotifications.filter((n) => !String(n.id).startsWith('notif-template-'))
      : []

  const handleMarkAsRead = (id: string) => {
    markAsRead(id)
    if (!isMock) {
      markAsReadMutation.mutate(id)
    }
  }

  const handleMarkAllAsRead = () => {
    markAllAsRead()
    if (!isMock) {
      markAllAsReadMutation.mutate()
    }
  }

  const unreadCount = visibleNotifications.filter((n) => !n.read).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-4.5" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex size-2 rounded-full bg-danger-500 ring-2 ring-background" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold">Notifications</p>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              className="text-xs font-medium text-primary hover:underline cursor-pointer"
              onClick={handleMarkAllAsRead}
            >
              Mark all as read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!isMock && isNotifyLoading ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Loading notifications...
            </div>
          ) : !isMock && isNotifyError ? (
            <div className="space-y-2 p-6 text-center text-xs text-danger-600 dark:text-danger-400">
              <p className="font-medium">Unable to load notifications from server.</p>
              <button
                type="button"
                onClick={() => refetchNotifications()}
                className="font-semibold text-primary underline hover:no-underline cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            visibleNotifications.map((n) => {
              const Icon = iconByType[n.type] || Settings2
              return (
                <button
                  key={n.id}
                  onClick={() => handleMarkAsRead(n.id)}
                  className={cn(
                    'flex w-full items-start gap-3 border-b border-border/60 px-3.5 py-3 text-left transition-colors last:border-0 hover:bg-accent cursor-pointer',
                    !n.read && 'bg-brand-50/60 dark:bg-brand-500/5'
                  )}
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <Icon className="size-3.5 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium">{n.title}</span>
                      {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{n.description}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground/70">{dayjs(n.timestamp).fromNow()}</span>
                  </span>
                </button>
              )
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
