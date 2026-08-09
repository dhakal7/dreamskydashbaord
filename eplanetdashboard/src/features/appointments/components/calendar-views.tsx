import { useMemo } from 'react'
import dayjs from 'dayjs'
import { MapPin, Monitor, Phone, CalendarDays, AlertCircle } from 'lucide-react'
import { PersonAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { appointmentStatusMeta } from '@/components/shared/status-badges'
import { students } from '@/mock'
import type { Appointment } from '@/types'

// ── Shared Helpers ────────────────────────────────────────────────────────────

const locationIcons: Record<Appointment['location'], React.ElementType> = {
  branch_office: MapPin,
  video_call: Monitor,
  phone_call: Phone,
}

const locationLabels: Record<Appointment['location'], string> = {
  branch_office: 'Branch Office',
  video_call: 'Video Call',
  phone_call: 'Phone Call',
}

const typeColors: Record<Appointment['type'], string> = {
  counseling: 'bg-brand-500',
  document_review: 'bg-warning-500',
  visa_prep: 'bg-violet-500',
  follow_up: 'bg-success-500',
  orientation: 'bg-sky-500',
}

const typeBorderColors: Record<Appointment['type'], string> = {
  counseling: 'border-brand-500',
  document_review: 'border-warning-500',
  visa_prep: 'border-violet-500',
  follow_up: 'border-success-500',
  orientation: 'border-sky-500',
}

const typeLabels: Record<Appointment['type'], string> = {
  counseling: 'Counseling',
  document_review: 'Doc Review',
  visa_prep: 'Visa Prep',
  follow_up: 'Follow-up',
  orientation: 'Orientation',
}

// Build a student color map once
function useStudentColorMap() {
  return useMemo(() => {
    const map: Record<string, string> = {}
    students.forEach((s) => { map[s.id] = s.photoColor })
    return map
  }, [])
}

function isToday(dateStr: string) {
  return dayjs(dateStr).isSame(dayjs(), 'day')
}

// ── Appointment Card ──────────────────────────────────────────────────────────

interface AppointmentCardProps {
  appt: Appointment
  studentColors: Record<string, string>
  compact?: boolean
  onClick: (appt: Appointment) => void
}

function formatCounselorLabel(appt: Appointment) {
  const names = appt.counselorNames?.filter(Boolean)
  if (names && names.length > 0) {
    if (names.length === 1) return names[0]
    if (names.length <= 3) return names.join(', ')
    return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`
  }

  if (appt.counselorName) return appt.counselorName
  return 'Unassigned'
}

function AppointmentCard({ appt, studentColors, compact = false, onClick }: AppointmentCardProps) {
  const LocationIcon = locationIcons[appt.location]
  const statusMeta = appointmentStatusMeta[appt.status]
  const todayHighlight = isToday(appt.start)
  const counselorLabel = formatCounselorLabel(appt)

  return (
    <button
      onClick={() => onClick(appt)}
      className={cn(
        'group w-full text-left rounded-lg border bg-card shadow-soft transition-all hover:shadow-card hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring relative overflow-hidden',
        'border-l-[3px]',
        typeBorderColors[appt.type],
        appt.status === 'cancelled' && 'opacity-55',
        compact ? 'p-2' : 'p-3',
        todayHighlight && 'bg-accent/40 ring-1 ring-brand-200 dark:ring-brand-900'
      )}
    >
      {/* Today badge strip */}
      {todayHighlight && (
        <span className="absolute top-0 right-0 bg-brand-500 text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-bl-md">
          TODAY
        </span>
      )}

      <div className={cn('flex items-start gap-2', compact && 'items-center')}>
        <PersonAvatar
          name={appt.studentName}
          color={studentColors[appt.studentId]}
          className={compact ? 'size-6 shrink-0' : 'size-7 shrink-0'}
        />
        <div className="min-w-0 flex-1">
          <p className={cn(
            'font-semibold text-foreground truncate group-hover:text-primary transition-colors',
            compact ? 'text-[12px]' : 'text-[13px]'
          )}>
            {appt.studentName}
          </p>
          {!compact && (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {counselorLabel}
            </p>
          )}
        </div>
        {!compact && (
          <Badge variant={statusMeta.variant} className="shrink-0 text-[10px] py-0 px-1.5">
            {statusMeta.label}
          </Badge>
        )}
      </div>

      {!compact && (
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/40 pt-2 mt-2">
          <div className="flex items-center gap-1.5">
            <span
              className={cn('size-1.5 rounded-full shrink-0', typeColors[appt.type])}
            />
            <span className="font-medium">{typeLabels[appt.type]}</span>
          </div>
          <div className="flex items-center gap-1 font-tabular">
            <LocationIcon className="size-3 shrink-0" />
            <span>{locationLabels[appt.location]}</span>
          </div>
        </div>
      )}

      <div className={cn(
        'font-tabular text-muted-foreground',
        compact ? 'text-[10px] ml-8' : 'text-[11px] mt-1.5 flex items-center gap-1'
      )}>
        {!compact && <span className="text-foreground/70 font-medium">{dayjs(appt.start).format('h:mm')}</span>}
        {!compact && <span>–</span>}
        {!compact && <span>{dayjs(appt.end).format('h:mm A')}</span>}
        {compact && <span>{dayjs(appt.start).format('h:mm A')}</span>}
      </div>
    </button>
  )
}

// ── Month View ────────────────────────────────────────────────────────────────

interface MonthViewProps {
  appointments: Appointment[]
  currentDate: dayjs.Dayjs
  selectedDate: string
  onSelectDate: (date: string) => void
  onSelectAppointment: (appt: Appointment) => void
  onNewOnDate: (date: string) => void
}

export function MonthView({
  appointments,
  currentDate,
  selectedDate,
  onSelectDate,
  onSelectAppointment,
  onNewOnDate,
}: MonthViewProps) {
  const studentColors = useStudentColorMap()

  const { calendarCells, apptsByDate } = useMemo(() => {
    const year = currentDate.year()
    const month = currentDate.month()
    const firstDay = dayjs(`${year}-${month + 1}-01`)
    const startDow = firstDay.day()
    const daysInMonth = firstDay.daysInMonth()

    const cells: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = []
    const prev = firstDay.subtract(1, 'month')
    const prevDays = prev.daysInMonth()
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevDays - i
      cells.push({ dateStr: prev.date(d).format('YYYY-MM-DD'), dayNum: d, isCurrentMonth: false })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ dateStr: firstDay.date(d).format('YYYY-MM-DD'), dayNum: d, isCurrentMonth: true })
    }
    const next = firstDay.add(1, 'month')
    const remaining = 42 - cells.length
    for (let d = 1; d <= remaining; d++) {
      cells.push({ dateStr: next.date(d).format('YYYY-MM-DD'), dayNum: d, isCurrentMonth: false })
    }

    const map: Record<string, Appointment[]> = {}
    appointments.forEach((a) => {
      const key = dayjs(a.start).format('YYYY-MM-DD')
      if (!map[key]) map[key] = []
      map[key].push(a)
    })

    return { calendarCells: cells, apptsByDate: map }
  }, [currentDate, appointments])

  const selectedAppts = apptsByDate[selectedDate] ?? []
  const todayStr = dayjs().format('YYYY-MM-DD')
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
      {/* Calendar Grid */}
      <div className="border border-border rounded-xl overflow-hidden bg-card shadow-soft">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {daysOfWeek.map((d) => (
            <div key={d} className="py-2.5 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7 divide-x divide-y divide-border/60 bg-border/20">
          {calendarCells.map((cell, idx) => {
            const dayAppts = apptsByDate[cell.dateStr] ?? []
            const isSel = selectedDate === cell.dateStr
            const isTod = cell.dateStr === todayStr

            return (
              <button
                key={idx}
                onClick={() => onSelectDate(cell.dateStr)}
                onDoubleClick={() => onNewOnDate(cell.dateStr)}
                className={cn(
                  'min-h-[86px] p-1.5 flex flex-col text-left transition-colors bg-card hover:bg-muted/30 focus-visible:outline-none relative',
                  !cell.isCurrentMonth && 'opacity-30 bg-secondary/5',
                  isSel && 'ring-2 ring-inset ring-primary z-10',
                  isTod && !isSel && 'bg-accent/30'
                )}
              >
                {/* Day number */}
                <span
                  className={cn(
                    'text-xs font-semibold font-tabular flex size-5 items-center justify-center rounded-full self-start',
                    isTod ? 'bg-primary text-primary-foreground' : 'text-foreground/80',
                    isSel && !isTod && 'text-primary'
                  )}
                >
                  {cell.dayNum}
                </span>

                {/* Event bars */}
                <div className="mt-1 space-y-0.5 flex-1">
                  {dayAppts.slice(0, 3).map((a) => (
                    <div
                      key={a.id}
                      onClick={(e) => { e.stopPropagation(); onSelectAppointment(a) }}
                      className={cn(
                        'text-[10px] font-medium rounded px-1 py-0.5 truncate cursor-pointer text-white transition-opacity hover:opacity-80',
                        typeColors[a.type],
                        a.status === 'cancelled' && 'opacity-40'
                      )}
                    >
                      {dayjs(a.start).format('h:mm')} {a.studentName.split(' ')[0]}
                    </div>
                  ))}
                  {dayAppts.length > 3 && (
                    <div className="text-[10px] text-muted-foreground font-medium px-1">
                      +{dayAppts.length - 3} more
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected Day Side Panel */}
      <div className="border border-border rounded-xl bg-card shadow-soft flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-foreground">
              {dayjs(selectedDate).format('MMMM D, YYYY')}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedAppts.length} appointment{selectedAppts.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => onNewOnDate(selectedDate)}
            className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
          >
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {selectedAppts.length === 0 ? (
            <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center p-4">
              <CalendarDays className="size-7 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">No appointments scheduled</p>
              <button
                onClick={() => onNewOnDate(selectedDate)}
                className="mt-2 text-xs text-primary font-medium hover:underline"
              >
                Schedule one →
              </button>
            </div>
          ) : (
            selectedAppts
              .sort((a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf())
              .map((a) => (
                <AppointmentCard
                  key={a.id}
                  appt={a}
                  studentColors={studentColors}
                  onClick={onSelectAppointment}
                />
              ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── Week View ─────────────────────────────────────────────────────────────────

interface WeekViewProps {
  appointments: Appointment[]
  currentDate: dayjs.Dayjs
  onSelectAppointment: (appt: Appointment) => void
  onNewOnDate: (date: string) => void
}

export function WeekView({ appointments, currentDate, onSelectAppointment, onNewOnDate }: WeekViewProps) {
  const studentColors = useStudentColorMap()

  const weekDays = useMemo(() => {
    const startOfWeek = currentDate.startOf('week')
    return Array.from({ length: 7 }).map((_, i) => startOfWeek.add(i, 'day'))
  }, [currentDate])

  const apptsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {}
    appointments.forEach((a) => {
      const key = dayjs(a.start).format('YYYY-MM-DD')
      if (!map[key]) map[key] = []
      map[key].push(a)
    })
    return map
  }, [appointments])

  const todayStr = dayjs().format('YYYY-MM-DD')

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card shadow-soft">
      {/* Headers */}
      <div className="grid grid-cols-7 border-b border-border bg-muted/40 divide-x divide-border/60">
        {weekDays.map((d) => {
          const dStr = d.format('YYYY-MM-DD')
          const isToday = dStr === todayStr
          return (
            <div
              key={dStr}
              className={cn(
                'py-2.5 px-2 text-center',
                isToday && 'bg-accent/40'
              )}
            >
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {d.format('ddd')}
              </p>
              <p className={cn(
                'text-sm font-semibold font-tabular mt-0.5',
                isToday ? 'text-primary' : 'text-foreground'
              )}>
                {d.format('D')}
              </p>
            </div>
          )
        })}
      </div>

      {/* Day columns */}
      <div className="grid grid-cols-7 divide-x divide-border/60 min-h-[400px]">
        {weekDays.map((d) => {
          const dStr = d.format('YYYY-MM-DD')
          const dayAppts = (apptsByDate[dStr] ?? []).sort(
            (a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf()
          )
          const isToday = dStr === todayStr

          return (
            <div
              key={dStr}
              className={cn('p-1.5 space-y-1.5', isToday && 'bg-accent/10')}
            >
              {dayAppts.length === 0 ? (
                <button
                  onClick={() => onNewOnDate(dStr)}
                  className="w-full h-full min-h-[80px] flex items-center justify-center text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  <span className="text-center leading-relaxed">+ Add</span>
                </button>
              ) : (
                dayAppts.map((a) => (
                  <AppointmentCard
                    key={a.id}
                    appt={a}
                    studentColors={studentColors}
                    compact
                    onClick={onSelectAppointment}
                  />
                ))
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Day View ──────────────────────────────────────────────────────────────────

const HOUR_START = 8
const HOUR_END = 19

interface DayViewProps {
  appointments: Appointment[]
  currentDate: dayjs.Dayjs
  onSelectAppointment: (appt: Appointment) => void
  onNewOnDate: (date: string) => void
}

export function DayView({ appointments, currentDate, onSelectAppointment, onNewOnDate }: DayViewProps) {
  const studentColors = useStudentColorMap()

  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)

  const dayStr = currentDate.format('YYYY-MM-DD')
  const todayStr = dayjs().format('YYYY-MM-DD')
  const isToday = dayStr === todayStr

  const dayAppts = useMemo(() =>
    appointments
      .filter((a) => dayjs(a.start).format('YYYY-MM-DD') === dayStr)
      .sort((a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf()),
    [appointments, dayStr]
  )

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card shadow-soft">
      {/* Day Header */}
      <div className={cn('px-5 py-3 border-b border-border', isToday && 'bg-accent/20')}>
        <div className="flex items-center justify-between">
          <div>
            <p className={cn('text-base font-bold', isToday && 'text-primary')}>
              {isToday && <span className="mr-2 text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5 font-semibold">TODAY</span>}
              {currentDate.format('dddd, MMMM D, YYYY')}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {dayAppts.length} appointment{dayAppts.length !== 1 ? 's' : ''} scheduled
            </p>
          </div>
          <button
            onClick={() => onNewOnDate(dayStr)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            + New Appointment
          </button>
        </div>
      </div>

      {/* Hourly Timeline */}
      <div className="overflow-y-auto max-h-[600px]">
        {hours.map((hour) => {
          const slotStart = dayjs(`${dayStr}T${String(hour).padStart(2, '0')}:00:00`)
          const slotAppts = dayAppts.filter((a) => {
            const s = dayjs(a.start)
            return s.hour() === hour
          })

          return (
            <div key={hour} className="flex border-b border-border/40 last:border-0 min-h-[64px]">
              {/* Time label */}
              <div className="w-16 shrink-0 py-2 px-3 text-right">
                <span className="text-[11px] font-tabular text-muted-foreground font-medium">
                  {slotStart.format('h A')}
                </span>
              </div>

              {/* Slot content */}
              <div className="flex-1 py-1.5 px-3 border-l border-border/40 space-y-1.5">
                {slotAppts.length === 0 ? (
                  <button
                    onClick={() => onNewOnDate(dayStr)}
                    className="w-full h-full min-h-[40px] flex items-center text-[11px] text-muted-foreground/40 hover:text-muted-foreground/80 transition-colors"
                  >
                    <span>Click to add appointment at {slotStart.format('h:mm A')}</span>
                  </button>
                ) : (
                  slotAppts.map((a) => (
                    <AppointmentCard
                      key={a.id}
                      appt={a}
                      studentColors={studentColors}
                      onClick={onSelectAppointment}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────

export function AppointmentsEmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="border border-dashed border-border rounded-xl p-12 text-center bg-card">
      <AlertCircle className="size-9 text-muted-foreground/40 mx-auto mb-3" />
      <p className="text-sm font-medium text-foreground">No appointments found</p>
      <p className="text-xs text-muted-foreground mt-1 mb-4">
        Try adjusting your filters or schedule a new appointment.
      </p>
      <button
        onClick={onNew}
        className="text-xs font-semibold text-primary hover:underline"
      >
        + Schedule new appointment
      </button>
    </div>
  )
}
