import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import {
  Plus, ChevronLeft, ChevronRight, CalendarDays, CalendarRange, Clock3,
  Search, SlidersHorizontal,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { counselors } from '@/mock'
import type { Appointment, AppointmentStatus } from '@/types'
import { useAuthStore } from '@/store/auth-store'
import { visibleAppointments } from '@/lib/data-visibility'
import { hasPermission } from '@/lib/rbac'
import { isMockMode } from '@/lib/api-client'
import { useAppointments } from '@/hooks/use-appointments'
import { useAppointmentsStore } from './store'
import { AppointmentDialog } from './components/appointment-dialog'
import {
  MonthView, WeekView, DayView, AppointmentsEmptyState,
} from './components/calendar-views'

type ViewMode = 'day' | 'week' | 'month'

const typeOptions = [
  { value: 'all', label: 'All Types' },
  { value: 'counseling', label: 'Counseling' },
  { value: 'document_review', label: 'Document Review' },
  { value: 'visa_prep', label: 'Visa Prep' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'orientation', label: 'Orientation' },
]

const statusOptions: { value: AppointmentStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No Show' },
]

export default function AppointmentsPage() {
  const mockAppointments = useAppointmentsStore((s) => s.appointments)
  const currentUser = useAuthStore((s) => s.currentUser)
  const canManage = hasPermission(currentUser.role, 'appointments.manage')

  // Live mode: scope to counselor if role is counselor
  const counselorId = currentUser.role === 'counselor' ? (currentUser.linkedId || undefined) : undefined
  const { data: apiData } = useAppointments({ counselorId, limit: 200 })

  const appointments: Appointment[] = !isMockMode()
    ? (apiData?.appointments ?? []).map((a) => ({
        id: a.id,
        title: `${(a.type ?? 'Appointment').replace(/_/g, ' ')} — ${a.student ? `${a.student.firstName} ${a.student.lastName}` : 'Student'}`,
        studentId: a.studentId,
        studentName: a.student ? `${a.student.firstName} ${a.student.lastName}` : 'Unknown Student',
        counselorId: a.counselorId ?? '',
        counselorName: a.counselor ? `${a.counselor.firstName} ${a.counselor.lastName}` : 'Counselor',
        counselorIds: a.counselorId ? [a.counselorId] : [],
        counselorNames: a.counselor ? [`${a.counselor.firstName} ${a.counselor.lastName}`] : [],
        type: (a.type?.toLowerCase() as Appointment['type']) ?? 'counseling',
        status: (a.status?.toLowerCase() as AppointmentStatus) ?? 'scheduled',
        start: a.datetime,
        end: new Date(new Date(a.datetime).getTime() + (a.durationMin ?? 30) * 60000).toISOString(),
        location: (a.meetingMode?.toLowerCase() as Appointment['location']) ?? 'branch_office',
        notes: a.notes ?? '',
      }))
    : mockAppointments

  // View & navigation state
  const [view, setView] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState(() => dayjs())
  const [selectedDate, setSelectedDate] = useState(() => dayjs().format('YYYY-MM-DD'))

  // Filters
  const [search, setSearch] = useState('')
  const [filterCounselor, setFilterCounselor] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState<AppointmentStatus | 'all'>('all')

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)
  const [newApptDate, setNewApptDate] = useState<string | undefined>(undefined)

  // ── Filtered appointments ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return visibleAppointments(currentUser, appointments).filter((a) => {
      if (q && !`${a.studentName} ${a.counselorName} ${a.type}`.toLowerCase().includes(q)) return false
      if (filterCounselor !== 'all' && a.counselorId !== filterCounselor) return false
      if (filterType !== 'all' && a.type !== filterType) return false
      if (filterStatus !== 'all' && a.status !== filterStatus) return false
      return true
    })
  }, [currentUser, appointments, search, filterCounselor, filterType, filterStatus])

  // ── Metric counts ────────────────────────────────────────────────────────
  const totalCount = filtered.length
  const todayCount = filtered.filter((a) => dayjs(a.start).isSame(dayjs(), 'day')).length
  const upcomingCount = filtered.filter((a) =>
    dayjs(a.start).isAfter(dayjs()) &&
    (a.status === 'scheduled' || a.status === 'confirmed')
  ).length
  const cancelledCount = filtered.filter((a) => a.status === 'cancelled').length

  // ── Navigation label ────────────────────────────────────────────────────
  const navLabel = useMemo(() => {
    if (view === 'month') return currentDate.format('MMMM YYYY')
    if (view === 'week') {
      const start = currentDate.startOf('week')
      const end = currentDate.endOf('week')
      return start.format('MMM D') + ' – ' + end.format('MMM D, YYYY')
    }
    return currentDate.format('dddd, MMMM D, YYYY')
  }, [view, currentDate])

  function navigate(dir: 1 | -1) {
    const unit = view === 'day' ? 'day' : view === 'week' ? 'week' : 'month'
    setCurrentDate((d) => dir === 1 ? d.add(1, unit) : d.subtract(1, unit))
  }

  // ── Dialog handlers ─────────────────────────────────────────────────────
  function openNewDialog(date?: string) {
    setSelectedAppt(null)
    setNewApptDate(date ?? selectedDate)
    setDialogOpen(true)
  }

  function openEditDialog(appt: Appointment) {
    setSelectedAppt(appt)
    setNewApptDate(undefined)
    setDialogOpen(true)
  }

  const hasNoResults = filtered.length === 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Appointments"
        description="Schedule and manage counseling sessions, document reviews, and visa preparation meetings."
        actions={
          canManage && (
            <Button size="sm" onClick={() => openNewDialog()}>
              <Plus className="size-3.5 mr-1" />
              New Appointment
            </Button>
          )
        }
      />

      {/* ── Metrics ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <Card className="p-3.5 shadow-soft">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="mt-1 text-xl font-semibold font-tabular">{totalCount}</p>
        </Card>
        <Card className="p-3.5 shadow-soft">
          <p className="text-xs text-muted-foreground">Today</p>
          <p className="mt-1 text-xl font-semibold font-tabular text-brand-600">{todayCount}</p>
        </Card>
        <Card className="p-3.5 shadow-soft">
          <p className="text-xs text-muted-foreground">Upcoming</p>
          <p className="mt-1 text-xl font-semibold font-tabular text-success-600">{upcomingCount}</p>
        </Card>
        <Card className="p-3.5 shadow-soft">
          <p className="text-xs text-muted-foreground">Cancelled</p>
          <p className="mt-1 text-xl font-semibold font-tabular text-danger-600">{cancelledCount}</p>
        </Card>
      </div>

      {/* ── Control Bar ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {/* Row 1: Search + Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student or counselor…"
              className="pl-8 h-9 text-sm"
            />
          </div>

          {/* Counselor Filter */}
          <Select value={filterCounselor} onValueChange={setFilterCounselor}>
            <SelectTrigger className="h-9 text-sm w-[170px]">
              <SlidersHorizontal className="size-3.5 text-muted-foreground mr-1.5 shrink-0" />
              <SelectValue placeholder="All Counselors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Counselors</SelectItem>
              {counselors.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Type Filter */}
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-9 text-sm w-[155px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as AppointmentStatus | 'all')}>
            <SelectTrigger className="h-9 text-sm w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Row 2: Date Nav + View Toggle */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {/* Date Navigation */}
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => navigate(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs px-2.5"
              onClick={() => { setCurrentDate(dayjs()); setSelectedDate(dayjs().format('YYYY-MM-DD')) }}
            >
              Today
            </Button>
            <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => navigate(1)}>
              <ChevronRight className="size-4" />
            </Button>
            <span className="text-sm font-semibold text-foreground ml-1 font-tabular tabular-nums">
              {navLabel}
            </span>
          </div>

          {/* View Toggle — same pattern as Leads (Table/Pipeline) */}
          <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-secondary/50 p-1 self-start sm:self-auto shadow-soft">
            <button
              onClick={() => setView('day')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                view === 'day'
                  ? 'bg-background shadow-soft text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Clock3 className="size-3.5" /> Day
            </button>
            <button
              onClick={() => setView('week')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                view === 'week'
                  ? 'bg-background shadow-soft text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <CalendarRange className="size-3.5" /> Week
            </button>
            <button
              onClick={() => setView('month')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                view === 'month'
                  ? 'bg-background shadow-soft text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <CalendarDays className="size-3.5" /> Month
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Calendar Content ────────────────────────────────────── */}
      {hasNoResults ? (
        <AppointmentsEmptyState onNew={canManage ? () => openNewDialog() : () => {}} />
      ) : (
        <>
          {view === 'month' && (
            <MonthView
              appointments={filtered}
              currentDate={currentDate}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onSelectAppointment={openEditDialog}
              onNewOnDate={canManage ? openNewDialog : () => {}}
            />
          )}
          {view === 'week' && (
            <WeekView
              appointments={filtered}
              currentDate={currentDate}
              onSelectAppointment={openEditDialog}
              onNewOnDate={canManage ? openNewDialog : () => {}}
            />
          )}
          {view === 'day' && (
            <DayView
              appointments={filtered}
              currentDate={currentDate}
              onSelectAppointment={openEditDialog}
              onNewOnDate={canManage ? openNewDialog : () => {}}
            />
          )}
        </>
      )}

      {/* ── Dialog ───────────────────────────────────────────────────── */}
      <AppointmentDialog
        appointment={selectedAppt}
        defaultDate={newApptDate}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}
