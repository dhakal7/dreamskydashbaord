import dayjs from 'dayjs'
import { ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ApplicationStageBadge } from '@/components/shared/status-badges'
import { applications } from '@/mock'
import { formatCurrency } from '@/lib/utils'
import type { Student } from '@/types'

export function ApplicationsTab({ student }: { student: Student }) {
  const apps = applications.filter((a) => a.studentId === student.id)

  return (
    <div className="space-y-3">
      {apps.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No applications submitted.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/60">
              <tr>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ref / University</th>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Course</th>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stage</th>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Intake</th>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Updated</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.id} className="border-b border-border/70 last:border-0 hover:bg-accent/50">
                  <td className="whitespace-nowrap px-3.5 py-2.5">
                    <p className="text-[13px] font-medium flex items-center gap-1.5 hover:underline cursor-pointer">
                      {app.universityName} <ExternalLink className="size-3 text-muted-foreground" />
                    </p>
                    <p className="text-xs text-muted-foreground font-tabular">{app.applicationRef} · {app.countryName}</p>
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">
                    <p className="text-[13px]">{app.courseName}</p>
                    <p className="text-xs text-muted-foreground font-tabular">{formatCurrency(app.tuitionUsd)}</p>
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">
                    <ApplicationStageBadge stage={app.stage} />
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-[13px]">
                    {app.intake} 2026
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-muted-foreground font-tabular">
                    {dayjs(app.lastUpdate).format('MMM D, YYYY')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
