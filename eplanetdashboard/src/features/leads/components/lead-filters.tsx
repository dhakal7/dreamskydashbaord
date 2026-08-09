import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { counselors } from '@/mock'
import { leadStageMeta, leadStageOrder } from '@/components/shared/status-badges'

export interface LeadFilters {
  search: string
  stage: string
  source: string
  priority: string
  counselorId: string
}

export const defaultLeadFilters: LeadFilters = {
  search: '', stage: 'all', source: 'all', priority: 'all', counselorId: 'all',
}

const sources = ['website', 'facebook', 'referral_agent', 'walk_in', 'education_fair', 'google_ads', 'instagram']
const priorities = ['low', 'medium', 'high', 'urgent']

export function LeadFiltersBar({
  filters, onChange,
}: {
  filters: LeadFilters
  onChange: (f: LeadFilters) => void
}) {
  const isFiltered = JSON.stringify(filters) !== JSON.stringify(defaultLeadFilters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        icon={<Search />}
        placeholder="Search leads..."
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="w-full sm:w-56"
      />

      <Select value={filters.stage} onValueChange={(v) => onChange({ ...filters, stage: v })}>
        <SelectTrigger className="w-[150px]"><SelectValue placeholder="Stage" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All stages</SelectItem>
          {leadStageOrder.map((stage) => {
            const meta = leadStageMeta[stage]
            return (
              <SelectItem key={stage} value={stage}>{meta?.label ?? stage}</SelectItem>
            )
          })}
        </SelectContent>
      </Select>

      <Select value={filters.source} onValueChange={(v) => onChange({ ...filters, source: v })}>
        <SelectTrigger className="w-[150px]"><SelectValue placeholder="Source" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sources</SelectItem>
          {sources.map((s) => (
            <SelectItem key={s} value={s} className="capitalize">{s.replace('_', ' ')}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.priority} onValueChange={(v) => onChange({ ...filters, priority: v })}>
        <SelectTrigger className="w-[130px]"><SelectValue placeholder="Priority" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All priority</SelectItem>
          {priorities.map((p) => (
            <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.counselorId} onValueChange={(v) => onChange({ ...filters, counselorId: v })}>
        <SelectTrigger className="w-[160px]"><SelectValue placeholder="Counselor" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All counselors</SelectItem>
          {counselors.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isFiltered && (
        <Button variant="ghost" size="sm" onClick={() => onChange(defaultLeadFilters)}>
          <X /> Clear
        </Button>
      )}
    </div>
  )
}
