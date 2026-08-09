import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { counselors, countries } from '@/mock'

export function AdvancedFilters({ onReset }: { onReset?: () => void }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Advanced Filters</h3>
        </div>
        {onReset && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <X className="mr-1 size-3.5" /> Reset
          </Button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Input placeholder="Search by student or counselor" />
        <Select>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="enrolled">Enrolled</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select>
          <SelectTrigger><SelectValue placeholder="Counselor" /></SelectTrigger>
          <SelectContent>
            {counselors.map((counselor) => (
              <SelectItem key={counselor.id} value={counselor.id}>{counselor.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select>
          <SelectTrigger><SelectValue placeholder="Country" /></SelectTrigger>
          <SelectContent>
            {countries.map((country) => (
              <SelectItem key={country.id} value={country.name}>{country.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Card>
  )
}
