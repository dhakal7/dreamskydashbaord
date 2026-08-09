import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function ErrorState({ title = 'Something went wrong', description = 'Please try again in a moment.', actionLabel = 'Retry', onRetry }: { title?: string; description?: string; actionLabel?: string; onRetry?: () => void }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 border-dashed border-danger-500/40 bg-danger-50/40 px-8 py-16 text-center dark:bg-danger-500/10">
      <div className="flex size-12 items-center justify-center rounded-full bg-danger-100 text-danger-600">
        <AlertTriangle className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry && <Button onClick={onRetry} variant="outline">{actionLabel}</Button>}
    </Card>
  )
}
