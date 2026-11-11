import { useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { CalendarClock, Plus, UserPlus, Wallet, CalendarCheck, RefreshCw, AlertCircle } from 'lucide-react'
import { RoleStatCards } from './shared'
import { TodaysAppointmentsPanel, UpcomingFollowUpsPanel } from '../components/panels'
import { useFrontDeskStats, ZERO_FRONT_DESK } from '../hooks/use-dashboard-stats'
import { AppointmentDialog } from '@/features/appointments/components/appointment-dialog'
import { LeadFormDialog } from '@/features/leads/components/lead-form-dialog'
import { FeeManagementPanel } from '@/features/reception/components/fee-management-panel'
import { ClassAttendanceWidget } from '../components/class-attendance-widget'
import { ClassEnrollmentPanel } from '../components/class-enrollment-panel'
import { isMockMode } from '@/lib/api-client'

export function FrontDeskDashboard() {
  const { data, isLoading, isError, refetch } = useFrontDeskStats()
  const fdStats = data ?? ZERO_FRONT_DESK
  const isMock = isMockMode()

  const [apptDialogOpen, setApptDialogOpen] = useState(false)
  const [leadDialogOpen, setLeadDialogOpen] = useState(false)

  const stats = [
    { label: 'New Leads Today', value: fdStats.newLeadsToday, icon: UserPlus, color: '#2563EB' },
    { label: 'Pending Follow-ups', value: fdStats.pendingFollowUps, icon: CalendarClock, color: '#D97706' },
    { label: "Today's Appointments", value: fdStats.todaysAppointments, icon: CalendarCheck, color: '#0891B2' },
    {
      label: 'Outstanding Fee Records',
      value: fdStats.feeCollectionQueue,
      icon: Wallet,
      color: '#16A34A',
      sub: typeof fdStats.uniqueStudentsWithDues === 'number' ? `${fdStats.uniqueStudentsWithDues} students with dues` : undefined,
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Front Desk Overview"
        description="Daily operational hub — walk-in lead capture, class admissions, appointment check-ins, fee collections, and student attendance."
        actions={
          <div className="flex items-center gap-2">
            {!isMock && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setApptDialogOpen(true)}>
              <CalendarClock /> Book Appointment
            </Button>
            <Button size="sm" onClick={() => setLeadDialogOpen(true)}>
              <Plus /> New Lead
            </Button>
          </div>
        }
      />

      {isError && !isMock && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>Unable to load live front desk statistics. Please check server connectivity.</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {isLoading && !isMock ? (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      ) : (
        <RoleStatCards stats={stats} />
      )}

      {/* Class Section & Student Admissions for Front Desk Officer */}
      <ClassEnrollmentPanel />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TodaysAppointmentsPanel />
        <UpcomingFollowUpsPanel />
      </div>

      {/* Class Attendance Widget for Frontdesk Officer */}
      <ClassAttendanceWidget />

      {/* Fee & Payment Collection Section for Frontdesk Officer */}
      <FeeManagementPanel />

      <AppointmentDialog
        appointment={null}
        open={apptDialogOpen}
        onOpenChange={setApptDialogOpen}
      />

      <LeadFormDialog
        open={leadDialogOpen}
        onOpenChange={setLeadDialogOpen}
      />
    </div>
  )
}
