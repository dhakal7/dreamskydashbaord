import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  Search,
  Calendar,
  ArrowRight,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { auditApi, type ApiAuditLog, type AuditLogsResponse } from '@/api/audit-api'

export default function AuditLogPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [entityFilter, setEntityFilter] = useState('ALL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const { data, isLoading, isError, refetch } = useQuery<AuditLogsResponse>({
    queryKey: ['audit-logs', { page, search, entityFilter, fromDate, toDate }],
    queryFn: () =>
      auditApi.list({
        page,
        limit: 25,
        search: search.trim() || undefined,
        entity: entityFilter !== 'ALL' ? entityFilter : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      }),
  })

  const logs = data?.data || []
  const totalPages = data?.totalPages || 1
  const totalCount = data?.total || 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activity Log"
        description="Immutable audit trail of staff actions, lead stage transitions, assignments, and soft deletions."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8 gap-1.5 text-xs">
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
        }
      />

      {/* ── Filters Bar ─────────────────────────────────────────── */}
      <Card className="p-3.5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by staff, record, or reason..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="h-8 pl-8 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={entityFilter}
              onValueChange={(val) => {
                setEntityFilter(val)
                setPage(1)
              }}
            >
              <SelectTrigger className="h-8 text-xs w-36">
                <SelectValue placeholder="All Entities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Entities</SelectItem>
                <SelectItem value="Student">Students / Leads</SelectItem>
                <SelectItem value="Application">Applications</SelectItem>
                <SelectItem value="VisaCase">Visa Cases</SelectItem>
                <SelectItem value="Commission">Commissions</SelectItem>
                <SelectItem value="User">Staff Users</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="size-3.5" />
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value)
                  setPage(1)
                }}
                className="h-8 text-xs w-32 px-2"
                placeholder="From"
              />
              <span>to</span>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value)
                  setPage(1)
                }}
                className="h-8 text-xs w-32 px-2"
                placeholder="To"
              />
            </div>

            {(search || entityFilter !== 'ALL' || fromDate || toDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setEntityFilter('ALL')
                  setFromDate('')
                  setToDate('')
                  setPage(1)
                }}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ── Audit Logs Table ────────────────────────────────────── */}
      <Card className="overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-secondary/40 text-muted-foreground">
              <tr>
                <th className="py-2.5 px-3.5 font-medium">Timestamp</th>
                <th className="py-2.5 px-3.5 font-medium">Staff Member</th>
                <th className="py-2.5 px-3.5 font-medium">Entity</th>
                <th className="py-2.5 px-3.5 font-medium">Action / Field</th>
                <th className="py-2.5 px-3.5 font-medium">Change Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    Loading activity records...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-rose-500">
                    Failed to load audit logs. Please check your network connection or permissions.
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No activity logs match the selected criteria.
                  </td>
                </tr>
              ) : (
                logs.map((log: ApiAuditLog) => (
                  <tr key={log.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-muted-foreground font-tabular">
                      {dayjs(log.timestamp).format('MMM D, YYYY h:mm A')}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground">{log.actorName}</span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          {log.actorRole.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3.5">
                      <Badge variant="outline" className="text-[10px] font-medium">
                        {log.entity}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span className="font-medium text-foreground">{log.field || 'MUTATION'}</span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {log.oldValue !== null && (
                          <span className="rounded bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 text-rose-700 dark:text-rose-400 font-mono text-[11px]">
                            {log.oldValue || 'none'}
                          </span>
                        )}
                        {log.oldValue !== null && log.newValue !== null && (
                          <ArrowRight className="size-3 text-muted-foreground shrink-0" />
                        )}
                        {log.newValue !== null && (
                          <span className="rounded bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-400 font-mono text-[11px]">
                            {log.newValue}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t px-3.5 py-2.5 text-xs text-muted-foreground">
          <span>
            Total: <strong className="text-foreground font-tabular">{totalCount}</strong> logs
          </span>

          <div className="flex items-center gap-1.5">
            <span>
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
