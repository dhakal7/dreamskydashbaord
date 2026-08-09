import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Link2, Users, ArrowRight, ExternalLink } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { DataTable } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { PersonAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { LeadStageBadge } from '@/components/shared/status-badges'
import { useAuthStore } from '@/store/auth-store'
import { visibleReferrals } from '@/lib/data-visibility'
import { referrals, referralAgents } from '@/mock'
import { formatCurrency } from '@/lib/utils'
import type { Referral, LeadStage } from '@/types'

dayjs.extend(relativeTime)

const stageOrder: LeadStage[] = [
  'new', 'contacted', 'counseling', 'interested',
  'application', 'offer_letter', 'visa', 'travel', 'completed',
]

const stageLabels: Record<LeadStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  counseling: 'Counseling',
  interested: 'Interested',
  application: 'Application',
  offer_letter: 'Offer Letter',
  visa: 'Visa',
  travel: 'Travel',
  completed: 'Completed',
}

// ── Referral Agent View (Pipeline) ────────────────────────────────────────

function AgentPipelineView({ data }: { data: readonly Referral[] }) {
  const grouped = useMemo(() => {
    const map = new Map<LeadStage, Referral[]>()
    for (const r of data) {
      const list = map.get(r.stage) ?? []
      list.push(r)
      map.set(r.stage, list)
    }
    return map
  }, [data])

  const stats = useMemo(() => {
    const total = data.length
    const completed = data.filter((r) => r.stage === 'completed').length
    const pending = total - completed
    const totalCommission = data.reduce((sum, r) => sum + r.potentialCommissionUsd, 0)
    const conversionRate = total > 0 ? Math.round((completed / total) * 100) : 0
    return { total, completed, pending, totalCommission, conversionRate }
  }, [data])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Referrals', value: stats.total, color: 'text-foreground' },
          { label: 'Completed', value: stats.completed, color: 'text-success-600' },
          { label: 'Pending', value: stats.pending, color: 'text-warning-600' },
          { label: 'Conversion', value: `${stats.conversionRate}%`, color: 'text-brand-600' },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <span className={`text-2xl font-semibold font-tabular ${s.color}`}>{s.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.length === 0 && (
        <EmptyState
          icon={Link2}
          title="No referrals yet"
          description="Share your referral link to get started."
        />
      )}

      {stageOrder.map((stage) => {
        const items = grouped.get(stage)
        if (!items || items.length === 0) return null
        return (
          <div key={stage} className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {stageLabels[stage]}
              </h3>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {items.length}
              </Badge>
            </div>
            <div className="space-y-1.5">
              {items.map((r) => (
                <Link
                  key={r.id}
                  to={`/students/${r.studentId}`}
                  className="flex items-center gap-3 rounded-lg border border-border/70 p-3 transition-colors hover:bg-accent/50"
                >
                  <PersonAvatar name={r.studentName} className="size-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.studentName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Referred {dayjs(r.referredAt).fromNow()}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs font-medium font-tabular text-muted-foreground">
                      {formatCurrency(r.potentialCommissionUsd)}
                    </span>
                    <LeadStageBadge stage={r.stage} className="text-[10px] py-0" />
                  </div>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Super Admin View (DataTable) ──────────────────────────────────────────

function AdminDataTable({ data }: { data: readonly Referral[] }) {
  const [agentFilter, setAgentFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')

  const filtered = useMemo(() => {
    return data.filter((r) => {
      if (agentFilter !== 'all' && r.agentId !== agentFilter) return false
      if (stageFilter !== 'all' && r.stage !== stageFilter) return false
      return true
    })
  }, [data, agentFilter, stageFilter])

  const stats = useMemo(() => {
    const total = data.length
    const uniqueAgents = new Set(data.map((r) => r.agentId)).size
    const converted = data.filter((r) => r.stage === 'completed').length
    const totalCommission = data.reduce((sum, r) => sum + r.potentialCommissionUsd, 0)
    return { total, uniqueAgents, converted, totalCommission }
  }, [data])

  const columns: ColumnDef<Referral>[] = useMemo(() => [
    {
      accessorKey: 'agentId',
      header: 'Agent',
      cell: ({ row }) => {
        const agent = referralAgents.find((a) => a.id === row.original.agentId)
        return (
          <div className="flex items-center gap-2">
            <PersonAvatar name={agent?.name ?? '?'} color={agent?.avatarColor} className="size-6" />
            <span className="text-sm font-medium">{agent?.name ?? 'Unknown'}</span>
          </div>
        )
      },
    },
    {
      accessorKey: 'studentName',
      header: 'Student',
      cell: ({ row }) => {
        const r = row.original
        return (
          <Link
            to={`/students/${r.studentId}`}
            className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-brand-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {r.studentName}
            <ExternalLink className="size-3 text-muted-foreground" />
          </Link>
        )
      },
    },
    {
      accessorKey: 'stage',
      header: 'Stage',
      cell: ({ row }) => <LeadStageBadge stage={row.original.stage} className="text-[10px] py-0" />,
    },
    {
      accessorKey: 'referredAt',
      header: 'Referred',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground font-tabular">
          {dayjs(row.original.referredAt).fromNow()}
        </span>
      ),
    },
    {
      accessorKey: 'potentialCommissionUsd',
      header: 'Commission',
      cell: ({ row }) => (
        <span className="text-xs font-medium font-tabular">
          {formatCurrency(row.original.potentialCommissionUsd)}
        </span>
      ),
    },
  ], [])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Referrals', value: stats.total, color: 'text-foreground' },
          { label: 'Active Agents', value: stats.uniqueAgents, color: 'text-brand-600' },
          { label: 'Converted', value: stats.converted, color: 'text-success-600' },
          { label: 'Total Commission', value: formatCurrency(stats.totalCommission), color: 'text-foreground' },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <span className={`text-2xl font-semibold font-tabular ${s.color}`}>{s.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {referralAgents.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {stageOrder.map((s) => (
              <SelectItem key={s} value={s}>{stageLabels[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(agentFilter !== 'all' || stageFilter !== 'all') && (
          <Button variant="ghost" size="sm" onClick={() => { setAgentFilter('all'); setStageFilter('all') }}>
            Clear
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        pageSize={12}
        emptyState={
          <EmptyState
            icon={Users}
            title="No referrals found"
            description="Try adjusting your filters."
          />
        }
      />
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function ReferralsPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const data = visibleReferrals(currentUser, referrals)
  const isAdmin = currentUser.role === 'super_admin'

  return (
    <div className="space-y-5">
      <PageHeader
        title={isAdmin ? 'All Referrals' : 'My Referrals'}
        description={
          isAdmin
            ? 'Referral pipeline overview across all agents.'
            : 'Track your referred students through the pipeline.'
        }
      />

      {isAdmin ? (
        <AdminDataTable data={data} />
      ) : (
        <AgentPipelineView data={data} />
      )}
    </div>
  )
}
