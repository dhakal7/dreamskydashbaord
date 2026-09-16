import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import dayjs from 'dayjs'
import {
  CalendarClock, MapPin, Monitor, Phone, X, Plus, AlertTriangle, Mail, Trash2,
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
import { counselors as mockCounselors } from '@/mock'
import { useAppointmentsStore } from '../store'
import type { Appointment } from '@/types'
import { useAuthStore } from '@/store/auth-store'
import { hasPermission } from '@/lib/rbac'
import { isMockMode } from '@/lib/api-client'
import { useCreateAppointment, useUpdateAppointment, useChangeAppointmentStatus } from '@/hooks/use-appointments'
import { appointmentApi } from '@/api/appointment-api'
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
/** Map frontend local values to backend VALID_TYPES. */
const TYPE_TO_BACKEND: Record<FormData['type'], string> = {
  counseling: 'INITIAL_CONSULTATION',
  document_review: 'DOCUMENT_REVIEW',
  visa_prep: 'VISA_COUNSELING',
  follow_up: 'FOLLOW_UP',
  orientation: 'OTHER',
}

/** Map backend type values back to frontend local values. */
const TYPE_FROM_BACKEND: Record<string, FormData['type']> = {
  INITIAL_CONSULTATION: 'counseling',
  FOLLOW_UP: 'follow_up',
  DOCUMENT_REVIEW: 'document_review',
  VISA_COUNSELING: 'visa_prep',
  OTHER: 'orientation',
}

/** Map frontend local location values to backend VALID_MODES. */
const LOCATION_TO_BACKEND: Record<FormData['location'], string> = {
  branch_office: 'OFFICE',
  video_call: 'ONLINE',
  phone_call: 'ONLINE',
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
  const addAppointmentMock = useAppointmentsStore((s) => s.addAppointment)
  const updateAppointmentMock = useAppointmentsStore((s) => s.updateAppointment)
  const cancelAppointmentMock = useAppointmentsStore((s) => s.cancelAppointment)
  const removeAppointmentMock = useAppointmentsStore((s) => s.removeAppointment)
  const createAppointmentApi = useCreateAppointment()
  const updateAppointmentApi = useUpdateAppointment()
  const changeStatusApi = useChangeAppointmentStatus()

  const currentUser = useAuthStore((s) => s.currentUser)
  const canManage = hasPermission(currentUser.role, 'appointments.manage')

  const isEditing = appointment !== null

  // ── Live students (server-side searchable) ──────────────────────────────
  const [studentSearch, setStudentSearch] = useState('')
  const debouncedSearch = useDebouncedValue(studentSearch.trim(), 300)
  const { data: apiStudentData, isLoading: isLoadingStudents, isError: isErrorStudents } = useStudents(
    isMockMode() ? { limit: 500 } : { limit: 50, search: debouncedSearch || undefined, stageIn: 'LEAD,PROSPECT,ENROLLED,APPLIED,OFFER_RECEIVED,VISA_APPLIED,VISA_APPROVED,DEPARTED,LOST' }
  )

  const mockStudents = useStudentsStore((s) => s.students)
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
    return mockStudents.map((s) => ({
      id: s.id,
      name: s.name,
      studentId: s.studentId,
      email: s.email,
      phone: s.phone,
    }))
  }, [apiStudentData, mockStudents])

  // ── Counselors (live from users API or mock) ────────────────────────────
  const users = useUsersStore((s) => s.users)
  const fetchUsers = useUsersStore((s) => s.fetchUsers)
  const usedCounselors = useMemo(() => {
    if (!isMockMode()) {
      return users
        .filter((u) => u.role === 'counselor' || u.role === 'super_admin' || u.role === 'front_desk')
        .map((u) => ({ id: u.id, name: u.name, email: u.email }))
    }
    return mockCounselors.map((c) => ({ id: c.id, name: c.name, email: c.email }))
  }, [users])

  // Fetch staff users when dialog opens (live mode)
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
    watch,
    formState: { errors, isSubmitting },
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

  function onSubmit(data: FormData) {
    const student = availableStudents.find((s) => s.id === data.studentId)
    const selectedCounselors = usedCounselors.filter((c) => data.counselorIds.includes(c.id))
    const primaryCounselor = selectedCounselors[0]
    const start = `${data.date}T${data.startTime}:00`
    const end = `${data.date}T${data.endTime}:00`
    const type = data.type
    const durationMin = Math.max(
      1,
      Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
    )

    if (!isMockMode()) {
      const backendType = TYPE_TO_BACKEND[data.type]
      const backendMode = LOCATION_TO_BACKEND[data.location]
      if (isEditing) {
        updateAppointmentApi.mutate(
          {
            id: appointment.id,
            body: {
              studentId: data.studentId,
              counselorId: primaryCounselor?.id,
              type: backendType,
              datetime: start,
              durationMin,
              meetingMode: backendMode,
            },
          },
          { onSuccess: () => onOpenChange(false) }
        )
      } else {
        createAppointmentApi.mutate(
          {
            studentId: data.studentId,
            counselorId: primaryCounselor?.id,
            type: backendType,
            datetime: start,
            durationMin,
            meetingMode: backendMode,
          },
          { onSuccess: () => onOpenChange(false) }
        )
      }
      return
    }

    // Mock mode: update local Zustand store
    const studentName = student?.name ?? 'Student'
    if (isEditing) {
      updateAppointmentMock(appointment.id, {
        studentId: data.studentId,
        studentName,
        counselorId: primaryCounselor?.id ?? '',
        counselorName: primaryCounselor?.name ?? '',
        counselorIds: selectedCounselors.map((c) => c.id),
        counselorNames: selectedCounselors.map((c) => c.name),
        type,
        start,
        end,
        location: data.location,
        title: `${type.replace('_', ' ')} — ${studentName}`,
      })
    } else {
      addAppointmentMock({
        studentId: data.studentId,
        studentName,
        counselorId: primaryCounselor?.id ?? '',
        counselorName: primaryCounselor?.name ?? '',
        counselorIds: selectedCounselors.map((c) => c.id),
        counselorNames: selectedCounselors.map((c) => c.name),
        type,
        start,
        end,
        location: data.location,
        status: 'scheduled',
        title: `${type.replace('_', ' ')} — ${studentName}`,
      })
    }
    onOpenChange(false)
  }

  function handleCancel() {
    if (appointment) {
      if (!isMockMode()) {
        changeStatusApi.mutate(
          { id: appointment.id, status: 'CANCELLED' },
          { onSuccess: () => onOpenChange(false) }
        )
      } else {
        cancelAppointmentMock(appointment.id)
        onOpenChange(false)
      }
    }
  }

  function handleDelete() {
    if (appointment) {
      if (window.confirm(`Are you sure you want to permanently delete this appointment for "${appointment.studentName}"?`)) {
        if (!isMockMode()) {
          appointmentApi.remove(appointment.id)
            .then(() => {
              onOpenChange(false)
              toast.success('Appointment deleted')
            })
            .catch((err: Error) => toast.error(err.message || 'Failed to delete appointment'))
        } else {
          removeAppointmentMock(appointment.id)
          onOpenChange(false)
        }
      }
    }
  }

  const isCancellable = isEditing && appointment?.status !== 'cancelled' && appointment?.status !== 'completed'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <CalendarClock className="size-3.5" />
            {isEditing ? 'Edit Appointment' : 'New Appointment'}
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

        {/* Body */}
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
                    label=""
                    students={availableStudents}
                    value={field.value}
                    onChange={field.onChange}
                    onSearchChange={setStudentSearch}
                    searching={isMockMode() ? false : isLoadingStudents}
                    placeholder={isLoadingStudents ? "Loading students..." : "Search student by name or ID"}
                    emptyMessage={isErrorStudents ? "Failed to load students. Check your connection." : (isLoadingStudents ? "Loading students..." : "No students found")}
                    disabled={!canManage}
                  />
                )}
              />
              {errors.studentId && (
                <p className="text-[11px] text-danger-600 flex items-center gap-1">
                  <AlertTriangle className="size-3" />{errors.studentId.message}
                </p>
              )}
              {(() => {
                const selId = watch('studentId')
                const selStu = availableStudents.find((s) => s.id === selId)
                if (!selStu) return null
                return selStu.email ? (
                  <div className="mt-1 flex items-center gap-2 rounded-md bg-emerald-500/10 p-2.5 text-[11px] text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <Mail className="size-3.5 shrink-0 text-emerald-500" />
                    <span>Automated appointment email will be sent to <strong>{selStu.email}</strong>.</span>
                  </div>
                ) : (
                  <div className="mt-1 flex items-center gap-2 rounded-md bg-amber-500/10 p-2.5 text-[11px] text-amber-700 dark:text-amber-300 border border-amber-500/20">
                    <Phone className="size-3.5 shrink-0 text-amber-500" />
                    <span><strong>No email registered:</strong> Frontdesk officer must manually call {selStu.phone ? <strong>{selStu.phone}</strong> : 'the student'} to confirm this appointment.</span>
                  </div>
                )
              })()}
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
                            disabled={!canManage}
                            className="flex h-10 w-full items-center justify-between rounded-md border border-border/70 bg-background px-3 text-left text-sm shadow-soft disabled:opacity-75 disabled:cursor-not-allowed"
                          >
                            <span className="truncate text-foreground">
                              {selectedCounselors.length > 0
                                ? selectedCounselors.map((c) => c.name).join(', ')
                                : 'Select counselors…'}
                            </span>
                            <ChevronDown className="size-4 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="p-2">
                          <div className="max-h-56 space-y-1 overflow-y-auto">
                            {usedCounselors.map((c) => {
                              const checked = field.value.includes(c.id)
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                                  onClick={() => {
                                    const next = checked
                                      ? field.value.filter((id) => id !== c.id)
                                      : [...field.value, c.id]
                                    field.onChange(next)
                                  }}
                                >
                                  <span>{c.name}</span>
                                  {checked && <Check className="size-4 text-primary" />}
                                </button>
                              )
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )
                }}
              />
              {errors.counselorIds && (
                <p className="text-[11px] text-danger-600 flex items-center gap-1">
                  <AlertTriangle className="size-3" />{errors.counselorIds.message}
                </p>
              )}
            </div>

            {/* Type + Location Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Type</label>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={!canManage}>
                      <SelectTrigger>
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
                    <Select value={field.value} onValueChange={field.onChange} disabled={!canManage}>
                      <SelectTrigger>
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
                className={`h-9 text-sm ${errors.date ? 'border-danger-500' : ''}`}
                {...register('date')}
                disabled={!canManage}
              />
              {errors.date && (
                <p className="text-[11px] text-danger-600 flex items-center gap-1">
                  <AlertTriangle className="size-3" />{errors.date.message}
                </p>
              )}
            </div>

            {/* Start / End Time Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Start Time</label>
                <Input
                  type="time"
                  className={`h-9 text-sm ${errors.startTime ? 'border-danger-500' : ''}`}
                  {...register('startTime')}
                  disabled={!canManage}
                />
                {errors.startTime && (
                  <p className="text-[11px] text-danger-600 flex items-center gap-1">
                    <AlertTriangle className="size-3" />{errors.startTime.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">End Time</label>
                <Input
                  type="time"
                  className={`h-9 text-sm ${errors.endTime ? 'border-danger-500' : ''}`}
                  {...register('endTime')}
                  disabled={!canManage}
                />
                {errors.endTime && (
                  <p className="text-[11px] text-danger-600 flex items-center gap-1">
                    <AlertTriangle className="size-3" />{errors.endTime.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="border-t border-border/60 bg-muted/30 px-6 py-4">
            {!canManage ? (
              <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            ) : (
              <>
                <div className="mr-auto flex items-center gap-2">
                  {isEditing && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-danger-600 hover:bg-danger-50 hover:text-danger-700 h-8 px-2 text-xs"
                      onClick={handleDelete}
                    >
                      <Trash2 className="size-3.5 mr-1" />
                      Delete
                    </Button>
                  )}
                  {isCancellable && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-danger-600 border-danger-200 hover:bg-danger-50 hover:border-danger-400 h-8 text-xs"
                      onClick={handleCancel}
                    >
                      <X className="size-3.5 mr-1" />
                      Cancel
                    </Button>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Discard
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  <Plus className="size-3.5 mr-1" />
                  {isEditing ? 'Save Changes' : 'Schedule Appointment'}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
