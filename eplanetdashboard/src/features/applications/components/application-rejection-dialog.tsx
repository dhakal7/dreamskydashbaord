import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const REJECTION_REASONS = [
  'Academic requirements / GPA not met',
  'English language proficiency score insufficient',
  'Incomplete documentation / missing required transcripts',
  'Financial capacity / funding verification not satisfied',
  'Program quota / intake full for chosen semester',
  'Course prerequisite subjects not completed',
  'Genuine student / visa compliance risk',
  'Student withdrawn / decided not to proceed',
  'Other (specify in explanation)',
]

interface ApplicationRejectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  application: {
    id: string
    studentName?: string
    universityName?: string
    courseName?: string
  } | null
  onConfirm: (reason: string, notes: string) => Promise<void>
  isSubmitting?: boolean
}

export function ApplicationRejectionDialog({
  open,
  onOpenChange,
  application,
  onConfirm,
  isSubmitting,
}: ApplicationRejectionDialogProps) {
  const [selectedReason, setSelectedReason] = useState<string>(REJECTION_REASONS[0])
  const [explanation, setExplanation] = useState('')

  const handleConfirm = async () => {
    if (!selectedReason) {
      toast.error('Please select a rejection reason.')
      return
    }
    if (!explanation.trim()) {
      toast.error('Please provide a mandatory explanation or note for the audit log.')
      return
    }
    await onConfirm(selectedReason, explanation.trim())
    setExplanation('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5 shrink-0" />
            Record Application Rejection
          </DialogTitle>
          <DialogDescription className="text-xs">
            {application?.studentName ? (
              <span>
                Documenting rejection for <strong>{application.studentName}</strong> (
                {application.universityName} — {application.courseName}).
              </span>
            ) : (
              'This reason will be permanently recorded in the student audit history.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Primary Rejection Reason *
            </label>
            <Select value={selectedReason} onValueChange={setSelectedReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select primary reason" />
              </SelectTrigger>
              <SelectContent>
                {REJECTION_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Mandatory Explanation & Official Notes *
            </label>
            <textarea
              className="w-full min-h-[90px] rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Enter official rejection explanation, university feedback, or reasons for audit trail..."
              rows={4}
              value={explanation}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setExplanation(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Recorded in the permanent Staff Activity Log for Super Admin review.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isSubmitting || !explanation.trim()}
          >
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Confirm & Log Rejection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
