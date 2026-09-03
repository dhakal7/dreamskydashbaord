import type { Role } from '@/types'

export type Permission =
  | 'dashboard.view'
  | 'leads.view'
  | 'leads.manage'
  | 'leads.change-stage'
  | 'students.view'
  | 'students.manage'
  | 'followups.view'
  | 'appointments.view'
  | 'appointments.manage'
  | 'applications.view'
  | 'applications.manage'
  | 'visa.view'
  | 'visa.manage'
  | 'documents.view'
  | 'documents.manage'
  | 'universities.view'
  | 'countries.view'
  | 'courses.view'
  | 'countries.manage'
  | 'universities.manage'
  | 'courses.manage'
  | 'classes.view'
  | 'classes.manage'
  | 'reports.view'
  | 'settings.manage'
  | 'commissions.view'
  | 'commission-rules.manage'
  | 'events.view'
  | 'events.manage'
  | 'users.view'
  | 'users.manage'

export const rolePermissions: Record<Role, readonly Permission[]> = {
  super_admin: [
    'dashboard.view', 'leads.view', 'leads.manage', 'leads.change-stage', 'students.view', 'students.manage',
    'followups.view', 'appointments.view', 'appointments.manage', 'applications.view', 'applications.manage',
    'visa.view', 'visa.manage', 'documents.view', 'documents.manage', 'universities.view',
    'countries.view', 'countries.manage', 'universities.view', 'universities.manage', 'courses.view', 'courses.manage',
    'classes.view', 'classes.manage', 'reports.view', 'settings.manage',
    'commissions.view', 'commission-rules.manage', 'events.view', 'events.manage',
    'users.view', 'users.manage',
  ],
  front_desk: [
    'dashboard.view', 'leads.view', 'leads.manage', 'leads.change-stage', 'students.view', 'students.manage',
    'followups.view', 'appointments.view', 'appointments.manage', 'applications.view', 'applications.manage',
    'documents.view', 'documents.manage', 'classes.view', 'classes.manage', 'events.view', 'events.manage', 'settings.manage',
  ],
  counselor: [
    'dashboard.view', 'leads.view', 'leads.manage', 'leads.change-stage', 'students.view', 'students.manage',
    'followups.view', 'appointments.view', 'applications.view', 'applications.manage',
    'visa.view', 'visa.manage', 'documents.view', 'documents.manage',
    'commissions.view', 'events.view', 'reports.view', 'settings.manage',
  ],
  teacher: ['dashboard.view', 'leads.view', 'students.view', 'classes.view', 'classes.manage', 'reports.view', 'settings.manage', 'events.view'],
  student: ['dashboard.view', 'appointments.view', 'applications.view', 'visa.view', 'documents.view', 'classes.view', 'events.view', 'settings.manage'],
  referral_agent: ['dashboard.view', 'leads.view', 'commissions.view', 'events.view', 'settings.manage'],
}

export const dashboardPaths: Record<Role, string> = {
  super_admin: '/dashboard/super-admin',
  front_desk: '/dashboard/frontdesk',
  counselor: '/dashboard/counselor',
  teacher: '/dashboard/teacher',
  student: '/dashboard/student',
  referral_agent: '/dashboard/referral',
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return rolePermissions[role].includes(permission)
}

export function hasAnyPermission(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => hasPermission(role, permission))
}

export function hasAllPermissions(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => hasPermission(role, permission))
}

export function canAccessRole(role: Role, allowedRoles: readonly Role[]): boolean {
  return allowedRoles.includes(role)
}
