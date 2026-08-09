import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { counselors, countries } from '@/mock'
import { studentStatusMeta } from '@/components/shared/status-badges'

export interface StudentFilters {
  search: string
  status: string
  counselorId: string
  country: string
  level: string
}

export const defaultStudentFilters: StudentFilters = {
  search: '', status: 'all', counselorId: 'all', country: 'all', level: 'all',
}

const levels = ['foundation', 'diploma', 'bachelor', 'master', 'phd']

export function StudentFiltersBar({
  filters, onChange,
}: {
  filters: StudentFilters
  onChange: (f: StudentFilters) => void
}) {
  const isFiltered = JSON.stringify(filters) !== JSON.stringify(defaultStudentFilters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        icon={<Search />}
        placeholder="Search students..."
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="w-full sm:w-56"
      />

      <Select value={filters.status} onValueChange={(v) => onChange({ ...filters, status: v })}>
        <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {Object.entries(studentStatusMeta).map(([key, meta]) => (
            <SelectItem key={key} value={key}>{meta.label}</SelectItem>
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

      <Select value={filters.country} onValueChange={(v) => onChange({ ...filters, country: v })}>
        <SelectTrigger className="w-[160px]"><SelectValue placeholder="Country" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All countries</SelectItem>
          {countries.map((c) => (
            <SelectItem key={c.id} value={c.name}>{c.flag} {c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.level} onValueChange={(v) => onChange({ ...filters, level: v })}>
        <SelectTrigger className="w-[140px]"><SelectValue placeholder="Level" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All levels</SelectItem>
          {levels.map((l) => (
            <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isFiltered && (
        <Button variant="ghost" size="sm" onClick={() => onChange(defaultStudentFilters)}>
          <X /> Clear
        </Button>
      )}
    </div>
  )
}
