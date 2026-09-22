import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/page-header'
import { StatCards } from '../components/stat-cards'
import { TodaysAppointmentsPanel, UpcomingFollowUpsPanel } from '../components/panels'
import { getDashboardStats } from '../selectors'
import { useSuperAdminStats } from '../hooks/use-dashboard-stats'
import { ClassEnrollmentPanel } from '../components/class-enrollment-panel'
import { ClassAttendanceWidget } from '../components/class-attendance-widget'
import { isMockMode } from '@/lib/api-client'

export function SuperAdminDashboard() {
  const queryClient = useQueryClient()
  const { data: stats, isLoading, isFetching, dataUpdatedAt } = useSuperAdminStats()
  const [lastUpdated, setLastUpdated] = useState<string>('')

  // Track when data last refreshed
  useEffect(() => {
    if (dataUpdatedAt) {
      const d = new Date(dataUpdatedAt)
      setLastUpdated(
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      )
    }
  }, [dataUpdatedAt])

  const handleManualRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  // In mock mode always use mock data; in real mode use API data or show skeleton
  const displayStats = stats ?? (isMockMode() ? getDashboardStats() : undefined)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description="Company-wide overview — students, leads, class batches, and follow-ups."
        actions={
          <div className="flex items-center gap-3">
            {/* Live indicator badge */}
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-xs font-semibold text-emerald-400">Live</span>
              {lastUpdated && !isMockMode() && (
                <span className="text-xs text-muted-foreground">· {lastUpdated}</span>
              )}
            </div>

            {/* Manual refresh button */}
            {!isMockMode() && (
              <button
                onClick={handleManualRefresh}
                disabled={isFetching}
                title="Refresh dashboard stats"
                className="flex size-8 items-center justify-center rounded-lg border border-border/60 bg-card text-muted-foreground transition-all hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        }
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
