import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlaneTakeoff, Loader2, GraduationCap, MapPin, User } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useVisaStore } from '@/features/visa/store'
import { useApplicationsStore } from '@/features/applications/store'
import { useCreateVisaCase } from '@/hooks/use-visa'
import { isMockMode } from '@/lib/api-client'
import type { Student } from '@/types'

// ── Props ─────────────────────────────────────────────────────────────────────

interface StartVisaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  student: Student
  /** The application from which visa processing is being started */
  application: {
    id: string
    universityName: string
    courseName: string
    countryName: string
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StartVisaDialog({
  open,
  onOpenChange,
  student,
  application,
}: StartVisaDialogProps) {
  const navigate = useNavigate()
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const createVisaCaseMutation = useCreateVisaCase()
  const addMockVisaCase = useVisaStore((s) => s.addVisaCase)

  // Derive the country from the application
  const country = application.countryName || 'General'

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      if (!isMockMode()) {
        await createVisaCaseMutation.mutateAsync({
          studentId: student.id,
          applicationId: application.id,
          country,
          visaType: 'Student Visa',
          notes: notes.trim() || undefined,
        })
      } else {
        addMockVisaCase({
          studentId: student.id,
          studentName: student.name,
          countryName: country,
          universityName: application.universityName,
        })
        useApplicationsStore.getState().removeApplication(application.id)
      }
      onOpenChange(false)
      setNotes('')
      navigate('/visa')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (isSubmitting) return
    setNotes('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <PlaneTakeoff className="size-3.5" />
            Start Visa Processing
          </div>
          <DialogTitle className="mt-1 text-lg font-bold">
            Confirm Visa Case Creation
          </DialogTitle>
          <DialogDescription>
            A new visa processing case will be created using the information below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          {/* Student info summary */}
          <div className="rounded-lg border border-border/60 bg-muted/40 p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <User className="size-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Student</p>
                <p className="text-sm font-semibold text-foreground">{student.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <GraduationCap className="size-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">University / Course</p>
                <p className="text-sm font-semibold text-foreground">{application.universityName}</p>
                <p className="text-xs text-muted-foreground">{application.courseName}</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <MapPin className="size-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Country / Visa Type</p>
                <p className="text-sm font-semibold text-foreground">{country}</p>
                <p className="text-xs text-muted-foreground">Student Visa</p>
              </div>
            </div>
          </div>

          {/* Optional notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Notes <span className="text-muted-foreground font-normal">(Optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes specific to this visa process..."
              className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              disabled={isSubmitting}
            />
          </div>
        </div>

        <DialogFooter className="border-t border-border/60 bg-muted/30 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1.5"
            disabled={isSubmitting}
            onClick={handleConfirm}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <PlaneTakeoff className="size-3.5" />
                Start Visa Processing
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
