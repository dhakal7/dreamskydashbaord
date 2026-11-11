import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import dayjs from 'dayjs'
import {
  CalendarClock, MapPin, Monitor, Phone, Lock, ShieldAlert,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SearchableStudentPicker } from '@/components/shared/searchable-student-picker'
import { ChevronDown, Check } from 'lucide-react'
import { appointmentStatusMeta } from '@/components/shared/status-badges'
import type { Appointment } from '@/types'
import { isMockMode } from '@/lib/api-client'
import { useCounselors } from '@/hooks/use-counselors'
import { useStudents } from '@/hooks/use-students'
import { useStudentsStore } from '@/features/students/store'
import { useUsersStore } from '@/features/users/store'
import { toast } from 'sonner'

// ── Zod Schema ───────────────────────────────────────────────────────────────

const formSchema = z.object({
  studentId: z.string().min(1, 'Student is required'),
  counselorIds: z.array(z.string()).min(1, 'At least one counselor is required'),
  type: z.enum(['counseling', 'document_review', 'visa_prep', 'follow_up', 'orientation']),
  date: z.string().min(1, 'Date is required'),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  location: z.enum(['branch_office', 'video_call', 'phone_call']),
}).refine(
  (data) => data.startTime < data.endTime,
  { message: 'End time must be after start time', path: ['endTime'] }
)

type FormData = z.infer<typeof formSchema>

// ── Backend enum mappings ─────────────────────────────────────────────────────

/** Map backend type values back to frontend local values. */
const TYPE_FROM_BACKEND: Record<string, FormData['type']> = {
  INITIAL_CONSULTATION: 'counseling',
  FOLLOW_UP: 'follow_up',
  DOCUMENT_REVIEW: 'document_review',
  VISA_COUNSELING: 'visa_prep',
  OTHER: 'orientation',
}

/** Map backend mode back to frontend local location values. */
const LOCATION_FROM_BACKEND: Record<string, FormData['location']> = {
  OFFICE: 'branch_office',
  ONLINE: 'video_call',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const typeLabels: Record<Appointment['type'], string> = {
  counseling: 'Counseling Session',
  document_review: 'Document Review',
  visa_prep: 'Visa Preparation',
  follow_up: 'Follow-up',
  orientation: 'Orientation',
}

const locationMeta: Record<Appointment['location'], { label: string; Icon: React.ElementType }> = {
  branch_office: { label: 'Branch Office', Icon: MapPin },
  video_call: { label: 'Video Call', Icon: Monitor },
  phone_call: { label: 'Phone Call', Icon: Phone },
}

// ── Debounce helper ───────────────────────────────────────────────────────────
function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface AppointmentDialogProps {
  /** Pass null to open the "new appointment" form */
  appointment: Appointment | null
  /** If creating a new appointment on a specific date, pass it here */
  defaultDate?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AppointmentDialog({
  appointment,
  defaultDate,
  open,
  onOpenChange,
}: AppointmentDialogProps) {
  const isEditing = appointment !== null

  // ── Live students (server-side searchable) ──────────────────────────────
  const [studentSearch, setStudentSearch] = useState('')
  const debouncedSearch = useDebouncedValue(studentSearch.trim(), 300)
  const { data: apiStudentData, isLoading: isLoadingStudents, isError: isErrorStudents } = useStudents(
    isMockMode() ? { limit: 500 } : { limit: 50, search: debouncedSearch || undefined, stageIn: 'LEAD,PROSPECT,ENROLLED,APPLIED,OFFER_RECEIVED,VISA_APPLIED,VISA_APPROVED,DEPARTED,LOST' }
  )

  const mockStudents = useStudentsStore((s) => s.students)
  const availableStudents = useMemo(() => {
    const list: Array<{ id: string; name: string; studentId: string; email?: string; phone?: string }> = []
    if (!isMockMode()) {
      list.push(...(apiStudentData?.students ?? []).map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        studentId: s.id.length > 12 ? `STU-${s.id.slice(-6).toUpperCase()}` : s.id,
        email: s.email,
        phone: s.phone ?? undefined,
      })))
    } else {
      list.push(...mockStudents.map((s) => ({
        id: s.id,
        name: s.name,
        studentId: s.studentId,
        email: s.email,
        phone: s.phone,
      })))
    }

    // If viewing an appointment whose student is not yet loaded in search results, preserve display
    if (appointment?.studentId && !list.some((s) => s.id === appointment.studentId)) {
      list.unshift({
        id: appointment.studentId,
        name: appointment.studentName || 'Student',
        studentId: appointment.studentId.length > 12 ? `STU-${appointment.studentId.slice(-6).toUpperCase()}` : appointment.studentId,
      })
    }

    return list
  }, [apiStudentData, mockStudents, appointment])

  // ── Authorized Counselors (live from user API) ──────────────────────────
  const { data: realCounselors = [], isLoading: isLoadingCounselors } = useCounselors()
  const users = useUsersStore((s) => s.users)
  const fetchUsers = useUsersStore((s) => s.fetchUsers)

  const usedCounselors = useMemo(() => {
    if (realCounselors && realCounselors.length > 0) {
      return realCounselors.map((c) => ({ id: c.id, name: c.name, email: c.email }))
    }
    if (!isMockMode()) {
      return users
        .filter((u) => u.role === 'counselor' || u.role === 'super_admin' || u.role === 'front_desk')
        .map((u) => ({ id: u.id, name: u.name, email: u.email }))
    }
    return []
  }, [realCounselors, users])

  // Fetch staff users when dialog opens (live mode fallback)
  useEffect(() => {
    if (open && !isMockMode()) {
      fetchUsers()
    }
  }, [open, fetchUsers])

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      studentId: '',
      counselorIds: [],
      type: 'counseling',
      date: defaultDate ?? dayjs().format('YYYY-MM-DD'),
      startTime: '10:00',
      endTime: '10:30',
      location: 'branch_office',
    },
  })

  // Sync form when the dialog opens for editing
  useEffect(() => {
    if (open) {
      if (appointment) {
        reset({
          studentId: appointment.studentId,
          counselorIds: appointment.counselorIds ?? (appointment.counselorId ? [appointment.counselorId] : []),
          type: TYPE_FROM_BACKEND[appointment.type?.toUpperCase()] ?? (TYPE_FROM_BACKEND[appointment.type] ?? 'counseling'),
          date: dayjs(appointment.start).format('YYYY-MM-DD'),
          startTime: dayjs(appointment.start).format('HH:mm'),
          endTime: dayjs(appointment.end).format('HH:mm'),
          location: LOCATION_FROM_BACKEND[appointment.location?.toUpperCase()] ?? (LOCATION_FROM_BACKEND[appointment.location] ?? 'branch_office'),
        })
      } else {
        reset({
          studentId: '',
          counselorIds: [],
          type: 'counseling',
          date: defaultDate ?? dayjs().format('YYYY-MM-DD'),
          startTime: '10:00',
          endTime: '10:30',
          location: 'branch_office',
        })
      }
    }
  }, [open, appointment, defaultDate, reset])

  // ── Strictly Guarded Handlers (Phase 4A Read-Only) ──────────────────────
  function onSubmit(_data: FormData) {
    toast.warning('Phase 4A Read-Only Mode: Appointment scheduling and editing are locked to protect live business data.')
    return
  }

  function handleCancel() {
    toast.warning('Phase 4A Read-Only Mode: Appointment cancellations and status modifications are locked.')
    return
  }

  function handleDelete() {
    toast.warning('Phase 4A Read-Only Mode: Deleting live appointments is locked.')
    return
  }

  const isCancellable = isEditing && appointment?.status !== 'cancelled' && appointment?.status !== 'completed'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <CalendarClock className="size-3.5" />
            {isEditing ? 'Appointment Details' : 'New Appointment (Read-Only)'}
          </div>
          <DialogTitle className="mt-1 text-lg font-bold">
            {isEditing ? appointment.title : 'Schedule a Session'}
          </DialogTitle>
          {isEditing && (
            <DialogDescription className="flex items-center gap-2 mt-1">
              {(() => {
                const meta = (appointment.status && appointmentStatusMeta[appointment.status]) || {
                  label: appointment.status || 'Scheduled',
                  variant: 'info' as const,
                }
                return (
                  <Badge variant={meta.variant}>
                    {meta.label}
                  </Badge>
                )
              })()}
              <span className="text-xs text-muted-foreground">
                {dayjs(appointment.start).format('MMM D, YYYY · h:mm A')} – {dayjs(appointment.end).format('h:mm A')}
              </span>
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Phase 4A Read-Only Banner */}
        <div className="mx-6 mt-4 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50/90 p-3 text-xs text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-300">
          <ShieldAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold">Phase 4A Read-Only Mode:</span>
            <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
              Appointment scheduling, editing, status changes, and notifications are locked to protect live client data and prevent automated emails.
            </p>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="overflow-y-auto max-h-[55vh]">
          <div className="space-y-4 px-6 py-4">
            {/* Student Picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Student</label>
              <Controller
                name="studentId"
                control={control}
                render={({ field }) => (
                  <SearchableStudentPicker
                    label=""
                    students={availableStudents}
                    value={field.value}
                    onChange={field.onChange}
                    onSearchChange={setStudentSearch}
                    searching={isMockMode() ? false : isLoadingStudents}
                    placeholder={isLoadingStudents ? "Loading students..." : "Search student by name or ID"}
                    emptyMessage={isErrorStudents ? "Failed to load students." : (isLoadingStudents ? "Loading students..." : "No students found")}
                    disabled={true}
                  />
                )}
              />
              {errors.studentId && (
                <p className="text-[11px] text-danger-600 flex items-center gap-1">
                  {errors.studentId.message}
                </p>
              )}
            </div>

            {/* Counselors Picker */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Counselors</label>
              <Controller
                name="counselorIds"
                control={control}
                render={({ field }) => {
                  const selectedCounselors = usedCounselors.filter((c) => field.value.includes(c.id))
                  return (
                    <div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            disabled={true}
                            className="flex h-10 w-full items-center justify-between rounded-md border border-border/70 bg-background px-3 text-left text-sm shadow-soft opacity-75 cursor-not-allowed"
                          >
                            <span className="truncate text-foreground">
                              {isLoadingCounselors
                                ? 'Loading counselors...'
                                : selectedCounselors.length > 0
                                ? selectedCounselors.map((c) => c.name).join(', ')
                                : 'No counselor selected'}
                            </span>
                            <ChevronDown className="size-4 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="p-2">
                          <div className="max-h-56 space-y-1 overflow-y-auto">
                            {usedCounselors.map((c) => {
                              const checked = field.value.includes(c.id)
                              return (
                                <div
                                  key={c.id}
                                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm text-muted-foreground"
                                >
                                  <span>{c.name}</span>
                                  {checked && <Check className="size-4 text-primary" />}
                                </div>
                              )
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )
                }}
              />
            </div>

            {/* Type + Location Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Type</label>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={true}>
                      <SelectTrigger className="opacity-75 cursor-not-allowed">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(typeLabels) as Appointment['type'][]).map((t) => (
                          <SelectItem key={t} value={t}>{typeLabels[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Location</label>
                <Controller
                  name="location"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={true}>
                      <SelectTrigger className="opacity-75 cursor-not-allowed">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(locationMeta) as Appointment['location'][]).map((loc) => {
                          const { label, Icon } = locationMeta[loc]
                          return (
                            <SelectItem key={loc} value={loc}>
                              <span className="flex items-center gap-1.5">
                                <Icon className="size-3.5 text-muted-foreground" />
                                {label}
                              </span>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Date</label>
              <Input
                type="date"
                className="h-9 text-sm opacity-75 cursor-not-allowed"
                {...register('date')}
                disabled={true}
              />
            </div>

            {/* Start / End Time Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Start Time</label>
                <Input
                  type="time"
                  className="h-9 text-sm opacity-75 cursor-not-allowed"
                  {...register('startTime')}
                  disabled={true}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">End Time</label>
                <Input
                  type="time"
                  className="h-9 text-sm opacity-75 cursor-not-allowed"
                  {...register('endTime')}
                  disabled={true}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="border-t border-border/60 bg-muted/30 px-6 py-4">
            <div className="mr-auto flex items-center gap-2">
              {isEditing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={true}
                  className="text-muted-foreground h-8 px-2 text-xs opacity-50 cursor-not-allowed"
                  title="Deleting appointments is locked in Phase 4A Read-Only Mode"
                  onClick={handleDelete}
                >
                  <Lock className="size-3.5 mr-1" />
                  Delete
                </Button>
              )}
              {isCancellable && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={true}
                  className="text-muted-foreground h-8 text-xs opacity-50 cursor-not-allowed"
                  title="Canceling appointments is locked in Phase 4A Read-Only Mode"
                  onClick={handleCancel}
                >
                  <Lock className="size-3.5 mr-1" />
                  Cancel
                </Button>
              )}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={true}
              className="opacity-60 cursor-not-allowed"
              title="Mutation actions locked in Phase 4A Read-Only Mode"
            >
              <Lock className="size-3.5 mr-1" />
              {isEditing ? 'Save Changes (Locked)' : 'Schedule (Locked)'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

