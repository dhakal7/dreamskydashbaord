import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Clock,
  UserCheck,
  PhoneCall,
  Calendar,
  Search,
  CheckCircle2,
  Sparkles,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { dashboardApi, type AdminMonitoringData } from '@/api/dashboard-api'
import { cn } from '@/lib/utils'

export function AdminMonitoringPanel() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')

  const { data, isLoading, isError } = useQuery<AdminMonitoringData>({
    queryKey: ['dashboard', 'admin-monitoring'],
    queryFn: () => dashboardApi.getAdminMonitoring(),
    refetchInterval: 30000, // auto-refresh every 30s
  })

  const counts = data?.counts
  const overdueTasks = data?.overdueTasks || []

  const filteredTasks = overdueTasks.filter((t) => {
    if (typeFilter !== 'ALL' && t.type !== typeFilter) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const matchName = t.studentName.toLowerCase().includes(q)
      const matchEmp = t.responsibleEmployee.toLowerCase().includes(q)
      const matchDesc = t.description.toLowerCase().includes(q)
      return matchName || matchEmp || matchDesc
    }
    return true
  })

  return (
    <div className="space-y-4">
      {/* ── CRM Lead Stages & Health Grid ─────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="size-4 text-brand-600 dark:text-brand-400" /> CRM Lead Pipeline Monitoring
          </h3>
          <span className="text-xs text-muted-foreground">Real-time Stage Distribution</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
          <Card className="p-3 border-l-4 border-l-slate-400 bg-card shadow-sm">
            <p className="text-[11px] text-muted-foreground font-medium">New Leads</p>
            <p className="mt-1 text-lg font-bold font-tabular text-foreground">{counts?.newLeads ?? '—'}</p>
            <span className="text-[10px] text-muted-foreground">Unassigned</span>
          </Card>

          <Card className="p-3 border-l-4 border-l-amber-500 bg-card shadow-sm">
            <p className="text-[11px] text-muted-foreground font-medium">FD Follow-ups</p>
            <p className="mt-1 text-lg font-bold font-tabular text-amber-600 dark:text-amber-400">
              {counts?.frontDeskFollowUps ?? '—'}
            </p>
            <span className="text-[10px] text-muted-foreground">Front Desk</span>
          </Card>

          <Card className="p-3 border-l-4 border-l-blue-500 bg-card shadow-sm">
            <p className="text-[11px] text-muted-foreground font-medium">Assigned Leads</p>
            <p className="mt-1 text-lg font-bold font-tabular text-blue-600 dark:text-blue-400">
              {counts?.assignedLeads ?? '—'}
            </p>
            <span className="text-[10px] text-muted-foreground">With Counselor</span>
          </Card>

          <Card className="p-3 border-l-4 border-l-purple-500 bg-card shadow-sm">
            <p className="text-[11px] text-muted-foreground font-medium">Counselor Follow-up</p>
            <p className="mt-1 text-lg font-bold font-tabular text-purple-600 dark:text-purple-400">
              {counts?.counselorFollowUps ?? '—'}
            </p>
            <span className="text-[10px] text-muted-foreground">In Progress</span>
          </Card>

          <Card className="p-3 border-l-4 border-l-emerald-500 bg-card shadow-sm">
            <p className="text-[11px] text-muted-foreground font-medium">Interested</p>
            <p className="mt-1 text-lg font-bold font-tabular text-emerald-600 dark:text-emerald-400">
              {counts?.interestedLeads ?? '—'}
            </p>
            <span className="text-[10px] text-muted-foreground">Ready to Enroll</span>
          </Card>

          <Card className="p-3 border-l-4 border-l-stone-400 bg-card shadow-sm">
            <p className="text-[11px] text-muted-foreground font-medium">Not Contracted</p>
            <p className="mt-1 text-lg font-bold font-tabular text-stone-600 dark:text-stone-400">
              {counts?.notContracted ?? '—'}
            </p>
            <span className="text-[10px] text-muted-foreground">Front Desk Archive</span>
          </Card>

          <Card className="p-3 border-l-4 border-l-rose-500 bg-card shadow-sm">
            <p className="text-[11px] text-muted-foreground font-medium">Trash Archive</p>
            <p className="mt-1 text-lg font-bold font-tabular text-rose-600 dark:text-rose-400">
              {counts?.trash ?? '—'}
            </p>
            <span className="text-[10px] text-muted-foreground">Soft-deleted</span>
          </Card>
        </div>
      </div>

      {/* ── Employee Performance & Overdue Tasks Detection Engine ── */}
      <Card className="p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-rose-500" />
              <h3 className="text-sm font-semibold text-foreground">Employee Performance & Overdue Tasks</h3>
              <Badge variant="danger" className="text-[10px] px-1.5 py-0">
                {overdueTasks.length} Overdue
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automated detection of delayed follow-ups, neglected new enquiries, and inactive assigned leads.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search staff or lead..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 text-xs w-44">
                <SelectValue placeholder="All Task Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Overdue Tasks</SelectItem>
                <SelectItem value="OVERDUE_FOLLOW_UP">Missed Follow-ups</SelectItem>
                <SelectItem value="UNPROCESSED_NEW_LEAD">Unprocessed Leads (&gt;24h)</SelectItem>
                <SelectItem value="INACTIVE_ASSIGNED_LEAD">Inactive Leads (&gt;48h)</SelectItem>
                <SelectItem value="MISSED_APPOINTMENT">Missed Appointments</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-3.5 divide-y divide-border/60">
          {isLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Loading monitoring data...</div>
          ) : isError ? (
            <div className="py-8 text-center text-xs text-rose-500">
              Failed to load employee monitoring engine.
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="size-8 text-emerald-500 mb-1.5" />
              <p className="text-xs font-medium text-foreground">All tasks are up to date!</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                No overdue follow-ups or unattended leads detected across branch staff.
              </p>
            </div>
          ) : (
            filteredTasks.slice(0, 10).map((task) => (
              <div key={task.id} className="flex items-center justify-between py-2.5 hover:bg-secondary/30 px-2 rounded-md transition-colors">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div
                    className={cn(
                      'size-7 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                      task.type === 'OVERDUE_FOLLOW_UP' && 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
                      task.type === 'UNPROCESSED_NEW_LEAD' && 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
                      task.type === 'INACTIVE_ASSIGNED_LEAD' && 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400',
                      task.type === 'MISSED_APPOINTMENT' && 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400'
                    )}
                  >
                    {task.type === 'OVERDUE_FOLLOW_UP' && <PhoneCall className="size-3.5" />}
                    {task.type === 'UNPROCESSED_NEW_LEAD' && <Clock className="size-3.5" />}
                    {task.type === 'INACTIVE_ASSIGNED_LEAD' && <UserCheck className="size-3.5" />}
                    {task.type === 'MISSED_APPOINTMENT' && <Calendar className="size-3.5" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground truncate">{task.studentName}</span>
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                        {task.responsibleEmployee}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 font-tabular bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-900">
                    +{task.hoursOverdue}h overdue
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  )
}
