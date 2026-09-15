import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FileStack, AlertTriangle, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { SearchableStudentPicker } from '@/components/shared/searchable-student-picker'
import { useStudentsStore } from '@/features/students/store'
import { useUniversitiesStore } from '@/features/universities/store'
import { useCoursesStore } from '@/features/courses/store'
import { useApplicationsStore } from '@/features/applications/store'
import { useStudents } from '@/hooks/use-students'
import { useUniversities, useCourses } from '@/hooks/use-universities'
import { useCreateApplication } from '@/hooks/use-applications'
import { useAuthStore } from '@/store/auth-store'
import { canViewStudent } from '@/lib/data-visibility'
import { isMockMode } from '@/lib/api-client'

// ── Debounce helper ───────────────────────────────────────────────────────────
function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ── Zod Schema ───────────────────────────────────────────────────────────────

const formSchema = z.object({
  studentId: z.string().min(1, 'Student is required'),
  universityId: z.string().min(1, 'University is required'),
  courseId: z.string().min(1, 'Course is required'),
  intakeMonth: z.string().min(1, 'Intake month is required'),
  intakeYear: z.number().int().min(2020, 'Year must be valid'),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

// ── Props ─────────────────────────────────────────────────────────────────────

interface ApplicationFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// ── Component ─────────────────────────────────────────────────────────────────

export function ApplicationFormDialog({ open, onOpenChange }: ApplicationFormDialogProps) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const mockStudents = useStudentsStore((s) => s.students)
  const [studentSearch, setStudentSearch] = useState('')
  const debouncedSearch = useDebouncedValue(studentSearch.trim(), 300)

  const { data: apiStudentData, isLoading: isLoadingStudents, isError: isErrorStudents } = useStudents(
    isMockMode() ? { limit: 500 } : { limit: 50, search: debouncedSearch || undefined }
  )
  
  // Resolve Universities
  const mockUniversities = useUniversitiesStore((s) => s.universities)
  const { data: apiUniData, isLoading: isLoadingUniversities } = useUniversities()
  const universities = !isMockMode()
    ? (apiUniData?.universities ?? [])
    : (apiUniData?.universities && apiUniData.universities.length > 0 ? apiUniData.universities : mockUniversities)

  // Resolve Courses
  const mockCourses = useCoursesStore((s) => s.courses)
  const { data: apiCourseData, isLoading: isLoadingCourses } = useCourses()
  const courses = !isMockMode()
    ? (apiCourseData?.courses ?? [])
    : (apiCourseData?.courses && apiCourseData.courses.length > 0 ? apiCourseData.courses : mockCourses)

  // Filtering students to only allowed ones
  const availableStudents = useMemo(() => {
    if (!isMockMode()) {
      return (apiStudentData?.students ?? []).map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        studentId: s.id.length > 12 ? `STU-${s.id.slice(-6).toUpperCase()}` : s.id,
        email: s.email,
        phone: s.phone ?? undefined,
      }))
    }
    return mockStudents
      .filter((s) => canViewStudent(currentUser, s))
      .filter((s) => {
        const q = debouncedSearch.toLowerCase()
        if (!q) return true
        return `${s.name} ${s.studentId} ${s.email} ${s.phone}`.toLowerCase().includes(q)
      })
      .map((s) => ({
        id: s.id,
        name: s.name,
        studentId: s.studentId,
        email: s.email,
        phone: s.phone,
      }))
  }, [apiStudentData, mockStudents, currentUser, debouncedSearch])

  const createApplicationMutation = useCreateApplication()
  const addMockApplication = useApplicationsStore((s) => s.addApplication)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      studentId: '',
      universityId: '',
      courseId: '',
      intakeMonth: 'September',
      intakeYear: new Date().getFullYear() + 1,
      notes: '',
    },
  })

  const selectedUniId = watch('universityId')

  // Reset course selection when university changes
  useEffect(() => {
    setValue('courseId', '')
  }, [selectedUniId, setValue])

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      reset({
        studentId: '',
        universityId: '',
        courseId: '',
        intakeMonth: 'September',
        intakeYear: new Date().getFullYear() + 1,
        notes: '',
      })
    }
  }, [open, reset])

  const filteredCourses = courses.filter((c) => c.universityId === selectedUniId)

  async function onSubmit(data: FormData) {
    if (!isMockMode()) {
      await createApplicationMutation.mutateAsync({
        studentId: data.studentId,
        universityId: data.universityId,
        courseId: data.courseId,
        intake: `${data.intakeMonth} ${data.intakeYear}`,
        intakeMonth: data.intakeMonth,
        intakeYear: data.intakeYear,
        notes: data.notes,
      })
    } else {
      const student = mockStudents.find((s) => s.id === data.studentId)
      const university = universities.find((u) => u.id === data.universityId)
      const course = courses.find((c) => c.id === data.courseId)
      if (!student || !university || !course) return

      const countryName = ('countryName' in university) 
        ? (university.countryName as string) 
        : (university.country?.name || 'General')

      const tuitionUsd = ('tuitionUsd' in course)
        ? (course.tuitionUsd as number)
        : (course.tuitionFee || 15000)

      addMockApplication({
        studentId: student.id,
        studentName: student.name,
        universityId: university.id,
        universityName: university.name,
        courseName: course.name,
        countryName,
        stage: 'submitted',
        counselorName: currentUser.name,
        intake: `${data.intakeMonth} ${data.intakeYear}`,
        tuitionUsd,
      })
    }
    onOpenChange(false)
  }

  const isLoadingMutation = createApplicationMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <FileStack className="size-3.5" />
            Start Application
          </div>
          <DialogTitle className="mt-1 text-lg font-bold">
            Create Student Application
          </DialogTitle>
          <DialogDescription>
            Record a new university application for a student and start tracking its review progress.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="overflow-y-auto max-h-[60vh]">
          <div className="space-y-4 px-6 py-5">
            
            {/* Student Picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Student</label>
              <Controller
                name="studentId"
                control={control}
                render={({ field }) => (
                  <SearchableStudentPicker
                    students={availableStudents}
                    value={field.value}
                    onChange={field.onChange}
                    onSearchChange={setStudentSearch}
                    searching={isMockMode() ? false : isLoadingStudents}
                    placeholder={isLoadingStudents ? "Loading students..." : "Search student by name or ID"}
                    emptyMessage={isErrorStudents ? "Failed to load students. Check your connection." : (isLoadingStudents ? "Loading students..." : "No students found")}
                  />
                )}
              />
              {errors.studentId && (
                <p className="text-[11px] text-danger-600 flex items-center gap-1">
                  <AlertTriangle className="size-3" />{errors.studentId.message}
                </p>
              )}
            </div>

            {/* University Select */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">University</label>
              <Controller
                name="universityId"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={isLoadingUniversities ? "Loading universities..." : "Select university"} />
                    </SelectTrigger>
                    <SelectContent>
                      {universities.map((uni) => {
                        const countryLabel = ('countryName' in uni) 
                          ? (uni.countryName as string) 
                          : (uni.country?.name || 'General')
                        return (
                          <SelectItem key={uni.id} value={uni.id}>
                            {uni.name} ({countryLabel})
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.universityId && (
                <p className="text-[11px] text-danger-600 flex items-center gap-1">
                  <AlertTriangle className="size-3" />{errors.universityId.message}
                </p>
              )}
            </div>

            {/* Course Select */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Course</label>
              <Controller
                name="courseId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={!selectedUniId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={!selectedUniId ? "Select university first" : (isLoadingCourses ? "Loading courses..." : "Select course")} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredCourses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.courseId && (
                <p className="text-[11px] text-danger-600 flex items-center gap-1">
                  <AlertTriangle className="size-3" />{errors.courseId.message}
                </p>
              )}
            </div>

            {/* Intake Month and Year */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Intake Month</label>
                <Controller
                  name="intakeMonth"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Intake Year</label>
                <Input
                  type="number"
                  className={`h-9 text-sm ${errors.intakeYear ? 'border-danger-500' : ''}`}
                  {...register('intakeYear', { valueAsNumber: true })}
                />
                {errors.intakeYear && (
                  <p className="text-[11px] text-danger-600 flex items-center gap-1">
                    <AlertTriangle className="size-3" />{errors.intakeYear.message}
                  </p>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Notes (Optional)</label>
              <textarea
                placeholder="Enter any notes, application credentials, or special instructions..."
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                {...register('notes')}
              />
            </div>
          </div>

          <DialogFooter className="border-t border-border/60 bg-muted/30 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Discard
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || isLoadingMutation}
            >
              {isSubmitting || isLoadingMutation ? (
                <>
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Application'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
