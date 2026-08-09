import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Calendar, Clock, Table2, Plus, Phone, Mail, MessageSquare, User } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DataTable } from '@/components/shared/data-table'
import { PersonAvatar } from '@/components/ui/avatar'
import { PriorityBadge, FollowUpStatusBadge } from '@/components/shared/status-badges'
import { students } from '@/mock'
import type { ColumnDef } from '@tanstack/react-table'
import type { FollowUp } from '@/types'
import { useAuthStore } from '@/store/auth-store'
import { visibleFollowUps } from '@/lib/data-visibility'

import { useFollowUpsStore } from './store'
import { FollowUpFiltersBar, defaultFollowUpFilters, type FollowUpFilters } from './components/followup-filters'
import { FollowUpCreateDialog } from './components/followup-create-dialog'
import { FollowUpDetailDialog } from './components/followup-detail-dialog'
import { CalendarView } from './components/calendar-view'
import { TimelineView } from './components/timeline-view'

type ViewMode = 'calendar' | 'timeline' | 'list'

const channelIcons = {
  call: Phone,
  email: Mail,
  whatsapp: MessageSquare,
  in_person: User,
  sms: MessageSquare,
}

export default function FollowUpsPage() {
  const location = useLocation()
  const followUps = useFollowUpsStore((s) => s.followUps)
  const currentUser = useAuthStore((s) => s.currentUser)
  const [view, setView] = useState<ViewMode>('calendar')
  const [filters, setFilters] = useState<FollowUpFilters>(defaultFollowUpFilters)
  const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUp | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const initialStudentId = (location.state as { studentId?: string } | null)?.studentId

  // Map of student colors for avatars
  const studentColors = useMemo(() => {
    const map: Record<string, string> = {}
    students.forEach((s) => {
      map[s.id] = s.photoColor
    })
    return map
  }, [])

  // Filtered followups
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return visibleFollowUps(currentUser, followUps).filter((f) => {
      if (q && !`${f.studentName} ${f.reminder} ${f.counselorName}`.toLowerCase().includes(q)) return false
      if (filters.status !== 'all' && f.status !== filters.status) return false
      if (filters.priority !== 'all' && f.priority !== filters.priority) return false
      if (filters.counselorId !== 'all' && f.counselorId !== filters.counselorId) return false
      if (filters.channel !== 'all' && f.channel !== filters.channel) return false
      return true
    })
  }, [currentUser, followUps, filters])

  // Count summaries
  const pendingCount = filtered.filter((f) => f.status === 'pending').length
  const completedCount = filtered.filter((f) => f.status === 'completed').length
  const missedCount = filtered.filter((f) => f.status === 'missed').length

  const handleOpenDetail = (fu: FollowUp) => {
    setSelectedFollowUp(fu)
    setDetailOpen(true)
  }

  // Column definitions for the List/Table view
  const columns: ColumnDef<FollowUp, any>[] = useMemo(
    () => [
      {
        accessorKey: 'studentName',
        header: 'Student',
        cell: ({ row }) => {
          const color = studentColors[row.original.studentId]
          return (
            <div className="flex items-center gap-2.5">
              <PersonAvatar name={row.original.studentName} color={color} className="size-7" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{row.original.studentName}</p>
                <p className="text-[10px] text-muted-foreground font-tabular">{row.original.studentId}</p>
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: 'counselorName',
        header: 'Counselor',
        cell: ({ row }) => <span className="text-[13px]">{row.original.counselorName}</span>,
      },
      {
        accessorKey: 'reminder',
        header: 'Reminder',
        cell: ({ row }) => <span className="text-[13px] font-medium text-foreground truncate max-w-[200px] block">{row.original.reminder}</span>,
      },
      {
        accessorKey: 'priority',
        header: 'Priority',
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <FollowUpStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'channel',
        header: 'Channel',
        cell: ({ row }) => {
          const ChannelIcon = channelIcons[row.original.channel] || Phone
          return (
            <div className="flex items-center gap-1 text-[13px] capitalize">
              <ChannelIcon className="size-3.5 text-muted-foreground" />
              {row.original.channel.replace('_', ' ')}
            </div>
          )
        },
      },
      {
        accessorKey: 'date',
        header: 'Date & Time',
        cell: ({ row }) => (
          <div className="text-[13px] font-tabular">
            <p className="font-medium">{row.original.date}</p>
            <p className="text-xs text-muted-foreground">{row.original.time}</p>
          </div>
        ),
      },
    ],
    [studentColors]
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Follow-ups"
        description="Monitor, schedule, and execute counselor reminders and client touchpoints."
      />

      <div className="flex items-center justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4 mr-2" /> New Follow-up
        </Button>
      </div>

      <FollowUpCreateDialog open={createOpen} onOpenChange={setCreateOpen} initialStudentId={initialStudentId} />

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <Card className="p-3.5 shadow-soft">
          <p className="text-xs text-muted-foreground">Total Reminders</p>
          <p className="mt-1 text-xl font-semibold font-tabular">{filtered.length}</p>
        </Card>
        <Card className="p-3.5 shadow-soft">
          <p className="text-xs text-muted-foreground">Pending</p>
          <p className="mt-1 text-xl font-semibold font-tabular text-warning-600">{pendingCount}</p>
        </Card>
        <Card className="p-3.5 shadow-soft">
          <p className="text-xs text-muted-foreground">Completed</p>
          <p className="mt-1 text-xl font-semibold font-tabular text-emerald-600">{completedCount}</p>
        </Card>
        <Card className="p-3.5 shadow-soft">
          <p className="text-xs text-muted-foreground">Missed</p>
          <p className="mt-1 text-xl font-semibold font-tabular text-danger-600">{missedCount}</p>
        </Card>
      </div>

      {/* Filters and View Switcher */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FollowUpFiltersBar filters={filters} onChange={setFilters} />
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-secondary/50 p-1 self-start sm:self-auto shadow-soft">
          <button
            onClick={() => setView('calendar')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              view === 'calendar' ? 'bg-background shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Calendar className="size-3.5" /> Calendar
          </button>
          <button
            onClick={() => setView('timeline')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              view === 'timeline' ? 'bg-background shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Clock className="size-3.5" /> Timeline
          </button>
          <button
            onClick={() => setView('list')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              view === 'list' ? 'bg-background shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Table2 className="size-3.5" /> List
          </button>
        </div>
      </div>

      {/* Main Dynamic View Panels */}
      <div className="bg-card border border-border/80 rounded-xl p-4 shadow-soft">
        {view === 'calendar' && (
          <CalendarView followUps={filtered} onSelectFollowUp={handleOpenDetail} />
        )}
        {view === 'timeline' && (
          <TimelineView followUps={filtered} onSelectFollowUp={handleOpenDetail} />
        )}
        {view === 'list' && (
          <DataTable
            columns={columns}
            data={filtered}
            pageSize={10}
            onRowClick={handleOpenDetail}
          />
        )}
      </div>

      {/* Detail Dialog */}
      <FollowUpDetailDialog
        followup={selectedFollowUp}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  )
}
