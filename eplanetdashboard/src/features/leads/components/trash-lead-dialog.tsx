import { useState, useEffect } from 'react'
import { AlertCircle, Loader2, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface TrashLeadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: { id: string; name: string } | null
  onConfirm: (reason: string) => Promise<void> | void
  isSubmitting?: boolean
}

export function TrashLeadDialog({
  open,
  onOpenChange,
  lead,
  onConfirm,
  isSubmitting = false,
}: TrashLeadDialogProps) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setReason('')
      setError(null)
    }
  }, [open, lead])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = reason.trim()
    if (!trimmed) {
      setError('A non-empty reason is required to move this record to Trash.')
      return
    }

    try {
      await onConfirm(trimmed)
      onOpenChange(false)
    } catch (err: any) {
      setError(err?.message || 'Failed to move record to Trash.')
    }
  }

  const handleCancel = () => {
    setReason('')
    setError(null)
    onOpenChange(false)
  }

  if (!lead) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-2.5 text-destructive">
              <div className="flex size-9 items-center justify-center rounded-lg bg-destructive/10">
                <Trash2 className="size-5 text-destructive" />
              </div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Move Lead to Trash
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              You are about to move <span className="font-semibold text-foreground">{lead.name}</span> to the Trash. The lead will be hidden from the active pipeline and ordinary counts. Authorized administrators can restore it later.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="trash-reason" className="text-xs font-medium text-foreground">
                Reason for Trash <span className="text-destructive">*</span>
              </label>
              <span className="text-[10px] text-muted-foreground">Required for audit trail</span>
            </div>

            <textarea
              id="trash-reason"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="e.g. Duplicate entry, invalid contact information, applicant moved abroad, or withdrew inquiry"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                if (error && e.target.value.trim()) setError(null)
              }}
              disabled={isSubmitting}
              autoFocus
            />

            {error && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="size-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={isSubmitting || !reason.trim()}
              className="gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Moving to Trash...
                </>
              ) : (
                <>
                  <Trash2 className="size-3.5" />
                  Move to Trash
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
