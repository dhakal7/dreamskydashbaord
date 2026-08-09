import { Activity, ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { activities } from '@/mock'

export function RecentActivities() {
  const recent = activities.slice(0, 5)

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Recent Activities</h3>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs">
          View all <ArrowRight className="ml-1 size-3.5" />
        </Button>
      </div>
      <div className="space-y-2">
        {recent.map((item) => (
          <div key={item.id} className="rounded-lg border border-border/70 bg-secondary/30 px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              <span className="text-[11px] text-muted-foreground">{item.timestamp}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
