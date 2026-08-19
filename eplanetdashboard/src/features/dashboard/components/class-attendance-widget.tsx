import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Users, CheckCircle, XCircle, ChevronRight, UserCheck, CalendarCheck2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PersonAvatar } from '@/components/ui/avatar'
import { classes, enrollments as mockEnrollments } from '@/mock'
import type { ClassSession, Enrollment } from '@/types'

export function ClassAttendanceWidget() {
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || 'cls-01')

  const activeClasses = useMemo(() => {
    return classes.map((cls: ClassSession) => {
      const classEnrollments = mockEnrollments.filter((e: Enrollment) => e.classId === cls.id)
      const totalEnrolled = classEnrollments.length || cls.enrolledCount || 15
      const avgAttendance = classEnrollments.length > 0
        ? Math.round(classEnrollments.reduce((acc: number, e: Enrollment) => acc + (e.attendancePct || 85), 0) / classEnrollments.length)
        : 88

      return {
        ...cls,
        classEnrollments,
        totalEnrolled,
        avgAttendance,
        presentToday: Math.round(totalEnrolled * (avgAttendance / 100)),
        absentToday: totalEnrolled - Math.round(totalEnrolled * (avgAttendance / 100)),
      }
    })
  }, [])

  const selectedClass = useMemo(() => {
    return activeClasses.find((c) => c.id === selectedClassId) || activeClasses[0]
  }, [activeClasses, selectedClassId])

  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b border-border/60 pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <CalendarCheck2 className="size-4 text-primary" />
              Student Attendance Across Every Class
            </CardTitle>
            <CardDescription className="text-xs">
              Front Desk live overview of class rosters and student attendance records.
            </CardDescription>
          </div>

          <Link to="/classes">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1">
              View All Classes & Rosters <ChevronRight className="size-3.5" />
            </Button>
          </Link>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* Class Selector Badges */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {activeClasses.map((cls) => {
            const isSelected = cls.id === selectedClassId
            return (
              <button
                key={cls.id}
                type="button"
                onClick={() => setSelectedClassId(cls.id)}
                className={`flex items-center gap-2 shrink-0 rounded-lg border px-3 py-2 text-xs transition-colors ${
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary font-semibold shadow-xs'
                    : 'border-border/70 bg-background text-muted-foreground hover:bg-muted/50'
                }`}
              >
                <BookOpen className="size-3.5" />
                <span>{cls.name}</span>
                <Badge variant={isSelected ? 'default' : 'secondary'} className="text-[10px] py-0 px-1.5 font-tabular">
                  {cls.avgAttendance}%
                </Badge>
              </button>
            )
          })}
        </div>

        {/* Selected Class Attendance Breakdown */}
        {selectedClass && (
          <div className="rounded-lg border border-border/70 bg-muted/20 p-4 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-foreground">{selectedClass.name}</h4>
                  <Badge variant="outline" className="text-[10px] font-normal uppercase">
                    {selectedClass.subject}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Instructor: <span className="font-medium text-foreground">{selectedClass.teacherName}</span> · Schedule: {selectedClass.schedule}
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-md">
                  <CheckCircle className="size-3.5 text-emerald-600" />
                  <span className="font-semibold">{selectedClass.presentToday}</span> Present
                </div>
                <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 text-rose-700 px-2.5 py-1 rounded-md">
                  <XCircle className="size-3.5 text-rose-600" />
                  <span className="font-semibold">{selectedClass.absentToday}</span> Absent
                </div>
                <div className="flex items-center gap-1.5 bg-sky-50 border border-sky-200 text-sky-700 px-2.5 py-1 rounded-md">
                  <Users className="size-3.5 text-sky-600" />
                  <span className="font-semibold">{selectedClass.totalEnrolled}</span> Total
                </div>
              </div>
            </div>

            {/* Student Roster Attendance List */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <UserCheck className="size-3.5 text-muted-foreground" />
                Enrolled Students Attendance Roster ({selectedClass.classEnrollments.length})
              </p>

              {selectedClass.classEnrollments.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-3 text-center">
                  No active student enrollments logged for this class session.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {selectedClass.classEnrollments.map((enr: Enrollment) => {
                    const pct = enr.attendancePct || 80
                    const isGood = pct >= 80
                    const isModerate = pct >= 65 && pct < 80

                    return (
                      <div
                        key={enr.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-background p-2.5 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <PersonAvatar name={enr.studentName} className="size-7" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">{enr.studentName}</p>
                            <p className="truncate text-[10px] text-muted-foreground">Enrolled: {enr.enrolledAt}</p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <Badge
                            className={`text-[10px] py-0 font-tabular font-semibold ${
                              isGood
                                ? 'bg-emerald-500/15 text-emerald-700 border-emerald-300'
                                : isModerate
                                ? 'bg-amber-500/15 text-amber-700 border-amber-300'
                                : 'bg-rose-500/15 text-rose-700 border-rose-300'
                            }`}
                          >
                            {pct}% Att.
                          </Badge>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
