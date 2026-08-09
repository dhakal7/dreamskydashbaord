import dayjs from 'dayjs'
import { PageHeader } from '@/components/shared/page-header'
import { Card } from '@/components/ui/card'
import { DataTable } from '@/components/shared/data-table'
import { commissionRules } from '@/mock'
import { useAuthStore } from '@/store/auth-store'
import type { CommissionRule } from '@/types'
import type { ColumnDef } from '@tanstack/react-table'

function formatDate(value?: string) {
  return value ? dayjs(value).format('MMM D, YYYY') : '—'
}

export default function CommissionRulesPage() {
  const currentUser = useAuthStore((s) => s.currentUser)

  if (currentUser.role !== 'super_admin') {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Commission Rules"
          description="Only super admins can review the full commission rule catalog."
        />
        <Card className="p-8 text-center text-sm text-muted-foreground">
          You do not have permission to view this page.
        </Card>
      </div>
    )
  }

  const columns: ColumnDef<CommissionRule>[] = [
    {
      accessorKey: 'name',
      header: 'Rule Name',
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">{row.original.appliesToRole === 'counselor' ? 'Counselor' : 'Referral Agent'}</p>
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => <span className="capitalize">{row.original.type}</span>,
    },
    {
      accessorKey: 'triggerStage',
      header: 'Trigger Stage',
      cell: ({ row }) => <span className="capitalize">{row.original.triggerStage.replace(/_/g, ' ')}</span>,
    },
    {
      id: 'effectiveDates',
      header: 'Effective Dates',
      cell: ({ row }) => (
        <span className="font-tabular">
          {formatDate(row.original.effectiveFrom)} — {formatDate(row.original.effectiveTo)}
        </span>
      ),
    },
    {
      accessorKey: 'active',
      header: 'Active',
      cell: ({ row }) => (
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${row.original.active ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
          {row.original.active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Commission Rules"
        description="Read-only rule catalog. Rule snapshots remain immutable once a commission is generated."
      />

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">Total Rules</p>
          <p className="mt-1 text-xl font-semibold font-tabular">{commissionRules.length}</p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">Active</p>
          <p className="mt-1 text-xl font-semibold font-tabular">{commissionRules.filter((rule) => rule.active).length}</p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">Legacy / Inactive</p>
          <p className="mt-1 text-xl font-semibold font-tabular">{commissionRules.filter((rule) => !rule.active).length}</p>
        </Card>
      </div>

      <DataTable columns={columns} data={commissionRules} pageSize={10} />
    </div>
  )
}
