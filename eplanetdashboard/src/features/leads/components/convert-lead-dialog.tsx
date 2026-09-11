import { useState, useEffect } from 'react'
import { UserCheck, Mail, KeyRound, AlertCircle, Loader2 } from 'lucide-react'
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
import { toast } from 'sonner'
import { convertLeadToStudent, type LeadConversionResult } from '@/lib/lead-conversion'
import type { Lead } from '@/types'

interface ConvertLeadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: Lead | null
  onSuccess?: (result: LeadConversionResult) => void
}

export function ConvertLeadDialog({
  open,
  onOpenChange,
  lead,
  onSuccess,
}: ConvertLeadDialogProps) {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasExistingEmail = Boolean(
    lead?.email &&
    lead.email.includes('@') &&
    !lead.email.includes('@no-email') &&
    !lead.email.endsWith('example.com')
  )

  useEffect(() => {
    if (lead) {
      setEmail(hasExistingEmail ? lead.email : '')
      setError(null)
    }
  }, [lead, hasExistingEmail, open])

  if (!lead) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedEmail = email.trim().toLowerCase()

    if (!trimmedEmail) {
      setError('Student email is required to create portal access.')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmedEmail)) {
      setError('Please enter a valid email address (e.g. name@domain.com).')
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      const result = await convertLeadToStudent(lead, trimmedEmail)
      if (result) {
        toast.success(`${lead.name} successfully registered as an enrolled student!`)
        onSuccess?.(result)
        onOpenChange(false)
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to register student. Please try again.'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                <UserCheck className="size-5 text-primary" />
              </div>
              <DialogTitle className="text-lg font-semibold">
                Register Lead as Student
              </DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-sm text-muted-foreground">
              Promote <strong>{lead.name}</strong> to an enrolled student. A student portal account will be created and login credentials will be emailed immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {!hasExistingEmail && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <div>
                  <strong>Email is mandatory for student portal access.</strong>
                  <p className="mt-0.5 text-amber-700 dark:text-amber-400">
                    This lead was created without an email. Enter their email below to send the dashboard invitation.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="student-email" className="text-xs font-semibold flex items-center gap-1.5">
                <Mail className="size-3.5 text-muted-foreground" />
                Student Email <span className="text-destructive">*</span>
              </label>
              <Input
                id="student-email"
                type="email"
                placeholder="student@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (error) setError(null)
                }}
                disabled={isSubmitting}
                autoFocus={!hasExistingEmail}
                className={error ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
              {error && (
                <p className="text-xs font-medium text-destructive mt-1">{error}</p>
              )}
            </div>

            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground flex items-center gap-2">
              <KeyRound className="size-4 shrink-0 text-primary" />
              <span>
                System will generate a secure temporary password and email the portal link to this address.
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-1.5">
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Registering...
                </>
              ) : (
                <>
                  <UserCheck className="size-4" />
                  Confirm & Send Portal Credentials
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
