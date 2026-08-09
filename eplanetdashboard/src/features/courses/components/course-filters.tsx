import { useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { countries, courses } from '@/mock'
import type { StudyLevel } from '@/types'

export interface CourseFilters {
  search: string
  level: string
  country: string
  field: string
}

export const defaultCourseFilters: CourseFilters = {
  search: '',
  level: 'all',
  country: 'all',
  field: 'all',
}

const levelLabels: Record<StudyLevel, string> = {
  bachelor: 'Bachelor',
  master: 'Master',
  diploma: 'Diploma',
  foundation: 'Foundation',
  phd: 'PhD',
}

interface CourseFiltersBarProps {
  filters: CourseFilters
  onChange: (f: CourseFilters) => void
}

export function CourseFiltersBar({ filters, onChange }: CourseFiltersBarProps) {
  const isFiltered = JSON.stringify(filters) !== JSON.stringify(defaultCourseFilters)

  const uniqueCountries = useMemo(() => {
    const countrySet = new Set(courses.map((c) => c.countryName))
    return Array.from(countrySet).sort()
  }, [])

  const uniqueFields = useMemo(() => {
    const fieldSet = new Set(courses.map((c) => c.field))
    return Array.from(fieldSet).sort()
  }, [])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        icon={<Search />}
        placeholder="Search courses..."
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="w-full sm:w-56"
      />

      <Select value={filters.level} onValueChange={(v) => onChange({ ...filters, level: v })}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Level" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Levels</SelectItem>
          {Object.entries(levelLabels).map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.country} onValueChange={(v) => onChange({ ...filters, country: v })}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Country" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Countries</SelectItem>
          {uniqueCountries.map((c) => {
            const country = countries.find((co) => co.name === c)
            return (
              <SelectItem key={c} value={c}>
                {country?.flag} {c}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>

      <Select value={filters.field} onValueChange={(v) => onChange({ ...filters, field: v })}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Field of Study" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Fields</SelectItem>
          {uniqueFields.map((f) => (
            <SelectItem key={f} value={f}>
              {f}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isFiltered && (
        <Button variant="ghost" size="sm" onClick={() => onChange(defaultCourseFilters)}>
          <X className="mr-1 size-3.5" /> Clear
        </Button>
      )}
    </div>
  )
}
