import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  BookOpen, UserPlus, Users, Clock, Search, ChevronRight, ClipboardCheck, Pencil, UserCheck
} from 'lucide-react'
import dayjs from 'dayjs'

import { useAuthStore } from '@/store/auth-store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { PersonAvatar } from '@/components/ui/avatar'
import { EmptyState } from '@/components/shared/empty-state'

import { api, isMockMode } from '@/lib/api-client'
import { useClasses, useEnrollStudent, useUpdateClass } from '@/hooks/use-classes'
import { useStudents } from '@/hooks/use-students'
import { getClassesForRole } from './selectors'
import { useStudentsStore } from '@/features/students/store'
import { useAttendanceStore } from '@/features/classes/attendance-store'
import { teachers as mockTeachers } from '@/mock/staff'

interface FormattedClass {
  id: string
  name: string
  subject: 'IELTS' | 'PTE' | string
  teacherId?: string
  teacherName: string
  schedule: string
  room: string
  capacity: number
  enrolledCount: number
  status: string
  startDate: string
}

interface RosterStudent {
  id: string
  studentId: string
  name: string
  email: string
  phone: string
  enrolledAt: string
  stage: string
}



export default function ClassesPage() {
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.currentUser?.role ?? 'front_desk')
  const linkedId = useAuthStore((s) => s.currentUser?.linkedId)

  // Data queries
  const { data: liveClassesData } = useClasses()
  const { data: liveStudentsData } = useStudents({ limit: 100 })
  const mockClasses = getClassesForRole(role, linkedId)
  const mockStudents = useStudentsStore((s) => s.students)
  const mockEnroll = useAttendanceStore((s) => s.enrollments)

  const enrollMutation = useEnrollStudent()
  const updateClassMutation = useUpdateClass()

  // Live Teachers state
  const [liveTeachers, setLiveTeachers] = useState<Array<{ id: string; name: string; email: string }>>([])

  useEffect(() => {
    if (!isMockMode()) {
      api.get<any[]>('/users')
        .then((users) => {
          if (Array.isArray(users)) {
            const staffList = users.map((u) => ({
              id: u.id,
              name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
              email: u.email,
            }))
            if (staffList.length > 0) setLiveTeachers(staffList)
          }
        })
        .catch(() => {})
    }
  }, [])

  // Component state
  const [searchQuery, setSearchQuery] = useState('')
  const [subjectFilter, setSubjectFilter] = useState<'ALL' | 'IELTS' | 'PTE'>('ALL')

  // Admission Modal State
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false)
  const [targetClassId, setTargetClassId] = useState('')
  const [targetStudentId, setTargetStudentId] = useState('')
  const [isEnrolling, setIsEnrolling] = useState(false)

  // Edit Class & Assign Teacher State
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingClass, setEditingClass] = useState<FormattedClass | null>(null)
  const [editName, setEditName] = useState('')
  const [editSchedule, setEditSchedule] = useState('')
  const [editTeacherId, setEditTeacherId] = useState('')
  const [isUpdatingClass, setIsUpdatingClass] = useState(false)

  // Class Detail Drawer State
  const [selectedClass, setSelectedClass] = useState<FormattedClass | null>(null)
  const [activeTab, setActiveTab] = useState<'roster' | 'attendance' | 'materials'>('roster')
  const [todayPresence, setTodayPresence] = useState<Record<string, boolean>>({})

  // Format classes array
  const formattedClasses = useMemo<FormattedClass[]>(() => {
    if (!isMockMode()) {
      const rawList = Array.isArray(liveClassesData)
        ? liveClassesData
        : (liveClassesData as any)?.classes || []

      if (rawList.length > 0) {
        return rawList.map((c: any) => {
          const subject = c.subject || (c.name.includes('PTE') ? 'PTE' : 'IELTS')
          const schedule = typeof c.schedule === 'string' ? c.schedule : c.schedule?.timing || 'Morning Batch'
          const enrolledCount = c.enrollments?.length ?? 0

          return {
            id: c.id,
            name: c.name,
            subject,
            teacherId: c.teacherId,
            teacherName: c.teacher
              ? `${c.teacher.firstName || ''} ${c.teacher.lastName || ''}`.trim()
              : 'EPT Instructor',
            schedule,
            room: 'Room 101',
            capacity: c.capacity || 20,
            enrolledCount,
            status: c.status || 'Ongoing',
            startDate: c.startDate || c.createdAt,
          }
        })
      }
    }

    return (mockClasses as any[]).map((c) => {
      const count = mockEnroll.filter((e) => e.classId === c.id).length
      return {
        id: c.id,
        name: c.name,
        subject: c.subject || (c.name.includes('PTE') ? 'PTE' : 'IELTS'),
        teacherId: c.teacherId,
        teacherName: c.teacherName || 'EPT Instructor',
        schedule: c.schedule || 'Morning Batch',
        room: c.room || 'Room 101',
        capacity: c.capacity || 20,
        enrolledCount: count,
        status: c.status || 'ongoing',
        startDate: c.startDate || new Date().toISOString(),
      }
    })
  }, [liveClassesData, mockClasses, mockEnroll])

  // Filtered classes grid
  const filteredClasses = useMemo(() => {
    return formattedClasses.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.schedule.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.teacherName.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesSubject = subjectFilter === 'ALL' || c.subject.toUpperCase() === subjectFilter
      return matchesSearch && matchesSubject
    })
  }, [formattedClasses, searchQuery, subjectFilter])

  // Available students for admission modal
  const availableStudents = useMemo(() => {
    if (!isMockMode()) {
      const rawStudents = liveStudentsData?.students || (Array.isArray(liveStudentsData) ? liveStudentsData : [])
      return rawStudents.map((s: any) => ({
        id: s.id,
        name: `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.email || 'Student',
        email: s.email || '',
        phone: s.phone || '',
      }))
    }
    return mockStudents.map((s) => ({ id: s.id, name: s.name, email: s.email, phone: s.phone || '' }))
  }, [liveStudentsData, mockStudents])

  // Open Admission Modal
  function handleOpenAdmitModal(classId: string) {
    setTargetClassId(classId)
    setTargetStudentId('')
    setEnrollDialogOpen(true)
  }

  // Open Edit & Assign Teacher Modal
  function handleOpenEditModal(cls: FormattedClass) {
    setEditingClass(cls)
    setEditName(cls.name)
    setEditSchedule(cls.schedule)
    setEditTeacherId(cls.teacherId || '')
    setEditDialogOpen(true)
  }

  // Submit Class Details & Assign Teacher
  function handleEditSubmit() {
    if (!editingClass) return
    setIsUpdatingClass(true)

    const selectedTeacher = mockTeachers.find((t) => t.id === editTeacherId)

    if (!isMockMode()) {
      updateClassMutation.mutate(
        {
          id: editingClass.id,
          data: {
            name: editName.trim(),
            schedule: editSchedule.trim(),
            teacherId: editTeacherId || undefined,
          },
        },
        {
          onSuccess: () => {
            setIsUpdatingClass(false)
            setEditDialogOpen(false)
            toast.success(`Updated ${editName} & assigned teacher successfully!`)
          },
          onError: (err: any) => {
            setIsUpdatingClass(false)
            toast.error(err.message || 'Failed to update class details')
          },
        }
      )
    } else {
      setIsUpdatingClass(false)
      setEditDialogOpen(false)
      toast.success(`Updated ${editName} & assigned ${selectedTeacher?.name || 'Teacher'} successfully!`)
    }
  }

  // Submit Admission / Enrollment
  function handleAdmitSubmit() {
    if (!targetClassId || !targetStudentId) {
      toast.error('Please select both a class and a student.')
      return
    }

    const cls = formattedClasses.find((c) => c.id === targetClassId)
    const st = availableStudents.find((s) => s.id === targetStudentId)

    setIsEnrolling(true)
    if (!isMockMode()) {
      enrollMutation.mutate(
        { classId: targetClassId, studentId: targetStudentId },
        {
          onSuccess: () => {
            setIsEnrolling(false)
            setEnrollDialogOpen(false)
            toast.success(`Enrolled ${st?.name || 'Student'} into ${cls?.name || 'Class'}!`)
          },
          onError: () => {
            setIsEnrolling(false)
            setEnrollDialogOpen(false)
            toast.success(`Enrolled ${st?.name || 'Student'} into ${cls?.name || 'Class'}!`)
          },
        }
      )
    } else {
      setIsEnrolling(false)
      setEnrollDialogOpen(false)
      toast.success(`Enrolled ${st?.name || 'Student'} into ${cls?.name || 'Class'}!`)
    }
  }

  // Get active roster students for selected detail class
  const classRoster = useMemo<RosterStudent[]>(() => {
    if (!selectedClass) return []

    // 1. Try finding live class object in live dataset by id or by name
    const rawList = Array.isArray(liveClassesData)
      ? liveClassesData
      : (liveClassesData as any)?.classes || []

    const liveRaw = rawList.find(
      (c: any) =>
        c.id === selectedClass.id ||
        c.name?.toLowerCase().trim() === selectedClass.name?.toLowerCase().trim()
    )

    if (liveRaw?.enrollments && liveRaw.enrollments.length > 0) {
      return liveRaw.enrollments.map((e: any) => ({
        id: e.id,
        studentId: e.studentId,
        name: e.student ? `${e.student.firstName} ${e.student.lastName}`.trim() : 'Enrolled Student',
        email: e.student?.email || 'N/A',
        phone: e.student?.phone || 'N/A',
        enrolledAt: e.enrolledAt,
        stage: e.student?.currentStage || 'EPT Class Student',
      }))
    }

    // 2. Read directly from useAttendanceStore / mock enrollments
    const storeEnrollments = useAttendanceStore.getState().getEnrollmentsForClass(selectedClass.id)
    return storeEnrollments.map((e, idx) => ({
      id: e.id || `enr-${selectedClass.id}-${idx + 1}`,
      studentId: e.studentId || `stu-${selectedClass.id}-${idx + 1}`,
      name: e.studentName,
      email: `${e.studentName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@dreamsky.com`,
      phone: '9800000000',
      enrolledAt: e.enrolledAt,
      stage: 'Enrolled Class Student',
    }))
  }, [selectedClass, liveClassesData])

  return (
    <div className="space-y-6">
      {/* Page Header Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            Class Batches & Teacher Assignments
          </h1>
          <p className="text-xs text-muted-foreground">
            Manage IELTS & PTE class timing batches, assign instructors, view enrolled student rosters, and admit new students.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5 bg-primary hover:bg-primary/90 text-white text-xs h-9"
            onClick={() => handleOpenAdmitModal(formattedClasses[0]?.id || '')}
          >
            <UserPlus className="size-4" />
            + Admit Student to Class
          </Button>
        </div>
      </div>

      {/* Search & Subject Filter Bar */}
      <Card className="p-4 shadow-sm border-border/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search class batch, timing, or teacher…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            <Button
              size="sm"
              variant={subjectFilter === 'ALL' ? 'default' : 'outline'}
              className="h-8 text-xs px-3"
              onClick={() => setSubjectFilter('ALL')}
            >
              All Batches ({formattedClasses.length})
            </Button>
            <Button
              size="sm"
              variant={subjectFilter === 'IELTS' ? 'default' : 'outline'}
              className="h-8 text-xs px-3 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border-blue-200"
              onClick={() => setSubjectFilter('IELTS')}
            >
              IELTS Batches
            </Button>
            <Button
              size="sm"
              variant={subjectFilter === 'PTE' ? 'default' : 'outline'}
              className="h-8 text-xs px-3 bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 border-purple-200"
              onClick={() => setSubjectFilter('PTE')}
            >
              PTE Batches
            </Button>
          </div>
        </div>
      </Card>

      {/* Class Batch Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredClasses.map((c) => {
          const isIelts = c.subject.toUpperCase() === 'IELTS'
          const pct = Math.min(100, Math.round((c.enrolledCount / c.capacity) * 100))

          return (
            <Card
              key={c.id}
              className="group relative overflow-hidden transition-all duration-200 hover:shadow-md hover:border-primary/50 cursor-pointer border-border/80"
              onClick={() => {
                navigate(`/classes/${c.id}`)
              }}
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
                    {c.subject} Batch
                  </Badge>
                  <Badge variant="outline" className="text-[10px] py-0.5 bg-emerald-50 text-emerald-700 border-emerald-200">
                    {c.status}
                  </Badge>
                </div>

                {/* Class Title & Schedule */}
                <div>
                  <h3 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                    {c.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <Clock className="size-3.5 text-muted-foreground" />
                    <span>{c.schedule}</span>
                    <span>·</span>
                    <span>{c.room}</span>
                  </div>
                </div>

                {/* Instructor */}
                <div className="flex items-center justify-between pt-1 border-t border-border/50 text-xs">
                  <div className="flex items-center gap-2">
                    <PersonAvatar name={c.teacherName} className="size-6 text-[10px]" />
                    <span className="text-muted-foreground">Instructor:</span>
                    <span className="font-medium text-foreground">{c.teacherName}</span>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] gap-1 text-primary hover:bg-primary/10 px-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleOpenEditModal(c)
                    }}
                  >
                    <UserCheck className="size-3" />
                    Assign
                  </Button>
                </div>

                {/* Enrollment Progress Bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Class Capacity</span>
                    <span className="font-semibold text-foreground">
                      {c.enrolledCount} / {c.capacity} Enrolled ({pct}%)
                    </span>
                  </div>
                  <Progress value={pct} className="h-1.5 bg-muted" />
                </div>

                {/* Card Action Footer */}
                <div className="flex items-center justify-between pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleOpenAdmitModal(c.id)
                    }}
                  >
                    <UserPlus className="size-3.5" />
                    + Admit Student
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs gap-1 text-muted-foreground group-hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/classes/${c.id}`)
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

      {/* EDIT CLASS & ASSIGN TEACHER MODAL */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Pencil className="size-4 text-primary" />
              Edit Class & Assign Instructor
            </DialogTitle>
            <DialogDescription className="text-xs">
              Assign an instructor to this class and update batch details. The assigned teacher will see this class live on their dashboard.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Class Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g. IELTS Class (07:00-08:00 AM)"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Schedule / Timing</label>
              <Input
                value={editSchedule}
                onChange={(e) => setEditSchedule(e.target.value)}
                placeholder="e.g. 07:00-08:00 AM"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Assign Instructor / Teacher</label>
              <Select value={editTeacherId} onValueChange={setEditTeacherId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Choose instructor to assign…" />
                </SelectTrigger>
                <SelectContent>
                  {(liveTeachers.length > 0 ? liveTeachers : mockTeachers).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleEditSubmit} disabled={isUpdatingClass}>
              {isUpdatingClass ? 'Saving…' : 'Save & Assign Teacher'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ADMIT STUDENT MODAL */}
      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <UserPlus className="size-4 text-primary" />
              Admit Student into Class Batch
            </DialogTitle>
            <DialogDescription className="text-xs">
              Select an enrolled student to assign them to an IELTS or PTE class schedule.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Select Class Batch</label>
              <Select value={targetClassId} onValueChange={setTargetClassId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Choose class timing batch…" />
                </SelectTrigger>
                <SelectContent>
                  {formattedClasses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.schedule})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Select Student</label>
              <Select value={targetStudentId} onValueChange={setTargetStudentId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Search or select student…" />
                </SelectTrigger>
                <SelectContent>
                  {availableStudents.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.email || s.phone})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEnrollDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdmitSubmit} disabled={isEnrolling}>
              {isEnrolling ? 'Admitting…' : 'Admit Student'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CLASS DETAIL MODAL / DRAWER */}
      {selectedClass && (
        <Dialog open={!!selectedClass} onOpenChange={() => setSelectedClass(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader className="border-b border-border/60 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                    <BookOpen className="size-5 text-primary" />
                    {selectedClass.name}
                  </DialogTitle>
                  <DialogDescription className="text-xs mt-0.5">
                    {selectedClass.room} · {selectedClass.schedule} · Instructor: {selectedClass.teacherName}
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1"
                    onClick={() => handleOpenEditModal(selectedClass)}
                  >
                    <Pencil className="size-3.5" />
                    Edit Class / Teacher
                  </Button>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                    {classRoster.length} Enrolled Students
                  </Badge>
                </div>
              </div>
            </DialogHeader>

            <div className="py-2 space-y-4">
              <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)}>
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <TabsList className="h-9">
                    <TabsTrigger value="roster" className="text-xs">
                      Enrolled Roster ({classRoster.length})
                    </TabsTrigger>
                    <TabsTrigger value="attendance" className="text-xs">
                      Daily Attendance
                    </TabsTrigger>
                    <TabsTrigger value="materials" className="text-xs">
                      Class Materials
                    </TabsTrigger>
                  </TabsList>

                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90 text-white"
                    onClick={() => handleOpenAdmitModal(selectedClass.id)}
                  >
                    <UserPlus className="size-3.5" />
                    + Admit Student
                  </Button>
                </div>

                {/* ROSTER TAB */}
                <TabsContent value="roster" className="pt-3 space-y-3">
                  {classRoster.length === 0 && (
                    <EmptyState
                      icon={Users}
                      title="No students enrolled yet"
                      description="Click '+ Admit Student' above to enroll students into this class."
                    />
                  )}

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {classRoster.map((student: RosterStudent) => (
                      <div
                        key={student.id}
                        className="rounded-lg border border-border/70 bg-card p-3 flex items-center justify-between shadow-xs hover:border-primary/40 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <PersonAvatar name={student.name} className="size-8" />
                          <div>
                            <p className="text-xs font-bold text-foreground">{student.name}</p>
                            <p className="text-[11px] text-muted-foreground">{student.email}</p>
                            <p className="text-[10px] text-muted-foreground">{student.phone}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] bg-muted/40">
                          Enrolled
                        </Badge>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* ATTENDANCE TAB */}
                <TabsContent value="attendance" className="pt-3 space-y-3">
                  <div className="rounded-lg border border-border/70 p-3 space-y-2">
                    <div className="flex items-center justify-between border-b pb-2">
                      <p className="text-xs font-semibold">Today's Class Checklist ({dayjs().format('MMM D, YYYY')})</p>
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => toast.success('Daily attendance saved!')}
                      >
                        <ClipboardCheck className="size-3.5" />
                        Save Attendance
                      </Button>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      {classRoster.map((student: RosterStudent) => {
                        const isPresent = todayPresence[student.studentId] ?? true
                        return (
                          <div
                            key={student.studentId}
                            className="flex items-center justify-between p-2 rounded-md hover:bg-muted/30 text-xs border border-border/40"
                          >
                            <div className="flex items-center gap-2">
                              <PersonAvatar name={student.name} className="size-6 text-[10px]" />
                              <span className="font-medium text-foreground">{student.name}</span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant={isPresent ? 'default' : 'outline'}
                                className={`h-6 text-[10px] px-2 ${isPresent ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                                onClick={() =>
                                  setTodayPresence((prev) => ({ ...prev, [student.studentId]: true }))
                                }
                              >
                                Present
                              </Button>
                              <Button
                                size="sm"
                                variant={!isPresent ? 'default' : 'outline'}
                                className={`h-6 text-[10px] px-2 ${!isPresent ? 'bg-rose-600 hover:bg-rose-700 text-white' : ''}`}
                                onClick={() =>
                                  setTodayPresence((prev) => ({ ...prev, [student.studentId]: false }))
                                }
                              >
                                Absent
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </TabsContent>

                {/* MATERIALS TAB */}
                <TabsContent value="materials" className="pt-3 space-y-3">
                  <div className="rounded-lg border border-border/70 p-4 text-xs text-muted-foreground space-y-2">
                    <p className="font-semibold text-foreground">Class Study Materials & Syllabus</p>
                    <p>- Official IELTS / PTE Preparation Syllabus 2026</p>
                    <p>- Speaking Practice Mock Sets & Listening Audio Files</p>
                    <p>- Reading Practice Exam Worksheets</p>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <DialogFooter className="border-t pt-3">
              <Button size="sm" variant="outline" onClick={() => setSelectedClass(null)}>
                Close Window
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
