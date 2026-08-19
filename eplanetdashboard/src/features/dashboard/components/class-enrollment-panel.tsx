import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BookOpen, UserPlus, Users, Clock, CheckCircle2 } from 'lucide-react'
import { isMockMode } from '@/lib/api-client'
import { useClasses, useEnrollStudent } from '@/hooks/use-classes'
import { useStudents } from '@/hooks/use-students'
import { classes as mockClasses } from '@/mock'
import { useStudentsStore } from '@/features/students/store'
import { useAttendanceStore } from '@/features/classes/attendance-store'
import { toast } from 'sonner'
import type { ClassSession } from '@/types'

interface FormattedClass {
  id: string
  name: string
  subject: string
  teacherName: string
  schedule: string
  capacity: number
  enrolledCount: number
  status: string
}

export function ClassEnrollmentPanel() {
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false)
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [selectedStudentId, setSelectedStudentId] = useState<string>('')

  // ── Data Fetching ─────────────────────────────────────────────────────────
  const { data: liveClassesData, isLoading: isClassesLoading } = useClasses()
  const { data: liveStudentsData } = useStudents({ limit: 100 })

  const mockStudents = useStudentsStore((s) => s.students)
  const mockEnroll = useAttendanceStore((s) => s.enrollments)

  const enrollMutation = useEnrollStudent()

  // Format classes array for unified rendering
  const activeClasses = useMemo<FormattedClass[]>(() => {
    if (!isMockMode() && liveClassesData?.classes) {
      return liveClassesData.classes.map((c) => ({
        id: c.id,
        name: c.name,
        subject: c.subject,
        teacherName: c.teacher ? `${c.teacher.firstName} ${c.teacher.lastName}` : 'Assigned Instructor',
        schedule: c.schedule || 'Mon-Fri (Morning)',
        capacity: c.capacity || 25,
        enrolledCount: c.enrollments?.length || 0,
        status: c.status || 'Active',
      }))
    }
    return (mockClasses as ClassSession[]).map((c) => {
      const count = mockEnroll.filter((e) => e.classId === c.id).length
      return {
        id: c.id,
        name: c.name,
        subject: c.subject,
        teacherName: c.teacherName,
        schedule: c.schedule,
        capacity: c.capacity,
        enrolledCount: count,
        status: c.status,
      }
    })
  }, [liveClassesData, mockEnroll])

  // Format students list for enrollment selector
  const availableStudents = useMemo(() => {
    if (!isMockMode() && liveStudentsData?.students) {
      return liveStudentsData.students.map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        email: s.email,
      }))
    }
    return mockStudents.map((s) => ({ id: s.id, name: s.name, email: s.email }))
  }, [liveStudentsData, mockStudents])

  const openEnrollModal = (classId?: string) => {
    if (classId) setSelectedClassId(classId)
    else if (activeClasses.length > 0) setSelectedClassId(activeClasses[0].id)
    setSelectedStudentId('')
    setEnrollDialogOpen(true)
  }

  const handleEnrollSubmit = () => {
    if (!selectedClassId || !selectedStudentId) {
      toast.error('Please select both a class and a student.')
      return
    }

    const cls = activeClasses.find((c) => c.id === selectedClassId)
    const st = availableStudents.find((s) => s.id === selectedStudentId)

    if (!isMockMode()) {
      enrollMutation.mutate(
        { classId: selectedClassId, studentId: selectedStudentId },
        {
          onSuccess: () => {
            setEnrollDialogOpen(false)
            setSelectedStudentId('')
          },
        }
      )
    } else {
      toast.success(`${st?.name || 'Student'} enrolled into ${cls?.name || 'Class'} successfully!`)
      setEnrollDialogOpen(false)
      setSelectedStudentId('')
    }
  }

  return (
    <>
      <Card className="shadow-xs border-border/80">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-md bg-brand-500/10 text-brand-600">
                <BookOpen className="size-4" />
              </div>
              <CardTitle className="text-base font-semibold">Active Classes & Student Admissions</CardTitle>
            </div>
            <CardDescription className="mt-1 text-xs">
              Directly admit leads and students into language & test prep classes (IELTS, PTE, TOEFL, Japanese).
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => openEnrollModal()} className="gap-1.5 bg-brand-600 text-white hover:bg-brand-700">
            <UserPlus className="size-3.5" /> Admit Student to Class
          </Button>
        </CardHeader>

        <CardContent>
          {isClassesLoading ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Loading active classes...</p>
          ) : activeClasses.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No active classes found.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {activeClasses.map((cls: FormattedClass) => {
                const isFull = cls.enrolledCount >= cls.capacity
                const pct = Math.round((cls.enrolledCount / cls.capacity) * 100)

                return (
                  <div
                    key={cls.id}
                    className="flex flex-col justify-between rounded-xl border border-border/70 bg-card p-4 transition-all hover:border-brand-500/30 hover:shadow-soft"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <Badge variant="outline" className="font-mono text-[10px] uppercase">
                          {cls.subject}
                        </Badge>
                        <Badge variant={isFull ? 'danger' : 'success'} className="text-[10px]">
                          {cls.enrolledCount} / {cls.capacity} Enrolled ({pct}%)
                        </Badge>
                      </div>

                      <div>
                        <h4 className="font-semibold text-sm text-foreground">{cls.name}</h4>
                        <p className="text-xs text-muted-foreground">Instructor: {cls.teacherName}</p>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="size-3.5 text-brand-500" />
                        <span>{cls.schedule}</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="size-3.5" />
                        <span>{cls.enrolledCount} Students</span>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEnrollModal(cls.id)}
                        disabled={isFull}
                        className="h-8 gap-1 text-xs"
                      >
                        <UserPlus className="size-3" /> Admit
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Admission & Class Enrollment Dialog ── */}
      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-5 text-brand-600" /> Admit Student to Class
            </DialogTitle>
            <DialogDescription>
              Select a target class batch and choose the student to admit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Target Class Selection */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">Select Target Class Batch</label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="">-- Choose Class --</option>
                {activeClasses.map((cls: FormattedClass) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.subject}) — {cls.enrolledCount}/{cls.capacity} Enrolled
                  </option>
                ))}
              </select>
            </div>

            {/* Student Selection */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">Select Student / Lead to Admit</label>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="">-- Choose Student --</option>
                {availableStudents.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.email || 'No email'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEnrollDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEnrollSubmit}
              disabled={enrollMutation.isPending || !selectedClassId || !selectedStudentId}
              className="gap-1.5 bg-brand-600 text-white hover:bg-brand-700"
            >
              <CheckCircle2 className="size-4" />
              {enrollMutation.isPending ? 'Enrolling...' : 'Confirm Admission'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
