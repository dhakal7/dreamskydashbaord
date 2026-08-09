import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { Role } from '@/types'
import type { Permission } from '@/lib/rbac'
import { canAccessRole, hasAllPermissions } from '@/lib/rbac'
import { useAuthStore } from '@/store/auth-store'

interface GuardProps {
  children?: ReactNode
  permissions?: readonly Permission[]
  roles?: readonly Role[]
}

export function ProtectedRoute({ children, permissions = [], roles }: GuardProps) {
  const location = useLocation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const currentUser = useAuthStore((state) => state.currentUser)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  const allowedByRole = !roles || canAccessRole(currentUser.role, roles)
  const allowedByPermission = hasAllPermissions(currentUser.role, permissions)
  if (!allowedByRole || !allowedByPermission) {
    return <Navigate to="/unauthorized" replace />
  }

  return children ? <>{children}</> : <Outlet />
}

export function RoleGuard({ children, roles }: Pick<GuardProps, 'children' | 'roles'>) {
  return <ProtectedRoute roles={roles}>{children}</ProtectedRoute>
}

export function PermissionGuard({ children, permissions }: Pick<GuardProps, 'children' | 'permissions'>) {
  return <ProtectedRoute permissions={permissions}>{children}</ProtectedRoute>
}
