import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { Role } from '@/types'
import { roleLabels } from '@/mock'

interface UserFiltersProps {
  roleFilter: string
  setRoleFilter: (v: string) => void
  statusFilter: string
  setStatusFilter: (v: string) => void
}

const allRoles: Role[] = ['super_admin', 'front_desk', 'counselor', 'teacher', 'student', 'referral_agent']

export function UserFiltersBar({
  roleFilter, setRoleFilter,
  statusFilter, setStatusFilter,
}: UserFiltersProps) {
  const hasFilters = roleFilter !== 'all' || statusFilter !== 'all'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={roleFilter} onValueChange={setRoleFilter}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="All Roles" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Roles</SelectItem>
          {allRoles.map((r) => (
            <SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="suspended">Suspended</SelectItem>
          <SelectItem value="invited">Invited</SelectItem>
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setRoleFilter('all'); setStatusFilter('all') }}
        >
          <X className="size-3" />
          Clear
        </Button>
      )}
    </div>
  )
}
