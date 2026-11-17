import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { PriorityBadge, leadStageMeta, leadStageOrder } from '@/components/shared/status-badges'
import { Users, TrendingUp, CalendarClock, CalendarDays, UserCheck, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RoleStatCards } from './shared'
import { useCounselorDashboard, ZERO_COUNSELOR } from '../hooks/use-dashboard-stats'
import { useLiveLeads } from '@/hooks/use-leads-live'
import { useAppointments } from '@/hooks/use-appointments'
import { formatCurrency } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { getCounselorScopeId } from '@/lib/data-visibility'
import { isMockMode } from '@/lib/api-client'
import dayjs from 'dayjs'

export function CounselorDashboard() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const counselorScopeId = getCounselorScopeId(currentUser) ?? currentUser.linkedId
  const {
    data,
    isLoading: isDashboardLoading,
    isFetching: isDashboardFetching,
    isError: isDashboardError,
    error: dashboardError,
    refetch: refetchDashboard,
  } = useCounselorDashboard(counselorScopeId)
  const dashboard = data ?? ZERO_COUNSELOR

  const {
    leads: liveLeads,
    refetch: refetchLeads,
    isFetching: isLeadsFetching,
  } = useLiveLeads({ enabled: !isMockMode() })
  const {
    data: apptsData,
    refetch: refetchAppts,
    isFetching: isApptsFetching,
  } = useAppointments({
    counselorId: counselorScopeId || undefined,
    limit: 200,
  })

  const isRefreshing = isDashboardFetching || isLeadsFetching || isApptsFetching

  const handleRefresh = () => {
    if (isRefreshing) return
    void Promise.all([
      refetchDashboard(),
      !isMockMode() ? refetchLeads() : Promise.resolve(),
      refetchAppts(),
    ])
  }

  const assignedStudents = useMemo(() => {
    const apptsByStudent = new Map<string, { datetime: string; type: string; status: string }>()
    for (const appt of apptsData?.appointments ?? []) {
      if (appt.status !== 'SCHEDULED') continue
      const existing = apptsByStudent.get(appt.studentId)
      if (!existing || dayjs(appt.datetime).isBefore(dayjs(existing.datetime))) {
        apptsByStudent.set(appt.studentId, {
          datetime: appt.datetime,
          type: appt.type,
          status: appt.status,
        })
      }
    }

    return liveLeads
      .filter((l) => l.stage === 'assigned' || l.stage === 'counseling')
      .map((l) => ({
        ...l,
        appointment: apptsByStudent.get(l.id) ?? null,
      }))
  }, [liveLeads, apptsData])

  const stats = [
    { label: 'My Students', value: dashboard.totalStudents, icon: Users, color: '#2563EB', sub: `${dashboard.activeStudents} active` },
    { label: 'Leads in Pipeline', value: dashboard.totalLeads, icon: TrendingUp, color: '#7C3AED' },
    {
      label: 'Conversion Rate', value: `${dashboard.counselor?.conversionRate ?? 0}%`, icon: TrendingUp, color: '#0891B2',
      sub: `${dashboard.counselor?.studentsHandled ?? 0} handled lifetime`,
    },
    {
      label: 'Commission Earned', value: formatCurrency(dashboard.commission.earned), icon: TrendingUp, color: '#16A34A',
      sub: `${formatCurrency(dashboard.commission.pending)} pending`,
    },
  ]

  const maxStageCount = Math.max(1, ...dashboard.stageBreakdown.map((s) => s.count))

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Welcome back, ${dashboard.counselor?.name.split(' ')[0] ?? 'Counselor'}`}
        description="Your assigned students, pipeline, and follow-ups."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh dashboard"
            >
              <RefreshCw className={cn('size-4', isRefreshing && 'animate-spin')} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button variant="outline" size="sm" asChild><Link to="/students"><Users className="size-4" /> My Students</Link></Button>
            <Button variant="outline" size="sm" asChild><Link to="/appointments"><CalendarDays className="size-4" /> Appointments</Link></Button>
            <Button variant="outline" size="sm" asChild><Link to="/follow-ups"><CalendarClock className="size-4" /> Follow-ups</Link></Button>
          </>
        }
      />

      {!isMockMode() && isDashboardError && (
        <Card className="p-4 border-destructive/40 bg-destructive/5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-destructive">Failed to load dashboard data</p>
            <p className="text-xs text-muted-foreground">
              {(dashboardError as Error)?.message || 'Unable to fetch counselor summary from server.'}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
            Retry
          </Button>
        </Card>
      )}

      {!isMockMode() && isDashboardLoading && !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-24 animate-pulse bg-muted/40" />
          ))}
        </div>
      ) : (
        <RoleStatCards stats={stats} />
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="size-4 text-primary" />
              Assigned Students
            </CardTitle>
            <CardDescription>Students assigned to you with scheduled counseling appointments</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/leads">View Pipeline</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {assignedStudents.length === 0 ? (
            <EmptyState
              icon={UserCheck}
              title="No assigned students yet"
              description="Students assigned to you by Front Desk will appear here with their appointment schedule."
              className="py-8"
            />
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {assignedStudents.slice(0, 10).map((student) => (
                <div key={student.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link
                      to={`/students/${student.id}`}
                      className="truncate text-sm font-medium text-foreground hover:underline"
                    >
                      {student.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {[student.email, student.phone].filter(Boolean).join(' • ') || 'No contact details'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {student.appointment ? (
                      <div className="text-right">
                        <p className="text-xs font-medium text-foreground font-tabular">
                          {dayjs(student.appointment.datetime).format('MMM D, YYYY • h:mm A')}
                        </p>
                        <p className="text-[11px] text-muted-foreground">Scheduled Appointment</p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No upcoming appointment</span>
                    )}
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/students/${student.id}`}>Open</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>My Pipeline</CardTitle>
            <CardDescription>Assigned leads by stage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {leadStageOrder.map((stage) => {
              const entry = dashboard.stageBreakdown.find((s) => s.stage === stage)
              const count = entry?.count ?? 0
              const meta = leadStageMeta[stage] ?? {
                label: stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
                variant: 'slate' as const,
              }
              return (
                <div key={stage} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground">{meta.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${(count / maxStageCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right text-xs font-medium font-tabular">{count}</span>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Follow-ups</CardTitle>
            <CardDescription>Your pending reminders</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {dashboard.upcomingFollowUps.length === 0 && (
              <EmptyState icon={CalendarClock} title="All caught up" description="No pending follow-ups right now." className="py-8" />
            )}
            {dashboard.upcomingFollowUps.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-lg border border-border/70 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{f.studentName}</p>
                  <p className="truncate text-xs text-muted-foreground">{f.reminder}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs font-medium font-tabular">{dayjs(f.date).format('MMM D')}</span>
                  <PriorityBadge priority={f.priority} className="text-[10px] py-0" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
