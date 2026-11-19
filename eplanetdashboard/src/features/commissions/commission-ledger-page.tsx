import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { Filter, Users, UserCheck, Calendar, Receipt } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DataTable } from '@/components/shared/data-table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCommissionStore } from './store'
import { useAuthStore } from '@/store/auth-store'
import type { Commission, CommissionStatus } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { useCommissions, useMarkCommissionPaid } from '@/hooks/use-commissions'
import { isMockMode } from '@/lib/api-client'
import { visibleCommissions as filterVisibleCommissions } from '@/lib/data-visibility'
import { CounselorProfileView } from './components/counselor-profile-view'
import { AgentProfileView } from './components/agent-profile-view'
import { AnnualSettlementView } from './components/annual-settlement-view'

const statusOptions: Array<'all' | CommissionStatus> = ['all', 'pending', 'approved', 'paid', 'disputed']
const earnerTypeOptions: Array<'all' | Commission['earnerType']> = ['all', 'counselor', 'referral_agent']

function formatDate(value?: string) {
  return value ? dayjs(value).format('MMM D, YYYY') : '—'
}

export default function CommissionLedgerPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const isCounselor = currentUser?.role === 'counselor'
  const isAgent = currentUser?.role === 'referral_agent'
  const isAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'branch_admin'

  const defaultTab = isCounselor ? 'counselors' : isAgent ? 'agents' : 'ledger'
  const [activeTab, setActiveTab] = useState(defaultTab)

  const mockCommissions = useCommissionStore((s) => s.commissions)
  const { data: apiCommissions } = useCommissions()
  const markPaidMutation = useMarkCommissionPaid()
  const updateCommissionStatus = useCommissionStore((s) => s.updateCommissionStatus)

  const apiCommissionsList = Array.isArray(apiCommissions) ? apiCommissions : []

  const commissions: Commission[] = !isMockMode()
    ? apiCommissionsList.map((c) => {
        const rawRule = (c as any).rule
        const resolvedBranchId =
          typeof (c.recipient as any)?.branchId === 'string' && (c.recipient as any).branchId.trim().length > 0
            ? (c.recipient as any).branchId
            : typeof rawRule?.scopeBranchId === 'string' && rawRule.scopeBranchId.trim().length > 0
              ? rawRule.scopeBranchId
              : typeof rawRule?.scopeBranch?.id === 'string' && rawRule.scopeBranch.id.trim().length > 0
                ? rawRule.scopeBranch.id
                : undefined
        return {
          id: c.id,
          ruleId: c.ruleId ?? 'rule-1',
          earnerId: c.recipientId,
          earnerName: c.recipient ? `${c.recipient.firstName} ${c.recipient.lastName}` : 'Recipient',
          earnerType: ((c.recipient as any)?.role === 'REFERRAL_AGENT' ? 'referral_agent' : 'counselor') as any,
          studentId: c.studentId,
          studentName: c.student ? `${c.student.firstName} ${c.student.lastName}` : 'Student',
          ruleSnapshot: {
            id: c.ruleSnapshot?.id ?? c.ruleId ?? 'rule-1',
            name: c.ruleSnapshot?.name ?? 'Standard Rule',
            type: (c.ruleSnapshot?.type ?? 'counselor_flat') as any,
            amountType: (c.ruleSnapshot?.amountType ?? 'flat') as any,
            amountValue: c.ruleSnapshot?.amount ?? c.amount ?? 0,
            value: c.ruleSnapshot?.amount ?? c.amount ?? 0,
            triggerStage: (c.ruleSnapshot?.triggerStage ?? 'submitted') as any,
          },
          amountUsd: c.amount,
          status: c.status.toLowerCase() as CommissionStatus,
          generatedAt: c.generatedAt,
          paidAt: c.paidAt ?? undefined,
          milestoneStatus: 'pending' as const,
          ...(resolvedBranchId ? { branchId: resolvedBranchId } : {}),
        } as Commission
      })
    : mockCommissions

  const [statusFilterValue, setStatusFilterValue] = useState<'all' | CommissionStatus>('all')
  const [earnerTypeFilterValue, setEarnerTypeFilterValue] = useState<'all' | Commission['earnerType']>('all')

  const visibleCommissions = useMemo(() => {
    const scoped = filterVisibleCommissions(currentUser, commissions, { verifiedBranchScopedApi: !isMockMode() })
    return scoped.filter((commission) => {
      if (statusFilterValue !== 'all' && commission.status !== statusFilterValue) return false
      if (earnerTypeFilterValue !== 'all' && commission.earnerType !== earnerTypeFilterValue) return false
      return true
    })
  }, [commissions, currentUser, earnerTypeFilterValue, statusFilterValue])

  const totalAmount = visibleCommissions.reduce((sum, commission) => sum + commission.amountUsd, 0)
  const pendingCount = visibleCommissions.filter((commission) => commission.status === 'pending').length
  const paidCount = visibleCommissions.filter((commission) => commission.status === 'paid').length

  function markPaid(commissionId: string) {
    updateCommissionStatus(commissionId, 'paid')
    markPaidMutation.mutate(commissionId)
  }

  const columns: ColumnDef<Commission>[] = [
    {
      accessorKey: 'earnerName',
      header: 'Earner',
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.earnerName}</p>
          <p className="text-xs text-muted-foreground">
            {row.original.earnerType === 'counselor' ? 'Counselor' : 'Referral Agent'}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'studentName',
      header: 'Student',
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.studentName}</p>
          <p className="text-xs text-muted-foreground">{row.original.studentId}</p>
        </div>
      ),
    },
    {
      accessorFn: (row) => row.ruleSnapshot.name,
      id: 'ruleName',
      header: 'Rule Name',
      cell: ({ row }) => <span className="font-medium">{row.original.ruleSnapshot.name}</span>,
    },
    {
      accessorKey: 'amountUsd',
      header: 'Amount',
      cell: ({ row }) => <span className="font-medium font-tabular">{formatCurrency(row.original.amountUsd)}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status
        const classes = status === 'paid'
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : status === 'approved'
            ? 'bg-sky-500/10 text-sky-700 dark:text-sky-400'
            : status === 'disputed'
              ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
              : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
        return <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${classes}`}>{status}</span>
      },
    },
    {
      accessorKey: 'generatedAt',
      header: 'Generated Date',
      cell: ({ row }) => <span className="font-tabular">{formatDate(row.original.generatedAt)}</span>,
    },
    {
      accessorKey: 'paidAt',
      header: 'Paid Date',
      cell: ({ row }) => <span className="font-tabular">{formatDate(row.original.paidAt)}</span>,
    },
    ...(currentUser.role === 'super_admin'
      ? [{
          id: 'actions',
          header: 'Actions',
          cell: ({ row }: { row: { original: Commission } }) => (
            <Button
              size="sm"
              variant="outline"
              disabled={row.original.status === 'paid'}
              onClick={() => markPaid(row.original.id)}
            >
              Mark Paid
            </Button>
          ),
        }] as ColumnDef<Commission>[]
      : []),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Commission Management"
        description="Performance funnels, visa-approval commissions, individual counselor & agent profiles, and annual settlements."
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 max-w-2xl">
          <TabsTrigger value="ledger" className="gap-2">
            <Receipt className="size-4" />
            <span className="hidden sm:inline">Transactions</span> Ledger
          </TabsTrigger>
          <TabsTrigger value="counselors" className="gap-2">
            <Users className="size-4" />
            Counselor Profiles
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-2">
            <UserCheck className="size-4" />
            Referral Agents
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="settlements" className="gap-2">
              <Calendar className="size-4" />
              Annual Settlement
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Tab 1: Ledger ── */}
        <TabsContent value="ledger" className="space-y-5 pt-4">
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            <Card className="p-3.5">
              <p className="text-xs text-muted-foreground">Visible Records</p>
              <p className="mt-1 text-xl font-semibold font-tabular">{visibleCommissions.length}</p>
            </Card>
            <Card className="p-3.5">
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="mt-1 text-xl font-semibold font-tabular">{pendingCount}</p>
            </Card>
            <Card className="p-3.5">
              <p className="text-xs text-muted-foreground">Paid</p>
              <p className="mt-1 text-xl font-semibold font-tabular">{paidCount}</p>
            </Card>
            <Card className="p-3.5">
              <p className="text-xs text-muted-foreground">Total Value</p>
              <p className="mt-1 text-xl font-semibold font-tabular">{formatCurrency(totalAmount)}</p>
            </Card>
          </div>

          <Card className="p-3.5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Filter className="size-4" />
                Filters
              </div>
              <Select value={statusFilterValue} onValueChange={(value) => setStatusFilterValue(value as 'all' | CommissionStatus)}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option} value={option}>{option === 'all' ? 'All statuses' : option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={earnerTypeFilterValue} onValueChange={(value) => setEarnerTypeFilterValue(value as 'all' | Commission['earnerType'])}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Earner type" />
                </SelectTrigger>
                <SelectContent>
                  {earnerTypeOptions.map((option) => (
                    <SelectItem key={option} value={option}>{option === 'all' ? 'All earners' : option === 'counselor' ? 'Counselor' : 'Referral Agent'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>

          <DataTable
            columns={columns}
            data={visibleCommissions}
            pageSize={10}
            emptyState={<span>No commission records match the current filters.</span>}
          />
        </TabsContent>

        {/* ── Tab 2: Counselor Profiles ── */}
        <TabsContent value="counselors" className="pt-4">
          <CounselorProfileView />
        </TabsContent>

        {/* ── Tab 3: Referral Agent Profiles ── */}
        <TabsContent value="agents" className="pt-4">
          <AgentProfileView />
        </TabsContent>

        {/* ── Tab 4: Annual Settlements ── */}
        {isAdmin && (
          <TabsContent value="settlements" className="pt-4">
            <AnnualSettlementView />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
