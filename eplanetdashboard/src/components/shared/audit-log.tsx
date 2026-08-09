import { ShieldCheck } from 'lucide-react'
import { Card } from '@/components/ui/card'

const auditEntries = [
  { id: 1, actor: 'Monica', action: 'Updated student profile', detail: 'Added passport document status', time: '5 mins ago' },
  { id: 2, actor: 'System', action: 'Exported student report', detail: 'Generated PDF from filtered view', time: '17 mins ago' },
  { id: 3, actor: 'Ravi', action: 'Changed visa stage', detail: 'Moved case to interview review', time: '1 hr ago' },
]

export function AuditLog() {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Audit Logs</h3>
      </div>
      <div className="space-y-2">
        {auditEntries.map((entry) => (
          <div key={entry.id} className="rounded-lg border border-border/70 bg-secondary/30 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{entry.actor}</p>
              <span className="text-[11px] text-muted-foreground">{entry.time}</span>
            </div>
            <p className="mt-1 text-muted-foreground">{entry.action}</p>
            <p className="text-xs text-muted-foreground">{entry.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}
