import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { countries } from '@/mock'

export interface UniversityFilters {
  search: string
  country: string
  scholarship: string
}

export const defaultUniversityFilters: UniversityFilters = {
  search: '',
  country: 'all',
  scholarship: 'all',
}

interface UniversityFiltersBarProps {
  filters: UniversityFilters
  onChange: (f: UniversityFilters) => void
}

export function UniversityFiltersBar({ filters, onChange }: UniversityFiltersBarProps) {
  const isFiltered = JSON.stringify(filters) !== JSON.stringify(defaultUniversityFilters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        icon={<Search />}
        placeholder="Search universities..."
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="w-full sm:w-56"
      />

      <Select value={filters.country} onValueChange={(v) => onChange({ ...filters, country: v })}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Country" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Countries</SelectItem>
          {countries.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.flag} {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.scholarship} onValueChange={(v) => onChange({ ...filters, scholarship: v })}>
        <SelectTrigger className="w-[170px]">
          <SelectValue placeholder="Scholarship" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="available">Available</SelectItem>
          <SelectItem value="none">Not Available</SelectItem>
        </SelectContent>
      </Select>

      {isFiltered && (
        <Button variant="ghost" size="sm" onClick={() => onChange(defaultUniversityFilters)}>
          <X className="mr-1 size-3.5" /> Clear
        </Button>
      )}
    </div>
  )
}
