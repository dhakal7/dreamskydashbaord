import { useState, useMemo } from 'react'
import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, User, Phone, Mail, MessageSquare, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { priorityMeta } from '@/components/shared/status-badges'
import type { FollowUp } from '@/types'

const channelIcons = {
  call: Phone,
  email: Mail,
  whatsapp: MessageSquare,
  in_person: User,
  sms: MessageSquare,
}

interface CalendarViewProps {
  followUps: FollowUp[]
  onSelectFollowUp: (fu: FollowUp) => void
}

export function CalendarView({ followUps, onSelectFollowUp }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => dayjs())
  const [selectedDate, setSelectedDate] = useState<string>(() => dayjs().format('YYYY-MM-DD'))

  const currentYear = currentDate.year()
  const currentMonth = currentDate.month() // 0-indexed

  // Prev month / Next month navigation
  const prevMonth = () => setCurrentDate(currentDate.subtract(1, 'month'))
  const nextMonth = () => setCurrentDate(currentDate.add(1, 'month'))

  // Generate calendar days
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = dayjs(`${currentYear}-${currentMonth + 1}-01`)
    const startDayOfWeek = firstDayOfMonth.day() // 0 = Sunday, 1 = Monday...
    const daysInMonth = firstDayOfMonth.daysInMonth()

    const cells: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = []

    // Previous month padding
    const prevMonthObj = firstDayOfMonth.subtract(1, 'month')
    const prevMonthDays = prevMonthObj.daysInMonth()
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthDays - i
      cells.push({
        dateStr: prevMonthObj.date(d).format('YYYY-MM-DD'),
        dayNum: d,
        isCurrentMonth: false,
      })
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        dateStr: firstDayOfMonth.date(d).format('YYYY-MM-DD'),
        dayNum: d,
        isCurrentMonth: true,
      })
    }

    // Next month padding to fill a grid of 6 rows (42 cells)
    const nextMonthObj = firstDayOfMonth.add(1, 'month')
    const remainingCells = 42 - cells.length
    for (let d = 1; d <= remainingCells; d++) {
      cells.push({
        dateStr: nextMonthObj.date(d).format('YYYY-MM-DD'),
        dayNum: d,
        isCurrentMonth: false,
      })
    }

    return cells;
  }, [currentYear, currentMonth])

  // Group all followups by date string (YYYY-MM-DD) for O(1) cell lookup
  const followUpsByDate = useMemo(() => {
    const map: Record<string, FollowUp[]> = {}
    followUps.forEach((fu) => {
      if (!map[fu.date]) {
        map[fu.date] = []
      }
      map[fu.date].push(fu)
    })
    return map
  }, [followUps])

  // Get followups for the selected date
  const selectedDateFollowUps = useMemo(() => {
    return followUpsByDate[selectedDate] || []
  }, [followUpsByDate, selectedDate])

  // Agenda items for mobile (grouped and sorted)
  const mobileAgendaItems = useMemo(() => {
    // Show follow-ups for the current month, sorted by date and time
    const startOfMonthStr = currentDate.startOf('month').format('YYYY-MM-DD')
    const endOfMonthStr = currentDate.endOf('month').format('YYYY-MM-DD')

    const items = followUps.filter(
      (fu) => fu.date >= startOfMonthStr && fu.date <= endOfMonthStr
    )

    // Sort by date then time
    items.sort((a, b) => {
      const dateDiff = a.date.localeCompare(b.date)
      if (dateDiff !== 0) return dateDiff
      return a.time.localeCompare(b.time)
    })

    // Group by date
    const groups: { date: string; list: FollowUp[] }[] = []
    items.forEach((item) => {
      const lastGroup = groups[groups.length - 1]
      if (lastGroup && lastGroup.date === item.date) {
        lastGroup.list.push(item)
      } else {
        groups.push({ date: item.date, list: [item] })
      }
    })

    return groups
  }, [followUps, currentDate])

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="space-y-4">
      {/* Calendar Header with Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="size-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">
            {currentDate.format('MMMM YYYY')}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-8" onClick={prevMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs px-2.5" onClick={() => setCurrentDate(dayjs())}>
            Today
          </Button>
          <Button variant="outline" size="icon" className="size-8" onClick={nextMonth}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Responsive View Wrapper */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Desktop Month Grid (hidden on mobile, visible on desktop/large screens) */}
        <div className="hidden sm:block lg:col-span-2 border border-border bg-card rounded-xl overflow-hidden shadow-soft">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-center py-2">
            {daysOfWeek.map((day) => (
              <span key={day} className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {day}
              </span>
            ))}
          </div>

          {/* Month Cells Grid */}
          <div className="grid grid-cols-7 divide-x divide-y divide-border/60 bg-border/20">
            {calendarCells.map((cell, idx) => {
              const dateItems = followUpsByDate[cell.dateStr] || []
              const isSelected = selectedDate === cell.dateStr
              const isToday = cell.dateStr === dayjs().format('YYYY-MM-DD')

              // Sort items by priority for consistent rendering of dots
              const sortedItems = [...dateItems].sort((a, b) => {
                const priorityWeight = { urgent: 4, high: 3, medium: 2, low: 1 }
                return (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0)
              })

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(cell.dateStr)}
                  className={cn(
                    'min-h-[90px] p-2 flex flex-col items-stretch text-left transition-colors bg-card hover:bg-muted/30 focus-visible:outline-none relative',
                    !cell.isCurrentMonth && 'opacity-30 bg-secondary/5 hover:opacity-40',
                    isSelected && 'ring-2 ring-primary ring-inset z-10',
                    isToday && 'bg-primary/5'
                  )}
                >
                  <div className="flex justify-between items-center">
                    <span
                      className={cn(
                        'text-xs font-semibold font-tabular flex size-5 items-center justify-center rounded-full',
                        isToday && 'bg-primary text-primary-foreground',
                        isSelected && !isToday && 'text-primary'
                      )}
                    >
                      {cell.dayNum}
                    </span>
                    {dateItems.length > 0 && (
                      <span className="text-[10px] text-muted-foreground font-semibold px-1 rounded bg-secondary/85">
                        {dateItems.length}
                      </span>
                    )}
                  </div>

                  {/* Followups Dots Container */}
                  <div className="mt-auto pt-2 flex flex-wrap gap-1">
                    {sortedItems.slice(0, 5).map((fu) => (
                      <span
                        key={fu.id}
                        className="size-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: priorityMeta[fu.priority].dot }}
                        title={`${fu.studentName}: ${fu.reminder}`}
                      />
                    ))}
                    {sortedItems.length > 5 && (
                      <span className="text-[9px] text-muted-foreground font-medium shrink-0 leading-none">
                        +{sortedItems.length - 5}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Selected Day's Follow-ups Panel (Desktop: side column; Mobile: hidden when collapsed) */}
        <div className="hidden sm:block lg:col-span-1">
          <Card className="h-full min-h-[400px] border border-border shadow-soft flex flex-col">
            <div className="p-4 border-b border-border bg-muted/20">
              <h3 className="font-semibold text-foreground text-[14px] flex items-center gap-1.5">
                <CalendarIcon className="size-4 text-primary" />
                Schedule for {dayjs(selectedDate).format('MMM D, YYYY')}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedDateFollowUps.length} follow-up reminders scheduled
              </p>
            </div>
            <CardContent className="p-3 flex-1 overflow-y-auto space-y-2">
              {selectedDateFollowUps.length === 0 ? (
                <div className="h-full min-h-[250px] flex flex-col items-center justify-center text-center p-4">
                  <AlertCircle className="size-8 text-muted-foreground/60 mb-2" />
                  <p className="text-xs font-medium text-muted-foreground">No follow-ups for this day</p>
                </div>
              ) : (
                selectedDateFollowUps.map((fu) => {
                  const ChannelIcon = channelIcons[fu.channel] || Phone
                  return (
                    <button
                      key={fu.id}
                      onClick={() => onSelectFollowUp(fu)}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border border-border/75 bg-card hover:bg-accent/40 transition-colors flex flex-col gap-1.5 relative overflow-hidden group shadow-soft",
                        fu.status === 'completed' && 'opacity-65'
                      )}
                    >
                      {/* Left color bar representing priority */}
                      <span
                        className="absolute left-0 top-0 bottom-0 w-1"
                        style={{ backgroundColor: priorityMeta[fu.priority].dot }}
                      />
                      <div className="flex justify-between items-start pl-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                            {fu.studentName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate font-medium mt-0.5">
                            {fu.reminder}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0 font-tabular text-[11px] text-muted-foreground font-medium">
                          <div className="flex items-center gap-1">
                            <Clock className="size-3" />
                            {fu.time}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pl-1.5 pt-1 border-t border-border/40 mt-0.5">
                        <div className="flex items-center gap-1.5 capitalize font-medium">
                          <ChannelIcon className="size-3" />
                          {fu.channel}
                        </div>
                        <span className="capitalize font-semibold text-foreground/80">{fu.status}</span>
                      </div>
                    </button>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Mobile Agenda List View (visible ONLY on small screens, collapsing month grid) */}
        <div className="sm:hidden space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Agenda for {currentDate.format('MMMM')}
          </p>
          {mobileAgendaItems.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-8 text-center bg-card">
              <AlertCircle className="size-8 text-muted-foreground/60 mx-auto mb-2" />
              <p className="text-xs font-medium text-muted-foreground">No follow-ups scheduled this month.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {mobileAgendaItems.map((group) => (
                <div key={group.date} className="space-y-2">
                  {/* Sticky date header for agenda */}
                  <div className="sticky top-0 bg-background/95 backdrop-blur z-10 py-1.5 px-2 border-b border-border/60 text-xs font-bold text-foreground flex justify-between items-center">
                    <span>{dayjs(group.date).format('dddd, MMMM D')}</span>
                    <span className="text-[10px] text-muted-foreground font-semibold bg-secondary px-1.5 py-0.5 rounded-full">
                      {group.list.length}
                    </span>
                  </div>
                  {/* List of items on this date */}
                  <div className="space-y-2 px-1">
                    {group.list.map((fu) => {
                      const ChannelIcon = channelIcons[fu.channel] || Phone
                      return (
                        <button
                          key={fu.id}
                          onClick={() => onSelectFollowUp(fu)}
                          className={cn(
                            "w-full text-left p-3 rounded-lg border border-border/75 bg-card hover:bg-accent/40 flex flex-col gap-1.5 relative overflow-hidden",
                            fu.status === 'completed' && 'opacity-65'
                          )}
                        >
                          <span
                            className="absolute left-0 top-0 bottom-0 w-1"
                            style={{ backgroundColor: priorityMeta[fu.priority].dot }}
                          />
                          <div className="flex justify-between items-start pl-1.5">
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-semibold text-foreground truncate">
                                {fu.studentName}
                              </p>
                              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                                {fu.reminder}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 font-tabular text-[11px] text-muted-foreground">
                              <Clock className="size-3" />
                              {fu.time}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground pl-1.5 pt-1 border-t border-border/40">
                            <div className="flex items-center gap-1 capitalize">
                              <ChannelIcon className="size-3" />
                              {fu.channel}
                            </div>
                            <span className="capitalize font-semibold text-foreground/80">{fu.status}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
