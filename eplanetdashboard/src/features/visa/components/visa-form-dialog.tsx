import { useEffect } from 'react'
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
import { useVisaStore } from '@/features/visa/store'
import { useCreateVisaCase } from '@/hooks/use-visa'
import { useAuthStore } from '@/store/auth-store'
import { canViewStudent } from '@/lib/data-visibility'
import { isMockMode } from '@/lib/api-client'
import { countries } from '@/mock'

// ── Zod Schema ───────────────────────────────────────────────────────────────

const formSchema = z.object({
  studentId: z.string().min(1, 'Student is required'),
  country: z.string().min(1, 'Country is required'),
  visaType: z.string().min(1, 'Visa Type is required'),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

// ── Props ─────────────────────────────────────────────────────────────────────

interface VisaFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VisaFormDialog({ open, onOpenChange }: VisaFormDialogProps) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const students = useStudentsStore((s) => s.students)
  
  // Filtering students to only allowed ones (assigned students for counselors)
  const availableStudents = students.filter((s) => canViewStudent(currentUser, s))

  const createVisaCaseMutation = useCreateVisaCase()
  const addMockVisaCase = useVisaStore((s) => s.addVisaCase)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      studentId: '',
      country: '',
      visaType: 'Student Visa',
      notes: '',
    },
  })

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      reset({
        studentId: '',
        country: '',
        visaType: 'Student Visa',
        notes: '',
      })
    }
  }, [open, reset])

  async function onSubmit(data: FormData) {
    const student = students.find((s) => s.id === data.studentId)!

    if (!isMockMode()) {
      await createVisaCaseMutation.mutateAsync({
        studentId: data.studentId,
        country: data.country,
        visaType: data.visaType,
        notes: data.notes,
      })
    } else {
      addMockVisaCase({
        studentId: student.id,
        studentName: student.name,
        countryName: data.country,
        universityName: 'University',
      })
    }
    onOpenChange(false)
  }

  const isLoadingMutation = createVisaCaseMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <FileStack className="size-3.5" />
            Start Visa Process
          </div>
          <DialogTitle className="mt-1 text-lg font-bold">
            Create Visa Application Case
          </DialogTitle>
          <DialogDescription>
            Initiate a new visa application tracking case for an enrolled student.
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
                    students={availableStudents.map((s) => ({
                      id: s.id,
                      name: s.name,
                      studentId: s.studentId,
                      email: s.email,
                    }))}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Search student by name or ID"
                  />
                )}
              />
              {errors.studentId && (
                <p className="text-[11px] text-danger-600 flex items-center gap-1">
                  <AlertTriangle className="size-3" />{errors.studentId.message}
                </p>
              )}
            </div>

            {/* Country Select */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Country</label>
              <Controller
                name="country"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map((c) => (
                        <SelectItem key={c.id} value={c.name}>
                          <span className="flex items-center gap-1.5">
                            <span>{c.flag}</span>
                            <span>{c.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.country && (
                <p className="text-[11px] text-danger-600 flex items-center gap-1">
                  <AlertTriangle className="size-3" />{errors.country.message}
                </p>
              )}
            </div>

            {/* Visa Type Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Visa Type</label>
              <Input
                type="text"
                placeholder="e.g. Student Visa (Subclass 500)"
                className={`h-9 text-sm ${errors.visaType ? 'border-danger-500' : ''}`}
                {...register('visaType')}
              />
              {errors.visaType && (
                <p className="text-[11px] text-danger-600 flex items-center gap-1">
                  <AlertTriangle className="size-3" />{errors.visaType.message}
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Notes (Optional)</label>
              <textarea
                placeholder="Enter any notes or checklists specific to this visa process..."
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
                'Start Visa Process'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
