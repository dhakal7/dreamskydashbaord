import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { LayoutGrid, Plus, Table2, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { DataTable } from '@/components/shared/data-table'
import { useLeadsStore } from './store'
import { getLeadColumns } from './components/lead-columns'
import { LeadsPipeline } from './components/leads-pipeline'
import { LeadFiltersBar, defaultLeadFilters, type LeadFilters } from './components/lead-filters'
import { LeadFormDialog } from './components/lead-form-dialog'
import { LeadsTrashView } from './components/leads-trash-view'
import { useAuthStore } from '@/store/auth-store'
import { visibleLeads } from '@/lib/data-visibility'
import { hasPermission } from '@/lib/rbac'
import { isMockMode } from '@/lib/api-client'
import { useLiveLeads, useMoveLiveLead } from '@/hooks/use-leads-live'
import type { Lead, LeadStage } from '@/types'

type ViewMode = 'table' | 'pipeline' | 'trash'

export default function LeadsPage() {
  const mockLeads = useLeadsStore((s) => s.leads)
  const moveMockLead = useLeadsStore((s) => s.moveLead)
  const currentUser = useAuthStore((s) => s.currentUser)
  const [view, setView] = useState<ViewMode>('pipeline')
  const [filters, setFilters] = useState<LeadFilters>(defaultLeadFilters)
  const [isLeadDialogOpen, setIsLeadDialogOpen] = useState(false)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)

  // Live mode: fetch LEAD/PROSPECT students from backend
  const {
    leads: liveLeads,
    totalCount: liveTotalCount,
    isError: isLiveError,
    error: liveError,
    refetch: refetchLiveLeads,
  } = useLiveLeads()
  const moveLiveLead = useMoveLiveLead()

  // Merge: use live data in real mode, mock data in mock mode
  const leads = isMockMode() ? mockLeads : liveLeads

  const handleMove = (id: string, stage: LeadStage) => {
    if (isMockMode()) {
      moveMockLead(id, stage)
    } else {
      moveLiveLead.mutate({ id, stage })
    }
  }

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return visibleLeads(currentUser, leads, { verifiedBranchScopedApi: !isMockMode() }).filter((l) => {
      if (q && !`${l.name} ${l.email} ${l.phone}`.toLowerCase().includes(q)) return false
      if (filters.stage !== 'all' && l.stage !== filters.stage) return false
      if (filters.source !== 'all' && l.source !== filters.source) return false
      if (filters.priority !== 'all' && l.priority !== filters.priority) return false
      if (filters.counselorId !== 'all' && l.counselorId !== filters.counselorId) return false
      return true
    })
  }, [currentUser, leads, filters])

  const totalLeadsCount = isMockMode() ? filtered.length : liveTotalCount
  const recentLeadsCount = useMemo(() => {
    const thirtyDaysAgo = dayjs().subtract(30, 'day')
    return leads.filter((l) => dayjs(l.createdAt || l.lastContact).isAfter(thirtyDaysAgo)).length
  }, [leads])

  const hotLeads = filtered.filter((l) => l.priority === 'urgent' || l.priority === 'high').length
  const canChangeStage = hasPermission(currentUser.role, 'leads.change-stage')
  const canManageLeads = hasPermission(currentUser.role, 'leads.manage')
  const canAccessTrash =
    currentUser.role === 'super_admin' ||
    currentUser.role === 'branch_admin' ||
    currentUser.role === 'front_desk' ||
    currentUser.role === 'counselor'
  const showLiveErrorState = !isMockMode() && isLiveError

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leads"
        description="Track and convert prospective students through your pipeline."
        actions={
          canManageLeads ? (
            <Button size="sm" onClick={() => setIsLeadDialogOpen(true)}>
              <Plus /> Add Lead
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">Total Leads (All Time)</p>
          <p className="mt-1 text-xl font-semibold font-tabular">{showLiveErrorState ? '—' : totalLeadsCount}</p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">New (Last 30 Days)</p>
          <p className="mt-1 text-xl font-semibold font-tabular text-brand-600 dark:text-brand-400">{showLiveErrorState ? '—' : recentLeadsCount}</p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">High / Urgent</p>
          <p className="mt-1 text-xl font-semibold font-tabular">{showLiveErrorState ? '—' : hotLeads}</p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">Won This Month</p>
          <p className="mt-1 text-xl font-semibold font-tabular">{showLiveErrorState ? '—' : filtered.filter((l) => l.stage === 'completed').length}</p>
        </Card>
      </div>

      {showLiveErrorState && view !== 'trash' && (
        <Card className="p-4 border-destructive/40 bg-destructive/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-destructive">Failed to load leads</p>
            <p className="text-xs text-muted-foreground">
              {(liveError as Error)?.message || 'Unable to fetch leads from the server.'}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetchLiveLeads()}>
            Retry
          </Button>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {view !== 'trash' ? (
          <LeadFiltersBar filters={filters} onChange={setFilters} />
        ) : (
          <div className="text-xs text-muted-foreground italic">
            Trash view: showing soft-deleted leads scoped to your branch authorization.
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-secondary/50 p-1">
          <button
            onClick={() => setView('pipeline')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              view === 'pipeline' ? 'bg-background shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <LayoutGrid className="size-3.5" /> Pipeline
          </button>
          <button
            onClick={() => setView('table')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              view === 'table' ? 'bg-background shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Table2 className="size-3.5" /> Table
          </button>
          {canAccessTrash && (
            <button
              onClick={() => setView('trash')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                view === 'trash' ? 'bg-background shadow-soft text-destructive font-semibold' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Trash2 className="size-3.5" /> Trash
            </button>
          )}
        </div>
      </div>

      {view === 'trash' ? (
        <LeadsTrashView />
      ) : view === 'pipeline' ? (
        <LeadsPipeline leads={filtered} onMove={handleMove} canChangeStage={canChangeStage} />
      ) : (
        <DataTable
          columns={getLeadColumns((lead) => setEditingLead(lead))}
          data={filtered}
          enableRowSelection
          pageSize={10}
          onRowClick={(lead) => setEditingLead(lead)}
        />
      )}

      <LeadFormDialog
        open={isLeadDialogOpen || Boolean(editingLead)}
        onOpenChange={(open) => {
          if (!open) {
            setIsLeadDialogOpen(false)
            setEditingLead(null)
          } else {
            setIsLeadDialogOpen(true)
          }
        }}
        leadToEdit={editingLead}
      />
    </div>
  )
}
