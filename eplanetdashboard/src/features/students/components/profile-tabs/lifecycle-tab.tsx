import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Clock3, CheckCircle2, ArrowRight } from 'lucide-react'
import type { Student } from '@/types'
import { getStudentLifecycleState } from '../../lifecycle'
import dayjs from 'dayjs'

export function LifecycleTab({ student }: { student: Student }) {
  const { steps, progress, activeStep, history } = getStudentLifecycleState(student)

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">Student lifecycle</p>
            <h3 className="text-xl font-semibold">{activeStep.label}</h3>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{activeStep.description}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-secondary/40 px-4 py-3">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-semibold">{progress}%</span>
            </div>
            <Progress value={progress} className="w-56" />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Clock3 className="size-4 text-primary" />
            <h4 className="font-semibold">Journey pipeline</h4>
          </div>
          <div className="space-y-3">
            {steps.map((step) => (
              <div key={step.key} className="flex items-start gap-3 rounded-lg border border-border/70 p-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background">
                  {step.completed ? <CheckCircle2 className="size-4 text-success" /> : <ArrowRight className="size-4 text-muted-foreground" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{step.label}</span>
                    {step.active && <Badge variant="info">Current</Badge>}
                    {step.completed && <Badge variant="success">Completed</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle2 className="size-4 text-primary" />
            <h4 className="font-semibold">Activity history</h4>
          </div>
          <div className="space-y-3">
            {history.map((event) => (
              <div key={event.id} className="rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{event.title}</p>
                  <span className="text-xs text-muted-foreground">{dayjs(event.timestamp).format('MMM D, YYYY')}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
