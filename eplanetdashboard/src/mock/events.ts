import type { Event, EventReminderSchedule } from '@/types'
import dayjs from 'dayjs'

const reminderSchedule: EventReminderSchedule[] = ['-1wk', '0']

export const events: Event[] = [
  {
    id: 'evt-1',
    name: 'University Fair — Kathmandu',
    type: 'fair',
    date: dayjs().add(10, 'day').toISOString(),
    location: 'Hotel Himalaya, Kathmandu',
    scope: 'staff',
    audienceRoles: ['super_admin', 'counselor', 'front_desk', 'teacher'],
    reminderSchedule,
    notificationEnabled: true,
  },
  {
    id: 'evt-2',
    name: 'Visa Prep Webinar',
    type: 'webinar',
    date: dayjs().add(3, 'day').toISOString(),
    location: 'Online',
    scope: 'everyone',
    audienceRoles: ['super_admin', 'front_desk', 'counselor', 'teacher', 'student', 'referral_agent'],
    reminderSchedule: ['-1d', '0'],
    notificationEnabled: true,
  },
  {
    id: 'evt-3',
    name: 'University Visit — Sydney',
    type: 'uni_visit',
    date: dayjs().add(24, 'day').toISOString(),
    location: 'Sydney, Australia',
    scope: 'staff',
    audienceRoles: ['super_admin', 'counselor', 'front_desk'],
    reminderSchedule: ['-1mo', '-1wk'],
    notificationEnabled: false,
  },
  {
    id: 'evt-4',
    name: 'Branch Planning Meeting',
    type: 'meeting',
    date: dayjs().subtract(2, 'day').toISOString(),
    location: 'HQ Boardroom',
    scope: 'staff',
    audienceRoles: ['super_admin', 'front_desk'],
    reminderSchedule: ['-1d', '0'],
    notificationEnabled: true,
  },
  {
    id: 'evt-5',
    name: 'Student Counseling Seminar',
    type: 'seminar',
    date: dayjs().subtract(15, 'day').toISOString(),
    location: 'Pokhara Branch',
    scope: 'student',
    audienceRoles: ['student'],
    reminderSchedule: ['-1wk'],
    notificationEnabled: true,
  },
]
