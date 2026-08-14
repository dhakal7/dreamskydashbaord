import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { sendEmailNotification } from '@/lib/email-notifications'
import type { AppNotification } from '@/types'
import { appNotifications } from '@/mock/notifications'

interface NotificationsState {
  notifications: AppNotification[]
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  deleteNotification: (id: string) => void
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set) => ({
      notifications: appNotifications,

      addNotification: (notification) => {
        const newNotification: AppNotification = {
          ...notification,
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          timestamp: new Date().toISOString(),
        }

        const recipientEmails = (notification.recipientEmails ?? []).filter(Boolean)
        if (recipientEmails.length > 0 && notification.sendEmail !== false) {
          const emailPayload = {
            to: recipientEmails,
            subject: notification.title,
            body: notification.description,
          }

          if (typeof notification.sendEmail === 'function') {
            notification.sendEmail(emailPayload)
          } else {
            sendEmailNotification(emailPayload)
          }
        }

        set((state) => ({
          notifications: [newNotification, ...state.notifications],
        }))
      },

      markAsRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        }))
      },

      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        }))
      },

      deleteNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }))
      },
    }),
    {
      name: 'dreamsky-notifications-store',
    }
  )
)
