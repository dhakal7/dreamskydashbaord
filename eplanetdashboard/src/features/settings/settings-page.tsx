import { useState } from 'react'
import { User, Lock, Eye, EyeOff } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '@/store/auth-store'
import { toast } from 'sonner'
import CommissionSetupPanel from './components/commission-setup-panel'
import { RoleSettingsPanel } from './components/role-settings-panels'
import { api, isMockMode } from '@/lib/api-client'

/* ── Profile Section (Staff & Admin only) ────────────────────────────── */

function StaffProfileSection() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const [name, setName] = useState(currentUser.name)
  const [email, setEmail] = useState(currentUser.email)
  const [phone, setPhone] = useState('+977 9801234567')

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault()
    toast.success('Profile details updated successfully')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="size-4 text-muted-foreground" />
          Staff Profile Information
        </CardTitle>
        <CardDescription>View and update your personal details and contact information</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Full Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Name" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email Address</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Address" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Phone Number</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+977 98XXXXXXXX" />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Button type="submit">Update Profile</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/* ── Password Section (all roles) ────────────────────────────────────── */

function PasswordSection() {
  const logout = useAuthStore((s) => s.logout)
  const [showPassword, setShowPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentPassword) {
      toast.error('Current password is required')
      return
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }

    setLoading(true)
    try {
      if (!isMockMode()) {
        await api.post('/auth/change-password', {
          currentPassword: currentPassword.trim(),
          newPassword: newPassword.trim(),
        })

        toast.success('Password updated successfully! Logging out to re-authenticate.')
        setTimeout(() => {
          logout()
        }, 1500)
      } else {
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        toast.success('Password updated successfully (Mock Mode)')
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update password. Please check your current password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-4 text-muted-foreground" />
          Password Management
        </CardTitle>
        <CardDescription>Update your account security password</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Current Password</label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                disabled={loading}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">New Password</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Confirm New Password</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                disabled={loading}
              />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              disabled={loading || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
            >
              {loading ? 'Updating…' : 'Update Password'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/* ── Main Settings Page ──────────────────────────────────────────────── */

export default function SettingsPage() {
  const role = useAuthStore((s) => s.currentUser.role)
  const isStaffOrAdmin = role !== 'student'
  const isAdmin = role === 'super_admin'

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Manage your account profile, password security, and custom dashboard settings."
      />

      {isStaffOrAdmin && (
        <>
          <StaffProfileSection />
          <Separator />
        </>
      )}

      <PasswordSection />

      <Separator />

      <RoleSettingsPanel role={role} />

      {isAdmin && (
        <>
          <Separator />
          <CommissionSetupPanel />
        </>
      )}
    </div>
  )
}
