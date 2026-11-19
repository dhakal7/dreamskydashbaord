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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ShieldAlert, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const VISA_REFUSAL_GROUNDS = [
  'Genuine Student (GS) / GTE criteria not satisfied',
  'Financial capacity / genuine source of funds question',
  'Academic qualification / gap justification not accepted',
  'Immigration history / undeclared prior refusal',
  'English language / interview assessment concern',
  'Documentation authenticity or verification failure',
  'Intent to return to home country not demonstrated',
  'Health / character requirements not met',
  'Other official embassy refusal ground',
]

interface VisaRefusalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  studentName?: string
  countryName?: string
  onConfirm: (reason: string, notes: string, decisionDate?: string) => Promise<void>
  isSubmitting?: boolean
}

export function VisaRefusalDialog({
  open,
  onOpenChange,
  studentName,
  countryName,
  onConfirm,
  isSubmitting,
}: VisaRefusalDialogProps) {
  const [selectedGround, setSelectedGround] = useState<string>(VISA_REFUSAL_GROUNDS[0])
  const [decisionDate, setDecisionDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [explanation, setExplanation] = useState('')

  const handleConfirm = async () => {
    if (!selectedGround) {
      toast.error('Please select the primary refusal ground.')
      return
    }
    if (!explanation.trim()) {
      toast.error('A detailed refusal reason is mandatory for the student record and audit trail.')
      return
    }
    await onConfirm(selectedGround, explanation.trim(), decisionDate)
    setExplanation('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="size-5 shrink-0" />
            Record Official Visa Refusal
          </DialogTitle>
          <DialogDescription className="text-xs">
            {studentName ? (
              <span>
                Documenting embassy refusal for <strong>{studentName}</strong>{' '}
                {countryName ? `(${countryName})` : ''}.
              </span>
            ) : (
              'This official refusal will be permanently recorded in the student and visa audit log.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Primary Refusal Ground *
            </label>
            <Select value={selectedGround} onValueChange={setSelectedGround}>
              <SelectTrigger>
                <SelectValue placeholder="Select refusal ground" />
              </SelectTrigger>
              <SelectContent>
                {VISA_REFUSAL_GROUNDS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Embassy Decision Date
            </label>
            <Input
              type="date"
              value={decisionDate}
              onChange={(e) => setDecisionDate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Official Refusal Reason & Embassy Remarks *
            </label>
            <textarea
              className="w-full min-h-[90px] rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Paste or enter embassy letter refusal clauses, reasons given by case officer, and remarks..."
              rows={4}
              value={explanation}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setExplanation(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Must include specific case details for appeal, resubmission, or super admin audit.
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
            Confirm & Log Refusal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
