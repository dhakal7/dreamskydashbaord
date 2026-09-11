import { ArrowLeft, Compass, AlertTriangle, RefreshCw } from 'lucide-react'
import { Link, useRouteError, isRouteErrorResponse } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuthStore } from '@/store/auth-store'
import { dashboardPaths } from '@/lib/rbac'

export function NotFoundPage() {
  const error = useRouteError()
  const role = useAuthStore((state) => state.currentUser?.role ?? 'super_admin')
  const homePath = dashboardPaths[role] || '/'

  const is404 = isRouteErrorResponse(error) && error.status === 404
  const isChunkLoadError = error instanceof Error && (
    error.message.includes('dynamically imported module') ||
    error.message.includes('Loading chunk') ||
    error.message.includes('Failed to fetch')
  )

  if (!is404 && error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-dashed p-8 text-center space-y-4">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" />
          </div>
          <h1 className="text-xl font-bold">
            {isChunkLoadError ? 'New Update Available' : 'Something went wrong'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isChunkLoadError
              ? 'A new version of the dashboard has been deployed. Please reload the page to load the latest assets.'
              : error instanceof Error ? error.message : 'An unexpected error occurred while rendering this page.'}
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button onClick={() => window.location.reload()} className="gap-2">
              <RefreshCw className="size-4" /> Reload Page
            </Button>
            <Button variant="outline" asChild>
              <Link to={homePath}>
                <ArrowLeft className="mr-2 size-4" /> Go home
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    )
  }

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
