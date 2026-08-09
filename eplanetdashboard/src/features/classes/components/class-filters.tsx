import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { classes, teachers } from '@/mock'
import type { ClassSession } from '@/types'

export interface ClassFilters {
  search: string
  subject: string
  status: string
  teacherId: string
}

export const defaultClassFilters: ClassFilters = {
  search: '',
  subject: 'all',
  status: 'all',
  teacherId: 'all',
}

const subjects = Array.from(new Set(classes.map((c) => c.subject)))
const statuses: ClassSession['status'][] = ['upcoming', 'ongoing', 'completed']

export function ClassFiltersBar({
  filters, onChange,
}: {
  filters: ClassFilters
  onChange: (f: ClassFilters) => void
}) {
  const isFiltered = JSON.stringify(filters) !== JSON.stringify(defaultClassFilters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        icon={<Search />}
        placeholder="Search classes..."
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="w-full sm:w-56"
      />

      <Select value={filters.subject} onValueChange={(v) => onChange({ ...filters, subject: v })}>
        <SelectTrigger className="w-[140px]"><SelectValue placeholder="Subject" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All subjects</SelectItem>
          {subjects.map((s) => (
            <SelectItem key={s} value={s}>{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.status} onValueChange={(v) => onChange({ ...filters, status: v })}>
        <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {statuses.map((s) => (
            <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.teacherId} onValueChange={(v) => onChange({ ...filters, teacherId: v })}>
        <SelectTrigger className="w-[160px]"><SelectValue placeholder="Teacher" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All teachers</SelectItem>
          {teachers.map((t) => (
            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isFiltered && (
        <Button variant="ghost" size="sm" onClick={() => onChange(defaultClassFilters)}>
          <X /> Clear
        </Button>
      )}
    </div>
  )
}
