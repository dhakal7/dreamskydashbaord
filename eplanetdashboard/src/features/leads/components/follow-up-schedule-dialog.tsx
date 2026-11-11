import { useState, useEffect } from 'react'
import { Calendar, Clock, Phone, AlertCircle, Loader2 } from 'lucide-react'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { useLeadsStore } from '../store'
import { useMoveLiveLead } from '@/hooks/use-leads-live'
import { isMockMode } from '@/lib/api-client'
import type { Lead } from '@/types'

interface FollowUpScheduleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: Lead | null
  onSuccess?: () => void
}

export function FollowUpScheduleDialog({
  open,
  onOpenChange,
  lead,
  onSuccess,
}: FollowUpScheduleDialogProps) {
  const moveLiveLead = useMoveLiveLead()
  const moveMockLead = useLeadsStore((s) => s.moveLead)

  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpTime, setFollowUpTime] = useState('10:00')
  const [durationMin, setDurationMin] = useState<number>(30)
  const [meetingMode, setMeetingMode] = useState<string>('PHONE')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset form when opening for a lead
  useEffect(() => {
    if (open && lead) {
      // Default to tomorrow's date
      const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD')
      setFollowUpDate(tomorrow)
      setFollowUpTime('10:00')
      setDurationMin(30)
      setMeetingMode('PHONE')
      setNotes('')
      setError(null)
      setIsSubmitting(false)
    }
  }, [open, lead])

  if (!lead) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!followUpDate || !followUpDate.trim()) {
      setError('Follow-up date is required.')
      return
    }

    if (!followUpTime || !followUpTime.trim()) {
      setError('Follow-up time is required.')
      return
    }

    // Verify valid date/time format
    const fullDateTime = dayjs(`${followUpDate}T${followUpTime}`)
    if (!fullDateTime.isValid()) {
      setError('Please provide a valid date and time.')
      return
    }

    if (fullDateTime.isBefore(dayjs().subtract(5, 'minute'))) {
      setError('Follow-up cannot be scheduled in the past. Please select a future date and time.')
      return
    }

    setIsSubmitting(true)

    try {
      if (isMockMode()) {
        moveMockLead(lead.id, 'follow_up')
        toast.success(`Follow-up scheduled for ${lead.name} on ${dayjs(followUpDate).format('MMM D, YYYY')} at ${followUpTime}`)
        onSuccess?.()
        onOpenChange(false)
      } else {
        await moveLiveLead.mutateAsync({
          id: lead.id,
          stage: 'follow_up',
          followUpDate,
          followUpTime,
          durationMin,
          meetingMode,
          notes: notes.trim() || undefined,
        })
        toast.success(`Follow-up scheduled for ${lead.name} on ${dayjs(followUpDate).format('MMM D, YYYY')} at ${followUpTime}`)
        onSuccess?.()
        onOpenChange(false)
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to schedule follow-up and update lead stage.'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!isSubmitting) {
        onOpenChange(val)
      }
    }}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="size-5 text-warning-500" />
              Schedule Follow-Up
            </DialogTitle>
            <DialogDescription>
              Transition <span className="font-semibold text-foreground">{lead.name}</span> to the <span className="font-medium text-warning-600">Follow Up</span> stage and create an appointment for the assigned counselor.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-3.5 py-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="size-3.5" /> Follow-Up Date *
                </label>
                <Input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3.5" /> Time *
                </label>
                <Input
                  type="time"
                  value={followUpTime}
                  onChange={(e) => setFollowUpTime(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Duration
                </label>
                <Select
                  value={String(durationMin)}
                  onValueChange={(val) => setDurationMin(Number(val))}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="45">45 minutes</SelectItem>
                    <SelectItem value="60">60 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Phone className="size-3.5" /> Meeting Mode
                </label>
                <Select
                  value={meetingMode}
                  onValueChange={(val) => setMeetingMode(val)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PHONE">Phone Call</SelectItem>
                    <SelectItem value="ONLINE">Online Meeting</SelectItem>
                    <SelectItem value="IN_PERSON">In Person / Office</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Follow-Up Agenda / Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Key topics to discuss (e.g. course options, visa documentation, intake dates)..."
                disabled={isSubmitting}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-soft placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="gap-1.5"
            >
              {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
              Schedule & Move
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
