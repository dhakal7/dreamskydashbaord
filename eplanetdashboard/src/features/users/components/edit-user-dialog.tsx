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
import { roleLabels } from '@/mock'
import { useUsersStore } from '../store'

const roles: { value: Role; label: string }[] = [
  { value: 'super_admin', label: roleLabels.super_admin },
  { value: 'front_desk', label: roleLabels.front_desk },
  { value: 'counselor', label: roleLabels.counselor },
  { value: 'teacher', label: roleLabels.teacher },
  { value: 'student', label: roleLabels.student },
  { value: 'referral_agent', label: roleLabels.referral_agent },
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
  const updateUserProfile = useUsersStore((s) => s.updateUserProfile)

  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [phone, setPhone] = useState(user.phone ?? '')
  const [role, setRole] = useState<Role>(user.role)
  const [status, setStatus] = useState<UserStatus>(user.status)

  const handleSave = () => {
    if (!name.trim() || !email.trim()) return

    updateUserProfile(user.id, {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      role,
      status,
    })

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit User Profile</DialogTitle>
          <DialogDescription>
            Update user information, contact details, role, and account status.
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
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Phone Number</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +977 9801234567"
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
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Role *</label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Account Status *</label>
              <Select value={status} onValueChange={(v) => setStatus(v as UserStatus)}>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || !email.trim()}>
            Save Profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
