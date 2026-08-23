import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/app-shell'
import { NotFoundPage } from '@/components/shared/not-found-page'
import { UnauthorizedPage } from '@/components/auth/unauthorized-page'
import { ProtectedRoute, RoleGuard } from '@/components/auth/route-guards'
import { dashboardPaths, type Permission } from '@/lib/rbac'
import { useAuthStore } from '@/store/auth-store'

const DashboardPage = lazy(() => import('@/features/dashboard/dashboard-page'))
const LeadsPage = lazy(() => import('@/features/leads/leads-page'))
const StudentsPage = lazy(() => import('@/features/students/students-page'))
const StudentProfilePage = lazy(() => import('@/features/students/student-profile-page'))
const FollowUpsPage = lazy(() => import('@/features/followups/followups-page'))
const AppointmentsPage = lazy(() => import('@/features/appointments/appointments-page'))
const ApplicationsPage = lazy(() => import('@/features/applications/applications-page'))
const ApplicationDetailPage = lazy(() => import('@/features/applications/application-detail-page'))
const VisaPage = lazy(() => import('@/features/visa/visa-page'))
const VisaCaseDetailPage = lazy(() => import('@/features/visa/visa-case-detail-page'))
const DocumentsPage = lazy(() => import('@/features/documents/documents-page'))
const UniversitiesPage = lazy(() => import('@/features/universities/universities-page'))
const CountriesPage = lazy(() => import('@/features/countries/countries-page'))
const CoursesPage = lazy(() => import('@/features/courses/courses-page'))
const ClassesPage = lazy(() => import('@/features/classes/classes-page'))
const ClassDetailPage = lazy(() => import('@/features/classes/class-detail-page'))
const MaterialsPage = lazy(() => import('@/features/materials/materials-page'))
const CommissionLedgerPage = lazy(() => import('@/features/commissions/commission-ledger-page'))
const CommissionRulesPage = lazy(() => import('@/features/commissions/commission-rules-page'))
const EventsPage = lazy(() => import('@/features/events/events-page'))
const ReportsPage = lazy(() => import('@/features/reports/reports-page'))
const SettingsPage = lazy(() => import('@/features/settings/settings-page'))
const UsersPage = lazy(() => import('@/features/users/users-page'))
const ReceptionPage = lazy(() => import('@/features/reception/reception-page'))
const FeesPage = lazy(() => import('@/features/reception/fees-page'))
const ReferralsPage = lazy(() => import('@/features/referrals/referrals-page'))
const LoginPage = lazy(() => import('@/features/auth/login-page'))

function protectedPage(element: React.ReactNode, permission: Permission) {
  return <ProtectedRoute permissions={[permission]}>{element}</ProtectedRoute>
}

function DashboardRedirect() {
  const role = useAuthStore((state) => state.currentUser?.role ?? 'super_admin')
  const targetPath = dashboardPaths[role] || '/dashboard/super-admin'
  return <Navigate to={targetPath} replace />
}

function roleDashboard(roles: [keyof typeof dashboardPaths, ...Array<keyof typeof dashboardPaths>]) {
  return <RoleGuard roles={roles}>{<DashboardPage />}</RoleGuard>
}

export const router = createBrowserRouter([
  { path: '/website/*', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/unauthorized', element: <UnauthorizedPage /> },
  {
    path: '/',
    element: <ProtectedRoute><AppShell /></ProtectedRoute>,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <DashboardRedirect /> },
      { path: 'dashboard', element: <DashboardRedirect /> },
      { path: 'dashboard/super-admin', element: roleDashboard(['super_admin']) },
      { path: 'dashboard/frontdesk', element: roleDashboard(['front_desk']) },
      { path: 'dashboard/counselor', element: roleDashboard(['counselor']) },
      { path: 'dashboard/teacher', element: roleDashboard(['teacher']) },
      { path: 'dashboard/student', element: roleDashboard(['student']) },
      { path: 'dashboard/referral', element: roleDashboard(['referral_agent']) },
      { path: 'reception', element: protectedPage(<ReceptionPage />, 'appointments.view') },
      { path: 'fees', element: protectedPage(<FeesPage />, 'appointments.view') },
      { path: 'leads', element: protectedPage(<LeadsPage />, 'leads.view') },
      { path: 'students', element: protectedPage(<StudentsPage />, 'students.view') },
      { path: 'students/:id', element: protectedPage(<StudentProfilePage />, 'students.view') },
      { path: 'follow-ups', element: protectedPage(<FollowUpsPage />, 'followups.view') },
      { path: 'appointments', element: protectedPage(<AppointmentsPage />, 'appointments.view') },
      { path: 'applications', element: protectedPage(<ApplicationsPage />, 'applications.view') },
      { path: 'applications/:id', element: protectedPage(<ApplicationDetailPage />, 'applications.view') },
      { path: 'visa', element: protectedPage(<VisaPage />, 'visa.view') },
      { path: 'visa/:id', element: protectedPage(<VisaCaseDetailPage />, 'visa.view') },
      { path: 'documents', element: protectedPage(<DocumentsPage />, 'documents.view') },
      { path: 'universities', element: protectedPage(<UniversitiesPage />, 'universities.view') },
      { path: 'countries', element: protectedPage(<CountriesPage />, 'countries.view') },
      { path: 'courses', element: protectedPage(<CoursesPage />, 'courses.view') },
      { path: 'classes', element: protectedPage(<ClassesPage />, 'classes.view') },
      { path: 'classes/:id', element: protectedPage(<ClassDetailPage />, 'classes.view') },
      { path: 'materials', element: protectedPage(<MaterialsPage />, 'classes.view') },
      { path: 'commissions', element: protectedPage(<CommissionLedgerPage />, 'commissions.view') },
      { path: 'referrals', element: protectedPage(<ReferralsPage />, 'commissions.view') },
      { path: 'commission-rules', element: protectedPage(<CommissionRulesPage />, 'commission-rules.manage') },
      { path: 'events', element: protectedPage(<EventsPage />, 'events.view') },
      { path: 'reports', element: protectedPage(<ReportsPage />, 'reports.view') },
      { path: 'users', element: protectedPage(<UsersPage />, 'users.view') },
      { path: 'settings', element: protectedPage(<SettingsPage />, 'settings.manage') },
    ],
  },
])
