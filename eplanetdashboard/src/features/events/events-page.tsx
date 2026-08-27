import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { CalendarDays, Filter, Plus, Bell, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/shared/empty-state'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAuthStore } from '@/store/auth-store'
import { useEventsStore } from './store'
import { hasPermission } from '@/lib/rbac'
import type { Event, EventAudienceScope, EventReminderSchedule, EventType } from '@/types'

const eventTypes: Array<'all' | EventType> = ['all', 'seminar', 'uni_visit', 'fair', 'webinar', 'meeting']
const eventScopes: EventAudienceScope[] = ['staff', 'student', 'everyone']
const reminderOptions: EventReminderSchedule[] = ['-1mo', '-1wk', '-1d', '0']

function formatDate(value: string) {
  return dayjs(value).format('MMM D, YYYY · h:mm A')
}

function scopeLabel(scope: EventAudienceScope) {
  return scope.charAt(0).toUpperCase() + scope.slice(1)
}

import { useEvents } from '@/hooks/use-events'
import { isMockMode } from '@/lib/api-client'

export default function EventsPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { events: mockEvents, addEvent, deleteEvent } = useEventsStore()
  const { data: apiEventsData } = useEvents()

  const events = !isMockMode()
    ? (apiEventsData?.events ?? []).map((e) => ({
        id: e.id,
        name: e.title,
        type: e.type.toLowerCase() as EventType,
        date: e.startDate,
        location: e.location ?? 'Online',
        scope: 'everyone' as EventAudienceScope,
        audienceRoles: e.audienceRoles as any,
        reminderSchedule: ['-1wk', '0'] as EventReminderSchedule[],
        notificationEnabled: true,
      }))
    : mockEvents

  const [typeFilter, setTypeFilter] = useState<'all' | EventType>('all')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [date, setDate] = useState(dayjs().add(1, 'day').format('YYYY-MM-DD'))
  const [time, setTime] = useState('10:00')
  const [type, setType] = useState<EventType>('seminar')
  const [scope, setScope] = useState<EventAudienceScope>('staff')
  const [notificationEnabled, setNotificationEnabled] = useState(true)
  const [reminderSchedule, setReminderSchedule] = useState<EventReminderSchedule[]>(['-1wk', '0'])

  const canManageEvents = hasPermission(currentUser.role, 'events.manage') || (currentUser.role !== 'student' && currentUser.role !== 'referral_agent')

  const visibleEvents = useMemo(() => {
    return events.filter((event) => {
      if (currentUser.role === 'super_admin') return true
      if (currentUser.role === 'student') return event.scope === 'student' || event.scope === 'everyone'
      if (currentUser.role === 'referral_agent') return event.scope === 'everyone'
      if (currentUser.role === 'teacher') return event.scope === 'staff' || event.scope === 'everyone'
      if (typeFilter !== 'all' && event.type !== typeFilter) return false
      return event.scope === 'staff' || event.scope === 'everyone'
    })
  }, [currentUser.role, events, typeFilter])

  const upcoming = visibleEvents.filter((event) => dayjs(event.date).isAfter(dayjs()))
  const past = visibleEvents.filter((event) => dayjs(event.date).isBefore(dayjs()))

  const handleCreateEvent = () => {
    if (!name.trim() || !location.trim()) return

    const eventDate = `${date}T${time}:00`

    addEvent({
      name: name.trim(),
      type,
      date: eventDate,
      location: location.trim(),
      scope,
      audienceRoles: scope === 'staff'
        ? ['super_admin', 'front_desk', 'counselor', 'teacher']
        : scope === 'student'
          ? ['student']
          : ['super_admin', 'front_desk', 'counselor', 'teacher', 'student', 'referral_agent'],
      reminderSchedule,
      notificationEnabled,
    })

    setName('')
    setLocation('')
    setDate(dayjs().add(1, 'day').format('YYYY-MM-DD'))
    setTime('10:00')
    setType('seminar')
    setScope('staff')
    setNotificationEnabled(true)
    setReminderSchedule(['-1wk', '0'])
  }

  const toggleReminder = (value: EventReminderSchedule) => {
    setReminderSchedule((current) => {
      const exists = current.includes(value)
      return exists ? current.filter((item) => item !== value) : [...current, value]
    })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Events"
        description="Track upcoming and past outreach events for your team."
      />

      {canManageEvents && (
        <Card>
          <CardHeader>
            <CardTitle>Create Event</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Event title" />
              <Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" />
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
              <Select value={type} onValueChange={(value) => setType(value as EventType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Event type" />
                </SelectTrigger>
                <SelectContent>
                  {eventTypes.filter((item) => item !== 'all').map((option) => (
                    <SelectItem key={option} value={option}>{option.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={scope} onValueChange={(value) => setScope(value as EventAudienceScope)}>
                <SelectTrigger>
                  <SelectValue placeholder="Audience" />
                </SelectTrigger>
                <SelectContent>
                  {eventScopes.map((option) => (
                    <SelectItem key={option} value={option}>{scopeLabel(option)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Bell className="size-4 text-muted-foreground" />
                Notification settings
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={notificationEnabled} onChange={(event) => setNotificationEnabled(event.target.checked)} />
                Send notification for this event
              </label>
              <div className="flex flex-wrap gap-2">
                {reminderOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleReminder(option)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${reminderSchedule.includes(option) ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground'}`}
                  >
                    {option === '0' ? 'On day' : `Reminder ${option.replace('-', '')}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleCreateEvent}>
                <Plus className="size-4" />
                Save Event
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="p-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="size-4" />
            Filter by type
          </div>
          <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as 'all' | EventType)}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="All event types" />
            </SelectTrigger>
            <SelectContent>
              {eventTypes.map((option) => (
                <SelectItem key={option} value={option}>{option === 'all' ? 'All event types' : option.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" />
            <h2 className="font-semibold">Upcoming Events</h2>
          </div>
          {upcoming.length === 0 ? (
            <div className="mt-4">
              <EmptyState icon={CalendarDays} title="No upcoming events" description="Nothing is scheduled for the selected filters right now." />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {upcoming.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  canManage={canManageEvents}
                  onDelete={() => {
                    if (window.confirm(`Are you sure you want to delete event "${event.name}"?`)) {
                      deleteEvent(event.id)
                    }
                  }}
                />
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" />
            <h2 className="font-semibold">Past Events</h2>
          </div>
          {past.length === 0 ? (
            <div className="mt-4">
              <EmptyState icon={CalendarDays} title="No past events" description="No historical events match the current view." />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {past.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  canManage={canManageEvents}
                  onDelete={() => {
                    if (window.confirm(`Are you sure you want to delete event "${event.name}"?`)) {
                      deleteEvent(event.id)
                    }
                  }}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function EventCard({
  event,
  canManage,
  onDelete,
}: {
  event: Event
  canManage?: boolean
  onDelete?: () => void
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-secondary/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{event.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{event.location}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase text-primary">
            {event.type.replace(/_/g, ' ')}
          </span>
          {canManage && onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-red-600 hover:bg-red-50"
              onClick={onDelete}
              title="Delete event"
            >
              <Trash2 className="size-3" />
            </Button>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{formatDate(event.date)}</span>
        <span>•</span>
        <span>Audience: {event.scope}</span>
        <span>•</span>
        <span>Notifications: {event.notificationEnabled ? 'Enabled' : 'Off'}</span>
        <span>•</span>
        <span>Reminders: {event.reminderSchedule.join(', ')}</span>
      </div>
    </div>
  )
}
