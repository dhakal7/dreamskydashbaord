import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { PersonAvatar } from '@/components/ui/avatar'
import { EmptyState } from '@/components/shared/empty-state'
import { BookOpen, Clock, ChevronRight } from 'lucide-react'
import { RoleStatCards } from './shared'
import { getTeacherDashboard } from '../role-selectors'
import { useAuthStore } from '@/store/auth-store'
import { isMockMode } from '@/lib/api-client'
import { useMyClasses } from '@/hooks/use-classes'
import { enrollments as mockEnroll } from '@/mock/classes'

export function TeacherDashboard() {
  const navigate = useNavigate()
  const linkedId = useAuthStore((s) => s.currentUser.linkedId)
  const mockData = getTeacherDashboard(linkedId)
  const { data: liveClasses } = useMyClasses()

  const dashboardData = useMemo(() => {
    if (isMockMode() || !liveClasses) {
      return mockData
    }

    const classesMapped = (liveClasses || []).map((c) => {
      const storeCount = mockEnroll.filter((e) => e.classId === c.id || e.classId === c.name).length
      const enrolledCount = (Array.isArray(c.enrollments) && c.enrollments.length > 0)
        ? c.enrollments.length
        : storeCount

      return {
        id: c.id,
        name: c.name,
        subject: c.subject || (c.name.includes('PTE') ? 'PTE' : 'IELTS'),
        status: (c.status?.toLowerCase() ?? 'ongoing'),
        schedule: c.schedule ?? 'Sun-Fri · 07:00 AM - 08:00 AM',
        room: 'Room 101',
        enrolledCount,
        capacity: c.capacity || 20,
        teacherName: useAuthStore.getState().currentUser.name || 'EPT Instructor',
        nextSessionAt: c.startDate ?? c.createdAt,
      }
    })

    const ongoingCount = classesMapped.filter((c) => c.status === 'ongoing' || c.status === 'active').length
    const upcomingCount = classesMapped.filter((c) => c.status === 'upcoming').length
    const totalStudents = classesMapped.reduce((sum, c) => sum + c.enrolledCount, 0)

    return {
      teacher: { name: useAuthStore.getState().currentUser.name },
      classes: classesMapped,
      ongoingCount,
      upcomingCount,
      totalStudents,
      avgAttendancePct: 92,
      avgProgress: 78,
    }
  }, [liveClasses, mockData])

  const stats = [
    { label: 'Ongoing Classes', value: dashboardData.ongoingCount, icon: BookOpen, color: '#2563EB', sub: `${dashboardData.upcomingCount} upcoming` },
    { label: 'Total Students', value: dashboardData.totalStudents, icon: BookOpen, color: '#7C3AED' },
    { label: 'Avg. Attendance', value: `${dashboardData.avgAttendancePct}%`, icon: BookOpen, color: '#16A34A' },
    { label: 'Avg. Progress', value: `${dashboardData.avgProgress}%`, icon: BookOpen, color: '#D97706' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Welcome back, ${(dashboardData.teacher?.name || 'Teacher').split(' ')[0]}`}
        description="Your assigned class batches at a glance."
      />

      <RoleStatCards stats={stats} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <BookOpen className="size-4 text-primary" />
            My Class Batches
          </CardTitle>
          <CardDescription>Click any class batch card to manage daily attendance, roster, and materials</CardDescription>
        </CardHeader>
        <CardContent>
          {dashboardData.classes.length === 0 ? (
            <EmptyState icon={BookOpen} title="No classes assigned" className="py-8" />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dashboardData.classes.map((classItem) => {
                const subjectName = (classItem as any).subject || (classItem.name.includes('PTE') ? 'PTE' : 'IELTS')
                const isIelts = subjectName.toUpperCase() === 'IELTS'
                const pct = Math.min(100, Math.round((classItem.enrolledCount / classItem.capacity) * 100))
                const teacherName = (classItem as any).teacherName || dashboardData.teacher?.name || 'EPT Instructor'

                return (
                  <Card
                    key={classItem.id}
                    className="group relative overflow-hidden transition-all duration-200 hover:shadow-md hover:border-primary/50 cursor-pointer border-border/80"
                    onClick={() => navigate(`/classes/${classItem.id}`)}
                  >
                    <div className="p-4 space-y-3">
                      {/* Header Tag & Status */}
                      <div className="flex items-center justify-between">
                        <Badge
                          variant="outline"
                          className={
                            isIelts
                              ? 'bg-blue-50 text-blue-700 border-blue-200 font-semibold text-[11px]'
                              : 'bg-purple-50 text-purple-700 border-purple-200 font-semibold text-[11px]'
                          }
                        >
                          {subjectName} Batch
                        </Badge>
                        <Badge variant="outline" className="text-[10px] py-0.5 bg-emerald-50 text-emerald-700 border-emerald-200">
                          {classItem.status || 'ongoing'}
                        </Badge>
                      </div>

                      {/* Class Title & Schedule */}
                      <div>
                        <h3 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                          {classItem.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <Clock className="size-3.5 text-muted-foreground" />
                          <span>{classItem.schedule}</span>
                          <span>·</span>
                          <span>{classItem.room || 'Room 101'}</span>
                        </div>
                      </div>

                      {/* Instructor */}
                      <div className="flex items-center justify-between pt-1 border-t border-border/50 text-xs">
                        <div className="flex items-center gap-2">
                          <PersonAvatar name={teacherName} className="size-6 text-[10px]" />
                          <span className="text-muted-foreground">Instructor:</span>
                          <span className="font-medium text-foreground">{teacherName}</span>
                        </div>
                      </div>

                      {/* Enrollment Capacity Progress Bar */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">Class Capacity</span>
                          <span className="font-semibold text-foreground">
                            {classItem.enrolledCount} / {classItem.capacity} Enrolled ({pct}%)
                          </span>
                        </div>
                        <Progress value={pct} className="h-1.5 bg-muted" />
                      </div>

                      {/* Card Action Footer */}
                      <div className="flex items-center justify-end pt-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs gap-1 text-muted-foreground group-hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/classes/${classItem.id}`)
                          }}
                        >
                          View Details
                          <ChevronRight className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
