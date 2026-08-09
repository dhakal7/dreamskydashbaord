import type { ColumnDef } from '@tanstack/react-table'
import type { University } from '@/types'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'

export const universityColumns: ColumnDef<University>[] = [
  {
    accessorKey: 'name',
    header: 'University',
    cell: ({ row }) => {
      const uni = row.original
      return (
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-full bg-brand-50 dark:bg-brand-950/20 text-brand-600 dark:text-brand-400 flex items-center justify-center font-bold text-sm shrink-0">
            {uni.logoInitial}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate">{uni.name}</p>
            <p className="text-xs text-muted-foreground">{uni.city}</p>
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: 'countryName',
    header: 'Country',
    cell: ({ row }) => {
      const uni = row.original
      return (
        <span className="flex items-center gap-1.5 text-sm">
          <span>{uni.flag}</span>
          <span>{uni.countryName}</span>
        </span>
      )
    },
  },
  {
    accessorKey: 'ranking',
    header: 'Ranking',
    cell: ({ row }) => {
      return (
        <span className="font-mono text-sm font-semibold">
          #{row.getValue('ranking')}
        </span>
      )
    },
    sortingFn: 'basic',
  },
  {
    accessorKey: 'acceptanceRate',
    header: 'Acceptance',
    cell: ({ row }) => {
      return (
        <span className="font-tabular text-sm">
          {row.getValue('acceptanceRate')}%
        </span>
      )
    },
    sortingFn: 'basic',
  },
  {
    accessorKey: 'tuitionFromUsd',
    header: 'Tuition From',
    cell: ({ row }) => {
      return (
        <span className="font-tabular text-sm font-medium">
          {formatCurrency(row.getValue('tuitionFromUsd'), 'USD')}
        </span>
      )
    },
    sortingFn: 'basic',
  },
  {
    accessorKey: 'scholarshipAvailable',
    header: 'Scholarship',
    cell: ({ row }) => {
      const available = row.getValue('scholarshipAvailable') as boolean
      return (
        <Badge variant={available ? 'success' : 'slate'} className="text-[10px] py-0">
          {available ? 'Available' : 'None'}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'applicationDeadline',
    header: 'Deadline',
    cell: ({ row }) => {
      return (
        <span className="font-tabular text-xs text-muted-foreground">
          {row.getValue('applicationDeadline')}
        </span>
      )
    },
  },
  {
    accessorKey: 'courseCount',
    header: 'Courses',
    cell: ({ row }) => {
      return (
        <span className="font-tabular text-sm text-center block">
          {row.getValue('courseCount')}
        </span>
      )
    },
    sortingFn: 'basic',
  },
]
