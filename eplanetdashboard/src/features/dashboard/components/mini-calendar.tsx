import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppointmentsStore } from '@/features/appointments/store'
import { useEventsStore } from '@/features/events/store'
import { useAuthStore } from '@/store/auth-store'
import { visibleAppointments } from '@/lib/data-visibility'
import { cn } from '@/lib/utils'
import type { Appointment, Event } from '@/types'

function eventIsVisibleForRole(currentUserRole: string, event: Event) {
  if (currentUserRole === 'super_admin') return true
  if (currentUserRole === 'student') return event.scope === 'student' || event.scope === 'everyone'
  if (currentUserRole === 'referral_agent') return event.scope === 'everyone'
  if (currentUserRole === 'teacher') return event.scope === 'staff' || event.scope === 'everyone'
  return event.scope === 'staff' || event.scope === 'everyone'
}

export function MiniCalendar() {
  const allAppts = useAppointmentsStore((s) => s.appointments)
  const allEvents = useEventsStore((s) => s.events)
  const currentUser = useAuthStore((s) => s.currentUser)

  const [currentDate, setCurrentDate] = useState(() => dayjs())
  const [selectedDate, setSelectedDate] = useState(() => dayjs().format('YYYY-MM-DD'))

  const visibleAppts = visibleAppointments(currentUser, allAppts)
  const visibleEvents = allEvents.filter((event) => eventIsVisibleForRole(currentUser.role, event))

  const appointmentsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {}
    visibleAppts.forEach((appointment) => {
      const key = dayjs(appointment.start).format('YYYY-MM-DD')
      if (!map[key]) map[key] = []
      map[key].push(appointment)
    })
    return map
  }, [visibleAppts])

  const eventsByDate = useMemo(() => {
    const map: Record<string, Event[]> = {}
    visibleEvents.forEach((event) => {
      const key = dayjs(event.date).format('YYYY-MM-DD')
      if (!map[key]) map[key] = []
      map[key].push(event)
    })
    return map
  }, [visibleEvents])

  const calendarCells = useMemo(() => {
    const year = currentDate.year()
    const month = currentDate.month()
    const firstDayOfMonth = dayjs(`${year}-${month + 1}-01`)
    const startDayOfWeek = firstDayOfMonth.day()
    const daysInMonth = firstDayOfMonth.daysInMonth()

    const cells: Array<{ dateStr: string; dayNum: number; isCurrentMonth: boolean }> = []

    const prevMonth = firstDayOfMonth.subtract(1, 'month')
    const prevMonthDays = prevMonth.daysInMonth()
    for (let index = startDayOfWeek - 1; index >= 0; index--) {
      const dayNum = prevMonthDays - index
      cells.push({
        dateStr: prevMonth.date(dayNum).format('YYYY-MM-DD'),
        dayNum,
        isCurrentMonth: false,
      })
    }

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      cells.push({
        dateStr: firstDayOfMonth.date(dayNum).format('YYYY-MM-DD'),
        dayNum,
        isCurrentMonth: true,
      })
    }

    const nextMonth = firstDayOfMonth.add(1, 'month')
    const remaining = 42 - cells.length
    for (let dayNum = 1; dayNum <= remaining; dayNum++) {
      cells.push({
        dateStr: nextMonth.date(dayNum).format('YYYY-MM-DD'),
        dayNum,
        isCurrentMonth: false,
      })
    }

    return cells
  }, [currentDate])

  const selectedDayItems = useMemo(() => {
    const items: Array<{
      id: string
      kind: 'appointment' | 'event'
      title: string
      time: string
      details?: string
      sortKey: number
    }> = []

    ;(appointmentsByDate[selectedDate] ?? []).forEach((appointment) => {
      items.push({
        id: appointment.id,
        kind: 'appointment',
        title: appointment.title,
        time: dayjs(appointment.start).format('h:mm A'),
        details: appointment.counselorName,
        sortKey: dayjs(appointment.start).valueOf(),
      })
    })

    ;(eventsByDate[selectedDate] ?? []).forEach((event) => {
      items.push({
        id: event.id,
        kind: 'event',
        title: event.name,
        time: dayjs(event.date).format('h:mm A'),
        details: event.location,
        sortKey: dayjs(event.date).valueOf(),
      })
    })

    return items.sort((left, right) => left.sortKey - right.sortKey)
  }, [appointmentsByDate, eventsByDate, selectedDate])

  const today = dayjs()
  const todayStr = today.format('YYYY-MM-DD')
  const totalMarkedDays = new Set([
    ...Object.keys(appointmentsByDate),
    ...Object.keys(eventsByDate),
  ]).size

  const prevMonth = () => setCurrentDate((current) => current.subtract(1, 'month'))
  const nextMonth = () => setCurrentDate((current) => current.add(1, 'month'))
  const goToToday = () => {
    setCurrentDate(dayjs())
    setSelectedDate(dayjs().format('YYYY-MM-DD'))
  }

  return (
    <Card className="h-full overflow-hidden border-border/60 bg-background/95 shadow-sm">
      <CardHeader className="px-3 pb-2 pt-3">
        <CardTitle className="flex items-center gap-2 text-[13px] font-semibold">
          <CalendarDays className="size-3.5 text-muted-foreground" />
          <span>{currentDate.format('MMMM YYYY')}</span>
          <span className="ml-auto text-[10px] font-normal text-muted-foreground">
            {totalMarkedDays} marked day{totalMarkedDays !== 1 ? 's' : ''}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-2.5 px-2 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-7" onClick={prevMonth}>
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={goToToday}>
              Today
            </Button>
            <Button variant="outline" size="icon" className="size-7" onClick={nextMonth}>
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-center py-1.5">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <span key={day} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {day}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {calendarCells.map((cell, index) => {
            const dateItems = [
              ...(appointmentsByDate[cell.dateStr] ?? []).map((item) => ({ ...item, type: 'appointment' as const })),
              ...(eventsByDate[cell.dateStr] ?? []).map((item) => ({ ...item, type: 'event' as const })),
            ]
            const isSelected = selectedDate === cell.dateStr
            const isToday = cell.dateStr === todayStr
            const totalCount = dateItems.length

            return (
              <button
                key={`${cell.dateStr}-${index}`}
                onClick={() => setSelectedDate(cell.dateStr)}
                className={cn(
                  'min-h-[66px] rounded-md border border-border/60 bg-card p-1 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none relative',
                  !cell.isCurrentMonth && 'opacity-35',
                  isSelected && 'ring-1 ring-primary ring-inset',
                  isToday && 'bg-primary/5',
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      'flex size-4.5 items-center justify-center rounded-full text-[9px] font-semibold',
                      isToday && 'bg-primary text-primary-foreground',
                      isSelected && !isToday && 'text-primary',
                    )}
                  >
                    {cell.dayNum}
                  </span>
                  {totalCount > 0 && (
                    <span className="rounded-full bg-secondary px-1 py-0.5 text-[8px] font-semibold text-muted-foreground">
                      {totalCount}
                    </span>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap gap-1">
                  {dateItems.slice(0, 3).map((item) => (
                    <span
                      key={item.id}
                      className={cn(
                        'size-1.5 rounded-full shrink-0',
                        item.type === 'appointment' ? 'bg-primary' : 'bg-amber-500',
                      )}
                    />
                  ))}
                  {totalCount > 3 && (
                    <span className="text-[9px] text-muted-foreground">+{totalCount - 3}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold">{dayjs(selectedDate).format('MMMM D, YYYY')}</p>
            <span className="text-[10px] text-muted-foreground">
              {selectedDayItems.length} item{selectedDayItems.length !== 1 ? 's' : ''}
            </span>
          </div>

          {selectedDayItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">No appointments or events scheduled for this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedDayItems.map((item) => (
                <div key={item.id} className="rounded-md border border-border/70 bg-background/80 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase',
                      item.kind === 'appointment' ? 'bg-primary/10 text-primary' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                    )}>
                      {item.kind}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{item.time}</span>
                  </div>
                  <p className="mt-1 text-[12px] font-medium">{item.title}</p>
                  {item.details && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                      {item.kind === 'event' ? <MapPin className="size-3" /> : <Clock3 className="size-3" />}
                      <span>{item.details}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

