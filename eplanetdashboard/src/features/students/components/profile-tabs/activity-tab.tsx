import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { StickyNote, ArrowRight, FileStack, PhoneCall, Mail, CalendarDays } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { activities } from '@/mock'
import type { Student, ActivityItem } from '@/types'

dayjs.extend(relativeTime)

const activityIcons: Record<ActivityItem['type'], any> = {
  note: StickyNote,
  status_change: ArrowRight,
  document: FileStack,
  call: PhoneCall,
  email: Mail,
  application: FileStack,
  visa: FileStack,
  meeting: CalendarDays,
}

export function ActivityTab({ student }: { student: Student }) {
  const studentActivities = activities.filter((a) => a.entityId === student.id && a.entityType === 'student')
    .sort((a, b) => dayjs(b.timestamp).valueOf() - dayjs(a.timestamp).valueOf())

  if (studentActivities.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">No recent activity logged.</p>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <ol className="space-y-0">
        {studentActivities.map((item, i) => {
          const Icon = activityIcons[item.type]
          return (
            <li key={item.id} className="relative flex gap-4 pb-5 last:pb-0">
              {i < studentActivities.length - 1 && (
                <span className="absolute left-[15px] top-8 h-full w-px bg-border" />
              )}
              <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                <Icon className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <p className="text-[13px] font-medium">{item.title}</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{item.description}</p>
                <p className="mt-1.5 text-xs text-muted-foreground/70 font-tabular">
                  {dayjs(item.timestamp).fromNow()} · by {item.actor}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
