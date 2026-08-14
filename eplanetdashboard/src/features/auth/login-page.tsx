import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LockKeyhole, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useAuthStore, demoPassword } from '@/store/auth-store'
import { dashboardPaths } from '@/lib/rbac'
import { demoUsers } from '@/mock/current-user'
import { isMockMode, tokenStore } from '@/lib/api-client'

const LANDING_URL = import.meta.env.VITE_LANDING_URL ?? 'http://localhost:5174'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isLoading = useAuthStore((state) => state.isLoading)
  const login = useAuthStore((state) => state.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(() => tokenStore.getRemember())

  if (isAuthenticated) {
    return <Navigate to={dashboardPaths[useAuthStore.getState().currentUser.role]} replace />
  }

  if (!isAuthenticated) {
    window.location.href = `${LANDING_URL}?login=true`
    return null
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const success = await login(email, password, remember)
      if (!success) {
        // mock mode returns false for bad credentials
        toast.error('Invalid email or password')
        return
      }
    } catch (err) {
      // real mode throws on bad credentials or network errors
      toast.error(err instanceof Error ? err.message : 'Login failed. Please try again.')
      return
    }
    const role = useAuthStore.getState().currentUser.role
    const from = (location.state as { from?: string } | null)?.from
    navigate(from ?? dashboardPaths[role], { replace: true })
    toast.success('Welcome back')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-soft ring-1 ring-border/70">
            <img src="/WhatsApp Image 2026-07-23 at 21.17.04.jpeg" alt="DreamSky logo" className="h-full w-full object-cover" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Sign in to DreamSky</h1>
            <p className="text-sm text-muted-foreground">Education Consultancy CRM</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <Input
            icon={<Mail />}
            type="email"
            required
            placeholder="Work email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isLoading}
          />
          <Input
            icon={<LockKeyhole />}
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isLoading}
          />
          <label
            htmlFor="remember-me"
            className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground"
          >
            <Checkbox
              id="remember-me"
              checked={remember}
              onCheckedChange={(checked) => setRemember(Boolean(checked))}
              disabled={isLoading}
            />
            Remember me
          </label>
          <Button className="w-full" type="submit" disabled={isLoading}>
            {isLoading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        {/* Demo hint — only shown in mock mode */}
        {isMockMode() && (
          <div className="mt-6 rounded-lg border border-border/70 bg-secondary/40 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Demo access</p>
            <p className="mt-1">
              Use any demo user email with password <span className="font-mono">{demoPassword}</span>.
            </p>
            <div className="mt-2 space-y-1">
              {Object.values(demoUsers).map((user) => (
                <p key={user.id}>
                  {user.role}: {user.email}
                </p>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
