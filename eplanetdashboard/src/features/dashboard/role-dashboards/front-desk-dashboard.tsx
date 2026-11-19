import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CalendarClock, Plus, UserPlus, Wallet, CalendarCheck, RefreshCw, AlertCircle, Award, ArrowRight } from 'lucide-react'
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

      {/* Visa Granted & Departure Spotlight */}
      <Card className="p-4 border-l-4 border-l-sky-500 bg-card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-sky-500/10 p-2.5 text-sky-500">
              <Award className="size-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold">Visa Granted & Departure Success Hub</h4>
              <p className="text-xs text-muted-foreground">
                Centralized registry of visa-approved students, counselor counts, and flight readiness.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
            <Link to="/visa-granted">
              View Visa Granted Registry
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </Card>

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
