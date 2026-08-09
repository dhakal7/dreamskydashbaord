import { PageHeader } from '@/components/shared/page-header'
import { StatCards } from '../components/stat-cards'
import { TodaysAppointmentsPanel, UpcomingFollowUpsPanel } from '../components/panels'
import { getDashboardStats } from '../selectors'

export function SuperAdminDashboard() {
  const stats = getDashboardStats()

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description="Company-wide overview — students, leads, and follow-ups."
      />

      <StatCards stats={stats} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TodaysAppointmentsPanel />
        <UpcomingFollowUpsPanel />
      </div>
    </div>
  )
}
