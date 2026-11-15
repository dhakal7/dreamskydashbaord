import { useState, useEffect } from 'react'
import dayjs from 'dayjs'
import { Calendar, Clock, AlertCircle, Loader2, UserCheck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { userApi, type CounselorOption } from '@/api/user-api'
import { useAssignLiveLead } from '@/hooks/use-leads-live'
import { useLeadsStore } from '../store'
import { useAuthStore } from '@/store/auth-store'
import { isMockMode } from '@/lib/api-client'
import type { Lead } from '@/types'

interface AssignCounselorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: Lead | null
  onSuccess?: () => void
}

export function AssignCounselorDialog({
  open,
  onOpenChange,
  lead,
  onSuccess,
}: AssignCounselorDialogProps) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const assignLead = useAssignLiveLead()
  const moveMockLead = useLeadsStore((s) => s.moveLead)

  const [counselors, setCounselors] = useState<CounselorOption[]>([])
  const [selectedCounselorId, setSelectedCounselorId] = useState<string>('')
  const [appointmentDate, setAppointmentDate] = useState('')
  const [appointmentTime, setAppointmentTime] = useState('10:00')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (open && lead) {
      setLoading(true)
      setError(null)
      setIsSubmitting(false)
      setAppointmentDate(dayjs().add(1, 'day').format('YYYY-MM-DD'))
      setAppointmentTime('10:00')
      setNotes('')
      setSelectedCounselorId(lead.counselorId || '')

      userApi
        .getCounselors()
        .then((data) => {
          if (currentUser.role !== 'super_admin' && currentUser.branchId) {
            setCounselors(data.filter((c) => !c.branchId || c.branchId === currentUser.branchId))
          } else {
            setCounselors(data)
          }
        })
        .catch(() => {
          setError('Failed to load counselors list.')
        })
        .finally(() => setLoading(false))
    }
  }, [open, lead, currentUser])

  if (!lead) return null

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting || assignLead.isPending) return
    setError(null)

    if (!selectedCounselorId || !selectedCounselorId.trim()) {
      setError('Please select a counselor.')
      return
    }
    if (!appointmentDate || !appointmentDate.trim()) {
      setError('Appointment date is required.')
      return
    }
    if (!appointmentTime || !appointmentTime.trim()) {
      setError('Appointment time is required.')
      return
    }

    const fullDateTime = dayjs(`${appointmentDate}T${appointmentTime}`)
    if (!fullDateTime.isValid()) {
      setError('Please provide a valid appointment date and time.')
      return
    }
    if (fullDateTime.isBefore(dayjs().subtract(5, 'minute'))) {
      setError('Appointment cannot be scheduled in the past. Please select a future date and time.')
      return
    }

    setIsSubmitting(true)
    try {
      if (isMockMode()) {
        moveMockLead(lead.id, 'assigned')
        onSuccess?.()
        onOpenChange(false)
      } else {
        await assignLead.mutateAsync({
          id: lead.id,
          counselorId: selectedCounselorId,
          appointmentDate,
          appointmentTime,
          durationMin: 30,
          meetingMode: 'OFFICE',
          notes: notes.trim() || undefined,
        })
        onSuccess?.()
        onOpenChange(false)
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to assign lead and schedule appointment.'
      setError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!isSubmitting && !assignLead.isPending) {
        onOpenChange(nextOpen)
      }
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="size-4 text-primary" />
            Assign Lead to Counselor
          </DialogTitle>
          <DialogDescription>
            Select a counselor and schedule an initial counseling appointment to move this lead to Assigned.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleAssign} className="space-y-4 py-2" noValidate>
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="assign-student-name" className="text-xs font-medium text-foreground">
              Student / Lead Name
            </label>
            <Input
              id="assign-student-name"
              value={lead.name}
              readOnly
              disabled
              className="bg-muted/60 text-foreground opacity-100"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="counselor-select" className="text-xs font-medium text-foreground">
              Counselor <span className="text-destructive">*</span>
            </label>
            <Select
              value={selectedCounselorId}
              onValueChange={setSelectedCounselorId}
              disabled={loading || isSubmitting}
            >
              <SelectTrigger id="counselor-select">
                <SelectValue placeholder={loading ? 'Loading counselors...' : 'Select a counselor'} />
              </SelectTrigger>
              <SelectContent>
                {counselors.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.email ? `(${c.email})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="assign-appt-date" className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Calendar className="size-3.5 text-muted-foreground" />
                Appointment Date <span className="text-destructive">*</span>
              </label>
              <Input
                id="assign-appt-date"
                type="date"
                value={appointmentDate}
                min={dayjs().format('YYYY-MM-DD')}
                onChange={(e) => setAppointmentDate(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="assign-appt-time" className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Clock className="size-3.5 text-muted-foreground" />
                Appointment Time <span className="text-destructive">*</span>
              </label>
              <Input
                id="assign-appt-time"
                type="time"
                value={appointmentTime}
                onChange={(e) => setAppointmentTime(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="assign-appt-notes" className="text-xs font-medium text-foreground">
              Notes <span className="text-muted-foreground">(Optional)</span>
            </label>
            <textarea
              id="assign-appt-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              placeholder="Optional notes for the counselor..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting || assignLead.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || assignLead.isPending || loading}
              className="bg-brand-600 hover:bg-brand-700 text-white"
            >
              {isSubmitting || assignLead.isPending ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Assigning...
                </>
              ) : (
                'Assign & Schedule'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
