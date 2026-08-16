import React, { useState } from 'react'
import { LockKeyhole, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth-store'
import { api, isMockMode } from '@/lib/api-client'

export function ForceChangePassword() {
  const logout = useAuthStore((s) => s.logout)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!currentPassword) {
      toast.error('Please enter your temporary password')
      return
    }
    if (!newPassword) {
      toast.error('Please enter a new password')
      return
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters long')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }

    setLoading(true)
    try {
      if (!isMockMode()) {
        // Call the live backend API to change the password
        await api.post('/auth/change-password', {
          currentPassword: currentPassword.trim(),
          newPassword: newPassword.trim(),
        })
      }

      // Update state and storage so mustChangePassword is false
      useAuthStore.getState().clearMustChangePassword(newPassword.trim())
      toast.success('Password updated successfully! Welcome to your dashboard.')
    } catch (err: any) {
      toast.error(err.message || 'Failed to update password. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0F19]/80 px-4 backdrop-blur-md">
      <Card className="w-full max-w-md border-border bg-card shadow-elevated">
        <CardHeader className="space-y-1.5 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <CardTitle className="text-xl font-bold">Change Password</CardTitle>
          <CardDescription>
            This is your first login. You must update your temporary password to secure your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Temporary Password</label>
              <div className="relative">
                <Input
                  icon={<LockKeyhole />}
                  type={showCurrent ? 'text' : 'password'}
                  required
                  placeholder="Enter temporary password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">New Password</label>
              <div className="relative">
                <Input
                  icon={<LockKeyhole />}
                  type={showNew ? 'text' : 'password'}
                  required
                  placeholder="Enter new password (min. 8 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Confirm New Password</label>
              <Input
                icon={<LockKeyhole />}
                type="password"
                required
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="pt-2">
              <Button className="w-full bg-brand-600 hover:bg-brand-700 text-white" type="submit" disabled={loading}>
                {loading ? 'Updating Password…' : 'Secure Account'}
              </Button>
            </div>
            
            <div className="text-center">
              <button
                type="button"
                onClick={() => logout()}
                className="text-xs text-muted-foreground hover:text-danger hover:underline"
                disabled={loading}
              >
                Log Out
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
