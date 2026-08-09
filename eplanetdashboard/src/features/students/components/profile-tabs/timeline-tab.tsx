import dayjs from 'dayjs'
import { Card } from '@/components/ui/card'
import type { Student } from '@/types'
import { applications, visaCases } from '@/mock'
import { useDocumentsStore } from '@/features/documents/store'
import { ApplicationStageBadge, VisaStatusBadge } from '@/components/shared/status-badges'
import { User, FileText, Send, Plane } from 'lucide-react'

export function TimelineTab({ student }: { student: Student }) {
  const { documents } = useDocumentsStore()

  const events = [
    {
      id: 'created',
      date: student.createdAt,
      title: 'Profile Created',
      desc: 'Student registered in the system',
      icon: User,
      color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    }
  ]

  const docs = documents.filter((d) => d.studentId === student.id).sort((a, b) => dayjs(a.uploadedAt).valueOf() - dayjs(b.uploadedAt).valueOf())
  if (docs.length > 0) {
    events.push({
      id: 'first_doc',
      date: docs[0].uploadedAt,
      title: 'First Document Uploaded',
      desc: `${docs[0].fileName} was uploaded`,
      icon: FileText,
      color: 'bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400',
    })
  }

  const apps = applications.filter((a) => a.studentId === student.id)
  apps.forEach((a) => {
    events.push({
      id: `app_${a.id}`,
      date: a.submittedDate,
      title: `Applied to ${a.universityName}`,
      desc: (
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">{a.courseName}</span>
          <ApplicationStageBadge stage={a.stage} className="py-0 text-[10px]" />
        </div>
      ) as any,
      icon: Send,
      color: 'bg-warning-100 text-warning-600 dark:bg-warning-500/20 dark:text-warning-400',
    })
  })

  const visas = visaCases.filter((v) => v.studentId === student.id)
  visas.forEach((v) => {
    if (v.submissionDate) {
      events.push({
        id: `visa_${v.id}`,
        date: v.submissionDate,
        title: `${v.countryName} Visa Submitted`,
        desc: (
          <div className="flex items-center gap-2 mt-1">
            <VisaStatusBadge status={v.overallStatus} className="py-0 text-[10px]" />
          </div>
        ) as any,
        icon: Plane,
        color: 'bg-success-100 text-success-600 dark:bg-success-500/20 dark:text-success-400',
      })
    }
  })

  events.sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf())

  return (
    <div className="relative pl-4 sm:pl-0">
      {/* Vertical line connecting timeline dots (visible mostly on sm+) */}
      <div className="absolute left-6 sm:left-[111px] top-4 bottom-4 w-px bg-border/80 hidden sm:block" />
      
      <div className="space-y-6">
        {events.map((event) => {
          const Icon = event.icon
          return (
            <div key={event.id} className="relative flex flex-col sm:flex-row gap-4 sm:gap-6 group">
              {/* Date Column */}
              <div className="hidden sm:flex w-24 shrink-0 flex-col items-end pt-1">
                <span className="text-sm font-medium text-foreground">{dayjs(event.date).format('MMM D')}</span>
                <span className="text-xs text-muted-foreground">{dayjs(event.date).format('YYYY')}</span>
              </div>
              
              {/* Connector Dot */}
              <div className="absolute left-[-23px] sm:static sm:left-auto flex size-8 shrink-0 items-center justify-center rounded-full border-[3px] border-background z-10 shadow-sm transition-transform group-hover:scale-110 duration-200" style={{ backgroundColor: 'var(--background)' }}>
                <div className={`flex size-6 items-center justify-center rounded-full ${event.color}`}>
                  <Icon className="size-3.5" />
                </div>
              </div>

              {/* Content Card */}
              <Card className="flex-1 p-4 shadow-sm group-hover:shadow-soft transition-shadow border-border/60">
                <div className="sm:hidden mb-2">
                   <span className="text-xs font-semibold text-muted-foreground">{dayjs(event.date).format('MMM D, YYYY')}</span>
                </div>
                <h4 className="text-sm font-semibold">{event.title}</h4>
                <div className="mt-1 text-sm text-muted-foreground">
                  {event.desc}
                </div>
              </Card>
            </div>
          )
        })}
      </div>
    </div>
  )
}
