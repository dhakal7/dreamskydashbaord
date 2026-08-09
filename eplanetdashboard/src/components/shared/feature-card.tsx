import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function FeatureCard({ title, description, children, className }: { title: string; description?: string; children?: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('p-4', className)}>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </Card>
  )
}
