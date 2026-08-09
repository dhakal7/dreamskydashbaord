import { useState, useMemo } from 'react'
import { UserPlus, Users as UsersIcon } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { DataTable } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth-store'
import { hasPermission } from '@/lib/rbac'
import { useUsersStore } from './store'
import { getUserColumns } from './components/user-columns'
import { UserFiltersBar } from './components/user-filters'
import { InviteUserDialog } from './components/invite-user-dialog'

export default function UsersPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const users = useUsersStore((s) => s.users)

  const canManage = hasPermission(currentUser.role, 'users.manage')

  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [inviteOpen, setInviteOpen] = useState(false)

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      return true
    })
  }, [users, roleFilter, statusFilter])

  const columns = useMemo(() => getUserColumns(canManage), [canManage])

  const stats = useMemo(() => {
    const total = users.length
    const active = users.filter((u) => u.status === 'active').length
    const suspended = users.filter((u) => u.status === 'suspended').length
    const invited = users.filter((u) => u.status === 'invited').length
    return { total, active, suspended, invited }
  }, [users])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage staff accounts, roles, and access"
        actions={
          canManage ? (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-4" />
              Invite User
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Users', value: stats.total, color: 'text-foreground' },
          { label: 'Active', value: stats.active, color: 'text-success-600' },
          { label: 'Suspended', value: stats.suspended, color: 'text-danger-600' },
          { label: 'Invited', value: stats.invited, color: 'text-warning-600' },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <span className={`text-2xl font-semibold font-tabular ${s.color}`}>{s.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        <UserFiltersBar
          roleFilter={roleFilter} setRoleFilter={setRoleFilter}
          statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        />

        <DataTable
          columns={columns}
          data={filtered}
          pageSize={12}
          emptyState={
            <EmptyState
              icon={UsersIcon}
              title="No users found"
              description="Try adjusting your filters or invite a new user."
            />
          }
        />
      </div>

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  )
}
