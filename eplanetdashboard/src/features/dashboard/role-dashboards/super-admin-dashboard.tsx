import { PageHeader } from '@/components/shared/page-header'
import { StatCards } from '../components/stat-cards'
import { TodaysAppointmentsPanel, UpcomingFollowUpsPanel } from '../components/panels'
import { getDashboardStats } from '../selectors'
import { useSuperAdminStats } from '../hooks/use-dashboard-stats'
import { ClassEnrollmentPanel } from '../components/class-enrollment-panel'
import { ClassAttendanceWidget } from '../components/class-attendance-widget'
import { isMockMode } from '@/lib/api-client'

export function SuperAdminDashboard() {
  const { data: stats, isLoading } = useSuperAdminStats()

  // In mock mode always use mock data; in real mode use API data or show skeleton
  const displayStats = stats ?? (isMockMode() ? getDashboardStats() : undefined)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description="Company-wide overview — students, leads, class batches, and follow-ups."
      />

      {isLoading && !displayStats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border/50 bg-card p-5 animate-pulse">
              <div className="flex items-start justify-between">
                <div className="h-3.5 w-24 rounded-md bg-muted" />
                <div className="size-10 rounded-xl bg-muted" />
              </div>
              <div className="mt-3 h-10 w-16 rounded-md bg-muted" />
              <div className="mt-3 h-3 w-20 rounded-md bg-muted" />
            </div>
          ))}
        </div>
      ) : (
        <StatCards stats={displayStats ?? []} />
      )}

      {/* Universal Class Batches & Roster Panel */}
      <ClassEnrollmentPanel />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TodaysAppointmentsPanel />
        <UpcomingFollowUpsPanel />
      </div>

      {/* Universal Class Attendance Panel */}
      <ClassAttendanceWidget />
    </div>
  )
}
