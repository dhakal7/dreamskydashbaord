import { PageHeader } from '@/components/shared/page-header'
import { StatCards } from '../components/stat-cards'
import { TodaysAppointmentsPanel, UpcomingFollowUpsPanel } from '../components/panels'
import { getDashboardStats } from '../selectors'
import { useSuperAdminStats } from '../hooks/use-dashboard-stats'
import { ClassEnrollmentPanel } from '../components/class-enrollment-panel'
import { ClassAttendanceWidget } from '../components/class-attendance-widget'

export function SuperAdminDashboard() {
  const { data: stats = getDashboardStats() } = useSuperAdminStats()

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description="Company-wide overview — students, leads, class batches, and follow-ups."
      />

      <StatCards stats={stats} />

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
