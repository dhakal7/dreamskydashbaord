import { ArrowLeft, Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuthStore } from '@/store/auth-store'
import { dashboardPaths } from '@/lib/rbac'

export function NotFoundPage() {
  const role = useAuthStore((state) => state.currentUser?.role ?? 'super_admin')
  const homePath = dashboardPaths[role] || '/'

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-dashed p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary">
          <Compass className="size-5 text-muted-foreground" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">The route you requested could not be found. Return home to continue working.</p>
        <Button asChild className="mt-6">
          <Link to={homePath}>
            <ArrowLeft className="mr-2 size-4" /> Go home
          </Link>
        </Button>
      </Card>
    </div>
  )
}
