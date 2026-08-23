import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { BookOpen, Users, ClipboardCheck, ArrowLeft, GraduationCap, Check, X, Plus, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/shared/empty-state'
import { ClassStatusBadge } from '@/components/shared/status-badges'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAuthStore } from '@/store/auth-store'
import { getClassesForRole, getClassEnrollments, getClassAttendance, getClassMaterials } from './selectors'
import { useAttendanceStore } from './attendance-store'
import { useClassMaterialsStore, type AddMaterialData } from './materials-store'
import { StudentClassProfileDialog } from './components/student-class-profile-dialog'
import type { StudentPresence } from './attendance-store'
import { isMockMode } from '@/lib/api-client'
import { useClass, useClasses, useMarkAttendance, useClassContent } from '@/hooks/use-classes'
import { classApi } from '@/api/class-api'
import dayjs from 'dayjs'

const tabs = [
  { id: 'roster', label: 'Roster' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'materials', label: 'Materials' },
]

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>()
  const role = useAuthStore((s) => s.currentUser.role)
  const linkedId = useAuthStore((s) => s.currentUser.linkedId)
  const submitAttendanceMock = useAttendanceStore((s) => s.submitAttendance)
  const addMaterialMock = useClassMaterialsStore((s) => s.addMaterial)
  const markAttendanceApi = useMarkAttendance()

  // Live mode: fetch class from backend; mock mode: read from mock store
  const { data: liveClass, isLoading: isClassLoading } = useClass(id!)
  const { data: liveContent } = useClassContent(id!)
  const { data: allClassesData } = useClasses()

  const classList = getClassesForRole(role, linkedId)
  const mockCls = classList.find((c) => c.id === id)

  const liveClassFromList = Array.isArray(allClassesData)
    ? (allClassesData as any).find((c: any) => c.id === id)
    : (allClassesData as any)?.classes?.find((c: any) => c.id === id)

  const activeLiveClass = liveClass || liveClassFromList

  // Build the class object: live takes priority, fall back to mock
  const cls = activeLiveClass
    ? {
        id: activeLiveClass.id,
        name: activeLiveClass.name,
        subject: (activeLiveClass.subject ?? 'IELTS') as any,
        teacherId: activeLiveClass.teacherId,
        teacherName: activeLiveClass.teacher
          ? `${activeLiveClass.teacher.firstName || ''} ${activeLiveClass.teacher.lastName || ''}`.trim()
          : 'EPT Instructor',
        schedule: (activeLiveClass.schedule as any)?.timing || String(activeLiveClass.schedule || '07:00-08:00 AM'),
        room: 'Room 101',
        startDate: activeLiveClass.startDate ?? activeLiveClass.createdAt,
        endDate: activeLiveClass.endDate ?? activeLiveClass.createdAt,
        capacity: activeLiveClass.capacity || 20,
        enrolledCount: activeLiveClass.enrollments?.length ?? (mockCls?.enrolledCount || 0),
        status: (activeLiveClass.status?.toLowerCase() ?? 'ongoing') as any,
        nextSessionAt: activeLiveClass.startDate ?? activeLiveClass.createdAt,
      }
    : mockCls

  if (!isMockMode() && isClassLoading && !cls) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
        Loading class details...
      </div>
    )
  }

  if (!cls) {
    return (
      <div className="space-y-5">
        <PageHeader title="Class Details" />
        <EmptyState
          icon={BookOpen}
          title="Class not found"
          description={`No class found with ID ${id}.`}
          action={
            <Button asChild variant="outline" className="mt-2">
              <Link to="/classes">Back to Classes</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const today = dayjs().format('YYYY-MM-DD')
  const [todayPresence, setTodayPresence] = useState<Record<string, boolean>>({})

  // Student profile dialog state
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string } | null>(null)

  // Add material dialog state
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false)
  const [newMaterialTitle, setNewMaterialTitle] = useState('')
  const [newMaterialType, setNewMaterialType] = useState<string>('material')
  const [newMaterialDueDate, setNewMaterialDueDate] = useState('')
  const [newMaterialFile, setNewMaterialFile] = useState<File | null>(null)
  const [newMaterialFileName, setNewMaterialFileName] = useState('')
  const [isUploadingMaterial, setIsUploadingMaterial] = useState(false)

  const handleTogglePresence = (studentId: string) => {
    setTodayPresence((prev) => ({
      ...prev,
      [studentId]: !prev[studentId],
    }))
  }

  const handleSubmitAttendance = () => {
    if (!cls) return

    if (!isMockMode()) {
      // Live mode: get roster from live class enrollments
      const liveRoster = activeLiveClass?.enrollments ?? []
      const records = liveRoster.map((e: any) => ({
        studentId: e.studentId,
        status: (todayPresence[e.studentId] ?? false) ? 'PRESENT' : 'ABSENT',
      }))
      markAttendanceApi.mutate(
        { classId: cls.id, body: { records, date: today } },
        {
          onSuccess: () => {
            setTodayPresence({})
            toast.success('Attendance submitted successfully')
          },
        }
      )
    } else {
      // Mock mode: write to local store
      const roster = getClassEnrollments(cls.id)
      const presenceList: StudentPresence[] = roster.map((e) => ({
        studentId: e.studentId,
        present: todayPresence[e.studentId] ?? false,
      }))
      submitAttendanceMock(cls.id, cls.name, today, presenceList)
      setTodayPresence({})
      toast.success('Attendance submitted successfully')
    }
  }

  const handleOpenStudentProfile = (studentId: string, studentName: string) => {
    setSelectedStudent({ id: studentId, name: studentName })
    setProfileDialogOpen(true)
  }

  const handleAddMaterial = async () => {
    if (!cls || !newMaterialTitle.trim()) return
    setIsUploadingMaterial(true)
    try {
      if (!isMockMode()) {
        // Live mode: call backend API to create class content
        await classApi.createContent(cls.id, {
          title: newMaterialTitle.trim(),
          type: newMaterialType.toUpperCase(),
          description: newMaterialDueDate ? `Due: ${newMaterialDueDate}` : undefined,
        })
        toast.success('Material added successfully')
      } else {
        // Mock mode: write to local store
        await addMaterialMock(cls.id, {
          title: newMaterialTitle.trim(),
          type: newMaterialType as AddMaterialData['type'],
          dueDate: newMaterialDueDate || undefined,
          file: newMaterialFile || undefined,
        })
        toast.success('Material added successfully')
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to add material')
    } finally {
      setNewMaterialTitle('')
      setNewMaterialType('material')
      setNewMaterialDueDate('')
      setNewMaterialFile(null)
      setNewMaterialFileName('')
      setIsUploadingMaterial(false)
      setMaterialDialogOpen(false)
    }
  }

  const handleMaterialFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setNewMaterialFile(file)
      setNewMaterialFileName(file.name)
    }
  }

  const liveEnrollments = activeLiveClass?.enrollments
  const roster = Array.isArray(liveEnrollments) && liveEnrollments.length > 0
    ? liveEnrollments.map((e: any) => ({
        id: e.id,
        classId: cls?.id ?? '',
        studentId: e.studentId,
        studentName: e.student ? `${e.student.firstName} ${e.student.lastName}`.trim() : 'Student',
        enrolledAt: e.enrolledAt,
        attendancePct: 0,
        progress: 75,
      }))
    : getClassEnrollments(cls?.id ?? '')
  const attendance = getClassAttendance(cls?.id ?? '')
  const materials = !isMockMode() && liveContent
    ? liveContent.map((c) => ({
        id: c.id,
        classId: c.classId,
        title: c.title,
        type: (c.type?.toLowerCase() as any) ?? 'material',
        uploadedAt: c.createdAt,
        dueDate: undefined,
        fileUrl: c.url ?? undefined,
        fileName: c.title,
        fileSize: undefined,
        fileType: undefined,
      }))
    : getClassMaterials(cls?.id ?? '')
  const enrollmentPct = cls && cls.capacity > 0 ? Math.round((cls.enrolledCount / cls.capacity) * 100) : 0

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="size-8 -ml-2 text-muted-foreground hover:text-foreground">
            <Link to="/classes"><ArrowLeft /></Link>
          </Button>
          <PageHeader title={cls.name} description={cls.schedule} />
        </div>

        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <h2 className="text-xl font-bold">{cls.name}</h2>
                <ClassStatusBadge status={cls.status} />
              </div>
              <p className="text-sm text-muted-foreground">{cls.room} · {cls.schedule}</p>
            </div>
            <div className="flex shrink-0 items-center gap-6">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Enrolled</p>
                <p className="text-lg font-bold font-tabular">{cls.enrolledCount}<span className="text-muted-foreground font-normal">/{cls.capacity}</span></p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Fill</p>
                <p className="text-lg font-bold font-tabular">{enrollmentPct}%</p>
              </div>
            </div>
          </div>
        </Card>

        <Tabs defaultValue="roster" className="w-full">
          <TabsList className="w-full justify-start sm:w-auto h-10 min-w-max">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>

          <div className="mt-5 space-y-4">
            <TabsContent value="roster">
              <Card>
                <CardHeader>
                  <CardTitle>Class Roster</CardTitle>
                  <CardDescription>{roster.length} enrolled students</CardDescription>
                </CardHeader>
                <CardContent>
                  {roster.length === 0 && (
                    <EmptyState icon={Users} title="No students enrolled yet" className="py-8" />
                  )}
                  <div className="space-y-2.5">
                    {roster.map((e) => {
                      const isPresent = todayPresence[e.studentId]
                      const isToggled = e.studentId in todayPresence
                      return (
                        <div
                          key={e.id}
                          onClick={() => handleTogglePresence(e.studentId)}
                          className={`rounded-lg border p-3 flex items-center justify-between cursor-pointer transition-colors ${
                            isToggled
                              ? isPresent
                                ? 'border-green-400 bg-green-50/40 dark:bg-green-950/20'
                                : 'border-red-400 bg-red-50/40 dark:bg-red-950/20'
                              : 'border-border/70 hover:bg-accent/50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`size-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${
                              isToggled
                                ? isPresent
                                  ? 'bg-green-500'
                                  : 'bg-red-500'
                                : 'bg-muted-foreground/30'
                            }`}>
                              {isToggled ? (
                                isPresent ? <Check className="size-4" /> : <X className="size-4" />
                              ) : (
                                '?'
                              )}
                            </div>
                            <div>
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation()
                                  handleOpenStudentProfile(e.studentId, e.studentName)
                                }}
                                className="text-[13px] font-medium hover:text-primary hover:underline text-left"
                              >
                                {e.studentName}
                              </button>
                              <p className="text-xs text-muted-foreground">Enrolled {dayjs(e.enrolledAt).format('MMM D, YYYY')}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="font-tabular">{e.progress}% progress</span>
                            <span className="font-tabular">{e.attendancePct}% attendance</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {(role === 'teacher' || role === 'super_admin') && roster.length > 0 && (
                    <div className="mt-4 flex justify-end border-t pt-4">
                      <Button onClick={handleSubmitAttendance} className="gap-2">
                        <ClipboardCheck className="size-4" />
                        Submit Attendance
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="attendance">
              <Card>
                <CardHeader>
                  <CardTitle>Attendance History</CardTitle>
                  <CardDescription>Recent session records</CardDescription>
                </CardHeader>
                <CardContent>
                  {attendance.length === 0 && (
                    <EmptyState icon={ClipboardCheck} title="No attendance recorded yet" className="py-8" />
                  )}
                  <div className="space-y-2.5">
                    {attendance.map((a) => {
                      const pct = Math.round((a.presentCount / a.totalCount) * 100)
                      return (
                        <div key={a.id} className="rounded-lg border border-border/70 p-3">
                          <div className="flex items-center justify-between text-[13px]">
                            <span className="font-medium">{a.className}</span>
                            <span className="text-xs text-muted-foreground font-tabular">{dayjs(a.date).format('MMM D, YYYY')}</span>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <Progress value={pct} className="flex-1" />
                            <span className="w-20 shrink-0 text-right text-xs text-muted-foreground font-tabular">
                              {a.presentCount}/{a.totalCount}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="materials">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Materials & Assignments</CardTitle>
                      <CardDescription>{materials.length} files</CardDescription>
                    </div>
                    {(role === 'teacher' || role === 'super_admin') && (
                      <Button size="sm" onClick={() => setMaterialDialogOpen(true)} className="gap-1">
                        <Plus className="size-4" />
                        Add Material
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {materials.length === 0 && (
                    <EmptyState icon={GraduationCap} title="No materials uploaded yet" className="py-8" />
                  )}
                  <div className="space-y-2.5">
                    {materials.map((m) => (
                      <div key={m.id} className="rounded-lg border border-border/70 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-[13px] font-medium">{m.title}</p>
                              <Badge variant={m.type === 'assignment' ? 'default' : 'secondary'} className="text-[10px] py-0 shrink-0">
                                {m.type}
                              </Badge>
                            </div>
                            {m.fileName && (
                              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <FileText className="size-3" />
                                <span>{m.fileName}</span>
                                <span>•</span>
                                <span>{m.fileSize} KB</span>
                                {m.fileUrl && (
                                  <>
                                    <span>•</span>
                                    <a href={m.fileUrl} download={m.fileName} className="text-primary hover:underline">
                                      Download
                                    </a>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Uploaded {dayjs(m.uploadedAt).format('MMM D, YYYY')}
                          {m.dueDate && <span> • Due {dayjs(m.dueDate).format('MMM D')}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* ── Student Class Profile Dialog ── */}
      {selectedStudent && (
        <StudentClassProfileDialog
          open={profileDialogOpen}
          onOpenChange={setProfileDialogOpen}
          studentId={selectedStudent.id}
          studentName={selectedStudent.name}
          classId={cls.id}
          className={cls.name}
        />
      )}

      {/* ── Add Material Dialog ── */}
      <Dialog open={materialDialogOpen} onOpenChange={setMaterialDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Material</DialogTitle>
            <DialogDescription>Upload a new material or assignment for this class.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input
                placeholder="e.g. IELTS Reading Practice"
                value={newMaterialTitle}
                onChange={(e) => setNewMaterialTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <Select value={newMaterialType} onValueChange={setNewMaterialType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="material">Material</SelectItem>
                  <SelectItem value="assignment">Assignment</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Due Date (optional)</label>
              <Input
                type="date"
                value={newMaterialDueDate}
                onChange={(e) => setNewMaterialDueDate(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <input
                type="file"
                id="class-material-file-input"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                className="hidden"
                onChange={handleMaterialFileChange}
              />
              <label htmlFor="class-material-file-input">
                <Button variant="outline" size="sm" className="w-full cursor-pointer" asChild>
                  <span>
                    <FileText className="mr-2 size-4" /> Choose File to Upload
                  </span>
                </Button>
              </label>
              
              {newMaterialFileName && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-2.5">
                  <p className="text-xs text-muted-foreground">Selected file:</p>
                  <p className="text-sm font-medium text-primary mt-1">{newMaterialFileName}</p>
                  {newMaterialFile && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {(newMaterialFile.size / 1024).toFixed(1)} KB
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaterialDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddMaterial} disabled={isUploadingMaterial || !newMaterialTitle.trim()}>
              {isUploadingMaterial ? 'Uploading...' : 'Add Material'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
