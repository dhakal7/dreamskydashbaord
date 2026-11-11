import { useMemo, useState } from 'react'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useSensor, useSensors, useDroppable,
  type DragEndEvent, type DragStartEvent, type CollisionDetection,
} from '@dnd-kit/core'
import { RotateCcw, Phone } from 'lucide-react'
import type { Lead, LeadStage } from '@/types'
import { leadStageMeta } from '@/components/shared/status-badges'
import { LeadCard, LeadCardOverlay } from './lead-card'
import { FollowUpScheduleDialog } from './follow-up-schedule-dialog'
import { TrashLeadDialog } from './trash-lead-dialog'
import { AssignCounselorDialog } from './assign-counselor-dialog'
import { useAuthStore } from '@/store/auth-store'
import { useTrashLeads, useDeleteLiveLead, useRestoreLiveLead } from '@/hooks/use-leads-live'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface LeadsPipelineProps {
  leads: Lead[]
  onMove: (id: string, stage: LeadStage) => void
  canChangeStage: boolean
}

const customCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args)
  if (pointerCollisions.length > 0) {
    return pointerCollisions
  }
  return rectIntersection(args)
}

export function LeadsPipeline({ leads, onMove, canChangeStage }: LeadsPipelineProps) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const deleteLiveLead = useDeleteLiveLead()
  const restoreLiveLead = useRestoreLiveLead()
  const { students: trashedStudents } = useTrashLeads()

  const [activeLead, setActiveLead] = useState<Lead | null>(null)
  const [followUpLead, setFollowUpLead] = useState<Lead | null>(null)
  const [trashLead, setTrashLead] = useState<Lead | null>(null)
  const [assignLead, setAssignLead] = useState<Lead | null>(null)

  // Optimistic override map: leadId → overridden stage (shown immediately on drag, reset after refetch)
  const [optimisticStages, setOptimisticStages] = useState<Record<string, LeadStage>>({})

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  )

  // Dynamically configure pipeline columns based on role
  const pipelineStages: LeadStage[] = useMemo(() => {
    if (currentUser.role === 'front_desk') {
      return ['new', 'follow_up', 'assigned', 'not_contracted', 'trash']
    }
    if (currentUser.role === 'counselor') {
      return ['assigned', 'follow_up', 'interested', 'trash']
    }
    return ['new', 'follow_up', 'assigned', 'interested', 'not_contracted', 'trash']
  }, [currentUser.role])

  // Adapt trashed students to Lead shape for the Trash column
  const trashedLeads: Array<Lead & { trashReason?: string }> = useMemo(() => {
    return (trashedStudents || []).map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`.trim(),
      email: s.email || '',
      phone: s.phone || '',
      photoColor: '#94a3b8',
      source: 'walk_in',
      stage: 'trash' as LeadStage,
      counselorId: s.assignedCounselorId || '',
      counselorName: s.assignedCounselor ? `${s.assignedCounselor.firstName} ${s.assignedCounselor.lastName}`.trim() : 'Unassigned',
      interestedCountry: '',
      interestedLevel: 'bachelor',
      priority: 'low',
      notes: '',
      nextFollowUp: '',
      value: 0,
      createdAt: s.createdAt,
      lastContact: s.updatedAt,
      trashReason: s.trashReason || undefined,
    }))
  }, [trashedStudents])

  // Merge optimistic overrides into the leads list so UI updates instantly
  const effectiveLeads = useMemo(() => {
    if (Object.keys(optimisticStages).length === 0) return leads
    return leads.map((l) =>
      optimisticStages[l.id] !== undefined ? { ...l, stage: optimisticStages[l.id] } : l
    )
  }, [leads, optimisticStages])

  const columns = useMemo(() => {
    const map = new Map<LeadStage, Array<Lead & { trashReason?: string }>>()
    pipelineStages.forEach((s) => map.set(s, []))

    effectiveLeads.forEach((l) => {
      let stageKey = l.stage
      // Counselor pipeline: counseling aliases to assigned; omit new and not_contracted
      if (currentUser.role === 'counselor') {
        if (stageKey === 'counseling') stageKey = 'assigned'
        if (stageKey === 'new' || stageKey === 'not_contracted') return
      }
      if (map.has(stageKey)) {
        map.get(stageKey)!.push(l)
      }
    })

    if (map.has('trash')) {
      map.set('trash', trashedLeads)
    }

    return map
  }, [effectiveLeads, pipelineStages, currentUser.role, trashedLeads])

  function handleDragStart(event: DragStartEvent) {
    const lead = leads.find((l) => l.id === event.active.id)
    setActiveLead(lead ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveLead(null)
    const { active, over } = event
    if (!over) return

    const activeLeadId = String(active.id)
    let overStage: LeadStage | undefined

    if (pipelineStages.includes(over.id as LeadStage)) {
      overStage = over.id as LeadStage
    } else {
      const overLead = effectiveLeads.find((l) => l.id === over.id)
      if (overLead) {
        overStage = overLead.stage
      } else if (over.data?.current?.stage) {
        overStage = over.data.current.stage as LeadStage
      }
    }

    if (!overStage) return

    const activeLeadObj = effectiveLeads.find((l) => l.id === activeLeadId)
    if (activeLeadObj && activeLeadObj.stage !== overStage) {
      if (overStage === 'trash') {
        setTrashLead(activeLeadObj)
        return
      }
      if (overStage === 'follow_up') {
        setFollowUpLead(activeLeadObj)
        return
      }
      if (overStage === 'assigned' && !activeLeadObj.counselorId && currentUser.role === 'front_desk') {
        setAssignLead(activeLeadObj)
        return
      }

      setOptimisticStages((prev) => ({ ...prev, [activeLeadId]: overStage! }))
      onMove(activeLeadId, overStage)
      setTimeout(() => {
        setOptimisticStages((prev) => {
          const next = { ...prev }
          delete next[activeLeadId]
          return next
        })
      }, 3000)
    }
  }

  const handleConfirmTrash = async (reason: string) => {
    if (!trashLead) return
    await deleteLiveLead.mutateAsync({ id: trashLead.id, reason })
    setTrashLead(null)
  }

  const handleRestore = async (id: string) => {
    await restoreLiveLead.mutateAsync(id)
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={customCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3.5 overflow-x-auto pb-3">
          {pipelineStages.map((stage) =>
            canChangeStage ? (
              <PipelineColumn
                key={stage}
                stage={stage}
                leads={columns.get(stage) ?? []}
                onMove={onMove}
                onScheduleFollowUp={setFollowUpLead}
                onRestore={handleRestore}
              />
            ) : (
              <PipelineColumnStatic
                key={stage}
                stage={stage}
                leads={columns.get(stage) ?? []}
                onMove={onMove}
                onScheduleFollowUp={setFollowUpLead}
                onRestore={handleRestore}
              />
            )
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeLead && <LeadCardOverlay lead={activeLead} />}
        </DragOverlay>
      </DndContext>

      <FollowUpScheduleDialog
        open={Boolean(followUpLead)}
        onOpenChange={(open) => !open && setFollowUpLead(null)}
        lead={followUpLead}
      />

      <TrashLeadDialog
        open={Boolean(trashLead)}
        onOpenChange={(open) => !open && setTrashLead(null)}
        lead={trashLead}
        onConfirm={handleConfirmTrash}
        isSubmitting={deleteLiveLead.isPending}
      />

      <AssignCounselorDialog
        open={Boolean(assignLead)}
        onOpenChange={(open) => !open && setAssignLead(null)}
        lead={assignLead}
      />
    </>
  )
}

function PipelineColumn({
  stage,
  leads,
  onMove,
  onScheduleFollowUp,
  onRestore,
}: {
  stage: LeadStage
  leads: Array<Lead & { trashReason?: string }>
  onMove: (id: string, stage: LeadStage) => void
  onScheduleFollowUp?: (lead: Lead) => void
  onRestore?: (id: string) => void
}) {
  const meta = leadStageMeta[stage] ?? {
    label: stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    variant: 'slate' as const,
  }
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const isTrash = stage === 'trash'

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl border border-border bg-secondary/40',
        isOver && 'border-primary/50 bg-brand-50/60 dark:bg-brand-500/5',
        isTrash && 'border-dashed border-red-300/80 dark:border-red-900/50 bg-red-50/20 dark:bg-red-950/10'
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full', badgeDot[meta.variant] || 'bg-slate-400')} />
          <span className="text-[13px] font-semibold">{meta.label}</span>
          <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground font-tabular">
            {leads.length}
          </span>
        </div>
      </div>

      <div className="flex min-h-[200px] flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-3">
        {leads.map((lead) =>
          isTrash ? (
            <TrashedLeadMiniCard key={lead.id} lead={lead} onRestore={onRestore} />
          ) : (
            <LeadCard
              key={lead.id}
              lead={lead}
              canDrag
              onMove={onMove}
              onScheduleFollowUp={onScheduleFollowUp}
            />
          )
        )}
        {leads.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/70 py-8 text-[11px] text-muted-foreground">
            {isTrash ? 'Drop leads here to Trash' : 'Drop leads here'}
          </div>
        )}
      </div>
    </div>
  )
}

function PipelineColumnStatic({
  stage,
  leads,
  onMove,
  onScheduleFollowUp,
  onRestore,
}: {
  stage: LeadStage
  leads: Array<Lead & { trashReason?: string }>
  onMove: (id: string, stage: LeadStage) => void
  onScheduleFollowUp?: (lead: Lead) => void
  onRestore?: (id: string) => void
}) {
  const meta = leadStageMeta[stage] ?? {
    label: stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    variant: 'slate' as const,
  }
  const isTrash = stage === 'trash'

  return (
    <div className={cn(
      'flex w-72 shrink-0 flex-col rounded-xl border border-border bg-secondary/40',
      isTrash && 'border-dashed border-red-300/80 dark:border-red-900/50 bg-red-50/20 dark:bg-red-950/10'
    )}>
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full', badgeDot[meta.variant] || 'bg-slate-400')} />
          <span className="text-[13px] font-semibold">{meta.label}</span>
          <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground font-tabular">
            {leads.length}
          </span>
        </div>
      </div>

      <div className="flex min-h-[200px] flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-3">
        {leads.map((lead) =>
          isTrash ? (
            <TrashedLeadMiniCard key={lead.id} lead={lead} onRestore={onRestore} />
          ) : (
            <LeadCard
              key={lead.id}
              lead={lead}
              canDrag={false}
              onMove={onMove}
              onScheduleFollowUp={onScheduleFollowUp}
            />
          )
        )}
        {leads.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/70 py-8 text-[11px] text-muted-foreground">
            {isTrash ? 'No trashed leads' : 'No leads in this stage'}
          </div>
        )}
      </div>
    </div>
  )
}

function TrashedLeadMiniCard({
  lead,
  onRestore,
}: {
  lead: Lead & { trashReason?: string }
  onRestore?: (id: string) => void
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-background p-2.5 shadow-sm space-y-1.5">
      <div className="flex items-center justify-between gap-1">
        <p className="text-xs font-semibold truncate">{lead.name}</p>
        {onRestore && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px] text-brand-600 hover:text-brand-700 hover:bg-brand-50"
            onClick={() => onRestore(lead.id)}
          >
            <RotateCcw className="size-3 mr-1" /> Restore
          </Button>
        )}
      </div>
      {lead.phone && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Phone className="size-2.5" /> {lead.phone}
        </p>
      )}
      {lead.trashReason && (
        <div className="rounded bg-muted/60 p-1 text-[10px] text-muted-foreground italic truncate" title={lead.trashReason}>
          "{lead.trashReason}"
        </div>
      )}
    </div>
  )
}

const badgeDot: Record<string, string> = {
  default: 'bg-brand-600', secondary: 'bg-slate-400', success: 'bg-success-500',
  warning: 'bg-warning-500', info: 'bg-brand-500', slate: 'bg-slate-400',
}
