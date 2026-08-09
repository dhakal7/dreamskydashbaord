import { useAuthStore } from '@/store/auth-store'
import { SuperAdminDashboard } from './role-dashboards/super-admin-dashboard'
import { FrontDeskDashboard } from './role-dashboards/front-desk-dashboard'
import { CounselorDashboard } from './role-dashboards/counselor-dashboard'
import { TeacherDashboard } from './role-dashboards/teacher-dashboard'
import { StudentDashboard } from './role-dashboards/student-dashboard'
import { ReferralAgentDashboard } from './role-dashboards/agent-dashboard'

// Dispatches to the role-scoped dashboard for the current (mock) user.
// Real auth will replace `useAuthStore` with the actual session once Track A wires in JWT.
export default function DashboardPage() {
  const role = useAuthStore((s) => s.currentUser.role)

  switch (role) {
    case 'super_admin':
      return <SuperAdminDashboard />
    case 'front_desk':
      return <FrontDeskDashboard />
    case 'counselor':
      return <CounselorDashboard />
    case 'teacher':
      return <TeacherDashboard />
    case 'student':
      return <StudentDashboard />
    case 'referral_agent':
      return <ReferralAgentDashboard />
    default:
      return <SuperAdminDashboard />
  }
}
