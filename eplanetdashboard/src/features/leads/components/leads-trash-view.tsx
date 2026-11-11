import { useState, useMemo } from 'react'
import dayjs from 'dayjs'
import {
  RotateCcw,
  Search,
  Trash2,
  AlertCircle,
  Loader2,
  Calendar,
  User,
  MessageSquare,
  ShieldAlert,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTrashLeads, useRestoreLiveLead } from '@/hooks/use-leads-live'
import type { ApiStudent } from '@/api/student-api'

export function LeadsTrashView() {
  const [search, setSearch] = useState('')
  const [restoringLead, setRestoringLead] = useState<ApiStudent | null>(null)

  const { students, isLoading, isError, error, refetch } = useTrashLeads()
  const restoreLeadMutation = useRestoreLiveLead()

  const filteredStudents = useMemo(() => {
    if (!students) return []
    const q = search.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) => {
      const name = `${s.firstName} ${s.lastName}`.toLowerCase()
      const email = (s.email || '').toLowerCase()
      const phone = (s.phone || '').toLowerCase()
      const reason = (s.trashReason || '').toLowerCase()
      return (
        name.includes(q) ||
        email.includes(q) ||
        phone.includes(q) ||
        reason.includes(q)
      )
    })
  }, [students, search])

  const handleConfirmRestore = async () => {
    if (!restoringLead) return
    try {
      await restoreLeadMutation.mutateAsync(restoringLead.id)
      setRestoringLead(null)
    } catch {
      // Mutation handles error toast
    }
  }

  const formatStage = (student: ApiStudent) => {
    const raw = (student.academicBackground as any)?.leadStage || student.leadStage
    if (raw) {
      return String(raw).replace(/_/g, ' ')
    }
    if (student.currentStage === 'PROSPECT') return 'COUNSELLING'
    return student.currentStage || 'NEW'
  }

  return (
    <div className="space-y-4">
      {/* Search and summary bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search trashed leads by name, email, or reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="gap-1 font-tabular">
            <Trash2 className="size-3 text-destructive" />
            {filteredStudents.length} Trashed Lead{filteredStudents.length === 1 ? '' : 's'}
          </Badge>
        </div>
      </div>

      {/* Content states */}
      {isLoading ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="mt-3 text-xs text-muted-foreground font-medium">Loading trashed leads...</p>
        </Card>
      ) : isError ? (
        <Card className="flex flex-col items-center justify-center p-8 text-center border-destructive/20 bg-destructive/5">
          <AlertCircle className="size-8 text-destructive" />
          <p className="mt-2 text-sm font-semibold text-foreground">Failed to load Trash</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-md">
            {error instanceof Error ? error.message : 'An error occurred while fetching deleted leads.'}
          </p>
          <Button size="sm" variant="outline" className="mt-4" onClick={() => refetch()}>
            Retry
          </Button>
        </Card>
      ) : filteredStudents.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-secondary">
            <Trash2 className="size-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-foreground">Trash is empty</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm">
            {search
              ? 'No trashed leads matched your search query.'
              : 'Deleted leads will appear here. Authorized administrators can restore them at any time.'}
          </p>
          {search && (
            <Button size="sm" variant="ghost" className="mt-3 text-xs" onClick={() => setSearch('')}>
              Clear search
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredStudents.map((lead) => {
            const trashedDate = lead.trashedAt || lead.updatedAt
            const priorStage = formatStage(lead)
            const actorName = lead.trashedBy?.name || lead.trashedById || 'Administrator'

            return (
              <Card
                key={lead.id}
                className="flex flex-col gap-3 p-4 transition-colors hover:border-brand-300 dark:hover:border-brand-700 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {lead.firstName} {lead.lastName}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-medium border-border">
                      Prior Stage: {priorStage}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {lead.email && <span className="truncate">{lead.email}</span>}
                    {lead.phone && <span>{lead.phone}</span>}
                    {lead.assignedCounselor && (
                      <span className="inline-flex items-center gap-1">
                        <User className="size-3" />
                        Counselor: {lead.assignedCounselor.firstName} {lead.assignedCounselor.lastName}
                      </span>
                    )}
                  </div>

                  {lead.trashReason && (
                    <div className="flex items-start gap-1.5 pt-1 text-xs text-foreground/90">
                      <MessageSquare className="size-3.5 shrink-0 text-muted-foreground mt-0.5" />
                      <span className="italic bg-secondary/40 px-2 py-0.5 rounded text-[11px]">
                        "{lead.trashReason}"
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-0.5">
                    {trashedDate && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3" />
                        Deleted {dayjs(trashedDate).format('MMM D, YYYY h:mm A')}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <ShieldAlert className="size-3" />
                      Deleted by: {actorName}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-end pt-2 sm:pt-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-950/50 dark:hover:text-brand-300"
                    onClick={() => setRestoringLead(lead)}
                  >
                    <RotateCcw className="size-3.5" />
                    Restore Lead
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Restore Confirmation Dialog */}
      <Dialog open={Boolean(restoringLead)} onOpenChange={(open) => !open && setRestoringLead(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-2.5 text-primary">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                <RotateCcw className="size-5 text-primary" />
              </div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Restore Lead
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to restore{' '}
              <span className="font-semibold text-foreground">
                {restoringLead?.firstName} {restoringLead?.lastName}
              </span>{' '}
              to the active Leads pipeline?
            </DialogDescription>
          </DialogHeader>

          {restoringLead && (
            <div className="my-2 rounded-lg border border-border bg-secondary/30 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prior Pipeline Stage:</span>
                <span className="font-medium text-foreground">{formatStage(restoringLead)}</span>
              </div>
              {restoringLead.trashReason && (
                <div className="flex flex-col gap-0.5 pt-1 border-t border-border/50">
                  <span className="text-muted-foreground">Original Trash Reason:</span>
                  <span className="italic text-foreground/90 font-mono text-[11px]">
                    "{restoringLead.trashReason}"
                  </span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRestoringLead(null)}
              disabled={restoreLeadMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmRestore}
              disabled={restoreLeadMutation.isPending}
              className="gap-1.5"
            >
              {restoreLeadMutation.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Restoring...
                </>
              ) : (
                <>
                  <RotateCcw className="size-3.5" />
                  Confirm Restore
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
