import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { counselors, countries, universities } from '@/mock'
import { applicationStageMeta } from '@/components/shared/status-badges'

export interface ApplicationFilters {
  search: string
  stage: string
  country: string
  university: string
  counselor: string
}

export const defaultApplicationFilters: ApplicationFilters = {
  search: '',
  stage: 'all',
  country: 'all',
  university: 'all',
  counselor: 'all',
}

interface ApplicationFiltersBarProps {
  filters: ApplicationFilters
  onChange: (f: ApplicationFilters) => void
}

export function ApplicationFiltersBar({ filters, onChange }: ApplicationFiltersBarProps) {
  const isFiltered = JSON.stringify(filters) !== JSON.stringify(defaultApplicationFilters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        icon={<Search />}
        placeholder="Search applications..."
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="w-full sm:w-56"
      />

      <Select value={filters.stage} onValueChange={(v) => onChange({ ...filters, stage: v })}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Stage" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Stages</SelectItem>
          {Object.entries(applicationStageMeta).map(([key, meta]) => (
            <SelectItem key={key} value={key}>
              {meta.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.country} onValueChange={(v) => onChange({ ...filters, country: v })}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Country" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Countries</SelectItem>
          {countries.map((c) => (
            <SelectItem key={c.id} value={c.name}>
              {c.flag} {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.university} onValueChange={(v) => onChange({ ...filters, university: v })}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="University" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Universities</SelectItem>
          {universities.map((u) => (
            <SelectItem key={u.id} value={u.name}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.counselor} onValueChange={(v) => onChange({ ...filters, counselor: v })}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Counselor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Counselors</SelectItem>
          {counselors.map((c) => (
            <SelectItem key={c.id} value={c.name}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isFiltered && (
        <Button variant="ghost" size="sm" onClick={() => onChange(defaultApplicationFilters)}>
          <X className="mr-1 size-3.5" /> Clear
        </Button>
      )}
    </div>
  )
}
