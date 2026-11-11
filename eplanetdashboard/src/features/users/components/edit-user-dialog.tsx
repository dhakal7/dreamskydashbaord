import { useState } from 'react'
import type { Role, UserAccount, UserStatus } from '@/types'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { roleLabels } from '@/constants/roles'
import { useAuthStore } from '@/store/auth-store'
import { useUsersStore } from '../store'
import { isMockMode } from '@/lib/api-client'

const allStaffRoles: { value: Role; label: string }[] = [
  { value: 'super_admin', label: roleLabels.super_admin },
  { value: 'branch_admin', label: roleLabels.branch_admin },
  { value: 'counselor', label: roleLabels.counselor },
  { value: 'front_desk', label: roleLabels.front_desk },
  { value: 'teacher', label: roleLabels.teacher },
  { value: 'referral_agent', label: roleLabels.referral_agent },
]

const branchAdminAllowedRoles: { value: Role; label: string }[] = [
  { value: 'counselor', label: roleLabels.counselor },
  { value: 'front_desk', label: roleLabels.front_desk },
  { value: 'teacher', label: roleLabels.teacher },
  { value: 'referral_agent', label: roleLabels.referral_agent },
]

const availableBranches = [
  { id: 'cmt5tsb5x0000vrty2qel7x9c', name: 'DreamSky Head Office' },
  { id: 'br-1', name: 'Chabahil Branch' },
]

const statuses: { value: UserStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'invited', label: 'Invited' },
]

interface EditUserDialogProps {
  user: UserAccount
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditUserDialog({ user, open, onOpenChange }: EditUserDialogProps) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { updateUserProfile, changeUserRole, changeUserBranch, suspendUser, reactivateUser } = useUsersStore()

  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [phone, setPhone] = useState(user.phone ?? '')
  const [role, setRole] = useState<Role>(user.role)
  const [status, setStatus] = useState<UserStatus>(user.status)
  const [branchId, setBranchId] = useState<string>(user.branchId ?? 'unassigned')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isSuperAdminActor = currentUser.role === 'super_admin'
  const isBranchAdminActor = currentUser.role === 'branch_admin'
  const selectableRoles = isBranchAdminActor ? branchAdminAllowedRoles : allStaffRoles
  const isCrossBranchTarget = Boolean(
    isBranchAdminActor && currentUser.branchId && user.branchId && user.branchId !== currentUser.branchId,
  )

  if (isBranchAdminActor && (user.role === 'super_admin' || user.role === 'branch_admin' || isCrossBranchTarget)) {
    return null
  }

  const handleSave = async () => {
    if (!name.trim() || !email.trim()) return

    try {
      setIsSubmitting(true)

      // 1. Live role update if changed
      if (role !== user.role && !isMockMode()) {
        await changeUserRole(user.id, role)
      }

      // 2. Live status update if changed
      if (status !== user.status && !isMockMode()) {
        if (status === 'suspended') {
          await suspendUser(user.id)
        } else if (status === 'active') {
          await reactivateUser(user.id)
        }
      }

      // 3. Live branch update if changed and actor is Super Admin
      if (isSuperAdminActor && !isMockMode()) {
        const targetBranchId = branchId === 'unassigned' ? null : branchId
        if (targetBranchId !== (user.branchId ?? null)) {
          const selectedBranch = availableBranches.find((b) => b.id === targetBranchId)
          await changeUserBranch(user.id, targetBranchId, selectedBranch?.name || 'Unassigned')
        }
      }

      // 4. Update local profile state
      const targetBranchId = branchId === 'unassigned' ? undefined : branchId
      const selectedBranch = availableBranches.find((b) => b.id === targetBranchId)
      updateUserProfile(user.id, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        role,
        status,
        branchId: targetBranchId,
        branchName: selectedBranch?.name || (targetBranchId ? 'Assigned Branch' : 'Unassigned'),
      })

      onOpenChange(false)
    } catch {
      // Error toasts already dispatched by store
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit User Profile</DialogTitle>
          <DialogDescription>
            Update user information, contact details, role, and branch assignment.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Full Name *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Vaibhav Joshi"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Phone Number</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +977 9801234567"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Email Address *</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. vaibhav.joshi@dreamsky.com"
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Role *</label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectableRoles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Account Status *</label>
              <Select value={status} onValueChange={(v) => setStatus(v as UserStatus)} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isSuperAdminActor && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Branch Assignment *</label>
              <Select value={branchId} onValueChange={setBranchId} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableBranches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                  {role === 'super_admin' && (
                    <SelectItem value="unassigned">
                      Unassigned (Global)
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || !email.trim() || isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Profile'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
