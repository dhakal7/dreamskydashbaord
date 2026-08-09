import type { AppNotification, NotificationTemplate } from '@/types'
import { daysAgo } from './generators'

export const notificationTemplates: NotificationTemplate[] = [
  {
    id: 'tpl-follow-up',
    title: 'Follow-up due',
    description: 'A student follow-up is due soon and needs your attention.',
    type: 'follow_up',
  },
  {
    id: 'tpl-application',
    title: 'Application update',
    description: 'An application moved to a new stage and needs review.',
    type: 'application',
  },
  {
    id: 'tpl-visa',
    title: 'Visa milestone reached',
    description: 'A visa case reached an important milestone.',
    type: 'visa',
  },
  {
    id: 'tpl-doc',
    title: 'Document review',
    description: 'A document requires verification before the next step.',
    type: 'document',
  },
  {
    id: 'tpl-system',
    title: 'System update',
    description: 'A weekly summary or system alert is ready to review.',
    type: 'system',
  },
  {
    id: 'tpl-fee-due',
    title: 'Fee due',
    description: 'A student fee payment is due or overdue.',
    type: 'fee_due',
  },
]

export const appNotifications: AppNotification[] = [
  {
    id: 'notif-template-1',
    title: notificationTemplates[0].title,
    description: notificationTemplates[0].description,
    timestamp: daysAgo(0),
    read: false,
    type: 'follow_up',
  },
  {
    id: 'notif-template-2',
    title: notificationTemplates[1].title,
    description: notificationTemplates[1].description,
    timestamp: daysAgo(1),
    read: true,
    type: 'application',
  },
  {
    id: 'notif-template-3',
    title: notificationTemplates[2].title,
    description: notificationTemplates[2].description,
    timestamp: daysAgo(2),
    read: false,
    type: 'visa',
  },
  {
    id: 'notif-template-4',
    title: notificationTemplates[3].title,
    description: notificationTemplates[3].description,
    timestamp: daysAgo(3),
    read: true,
    type: 'document',
  },
  {
    id: 'notif-template-5',
    title: notificationTemplates[4].title,
    description: notificationTemplates[4].description,
    timestamp: daysAgo(4),
    read: true,
    type: 'system',
  },
]
