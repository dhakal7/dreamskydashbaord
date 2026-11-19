import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/shared/data-table'
import { Plus, Settings2 } from 'lucide-react'
import { useCommissionRules } from '@/hooks/use-commissions'
import { isMockMode } from '@/lib/api-client'
import { commissionRules as mockRules } from '@/mock'
import type { CommissionRule } from '@/types'
import type { ColumnDef } from '@tanstack/react-table'
import { formatCurrency } from '@/lib/utils'
import { ConfigureCommissionRuleDialog } from './configure-commission-rule-dialog'

function formatDate(value?: string) {
  return value ? dayjs(value).format('MMM D, YYYY') : '—'
}

export function CommissionRulesTabView() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<'COUNSELOR' | 'REFERRAL_AGENT'>('COUNSELOR')

  const { data: apiRulesData } = useCommissionRules()

  const rules: CommissionRule[] = useMemo(() => {
    if (isMockMode()) {
      return mockRules
    }
    const list = Array.isArray(apiRulesData) ? apiRulesData : apiRulesData?.rules || []
    if (list.length === 0) {
      // Fallback standard rules
      return [
        {
          id: 'rule-counselor-std',
          name: 'Standard Counselor Visa Success Rule',
          type: 'fixed' as const,
          value: 50000,
          triggerStage: 'visa_granted' as const,
          effectiveFrom: '2026-01-01T00:00:00.000Z',
          active: true,
          appliesToRole: 'counselor' as const,
        },
        {
          id: 'rule-agent-std',
          name: 'Standard Referral Agent Visa Grant Rule',
          type: 'fixed' as const,
          value: 25000,
          triggerStage: 'visa_granted' as const,
          effectiveFrom: '2026-01-01T00:00:00.000Z',
          active: true,
          appliesToRole: 'referral_agent' as const,
        },
      ]
    }
    return list.map((r: any) => ({
      id: r.id,
      name: r.name || (r.role === 'COUNSELOR' ? 'Counselor Commission Rule' : 'Referral Agent Rule'),
      type: (r.type?.toLowerCase() || 'fixed') as any,
      value: r.fixedAmount || r.amount || r.percentage || 0,
      triggerStage: (r.triggerStage?.toLowerCase() === 'visa_approved' ? 'visa_granted' : (r.triggerStage?.toLowerCase() || 'visa_granted')) as any,
      effectiveFrom: r.effectiveFrom || r.createdAt,
      effectiveTo: r.effectiveTo || undefined,
      active: r.isActive ?? true,
      appliesToRole: (r.role?.toLowerCase() || 'counselor') as any,
      scopeUniversityId: r.scopeUniversityId || undefined,
    }))
  }, [apiRulesData])

  const openCreateFor = (role: 'COUNSELOR' | 'REFERRAL_AGENT') => {
    setEditingRole(role)
    setCreateDialogOpen(true)
  }

  const columns: ColumnDef<CommissionRule>[] = [
    {
      accessorKey: 'name',
      header: 'Rule Name',
      cell: ({ row }) => (
        <div>
          <p className="font-semibold text-foreground">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">
            {row.original.appliesToRole === 'counselor' ? 'Counselor' : 'Referral Agent'}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'appliesToRole',
      header: 'Applies To',
      cell: ({ row }) => (
        <Badge variant={row.original.appliesToRole === 'counselor' ? 'info' : 'outline'}>
          {row.original.appliesToRole === 'counselor' ? 'Counselor' : 'Referral Agent'}
        </Badge>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Rate Type',
      cell: ({ row }) => <span className="capitalize">{row.original.type}</span>,
    },
    {
      accessorKey: 'value',
      header: 'Rate Value',
      cell: ({ row }) => (
        <span className="font-bold text-foreground">
          {row.original.type === 'percentage' ? `${row.original.value}%` : formatCurrency(row.original.value, 'NPR')}
        </span>
      ),
    },
    {
      accessorKey: 'triggerStage',
      header: 'Qualifying Milestone',
      cell: ({ row }) => (
        <Badge variant="outline" className="font-mono text-[11px] capitalize">
          {row.original.triggerStage.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      id: 'effectiveDates',
      header: 'Effective Period',
      cell: ({ row }) => (
        <span className="font-tabular text-xs text-muted-foreground">
          {formatDate(row.original.effectiveFrom)} — {formatDate(row.original.effectiveTo)}
        </span>
      ),
    },
    {
      accessorKey: 'active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.active ? 'success' : 'outline'}>
          {row.original.active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() =>
            openCreateFor(row.original.appliesToRole === 'counselor' ? 'COUNSELOR' : 'REFERRAL_AGENT')
          }
        >
          <Settings2 className="size-3" /> Edit
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      {/* ── Action Header Banner ── */}
      <Card className="p-4 bg-muted/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-sm">Commission Rules Catalog</h3>
            <p className="text-xs text-muted-foreground">
              Define flat or percentage rates, qualifying events (Visa Approval vs. Departure), and effective periods.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => openCreateFor('REFERRAL_AGENT')}
              className="gap-1 text-xs"
            >
              <Plus className="size-3.5" /> Agent Rule
            </Button>
            <Button
              size="sm"
              onClick={() => openCreateFor('COUNSELOR')}
              className="gap-1 text-xs"
            >
              <Plus className="size-3.5" /> Counselor Rule
            </Button>
          </div>
        </div>
      </Card>

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">Total Rules Configured</p>
          <p className="mt-1 text-xl font-semibold font-tabular">{rules.length}</p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">Active Operational Rules</p>
          <p className="mt-1 text-xl font-semibold font-tabular text-emerald-600 dark:text-emerald-400">
            {rules.filter((rule) => rule.active).length}
          </p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">Standard Counselor Rate</p>
          <p className="mt-1 text-xl font-semibold font-tabular text-primary">
            NPR 50,000 <span className="text-xs font-normal text-muted-foreground">/ approved visa</span>
          </p>
        </Card>
      </div>

      {/* ── Rules Table ── */}
      <DataTable columns={columns} data={rules} pageSize={10} />

      {/* ── Configure Commission Rule Modal ── */}
      <ConfigureCommissionRuleDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        defaultRole={editingRole}
      />
    </div>
  )
}
