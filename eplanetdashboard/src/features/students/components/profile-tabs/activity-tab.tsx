import { useMemo } from 'react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import {
  StickyNote, ArrowRight, FileStack, PhoneCall, Mail, CalendarDays,
  MessageSquare, Clock, User, AlertCircle, RefreshCw
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { activities as mockActivities } from '@/mock'
import { isMockMode } from '@/lib/api-client'
import { useStudentFollowUps } from '@/hooks/use-followups'
import type { Student, ActivityItem } from '@/types'

dayjs.extend(relativeTime)

interface FormattedActivity {
  id: string
  title: string
  description: string
  timestamp: string
  actor: string
  type: ActivityItem['type']
  direction?: string
  nextFollowUpAt?: string | null
}

const activityIcons: Record<string, any> = {
  note: StickyNote,
  status_change: ArrowRight,
  document: FileStack,
  call: PhoneCall,
  email: Mail,
  whatsapp: MessageSquare,
  in_person: User,
  application: FileStack,
  visa: FileStack,
  meeting: CalendarDays,
}

function resolveChannelType(channel?: string): ActivityItem['type'] {
  const norm = (channel || '').toUpperCase()
  if (norm === 'CALL') return 'call'
  if (norm === 'EMAIL') return 'email'
  if (norm === 'WHATSAPP') return 'call' // mapped to messaging/call icon family
  if (norm === 'IN_PERSON') return 'meeting'
  return 'note'
}

function formatChannelTitle(channel?: string, direction?: string): string {
  const norm = (channel || '').toUpperCase()
  const dirLabel = direction ? direction.charAt(0).toUpperCase() + direction.slice(1).toLowerCase() : ''
  let chanLabel = 'Note'
  if (norm === 'CALL') chanLabel = 'Phone Call'
  else if (norm === 'EMAIL') chanLabel = 'Email'
  else if (norm === 'WHATSAPP') chanLabel = 'WhatsApp Message'
  else if (norm === 'IN_PERSON') chanLabel = 'In-Person Consultation'
  else if (norm) chanLabel = norm.replace(/_/g, ' ')

  return dirLabel ? `${dirLabel} ${chanLabel}` : chanLabel
}

export function ActivityTab({ student }: { student: Student }) {
  const mockMode = isMockMode()
  const {
    data: apiLogs,
    isLoading,
    isError,
    error,
    refetch,
  } = useStudentFollowUps(student.id)

  const activitiesList: FormattedActivity[] = useMemo(() => {
    if (!mockMode && apiLogs) {
      return (apiLogs || [])
        .map((log) => ({
          id: log.id,
          title: formatChannelTitle(log.channel, log.direction),
          description: log.content || '',
          timestamp: log.createdAt,
          actor: log.author
            ? `${log.author.firstName} ${log.author.lastName}`.trim()
            : log.authorId
              ? 'Staff'
              : 'System',
          type: resolveChannelType(log.channel),
          direction: log.direction || undefined,
          nextFollowUpAt: log.nextFollowUpAt,
        }))
        .filter((a) => a.timestamp && dayjs(a.timestamp).isValid())
        .sort((a, b) => dayjs(b.timestamp).valueOf() - dayjs(a.timestamp).valueOf())
    }

    // Mock mode fallback
    return mockActivities
      .filter((a) => a.entityId === student.id && a.entityType === 'student')
      .map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        timestamp: a.timestamp,
        actor: a.actor,
        type: a.type,
      }))
      .filter((a) => a.timestamp && dayjs(a.timestamp).isValid())
      .sort((a, b) => dayjs(b.timestamp).valueOf() - dayjs(a.timestamp).valueOf())
  }, [mockMode, apiLogs, student.id])

  if (!mockMode && isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-4 animate-pulse">
              <div className="size-8 rounded-full bg-muted shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 bg-muted rounded" />
                <div className="h-3 w-3/4 bg-muted rounded" />
                <div className="h-3 w-28 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    )
  }

  if (!mockMode && isError) {
    return (
      <Card className="p-6 border-danger/40 bg-danger/5">
        <div className="flex items-start gap-3">
          <AlertCircle className="size-5 text-danger shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-danger">Unable to load communication logs</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              {error instanceof Error ? error.message : 'A network error occurred while retrieving student activities.'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="mt-3 h-8 gap-1.5 text-xs"
            >
              <RefreshCw className="size-3" /> Retry
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  if (activitiesList.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">No recent activity logged for this student.</p>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <ol className="space-y-0">
        {activitiesList.map((item, i) => {
          const Icon = activityIcons[item.type] || StickyNote
          return (
            <li key={item.id} className="relative flex gap-4 pb-5 last:pb-0">
              {i < activitiesList.length - 1 && (
                <span className="absolute left-[15px] top-8 h-full w-px bg-border" />
              )}
              <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                <Icon className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[13px] font-medium">{item.title}</p>
                  {item.direction && (
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 uppercase font-medium">
                      {item.direction.toLowerCase()}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-[13px] text-muted-foreground whitespace-pre-wrap">{item.description}</p>
                {item.nextFollowUpAt && dayjs(item.nextFollowUpAt).isValid() && (
                  <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                    <Clock className="size-3" /> Next follow-up: {dayjs(item.nextFollowUpAt).format('MMM D, YYYY · h:mm A')}
                  </p>
                )}
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

