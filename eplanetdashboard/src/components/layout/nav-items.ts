import {
  LayoutDashboard, Users, UserPlus, CalendarClock, CalendarDays, FileStack,
  PlaneTakeoff, FolderKanban, Landmark, Globe2, GraduationCap, BarChart3, Settings,
  Wallet, Link2, BookOpen, Bookmark, UserCog, CalendarCheck, DollarSign,
} from 'lucide-react'
import type { Role } from '@/types'
import { hasPermission, type Permission } from '@/lib/rbac'
import { dashboardPaths } from '@/lib/rbac'

export interface NavItem {
  label: string
  to: string
  icon: typeof LayoutDashboard
  badge?: number
  permission?: Permission
}

// Full catalog — filtered per role below. Matches the permission matrix in the master plan (§3).
const all: Record<string, NavItem> = {
  dashboard: { label: 'Dashboard', to: '/', icon: LayoutDashboard, permission: 'dashboard.view' },
  reception: { label: 'Reception', to: '/reception', icon: CalendarCheck, permission: 'appointments.view' },
  students: { label: 'Students', to: '/students', icon: Users, permission: 'students.view' },
  leads: { label: 'Leads', to: '/leads', icon: UserPlus, permission: 'leads.view' },
  followUps: { label: 'Follow-ups', to: '/follow-ups', icon: CalendarClock, permission: 'followups.view' },
  appointments: { label: 'Appointments', to: '/appointments', icon: CalendarDays, permission: 'appointments.view' },
  applications: { label: 'Applications', to: '/applications', icon: FileStack, permission: 'applications.view' },
  visa: { label: 'Visa Processing', to: '/visa', icon: PlaneTakeoff, permission: 'visa.view' },
  documents: { label: 'Documents', to: '/documents', icon: FolderKanban, permission: 'documents.view' },
  universities: { label: 'Universities', to: '/universities', icon: Landmark, permission: 'universities.view' },
  countries: { label: 'Countries', to: '/countries', icon: Globe2, permission: 'countries.view' },
  courses: { label: 'Courses', to: '/courses', icon: GraduationCap, permission: 'courses.view' },
  classes: { label: 'Classes', to: '/classes', icon: BookOpen, permission: 'classes.view' },
  materials: { label: 'Materials', to: '/materials', icon: Bookmark, permission: 'classes.view' },
  reports: { label: 'Reports', to: '/reports', icon: BarChart3, permission: 'reports.view' },
  settings: { label: 'Settings', to: '/settings', icon: Settings, permission: 'settings.manage' },
  commissions: { label: 'My Commission', to: '/commissions', icon: Wallet, permission: 'commissions.view' },
  referrals: { label: 'My Referrals', to: '/referrals', icon: Link2, permission: 'commissions.view' },
  commissionRules: { label: 'Commission Rules', to: '/commission-rules', icon: Wallet, permission: 'commission-rules.manage' },
  events: { label: 'Events', to: '/events', icon: CalendarDays, permission: 'events.view' },
  users: { label: 'Users', to: '/users', icon: UserCog, permission: 'users.view' },
  fees: { label: 'Fees & Payments', to: '/fees', icon: DollarSign, permission: 'appointments.view' },
}

const byRole: Record<Role, (keyof typeof all)[]> = {
  super_admin: [
    'dashboard', 'students', 'leads', 'followUps', 'appointments', 'applications', 'visa',
    'documents', 'universities', 'countries', 'courses', 'classes', 'fees', 'reports', 'commissionRules', 'events', 'users', 'settings',
  ],
  front_desk: ['dashboard', 'reception', 'fees', 'leads', 'students', 'followUps', 'appointments', 'classes', 'documents', 'settings'],
  counselor: [
    'dashboard', 'students', 'leads', 'followUps', 'appointments', 'applications', 'visa',
    'documents', 'classes', 'materials', 'fees', 'commissions', 'events', 'reports', 'settings',
  ],
  teacher: ['dashboard', 'leads', 'classes', 'reports', 'settings'],
  student: ['dashboard', 'appointments', 'applications', 'visa', 'documents', 'classes', 'materials', 'settings'],
  referral_agent: ['dashboard', 'leads', 'referrals', 'commissions', 'settings'],
}

export function getNavItems(role: Role): NavItem[] {
  return byRole[role].map((key) => {
    const item = all[key]
    return key === 'dashboard' ? { ...item, to: dashboardPaths[role] } : item
  }).filter((item) => !item.permission || hasPermission(role, item.permission))
}

// Backwards-compatible default export (super admin's full nav)
export const navItems: NavItem[] = getNavItems('super_admin')
