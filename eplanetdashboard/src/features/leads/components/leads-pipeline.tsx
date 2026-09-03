import { useMemo, useState } from 'react'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useSensor, useSensors, useDroppable,
  type DragEndEvent, type DragStartEvent, type CollisionDetection,
} from '@dnd-kit/core'
import type { Lead, LeadStage } from '@/types'
import { leadStageMeta } from '@/components/shared/status-badges'
import { LeadCard, LeadCardOverlay } from './lead-card'
import { cn } from '@/lib/utils'

// Pipeline only shows the first 4 stages; after 'interested' leads are converted to students.
const PIPELINE_STAGES: LeadStage[] = ['new', 'contacted', 'counseling', 'interested']

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
  const [activeLead, setActiveLead] = useState<Lead | null>(null)
  // Optimistic override map: leadId → overridden stage (shown immediately on drag, reset after refetch)
  const [optimisticStages, setOptimisticStages] = useState<Record<string, LeadStage>>({})

  const sensors = useSensors(
    // distance: 5 prevents a plain click from starting a drag
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  )

  // Merge optimistic overrides into the leads list so UI updates instantly
  const effectiveLeads = useMemo(() => {
    if (Object.keys(optimisticStages).length === 0) return leads
    return leads.map((l) =>
      optimisticStages[l.id] !== undefined ? { ...l, stage: optimisticStages[l.id] } : l
    )
  }, [leads, optimisticStages])

  const columns = useMemo(() => {
    const map = new Map<LeadStage, Lead[]>()
    PIPELINE_STAGES.forEach((s) => map.set(s, []))
    effectiveLeads.forEach((l) => {
      if (map.has(l.stage)) {
        map.get(l.stage)!.push(l)
      }
    })
    return map
  }, [effectiveLeads])

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

    if (PIPELINE_STAGES.includes(over.id as LeadStage)) {
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
      // Apply optimistic update immediately so the card visually jumps to new column
      setOptimisticStages((prev) => ({ ...prev, [activeLeadId]: overStage! }))
      onMove(activeLeadId, overStage)
      // Clear optimistic override after a short delay (React Query will refetch and replace)
      setTimeout(() => {
        setOptimisticStages((prev) => {
          const next = { ...prev }
          delete next[activeLeadId]
          return next
        })
      }, 3000)
    }
  }

  if (!canChangeStage) {
    return (
      <div className="flex gap-3.5 overflow-x-auto pb-3">
        {PIPELINE_STAGES.map((stage) => (
          <PipelineColumnStatic key={stage} stage={stage} leads={columns.get(stage) ?? []} onMove={onMove} />
        ))}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3.5 overflow-x-auto pb-3">
        {PIPELINE_STAGES.map((stage) => (
          <PipelineColumn key={stage} stage={stage} leads={columns.get(stage) ?? []} onMove={onMove} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeLead && <LeadCardOverlay lead={activeLead} />}
      </DragOverlay>
    </DndContext>
  )
}

function PipelineColumn({ stage, leads, onMove }: { stage: LeadStage; leads: Lead[]; onMove: (id: string, stage: LeadStage) => void }) {
  const meta = leadStageMeta[stage] ?? {
    label: stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    variant: 'slate' as const,
  }
  const { setNodeRef, isOver } = useDroppable({ id: stage })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl border border-border bg-secondary/40',
        isOver && 'border-primary/50 bg-brand-50/60 dark:bg-brand-500/5'
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full', badgeDot[meta.variant])} />
          <span className="text-[13px] font-semibold">{meta.label}</span>
          <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground font-tabular">
            {leads.length}
          </span>
        </div>
      </div>

      <div className="flex min-h-[200px] flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-3">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} canDrag onMove={onMove} />
        ))}
        {leads.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/70 py-8 text-[11px] text-muted-foreground">
            Drop leads here
          </div>
        )}
      </div>
    </div>
  )
}

function PipelineColumnStatic({ stage, leads, onMove }: { stage: LeadStage; leads: Lead[]; onMove: (id: string, stage: LeadStage) => void }) {
  const meta = leadStageMeta[stage] ?? {
    label: stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    variant: 'slate' as const,
  }

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-secondary/40">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full', badgeDot[meta.variant])} />
          <span className="text-[13px] font-semibold">{meta.label}</span>
          <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground font-tabular">
            {leads.length}
          </span>
        </div>
      </div>

      <div className="flex min-h-[200px] flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-3">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} canDrag={false} onMove={onMove} />
        ))}
        {leads.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/70 py-8 text-[11px] text-muted-foreground">
            No leads in this stage
          </div>
        )}
      </div>
    </div>
  )
}

const badgeDot: Record<string, string> = {
  default: 'bg-brand-600', secondary: 'bg-slate-400', success: 'bg-success-500',
  warning: 'bg-warning-500', info: 'bg-brand-500', slate: 'bg-slate-400',
}
