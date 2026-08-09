import dayjs from 'dayjs'
import { Link } from 'react-router-dom'
import {
  CalendarDays, Clock, FileStack, PhoneCall, Mail, StickyNote,
  ChevronRight, ArrowRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PersonAvatar } from '@/components/ui/avatar'
import { EmptyState } from '@/components/shared/empty-state'
import { PriorityBadge, ApplicationStageBadge } from '@/components/shared/status-badges'
import { appointmentStatusMeta } from '@/components/shared/status-badges'
import {
  getRecentActivities, getRecentStudents, getRecentApplications,
} from '../selectors'
import { useTodayAppointments, useUpcomingFollowUps } from '../hooks/use-dashboard-stats'

const activityIcons = {
  note: StickyNote, status_change: ArrowRight, document: FileStack, call: PhoneCall,
  email: Mail, application: FileStack, visa: FileStack, meeting: CalendarDays,
}

export function TodaysAppointmentsPanel() {
  const { items } = useTodayAppointments()
  return (
    <Card className="h-full">
      <CardHeader className="px-3 pb-2 pt-3">
        <CardTitle className="text-sm">Today's Appointments</CardTitle>
        <CardDescription className="text-xs">{items.length} scheduled for today</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3">
        {items.length === 0 && (
          <EmptyState icon={CalendarDays} title="No appointments today" description="Enjoy the quiet — nothing is scheduled for today." className="py-8" />
        )}
        {items.slice(0, 5).map((a) => {
          const statusMeta = appointmentStatusMeta[a.status]
          return (
            <div key={a.id} className="flex items-center gap-3 rounded-md border border-border/70 p-2">
              <PersonAvatar name={a.studentName} className="size-7" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium">{a.studentName}</p>
                <p className="truncate text-[11px] text-muted-foreground capitalize">{a.type.replace('_', ' ')} · {a.counselorName}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="flex items-center gap-1 text-[11px] font-medium font-tabular">
                  <Clock className="size-3" /> {dayjs(a.start).format('h:mm A')}
                </span>
                <Badge variant={statusMeta.variant} className="text-[9px] py-0">{statusMeta.label}</Badge>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

export function RecentActivityPanel() {
  const items = getRecentActivities(8)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activities</CardTitle>
        <CardDescription>Latest actions across students &amp; leads</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-0">
          {items.map((item, i) => {
            const Icon = activityIcons[item.type]
            return (
              <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
                {i < items.length - 1 && <span className="absolute left-[13px] top-6 h-full w-px bg-border" />}
                <span className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <Icon className="size-3.5 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-[13px] font-medium">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/70">{dayjs(item.timestamp).fromNow()} · {item.actor}</p>
                </div>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}

export function UpcomingFollowUpsPanel() {
  const { items } = useUpcomingFollowUps()
  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between space-y-0 px-3 pb-2 pt-3">
        <div>
          <CardTitle className="text-sm">Upcoming Follow-ups</CardTitle>
          <CardDescription className="text-xs">Pending reminders across counselors</CardDescription>
        </div>
        <Link to="/follow-ups" className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
          View all <ChevronRight className="size-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3">
        {items.map((f) => (
          <div key={f.id} className="flex items-center gap-3 rounded-md border border-border/70 p-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium">{f.studentName}</p>
              <p className="truncate text-[11px] text-muted-foreground">{f.reminder}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-[11px] font-medium font-tabular">{dayjs(f.date).format('MMM D')}</span>
              <PriorityBadge priority={f.priority} className="text-[9px] py-0" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function RecentStudentsPanel() {
  const items = getRecentStudents(5)
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Recent Students</CardTitle>
          <CardDescription>Newly added student profiles</CardDescription>
        </div>
        <Link to="/students" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          View all <ChevronRight className="size-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((s) => (
          <Link
            key={s.id}
            to={`/students/${s.id}`}
            className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent"
          >
            <PersonAvatar name={s.name} color={s.photoColor} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{s.name}</p>
              <p className="truncate text-xs text-muted-foreground font-tabular">{s.studentId}</p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{dayjs(s.createdAt).fromNow()}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

export function RecentApplicationsPanel() {
  const items = getRecentApplications(5)
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Recent Applications</CardTitle>
          <CardDescription>Latest status updates</CardDescription>
        </div>
        <Link to="/applications" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          View all <ChevronRight className="size-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-lg border border-border/70 p-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{a.studentName}</p>
              <p className="truncate text-xs text-muted-foreground">{a.universityName}</p>
            </div>
            <ApplicationStageBadge stage={a.stage} className="shrink-0 text-[10px] py-0" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
