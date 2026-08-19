import { useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { CalendarClock, Plus, UserPlus, Wallet, CalendarCheck } from 'lucide-react'
import { RoleStatCards } from './shared'
import { TodaysAppointmentsPanel, UpcomingFollowUpsPanel } from '../components/panels'
import { useFrontDeskStats, ZERO_FRONT_DESK, useTodayAppointments } from '../hooks/use-dashboard-stats'
import { AppointmentDialog } from '@/features/appointments/components/appointment-dialog'
import { LeadFormDialog } from '@/features/leads/components/lead-form-dialog'
import { FeeManagementPanel } from '@/features/reception/components/fee-management-panel'
import { ClassAttendanceWidget } from '../components/class-attendance-widget'
import { ClassEnrollmentPanel } from '../components/class-enrollment-panel'

export function FrontDeskDashboard() {
  const { data } = useFrontDeskStats()
  const fdStats = data ?? ZERO_FRONT_DESK
  const { items: todayAppointments } = useTodayAppointments()

  const [apptDialogOpen, setApptDialogOpen] = useState(false)
  const [leadDialogOpen, setLeadDialogOpen] = useState(false)

  const stats = [
    { label: 'New Leads Today', value: fdStats.newLeadsToday, icon: UserPlus, color: '#2563EB' },
    { label: 'Pending Follow-ups', value: fdStats.pendingFollowUps, icon: CalendarClock, color: '#D97706' },
    { label: "Today's Appointments", value: todayAppointments.length, icon: CalendarCheck, color: '#0891B2' },
    { label: 'Fee Collection Queue', value: fdStats.feeCollectionQueue, icon: Wallet, color: '#16A34A' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Front Desk Overview"
        description="Daily operational hub — walk-in lead capture, class admissions, appointment check-ins, fee collections, and student attendance."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setApptDialogOpen(true)}>
              <CalendarClock /> Book Appointment
            </Button>
            <Button size="sm" onClick={() => setLeadDialogOpen(true)}>
              <Plus /> New Lead
            </Button>
          </>
        }
      />

      <RoleStatCards stats={stats} />

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

