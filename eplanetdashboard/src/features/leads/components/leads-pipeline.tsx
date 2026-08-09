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
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 0 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 0, tolerance: 5 } })
  )

  const columns = useMemo(() => {
    const map = new Map<LeadStage, Lead[]>()
    PIPELINE_STAGES.forEach((s) => map.set(s, []))
    leads.forEach((l) => {
      if (map.has(l.stage)) {
        map.get(l.stage)!.push(l)
      }
    })
    return map
  }, [leads])

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
      const overLead = leads.find((l) => l.id === over.id)
      if (overLead) {
        overStage = overLead.stage
      } else if (over.data?.current?.stage) {
        overStage = over.data.current.stage as LeadStage
      }
    }

    if (!overStage) return

    const activeLeadObj = leads.find((l) => l.id === activeLeadId)
    if (activeLeadObj && activeLeadObj.stage !== overStage) {
      onMove(activeLeadId, overStage)
    }
  }

  if (!canChangeStage) {
    return (
      <div className="flex gap-3.5 overflow-x-auto pb-3">
        {PIPELINE_STAGES.map((stage) => (
          <PipelineColumnStatic key={stage} stage={stage} leads={columns.get(stage) ?? []} />
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
          <PipelineColumn key={stage} stage={stage} leads={columns.get(stage) ?? []} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeLead && <LeadCardOverlay lead={activeLead} />}
      </DragOverlay>
    </DndContext>
  )
}

function PipelineColumn({ stage, leads }: { stage: LeadStage; leads: Lead[] }) {
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
          <LeadCard key={lead.id} lead={lead} canDrag />
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

function PipelineColumnStatic({ stage, leads }: { stage: LeadStage; leads: Lead[] }) {
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
          <LeadCard key={lead.id} lead={lead} canDrag={false} />
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
