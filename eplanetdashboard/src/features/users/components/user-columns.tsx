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
import { MoreHorizontal, Shield, Ban, RotateCcw } from 'lucide-react'
import { roleLabels } from '@/mock'
import { useUsersStore } from '../store'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

const roleBadgeVariant: Record<Role, 'danger' | 'info' | 'default' | 'success' | 'slate' | 'warning'> = {
  super_admin: 'danger',
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

const allRoles: Role[] = ['super_admin', 'front_desk', 'counselor', 'teacher', 'student', 'referral_agent']

function UserActionsDropdown({ user }: { user: UserAccount }) {
  const { suspendUser, reactivateUser, changeUserRole } = useUsersStore()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Change Role</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={user.role}
              onValueChange={(v) => changeUserRole(user.id, v as Role)}
            >
              {allRoles.map((r) => (
                <DropdownMenuRadioItem key={r} value={r}>
                  {roleLabels[r]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        {user.status === 'active' ? (
          <DropdownMenuItem destructive onClick={() => suspendUser(user.id)}>
            <Ban className="size-4" />
            Suspend User
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => reactivateUser(user.id)}>
            <RotateCcw className="size-4" />
            Reactivate User
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
