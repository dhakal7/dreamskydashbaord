import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-dashed p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger-100 text-danger-600 dark:bg-danger-500/10">
          <ShieldAlert className="size-5" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">Access restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your role does not have permission to open this workspace.</p>
        <Button asChild className="mt-6">
          <Link to="/">
            <ArrowLeft className="mr-2 size-4" /> Return to dashboard
          </Link>
        </Button>
      </Card>
    </div>
  )
}
