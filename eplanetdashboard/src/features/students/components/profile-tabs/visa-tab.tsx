import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { CheckCircle2, Circle, Clock, ExternalLink } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { VisaStatusBadge } from '@/components/shared/status-badges'
import { useVisaStore } from '@/features/visa/store'
import type { Student } from '@/types'

export function VisaTab({ student }: { student: Student }) {
  const visaCases = useVisaStore((s) => s.visaCases)
  const cases = visaCases.filter((v) => v.studentId === student.id)

  if (cases.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">No visa cases initiated.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {cases.map((vc) => (
        <Card key={vc.id}>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">{vc.countryName} Visa</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{vc.universityName}</p>
            </div>
            <div className="flex items-center gap-2">
              <VisaStatusBadge status={vc.overallStatus} />
              <Button asChild variant="ghost" size="icon" className="size-8">
                <Link to={`/visa/${vc.id}`}>
                  <ExternalLink className="size-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-0">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium">
                <span>Progress</span>
                <span className="font-tabular">{vc.progress}%</span>
              </div>
              <Progress value={vc.progress} className="h-2" />
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Checklist</h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {vc.checklist.map((item) => (
                  <div key={item.step} className="flex items-start gap-2.5 rounded-lg border border-border/60 p-2.5">
                    {item.status === 'approved' ? (
                      <CheckCircle2 className="size-4 text-success-500 mt-0.5 shrink-0" />
                    ) : item.status === 'in_progress' ? (
                      <Clock className="size-4 text-info-500 mt-0.5 shrink-0" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div>
                      <p className="text-[13px] font-medium capitalize">{item.step.replace('_', ' ')}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {item.status === 'approved' && item.completedDate
                          ? `Completed on ${dayjs(item.completedDate).format('MMM D')}`
                          : item.status === 'in_progress'
                            ? 'In progress'
                            : 'Pending'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {(vc.submissionDate || vc.decisionDate) && (
              <div className="flex flex-wrap gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
                {vc.submissionDate && (
                  <p>Submitted: <span className="font-medium text-foreground">{dayjs(vc.submissionDate).format('MMM D, YYYY')}</span></p>
                )}
                {vc.decisionDate && (
                  <p>Decision: <span className="font-medium text-foreground">{dayjs(vc.decisionDate).format('MMM D, YYYY')}</span></p>
                )}
                {vc.visaOfficer && (
                  <p>Officer: <span className="font-medium text-foreground">{vc.visaOfficer}</span></p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
