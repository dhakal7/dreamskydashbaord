import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { CalendarDays, Clock, UserPlus, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { PersonAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { appointmentStatusMeta, PriorityBadge } from '@/components/shared/status-badges'
import { useAuthStore } from '@/store/auth-store'
import { hasPermission } from '@/lib/rbac'
import { visibleAppointments, visibleFollowUps } from '@/lib/data-visibility'
import { useAppointmentsStore } from '@/features/appointments/store'
import { LeadFormDialog } from '@/features/leads/components/lead-form-dialog'
import { followUps } from '@/mock'
import type { AppointmentStatus } from '@/types'

export default function ReceptionPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const allAppointments = useAppointmentsStore((s) => s.appointments)
  const updateAppointment = useAppointmentsStore((s) => s.updateAppointment)
  const [leadDialogOpen, setLeadDialogOpen] = useState(false)

  const todayStr = dayjs().format('YYYY-MM-DD')

  const todaysAppointments = useMemo(() => {
    return visibleAppointments(currentUser, allAppointments)
      .filter((a) => dayjs(a.start).format('YYYY-MM-DD') === todayStr)
      .sort((a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf())
  }, [currentUser, allAppointments, todayStr])

  const todaysFollowUps = useMemo(() => {
    return visibleFollowUps(currentUser, followUps)
      .filter((f) => f.date === todayStr && f.status === 'pending')
      .sort((a, b) => a.time.localeCompare(b.time))
  }, [currentUser, todayStr])

  function handleCheckIn(appt: { id: string; status: AppointmentStatus; studentName: string }) {
    if (appt.status === 'scheduled') {
      updateAppointment(appt.id, { status: 'confirmed' })
      toast.success(`${appt.studentName} checked in`)
    } else if (appt.status === 'confirmed') {
      updateAppointment(appt.id, { status: 'completed' })
      toast.success(`Appointment with ${appt.studentName} completed`)
    }
  }

  if (!hasPermission(currentUser.role, 'appointments.view')) {
    return <Navigate to="/unauthorized" replace />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reception"
        description="Walk-in desk — appointments, check-ins, and new leads."
      />

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr] xl:items-start">
        {/* ── Left: Today's Appointments ──────────────────────────────── */}
        <Card className="h-full">
          <CardHeader className="px-4 pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarDays className="size-4 text-muted-foreground" />
              Today's Appointments
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {todaysAppointments.length} scheduled for today
            </p>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-4">
            {todaysAppointments.length === 0 && (
              <EmptyState
                icon={CalendarDays}
                title="No appointments today"
                description="Nothing scheduled — ready for walk-ins."
                className="py-10"
              />
            )}
            {todaysAppointments.map((a) => {
              const meta = appointmentStatusMeta[a.status]
              const canCheckIn = a.status === 'scheduled' || a.status === 'confirmed'
              return (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-lg border border-border/70 p-3 transition-colors hover:bg-accent/40"
                >
                  <PersonAvatar name={a.studentName} className="size-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.studentName}</p>
                    <p className="truncate text-xs text-muted-foreground capitalize">
                      {a.type.replace('_', ' ')} · {a.counselorName}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="flex items-center gap-1 text-xs font-medium font-tabular text-muted-foreground">
                      <Clock className="size-3" />
                      {dayjs(a.start).format('h:mm A')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={meta.variant} className="text-[10px] py-0">
                        {meta.label}
                      </Badge>
                      {canCheckIn && (
                        <Button
                          size="sm"
                          variant={a.status === 'scheduled' ? 'default' : 'outline'}
                          className="h-6 gap-1 text-[10px]"
                          onClick={() => handleCheckIn(a)}
                        >
                          <CheckCircle2 className="size-3" />
                          {a.status === 'scheduled' ? 'Check In' : 'Done'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* ── Right column ────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Quick Walk-in */}
          <Card>
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <UserPlus className="size-4 text-muted-foreground" />
                New Walk-in
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-xs text-muted-foreground mb-3">
                Register a new visitor as a lead with full details.
              </p>
              <Button className="w-full gap-1.5" onClick={() => setLeadDialogOpen(true)}>
                <UserPlus className="size-3.5" />
                Capture Walk-in
              </Button>
            </CardContent>
          </Card>

          {/* Today's Follow-ups */}
          <Card className="h-full">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="size-4 text-muted-foreground" />
                Today's Follow-ups
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {todaysFollowUps.length} pending
              </p>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4">
              {todaysFollowUps.length === 0 && (
                <EmptyState
                  icon={CalendarDays}
                  title="All clear"
                  description="No follow-ups pending for today."
                  className="py-8"
                />
              )}
              {todaysFollowUps.slice(0, 8).map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 rounded-lg border border-border/70 p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{f.studentName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{f.reminder}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[11px] font-medium font-tabular text-muted-foreground">
                      {f.time}
                    </span>
                    <PriorityBadge priority={f.priority} className="text-[9px] py-0" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <LeadFormDialog open={leadDialogOpen} onOpenChange={setLeadDialogOpen} />
    </div>
  )
}
