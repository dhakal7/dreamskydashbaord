import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { counselors } from '@/mock'
import { followUpStatusMeta } from '@/components/shared/status-badges'

export interface FollowUpFilters {
  search: string
  status: string
  priority: string
  counselorId: string
  channel: string
}

export const defaultFollowUpFilters: FollowUpFilters = {
  search: '',
  status: 'all',
  priority: 'all',
  counselorId: 'all',
  channel: 'all',
}

const priorities = ['low', 'medium', 'high', 'urgent']
const channels = ['call', 'email', 'whatsapp', 'in_person', 'sms']

export function FollowUpFiltersBar({
  filters,
  onChange,
}: {
  filters: FollowUpFilters
  onChange: (f: FollowUpFilters) => void
}) {
  const isFiltered = JSON.stringify(filters) !== JSON.stringify(defaultFollowUpFilters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        icon={<Search />}
        placeholder="Search follow-ups..."
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="w-full sm:w-56"
      />

      <Select value={filters.status} onValueChange={(v) => onChange({ ...filters, status: v })}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {Object.entries(followUpStatusMeta).map(([key, meta]) => (
            <SelectItem key={key} value={key}>
              {meta.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.priority} onValueChange={(v) => onChange({ ...filters, priority: v })}>
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All priorities</SelectItem>
          {priorities.map((p) => (
            <SelectItem key={p} value={p} className="capitalize">
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.counselorId} onValueChange={(v) => onChange({ ...filters, counselorId: v })}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Counselor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All counselors</SelectItem>
          {counselors.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.channel} onValueChange={(v) => onChange({ ...filters, channel: v })}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Channel" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All channels</SelectItem>
          {channels.map((c) => (
            <SelectItem key={c} value={c} className="capitalize">
              {c.replace('_', ' ')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isFiltered && (
        <Button variant="ghost" size="sm" onClick={() => onChange(defaultFollowUpFilters)}>
          <X className="size-3.5 mr-1" /> Clear
        </Button>
      )}
    </div>
  )
}
