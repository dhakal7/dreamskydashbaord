import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { PriorityBadge, leadStageMeta, leadStageOrder } from '@/components/shared/status-badges'
import { Users, TrendingUp, CalendarClock, Plus } from 'lucide-react'
import { RoleStatCards } from './shared'
import { useCounselorDashboard, ZERO_COUNSELOR } from '../hooks/use-dashboard-stats'
import { formatCurrency } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { getCounselorScopeId } from '@/lib/data-visibility'
import dayjs from 'dayjs'

export function CounselorDashboard() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const counselorScopeId = getCounselorScopeId(currentUser) ?? currentUser.linkedId
  const { data } = useCounselorDashboard(counselorScopeId)
  const dashboard = data ?? ZERO_COUNSELOR

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
            <Button variant="outline" size="sm" asChild><Link to="/students"><Users className="size-4" /> My Students</Link></Button>
            <Button variant="outline" size="sm" asChild><Link to="/follow-ups"><CalendarClock className="size-4" /> Follow-ups</Link></Button>
            <Button size="sm" asChild><Link to="/leads"><Plus className="size-4" /> New Lead</Link></Button>
          </>
        }
      />

      <RoleStatCards stats={stats} />

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
