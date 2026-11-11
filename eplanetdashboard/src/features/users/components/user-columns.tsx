import type { ColumnDef } from '@tanstack/react-table'
import type { UserAccount, Role, UserStatus } from '@/types'
import { PersonAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger,
  DropdownMenuSubContent, DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { MoreHorizontal, Shield, Ban, RotateCcw, Pencil, Building2 } from 'lucide-react'
import { roleLabels } from '@/constants/roles'
import { useAuthStore } from '@/store/auth-store'
import { useUsersStore } from '../store'
import { EditUserDialog } from './edit-user-dialog'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

const roleBadgeVariant: Record<Role, 'danger' | 'info' | 'default' | 'success' | 'slate' | 'warning'> = {
  super_admin: 'danger',
  branch_admin: 'danger',
  front_desk: 'info',
  counselor: 'default',
  teacher: 'success',
  student: 'slate',
  referral_agent: 'warning',
}

const statusMeta: Record<UserStatus, { label: string; variant: 'success' | 'danger' | 'warning' }> = {
  active: { label: 'Active', variant: 'success' },
  suspended: { label: 'Suspended', variant: 'danger' },
  invited: { label: 'Invited', variant: 'warning' },
}

export function getUserColumns(canManage: boolean): ColumnDef<UserAccount>[] {
  const baseColumns: ColumnDef<UserAccount>[] = [
    {
      accessorKey: 'name',
      header: 'User',
      cell: ({ row }) => {
        const user = row.original
        return (
          <div className="flex items-center gap-3">
            <PersonAvatar name={user.name} color={user.avatarColor} />
            <div className="flex flex-col">
              <span className="font-medium text-foreground">{user.name}</span>
              <span className="text-xs text-muted-foreground">{user.email}</span>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => {
        const phone = row.getValue('phone') as string | undefined
        return (
          <span className="text-xs text-muted-foreground font-tabular">
            {phone || '—'}
          </span>
        )
      },
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => {
        const role = row.getValue('role') as Role
        return (
          <Badge variant={roleBadgeVariant[role]}>
            <Shield className="size-3" />
            {roleLabels[role]}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'branchName',
      header: 'Branch',
      cell: ({ row }) => {
        const branchName = (row.getValue('branchName') as string) || 'Unassigned'
        return (
          <span className="text-xs font-medium text-muted-foreground">
            {branchName}
          </span>
        )
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status') as UserStatus
        const meta = statusMeta[status]
        return <Badge variant={meta.variant} dot>{meta.label}</Badge>
      },
    },
    {
      accessorKey: 'lastLoginAt',
      header: 'Last Login',
      cell: ({ row }) => {
        const ts = row.getValue('lastLoginAt') as string
        return (
          <span className="text-xs text-muted-foreground font-tabular">
            {dayjs(ts).fromNow()}
          </span>
        )
      },
    },
  ]

  if (canManage) {
    baseColumns.push({
      id: 'actions',
      header: '',
      size: 40,
      cell: ({ row }) => {
        const user = row.original
        return <UserActionsDropdown user={user} />
      },
    })
  }

  return baseColumns
}

const superAdminRoles: Role[] = ['super_admin', 'branch_admin', 'counselor', 'front_desk', 'teacher', 'referral_agent']
const branchAdminRoles: Role[] = ['counselor', 'front_desk', 'teacher', 'referral_agent']

const availableBranches = [
  { id: 'cmt5tsb5x0000vrty2qel7x9c', name: 'DreamSky Head Office' },
  { id: 'br-1', name: 'Chabahil Branch' },
]

function UserActionsDropdown({ user }: { user: UserAccount }) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { suspendUser, reactivateUser, changeUserRole, changeUserBranch } = useUsersStore()
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)

  const isSuperAdminActor = currentUser.role === 'super_admin'
  const isBranchAdminActor = currentUser.role === 'branch_admin'
  const isTargetAdmin = user.role === 'super_admin' || user.role === 'branch_admin'
  const isCrossBranchTarget = Boolean(
    isBranchAdminActor && currentUser.branchId && user.branchId && user.branchId !== currentUser.branchId,
  )

  // Branch Admins cannot manage administrative accounts (Super Admin or Branch Admin) or staff outside their branch
  if (isBranchAdminActor && (isTargetAdmin || isCrossBranchTarget)) {
    return null
  }

  const allowedRoles = isSuperAdminActor ? superAdminRoles : branchAdminRoles

  const handleRoleChange = async (newRole: Role) => {
    if (newRole === user.role) return
    const confirmed = window.confirm(
      `Are you sure you want to change the role of "${user.name}" from ${roleLabels[user.role]} to ${roleLabels[newRole]}?`
    )
    if (!confirmed) return

    try {
      setIsPending(true)
      await changeUserRole(user.id, newRole)
    } catch {
      // toast error already handled in store
    } finally {
      setIsPending(false)
    }
  }

  const handleBranchChange = async (targetBranchId: string | null, targetBranchName: string) => {
    if (user.branchId === targetBranchId) return
    const confirmed = window.confirm(
      `Are you sure you want to assign "${user.name}" to "${targetBranchName}"?`
    )
    if (!confirmed) return

    try {
      setIsPending(true)
      await changeUserBranch(user.id, targetBranchId, targetBranchName)
    } catch {
      // toast error already handled in store
    } finally {
      setIsPending(false)
    }
  }

  const handleSuspend = async () => {
    if (window.confirm(`Are you sure you want to suspend "${user.name}"? This staff member will not be able to log in.`)) {
      try {
        setIsPending(true)
        await suspendUser(user.id)
      } catch {
        // toast error already dispatched in store
      } finally {
        setIsPending(false)
      }
    }
  }

  const handleReactivate = async () => {
    if (window.confirm(`Are you sure you want to reactivate "${user.name}"? This staff member will regain access to the CRM.`)) {
      try {
        setIsPending(true)
        await reactivateUser(user.id)
      } catch {
        // toast error already dispatched in store
      } finally {
        setIsPending(false)
      }
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" onClick={(e) => e.stopPropagation()} disabled={isPending}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
            <Pencil className="size-4" />
            Edit Profile
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Shield className="size-4 mr-2" />
              Change Role
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={user.role}
                onValueChange={(v) => handleRoleChange(v as Role)}
              >
                {allowedRoles.map((r) => (
                  <DropdownMenuRadioItem key={r} value={r} disabled={isPending}>
                    {roleLabels[r]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {isSuperAdminActor && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Building2 className="size-4 mr-2" />
                Change Branch
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {availableBranches.map((b) => (
                  <DropdownMenuItem
                    key={b.id}
                    onClick={() => handleBranchChange(b.id, b.name)}
                    disabled={isPending || user.branchId === b.id}
                  >
                    {b.name} {user.branchId === b.id ? '(Current)' : ''}
                  </DropdownMenuItem>
                ))}
                {user.role === 'super_admin' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleBranchChange(null, 'Unassigned')}
                      disabled={isPending || !user.branchId}
                    >
                      Unassigned (Global) {!user.branchId ? '(Current)' : ''}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          <DropdownMenuSeparator />
          {user.status === 'active' ? (
            <DropdownMenuItem destructive onClick={handleSuspend} disabled={isPending}>
              <Ban className="size-4" />
              Suspend User
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={handleReactivate} disabled={isPending}>
              <RotateCcw className="size-4" />
              Reactivate User
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditUserDialog
        user={user}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
    </>
  )
}
