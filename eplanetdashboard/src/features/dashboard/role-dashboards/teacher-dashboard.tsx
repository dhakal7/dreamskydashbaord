import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { BookOpen, Clock, ChevronRight } from 'lucide-react'
import { RoleStatCards } from './shared'
import { getTeacherDashboard } from '../role-selectors'
import { useAuthStore } from '@/store/auth-store'

const statusMeta = {
  ongoing: { label: 'Ongoing', variant: 'success' as const },
  upcoming: { label: 'Upcoming', variant: 'info' as const },
  completed: { label: 'Completed', variant: 'slate' as const },
}

export function TeacherDashboard() {
  const linkedId = useAuthStore((s) => s.currentUser.linkedId)
  const data = getTeacherDashboard(linkedId)

  const stats = [
    { label: 'Ongoing Classes', value: data.ongoingCount, icon: BookOpen, color: '#2563EB', sub: `${data.upcomingCount} upcoming` },
    { label: 'Total Students', value: data.totalStudents, icon: BookOpen, color: '#7C3AED' },
    { label: 'Avg. Attendance', value: `${data.avgAttendancePct}%`, icon: BookOpen, color: '#16A34A' },
    { label: 'Avg. Progress', value: `${data.avgProgress}%`, icon: BookOpen, color: '#D97706' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Welcome back, ${data.teacher?.name.split(' ')[0] ?? 'Teacher'}`}
        description="Your classes at a glance."
      />

      <RoleStatCards stats={stats} />

      <Card>
        <CardHeader>
          <CardTitle>My Classes</CardTitle>
          <CardDescription>Click a class to manage attendance and materials</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {data.classes.length === 0 && (
            <EmptyState icon={BookOpen} title="No classes assigned" className="py-8" />
          )}
          {data.classes.map((classItem) => (
            <Link
              key={classItem.id}
              to={`/classes/${classItem.id}`}
              className="flex items-center justify-between rounded-lg border border-border/70 p-3 transition-colors hover:bg-accent/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[13px] font-medium">{classItem.name}</p>
                  <Badge variant={statusMeta[classItem.status].variant} className="shrink-0 text-[10px] py-0">
                    {statusMeta[classItem.status].label}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{classItem.schedule} · {classItem.room}</span>
                  <span>{classItem.enrolledCount}/{classItem.capacity} enrolled</span>
                  {classItem.status !== 'completed' && (
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" /> {dayjs(classItem.nextSessionAt).format('MMM D, h:mm A')}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
