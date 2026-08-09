import { useMemo } from 'react'
import dayjs from 'dayjs'
import { Phone, Mail, MessageSquare, User, Clock, AlertCircle } from 'lucide-react'
import { PriorityBadge, FollowUpStatusBadge } from '@/components/shared/status-badges'
import { priorityMeta } from '@/components/shared/status-badges'
import { cn } from '@/lib/utils'
import type { FollowUp } from '@/types'

const channelIcons = {
  call: Phone,
  email: Mail,
  whatsapp: MessageSquare,
  in_person: User,
  sms: MessageSquare,
}

interface TimelineViewProps {
  followUps: FollowUp[]
  onSelectFollowUp: (fu: FollowUp) => void
}

export function TimelineView({ followUps, onSelectFollowUp }: TimelineViewProps) {
  // Sort and group followups by date
  const groupedByDate = useMemo(() => {
    const sorted = [...followUps].sort((a, b) => {
      const dateDiff = a.date.localeCompare(b.date)
      if (dateDiff !== 0) return dateDiff
      return a.time.localeCompare(b.time)
    })

    const groups: { date: string; items: FollowUp[] }[] = []
    sorted.forEach((item) => {
      const lastGroup = groups[groups.length - 1]
      if (lastGroup && lastGroup.date === item.date) {
        lastGroup.items.push(item)
      } else {
        groups.push({ date: item.date, items: [item] })
      }
    })

    return groups
  }, [followUps])

  if (followUps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-border rounded-xl bg-card">
        <AlertCircle className="size-9 text-muted-foreground/60 mb-2" />
        <p className="text-sm font-semibold text-muted-foreground">No follow-ups found matching filters.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 relative pl-4 sm:pl-6">
      {/* Central timeline line */}
      <div className="absolute left-[23px] sm:left-[27px] top-3 bottom-3 w-px bg-border/80" />

      {groupedByDate.map((group) => (
        <div key={group.date} className="relative space-y-3">
          {/* Date Label Header */}
          <div className="relative z-10 flex items-center gap-3">
            <span className="size-3.5 sm:size-4 rounded-full border-2 border-primary bg-background ring-4 ring-background shrink-0" />
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider bg-background px-2 py-0.5 rounded border border-border/50 shadow-soft">
              {dayjs(group.date).format('dddd, MMMM D, YYYY')}
            </h3>
            <span className="text-[10px] text-muted-foreground/80 font-medium">
              ({group.items.length} follow-up{group.items.length > 1 ? 's' : ''})
            </span>
          </div>

          {/* Group items list */}
          <div className="space-y-3 pl-8 sm:pl-9">
            {group.items.map((fu) => {
              const ChannelIcon = channelIcons[fu.channel] || Phone
              const dotColor = priorityMeta[fu.priority].dot

              return (
                <div
                  key={fu.id}
                  onClick={() => onSelectFollowUp(fu)}
                  className={cn(
                    "relative flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 sm:p-3.5 rounded-xl border border-border/70 bg-card hover:bg-accent/40 cursor-pointer shadow-soft transition-all group overflow-hidden",
                    fu.status === 'completed' && 'opacity-65'
                  )}
                >
                  {/* Left priority border block */}
                  <span
                    className="absolute left-0 top-0 bottom-0 w-1"
                    style={{ backgroundColor: dotColor }}
                  />

                  {/* Channel icon absolute locator overlapping the main timeline line */}
                  <span
                    className="absolute left-[-24px] sm:left-[-27px] top-4 z-10 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-card shadow-soft text-muted-foreground ring-4 ring-background"
                    title={fu.channel}
                  >
                    <ChannelIcon className="size-3" />
                  </span>

                  <div className="min-w-0 flex-1 space-y-1 pl-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-bold text-foreground truncate group-hover:text-primary transition-colors">
                        {fu.studentName}
                      </p>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground font-medium">Counselor: {fu.counselorName}</span>
                    </div>
                    <p className="text-[12px] text-muted-foreground leading-normal font-medium">
                      {fu.reminder}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:gap-1.5 shrink-0 pl-1">
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground font-tabular">
                      <Clock className="size-3" />
                      {fu.time}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <PriorityBadge priority={fu.priority} className="text-[10px] py-0 px-1.5" />
                      <FollowUpStatusBadge status={fu.status} className="text-[10px] py-0 px-1.5" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
