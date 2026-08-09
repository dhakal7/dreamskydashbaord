import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { countries } from '@/mock'
import { getCounselorsForFilter, getUniversitiesForFilter, type ReportFilters } from './report-selectors'

export const defaultReportFilters: ReportFilters = {
  country: 'all',
  counselor: 'all',
  university: 'all',
  dateFrom: '',
  dateTo: '',
}

interface ReportFiltersBarProps {
  filters: ReportFilters
  onChange: (f: ReportFilters) => void
  showCounselorFilter: boolean
}

export function ReportFiltersBar({ filters, onChange, showCounselorFilter }: ReportFiltersBarProps) {
  const counselorsList = getCounselorsForFilter()
  const universitiesList = getUniversitiesForFilter()
  const isFiltered = JSON.stringify(filters) !== JSON.stringify(defaultReportFilters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={filters.country} onValueChange={(v) => onChange({ ...filters, country: v })}>
        <SelectTrigger className="w-[160px]">
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

      {showCounselorFilter && (
        <Select value={filters.counselor} onValueChange={(v) => onChange({ ...filters, counselor: v })}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Counselor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Counselors</SelectItem>
            {counselorsList.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={filters.university} onValueChange={(v) => onChange({ ...filters, university: v })}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="University" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Universities</SelectItem>
          {universitiesList.map((u) => (
            <SelectItem key={u.id} value={u.name}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
          className="w-[150px] h-9"
          placeholder="From"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="date"
          value={filters.dateTo}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
          className="w-[150px] h-9"
          placeholder="To"
        />
      </div>

      {isFiltered && (
        <Button variant="ghost" size="sm" onClick={() => onChange(defaultReportFilters)}>
          <X className="mr-1 size-3.5" /> Clear
        </Button>
      )}
    </div>
  )
}
