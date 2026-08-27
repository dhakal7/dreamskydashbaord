import { memo, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Phone, Mail, GripVertical, GraduationCap, MoreVertical, Pencil, AlertCircle, Trash2 } from 'lucide-react'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import type { Lead, LeadStage } from '@/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PersonAvatar } from '@/components/ui/avatar'
import { PriorityBadge } from '@/components/shared/status-badges'
import { cn } from '@/lib/utils'
import { convertLeadToStudent } from '@/lib/lead-conversion'
import { useAuthStore } from '@/store/auth-store'
import { useLeadsStore } from '../store'
import { LeadFormDialog } from './lead-form-dialog'
import { hasPermission } from '@/lib/rbac'

const sourceLabel: Record<string, string> = {
  website: 'Website', facebook: 'Facebook', referral_agent: 'Referral Agent', walk_in: 'Walk-in',
  education_fair: 'Education Fair', google_ads: 'Google Ads', instagram: 'Instagram',
}

const PIPELINE_STAGES: { stage: LeadStage; label: string }[] = [
  { stage: 'new', label: 'New' },
  { stage: 'contacted', label: 'Contacted' },
  { stage: 'counseling', label: 'Counseling' },
  { stage: 'interested', label: 'Interested' },
]

export const LeadCard = memo(function LeadCard({ lead, overlay, canDrag = true }: { lead: Lead; overlay?: boolean; canDrag?: boolean }) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const moveLead = useLeadsStore((s) => s.moveLead)
  const updateLead = useLeadsStore((s) => s.updateLead)
  const removeLead = useLeadsStore((s) => s.removeLead)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [missingEmailInput, setMissingEmailInput] = useState('')
  const [showEmailPrompt, setShowEmailPrompt] = useState(false)
  const [registeredStudent, setRegisteredStudent] = useState<{ studentId: string; email: string; portalPassword: string | null } | null>(null)

  const canChangeStage = hasPermission(currentUser.role, 'leads.change-stage')
  const canManageLeads = hasPermission(currentUser.role, 'leads.manage')
  const isMissingEmail = !lead.email || lead.email.includes('@no-email') || lead.email.includes('eplanet') || !lead.email.includes('@')

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    disabled: !canDrag || !canChangeStage,
  })

  async function handleRegisterLead() {
    let finalEmail = lead.email
    if (isMissingEmail) {
      if (!missingEmailInput.trim() || !missingEmailInput.includes('@')) {
        setShowEmailPrompt(true)
        toast.error('Please enter a valid email address to complete student registration')
        return
      }
      finalEmail = missingEmailInput.trim()
      updateLead(lead.id, { email: finalEmail })
    }

    setIsRegistering(true)
    try {
      const result = await convertLeadToStudent(lead.id)
      if (result) {
        setRegisteredStudent({
          studentId: result.studentId,
          email: finalEmail || result.email,
          portalPassword: result.portalPassword,
        })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to register student. Please try again.')
    } finally {
      setIsRegistering(false)
    }
  }

  function handleDeleteLead(e?: React.MouseEvent) {
    if (e) e.stopPropagation()
    if (window.confirm(`Are you sure you want to permanently delete lead "${lead.name}"?`)) {
      removeLead(lead.id)
      setIsDetailOpen(false)
      toast.success(`Lead "${lead.name}" deleted.`)
    }
  }

  return (
    <>
    <Card
      ref={overlay ? undefined : setNodeRef}
      onClick={() => {
        if (!isDragging) setIsDetailOpen(true)
      }}
      className={cn(
        'group relative cursor-pointer select-none p-3 transition-shadow duration-150 hover:shadow-elevated',
        isDragging && !overlay && 'opacity-30',
        overlay && 'rotate-2 shadow-elevated z-50 bg-background border-primary pointer-events-none'
      )}
    >
      <div className="flex items-start gap-2.5">
        <PersonAvatar name={lead.name} color={lead.photoColor} className="size-8" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{lead.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {lead.interestedCountries && lead.interestedCountries.length > 0
              ? lead.interestedCountries.join(', ')
              : lead.interestedCountry} · {lead.interestedLevel}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {!overlay && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-6 rounded p-0 text-muted-foreground hover:bg-secondary hover:text-foreground">
                  <MoreVertical className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {canManageLeads && (
                  <>
                    <DropdownMenuItem onClick={() => setIsEditOpen(true)} className="text-xs">
                      <Pencil className="mr-1.5 size-3.5" /> Edit Details
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {canChangeStage && (
                  <>
                    <DropdownMenuLabel>Move Stage</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {PIPELINE_STAGES.map((ps) => (
                      <DropdownMenuItem
                        key={ps.stage}
                        disabled={lead.stage === ps.stage}
                        onClick={() => moveLead(lead.id, ps.stage)}
                        className="text-xs flex items-center justify-between"
                      >
                        <span>{ps.label}</span>
                        {lead.stage === ps.stage && <span className="text-[10px] text-muted-foreground font-medium">(Current)</span>}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                )}
                {canManageLeads && (
                  <DropdownMenuItem
                    onClick={handleDeleteLead}
                    className="text-xs text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/50"
                  >
                    <Trash2 className="mr-1.5 size-3.5" /> Delete Lead
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {canDrag && canChangeStage && !overlay && (
            <button
              {...attributes}
              {...listeners}
              type="button"
              className="flex size-6 touch-none items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground cursor-grab active:cursor-grabbing"
              title="Drag to reorder"
            >
              <GripVertical className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><Phone className="size-3" /> {lead.phone || 'No Phone'}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        {isMissingEmail ? (
          <span className="flex items-center gap-1 text-amber-600 font-medium dark:text-amber-400">
            <AlertCircle className="size-3 shrink-0" /> Missing Email
          </span>
        ) : (
          <span className="flex items-center gap-1 truncate"><Mail className="size-3 shrink-0" /> <span className="truncate">{lead.email}</span></span>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <PriorityBadge priority={lead.priority} className="text-[10px] py-0" />
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-border/70 pt-2 text-[10px] text-muted-foreground">
        <span className="rounded bg-secondary px-1.5 py-0.5">{sourceLabel[lead.source] || lead.source}</span>
        <span className="font-medium text-foreground/80">Created: {dayjs(lead.createdAt || lead.lastContact).format('MMM D, YYYY')}</span>
      </div>
    </Card>

    <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle>{lead.name}</DialogTitle>
            {canManageLeads && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setIsDetailOpen(false); setIsEditOpen(true); }}>
                <Pencil className="mr-1 size-3" /> Edit Lead
              </Button>
            )}
          </div>
          <DialogDescription>Lead profile, contact information, and student upgrade.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {/* Stage Switcher inside Dialog */}
          <div className="rounded-lg border border-border bg-secondary/30 p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Current Pipeline Stage</p>
            <div className="flex flex-wrap gap-1.5">
              {PIPELINE_STAGES.map((ps) => {
                const isActive = lead.stage === ps.stage
                return (
                  <Button
                    key={ps.stage}
                    size="sm"
                    variant={isActive ? 'default' : 'outline'}
                    disabled={isActive || !canChangeStage}
                    onClick={() => moveLead(lead.id, ps.stage)}
                    className="h-7 text-xs px-2.5"
                  >
                    {ps.label}
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/70 bg-secondary/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</p>
              <p className="mt-1 font-medium">{lead.name}</p>
              <p className="mt-1 text-muted-foreground">{lead.phone || 'No phone'}</p>
              {isMissingEmail ? (
                <p className="mt-1 text-xs text-amber-600 font-semibold flex items-center gap-1">
                  <AlertCircle className="size-3" /> Email Missing
                </p>
              ) : (
                <p className="mt-1 text-muted-foreground">{lead.email}</p>
              )}
            </div>
            <div className="rounded-lg border border-border/70 bg-secondary/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interest</p>
              <p className="mt-1 font-medium">{lead.interestedCountry}</p>
              <p className="mt-1 text-muted-foreground">{lead.interestedLevel}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Address</p>
            <p className="mt-1 text-muted-foreground">{lead.address ?? 'No address captured yet.'}</p>
          </div>

          {/* Missing email prompt input before upgrading */}
          {isMissingEmail && (showEmailPrompt || lead.stage === 'interested') && (
            <div className="rounded-lg border border-amber-300 bg-amber-50/80 p-3 text-xs text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="font-semibold flex items-center gap-1.5 mb-1.5">
                <AlertCircle className="size-4 text-amber-600" /> Enter Email for Student Credentials & Notifications
              </p>
              <Input
                type="email"
                placeholder="student.email@example.com"
                value={missingEmailInput}
                onChange={(e) => setMissingEmailInput(e.target.value)}
                className="bg-background text-foreground h-8 text-xs"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">This email will be assigned to the student profile for automated notifications.</p>
            </div>
          )}

          {/* Register as Permanent Student Button */}
          {lead.stage === 'interested' && !registeredStudent && canChangeStage && (
            <Button onClick={handleRegisterLead} disabled={isRegistering} className="w-full bg-brand-600 hover:bg-brand-700 text-white">
              <GraduationCap className="mr-2 size-4" />
              {isRegistering ? 'Registering student…' : 'Register as Permanent Student'}
            </Button>
          )}

          {registeredStudent && (
            <div className="rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-700 dark:border-success-900/40 dark:bg-success-950/30">
              <p className="font-semibold flex items-center gap-1.5"><GraduationCap className="size-4" /> Student account created successfully.</p>
              <p className="mt-1">Student ID: <span className="font-mono font-semibold">{registeredStudent.studentId}</span></p>
              <p className="mt-1">Email: {registeredStudent.email}</p>
              {registeredStudent.portalPassword ? (
                <p className="mt-1">Temporary password: <span className="font-mono font-semibold">{registeredStudent.portalPassword}</span></p>
              ) : (
                <p className="mt-1">Portal login details sent to <span className="font-semibold">{registeredStudent.email}</span>.</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {canManageLeads ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => handleDeleteLead()}
            >
              <Trash2 className="mr-1.5 size-3.5" /> Delete Lead
            </Button>
          ) : <div />}
          <Button variant="outline" size="sm" onClick={() => setIsDetailOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Lead Form Dialog for Editing */}
    <LeadFormDialog
      open={isEditOpen}
      onOpenChange={setIsEditOpen}
      leadToEdit={lead}
    />
    </>
  )
})

export function LeadCardOverlay({ lead }: { lead: Lead }) {
  const isMissingEmail = !lead.email || lead.email.includes('@no-email') || lead.email.includes('eplanet') || !lead.email.includes('@')
  return (
    <Card className="group relative select-none p-3 shadow-elevated z-50 bg-background border-primary rotate-1 pointer-events-none w-72">
      <div className="flex items-start gap-2.5">
        <PersonAvatar name={lead.name} color={lead.photoColor} className="size-8" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{lead.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{lead.interestedCountry} · {lead.interestedLevel}</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><Phone className="size-3" /> {lead.phone || 'No Phone'}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        {isMissingEmail ? (
          <span className="flex items-center gap-1 text-amber-600 font-medium dark:text-amber-400">
            <AlertCircle className="size-3 shrink-0" /> Missing Email
          </span>
        ) : (
          <span className="flex items-center gap-1 truncate"><Mail className="size-3 shrink-0" /> <span className="truncate">{lead.email}</span></span>
        )}
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <PriorityBadge priority={lead.priority} className="text-[10px] py-0" />
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-border/70 pt-2 text-[10px] text-muted-foreground">
        <span className="rounded bg-secondary px-1.5 py-0.5">{sourceLabel[lead.source] || lead.source}</span>
        <span className="font-medium text-foreground/80">Created: {dayjs(lead.createdAt || lead.lastContact).format('MMM D, YYYY')}</span>
      </div>
    </Card>
  )
}
