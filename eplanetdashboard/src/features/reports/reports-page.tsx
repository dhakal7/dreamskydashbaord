import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { BarChart3, BookOpen, ClipboardCheck, Download, FileText, GraduationCap, PlaneTakeoff, TrendingUp, Users } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { useAuthStore } from '@/store/auth-store'
import { useAttendanceStore } from '@/features/classes/attendance-store'
import { useClassStudentNotesStore } from '@/features/classes/class-student-notes-store'
import { visibleClasses } from '@/lib/data-visibility'
import { classes as allClasses, enrollments as allEnrollments } from '@/mock'
import { hasPermission } from '@/lib/rbac'
import { exportCsv } from '@/lib/export'
import { ReportFiltersBar, defaultReportFilters } from './report-filters'
import { getReportStats, type ReportFilters } from './report-selectors'
import {
  ApplicationsByMonthChart, LeadsByMonthChart, ConversionTrendChart,
  CountryDistributionChart, SourceDistributionChart, CumulativeStudentsChart,
} from './report-charts'

/* ── Helpers ─────────────────────────────────────────────────────────── */

function computeWeeklyTrend(records: { date: string; presentCount: number; totalCount: number }[]) {
  const weeks: Record<string, { present: number; total: number }> = {}
  for (const r of records) {
    const weekKey = dayjs(r.date).startOf('week').format('YYYY-MM-DD')
    if (!weeks[weekKey]) weeks[weekKey] = { present: 0, total: 0 }
    weeks[weekKey].present += r.presentCount
    weeks[weekKey].total += r.totalCount
  }
  return Object.entries(weeks)
    .map(([week, { present, total }]) => ({
      week,
      label: dayjs(week).format('MMM D'),
      pct: total > 0 ? Math.round((present / total) * 100) : 0,
      present,
      total,
    }))
    .sort((a, b) => a.week.localeCompare(b.week))
}

function computeMonthlyTrend(records: { date: string; presentCount: number; totalCount: number }[]) {
  const months: Record<string, { present: number; total: number }> = {}
  for (const r of records) {
    const monthKey = dayjs(r.date).format('YYYY-MM')
    if (!months[monthKey]) months[monthKey] = { present: 0, total: 0 }
    months[monthKey].present += r.presentCount
    months[monthKey].total += r.totalCount
  }
  return Object.entries(months)
    .map(([month, { present, total }]) => ({
      month,
      label: dayjs(month + '-01').format('MMM YYYY'),
      pct: total > 0 ? Math.round((present / total) * 100) : 0,
      present,
      total,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

/* ── Teacher Reports View ────────────────────────────────────────────── */

function TeacherReportsView() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const attendanceRecords = useAttendanceStore((s) => s.attendanceRecords)
  const { notes } = useClassStudentNotesStore()

  // 1. Get teacher's own classes via visibleClasses
  const myClasses = useMemo(
    () => visibleClasses(currentUser, allClasses),
    [currentUser],
  )
  const myClassIds = useMemo(() => new Set(myClasses.map((c) => c.id)), [myClasses])

  // 2. Get enrollments for teacher's classes
  const myEnrollments = useMemo(
    () => allEnrollments.filter((e) => myClassIds.has(e.classId)),
    [myClassIds],
  )

  // 3. Get attendance records for teacher's classes
  const myAttendance = useMemo(
    () => attendanceRecords
      .filter((a) => myClassIds.has(a.classId))
      .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf()),
    [attendanceRecords, myClassIds],
  )

  // 4. Get test result notes for students in teacher's classes
  const studentIdsInMyClasses = useMemo(
    () => new Set(myEnrollments.map((e) => e.studentId)),
    [myEnrollments],
  )
  const testResults = useMemo(
    () => notes.filter(
      (n) => n.type === 'test_result' && studentIdsInMyClasses.has(n.studentId) && myClassIds.has(n.classId),
    ),
    [notes, studentIdsInMyClasses, myClassIds],
  )

  // 5. Per-class attendance trends
  const perClassAttendance = useMemo(
    () => myClasses.map((cls) => {
      const classRecords = myAttendance.filter((a) => a.classId === cls.id)
      const weekly = computeWeeklyTrend(classRecords)
      const monthly = computeMonthlyTrend(classRecords)
      const overallPct = classRecords.length
        ? Math.round(classRecords.reduce((s, a) => s + (a.presentCount / a.totalCount) * 100, 0) / classRecords.length)
        : 0
      return { classId: cls.id, className: cls.name, overallPct, weekly, monthly }
    }),
    [myClasses, myAttendance],
  )

  // 6. Per-student average test results per class
  const perStudentTestResults = useMemo(
    () => myEnrollments.map((enr) => {
      const studentResults = testResults.filter(
        (n) => n.studentId === enr.studentId && n.classId === enr.classId,
      )
      // Parse numeric scores from test result messages (e.g. "IELTS: 6.5" or "Score: 85%")
      const scores = studentResults
        .map((n) => {
          const match = n.message.match(/(\d+(?:\.\d+)?)/)
          return match ? parseFloat(match[1]) : null
        })
        .filter((s): s is number => s !== null)

      const avgScore = scores.length > 0
        ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10
        : null

      return {
        studentId: enr.studentId,
        studentName: enr.studentName,
        classId: enr.classId,
        className: myClasses.find((c) => c.id === enr.classId)?.name ?? '',
        testCount: studentResults.length,
        avgScore,
        latestResult: studentResults.length > 0
          ? studentResults.sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())[0]
          : null,
      }
    }).filter((s) => s.testCount > 0),
    [myEnrollments, testResults, myClasses],
  )

  const totalStudents = myEnrollments.length
  const overallAttendance = myAttendance.length
    ? Math.round(myAttendance.reduce((s, a) => s + (a.presentCount / a.totalCount) * 100, 0) / myAttendance.length)
    : 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Attendance trends and test results for your classes."
      />

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BookOpen className="size-4" />
              Classes
            </div>
            <p className="mt-1 text-2xl font-bold font-tabular">{myClasses.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="size-4" />
              Students
            </div>
            <p className="mt-1 text-2xl font-bold font-tabular">{totalStudents}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ClipboardCheck className="size-4" />
              Attendance
            </div>
            <p className="mt-1 text-2xl font-bold font-tabular">{overallAttendance}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <GraduationCap className="size-4" />
              Tests Recorded
            </div>
            <p className="mt-1 text-2xl font-bold font-tabular">{testResults.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Per-Class Attendance Trends ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="size-4 text-muted-foreground" />
            Attendance Trends by Class
          </CardTitle>
          <CardDescription>Weekly and monthly attendance percentages per class</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {perClassAttendance.length === 0 && (
            <EmptyState icon={ClipboardCheck} title="No attendance data yet" className="py-8" />
          )}
          {perClassAttendance.map((cls) => (
            <div key={cls.classId} className="space-y-3 rounded-lg border border-border/70 p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">{cls.className}</h4>
                <Badge variant="outline" className="text-xs">
                  {cls.overallPct}% overall
                </Badge>
              </div>

              {/* Weekly trend */}
              {cls.weekly.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Weekly
                  </p>
                  <div className="flex items-end gap-1.5">
                    {cls.weekly.map((w) => (
                      <div key={w.week} className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-[10px] font-tabular text-muted-foreground">{w.pct}%</span>
                        <div
                          className="w-full rounded-sm bg-primary/80"
                          style={{ height: `${Math.max(w.pct, 4)}px` }}
                        />
                        <span className="text-[10px] text-muted-foreground">{w.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Monthly trend */}
              {cls.monthly.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Monthly
                  </p>
                  <div className="flex items-end gap-2">
                    {cls.monthly.map((m) => (
                      <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-[10px] font-tabular text-muted-foreground">{m.pct}%</span>
                        <div
                          className="w-full rounded-sm bg-emerald-500/80"
                          style={{ height: `${Math.max(m.pct, 4)}px` }}
                        />
                        <span className="text-[10px] text-muted-foreground">{m.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Average Test Results per Student ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="size-4 text-muted-foreground" />
            Test Results by Student
          </CardTitle>
          <CardDescription>Average test scores recorded per student across your classes</CardDescription>
        </CardHeader>
        <CardContent>
          {perStudentTestResults.length === 0 ? (
            <EmptyState icon={GraduationCap} title="No test results recorded yet" className="py-8" />
          ) : (
            <div className="space-y-2">
              {perStudentTestResults.map((s) => (
                <div
                  key={`${s.studentId}-${s.classId}`}
                  className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.studentName}</p>
                    <p className="text-xs text-muted-foreground">{s.className} · {s.testCount} test{s.testCount !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {s.avgScore !== null && (
                      <div className="text-right">
                        <p className="text-sm font-bold font-tabular">{s.avgScore}</p>
                        <p className="text-[10px] text-muted-foreground">avg score</p>
                      </div>
                    )}
                    {s.latestResult && (
                      <Badge variant="secondary" className="text-[10px]">
                        Latest: {dayjs(s.latestResult.createdAt).format('MMM D')}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* ── Staff Reports View ──────────────────────────────────────────────── */

function StaffReportsView() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const [filters, setFilters] = useState<ReportFilters>(defaultReportFilters)

  const showCounselorFilter = currentUser.role === 'super_admin' || currentUser.role === 'front_desk'

  const stats = useMemo(() => getReportStats(currentUser, filters), [currentUser, filters])

  const handleExportPdf = () => {
    toast.success('Export started — your PDF report will download shortly')
  }

  const handleExportCsv = () => {
    const rows = [
      { metric: 'Students', value: stats[0].value },
      { metric: 'Leads', value: stats[1].value },
      { metric: 'Applications', value: stats[2].value },
      { metric: 'Visa Processing', value: stats[3].value },
    ]
    exportCsv('eplanet-reports.csv', rows)
    toast.success('Report downloaded')
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Analytics dashboard with filterable charts across your scope."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportPdf}>
              <FileText className="mr-1.5 size-3.5" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="mr-1.5 size-3.5" /> CSV
            </Button>
          </div>
        }
      />

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {stats.map((stat, i) => {
          const icons = [Users, BarChart3, FileText, PlaneTakeoff]
          const colors = ['#2563EB', '#7C3AED', '#0891B2', '#D97706']
          const Icon = icons[i]
          const color = colors[i]
          return (
            <Card key={stat.label} className="p-4 flex items-center justify-between border-border/70 shadow-sm">
              <div>
                <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
                <p className="mt-1 text-2xl font-bold font-tabular">{stat.value}</p>
              </div>
              <div
                className="size-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${color}18`, color }}
              >
                <Icon className="size-5" />
              </div>
            </Card>
          )
        })}
      </div>

      {/* ── Filters ── */}
      <ReportFiltersBar filters={filters} onChange={setFilters} showCounselorFilter={showCounselorFilter} />

      {/* ── Charts Grid ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ApplicationsByMonthChart user={currentUser} filters={filters} />
        <ConversionTrendChart user={currentUser} filters={filters} />
        <CountryDistributionChart user={currentUser} filters={filters} />
        <SourceDistributionChart user={currentUser} filters={filters} />
        <LeadsByMonthChart user={currentUser} filters={filters} />
        <CumulativeStudentsChart user={currentUser} filters={filters} />
      </div>
    </div>
  )
}

/* ── Main Export ─────────────────────────────────────────────────────── */

export default function ReportsPage() {
  const role = useAuthStore((s) => s.currentUser.role)

  if (role === 'teacher') {
    return <TeacherReportsView />
  }

  if (!hasPermission(role, 'reports.view')) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-center">
        <BarChart3 className="size-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-xl font-bold">Access Denied</h3>
        <p className="text-muted-foreground mt-2">You don't have permission to view reports.</p>
      </div>
    )
  }

  return <StaffReportsView />
}
