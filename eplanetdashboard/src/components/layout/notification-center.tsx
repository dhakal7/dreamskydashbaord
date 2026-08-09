import { useEffect } from 'react'
import { Bell, CalendarClock, FileStack, PlaneTakeoff, Settings2, Wallet } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useNotificationsStore } from '@/store/notifications-store'
import { useNotifications } from '@/hooks/use-notifications'
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
  const { data: apiNotifyData } = useNotifications()

  // Sync backend notifications when real mode API data arrives
  useEffect(() => {
    if (apiNotifyData?.notifications && apiNotifyData.notifications.length > 0) {
      const mapped: AppNotification[] = apiNotifyData.notifications.map((n) => ({
        id: n.id,
        type: 'system' as const,
        title: n.title,
        description: n.body,
        timestamp: n.createdAt,
        read: !!n.readAt,
      }))
      
      const currentIds = new Set(useNotificationsStore.getState().notifications.map((x) => x.id))
      const newItems = mapped.filter((x) => !currentIds.has(x.id))
      if (newItems.length > 0) {
        useNotificationsStore.setState((state) => ({
          notifications: [...newItems, ...state.notifications],
        }))
      }
    }
  }, [apiNotifyData])

  const unreadCount = storeNotifications.filter((n) => !n.read).length

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
              onClick={() => markAllAsRead()}
            >
              Mark all as read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {storeNotifications.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            storeNotifications.map((n) => {
              const Icon = iconByType[n.type] || Settings2
              return (
                <button
                  key={n.id}
                  onClick={() => markAsRead(n.id)}
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
