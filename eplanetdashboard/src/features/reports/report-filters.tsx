import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCounselors } from '@/hooks/use-counselors'
import { useCountries, useUniversities } from '@/hooks/use-universities'
import type { ReportFilters } from './report-selectors'

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
  const { data: counselorData } = useCounselors(showCounselorFilter)
  const { data: countryData } = useCountries()
  const { data: uniData } = useUniversities()

  const counselorsList = counselorData || []
  const countriesList = Array.isArray(countryData) ? countryData : (countryData?.countries ?? [])
  const universitiesList = Array.isArray(uniData) ? uniData : (uniData?.universities ?? [])

  const isFiltered = JSON.stringify(filters) !== JSON.stringify(defaultReportFilters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={filters.country} onValueChange={(v) => onChange({ ...filters, country: v })}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Country" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Countries</SelectItem>
          {countriesList.map((c: any) => (
            <SelectItem key={c.id} value={c.name}>
              {c.flagUrl || c.flag || '🌐'} {c.name}
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
            {counselorsList.map((c: any) => (
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
          {universitiesList.map((u: any) => (
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
