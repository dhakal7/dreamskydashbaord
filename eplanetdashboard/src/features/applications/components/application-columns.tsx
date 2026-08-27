import type { ColumnDef } from '@tanstack/react-table'
import type { Application } from '@/types'
import { ApplicationStageBadge } from '@/components/shared/status-badges'
import { formatCurrency } from '@/lib/utils'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { universities } from '@/mock'
import { useApplicationsStore } from '../store'

export const applicationColumns: ColumnDef<Application>[] = [
  {
    accessorKey: 'applicationRef',
    header: 'Ref / Student',
    cell: ({ row }) => {
      const app = row.original
      return (
        <div className="flex flex-col">
          <span className="font-mono text-xs font-semibold text-muted-foreground">
            {app.applicationRef}
          </span>
          <Link
            to={`/applications/${app.id}`}
            className="font-medium text-foreground hover:text-brand-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {app.studentName}
          </Link>
        </div>
      )
    },
  },
  {
    accessorKey: 'universityName',
    header: 'University',
    cell: ({ row }) => {
      const app = row.original
      // Find flag from universities if available
      const uni = universities.find((u) => u.id === app.universityId)
      const flag = uni?.flag || '🎓'
      return (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{app.universityName}</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <span>{flag}</span>
            <span>{app.countryName}</span>
          </span>
        </div>
      )
    },
  },
  {
    accessorKey: 'courseName',
    header: 'Course',
    cell: ({ row }) => {
      return (
        <span className="text-sm font-medium text-foreground max-w-[200px] truncate block">
          {row.getValue('courseName')}
        </span>
      )
    },
  },
  {
    accessorKey: 'stage',
    header: 'Stage',
    cell: ({ row }) => {
      return <ApplicationStageBadge stage={row.getValue('stage')} />
    },
  },
  {
    accessorKey: 'intake',
    header: 'Intake',
    cell: ({ row }) => {
      return <span className="text-sm font-medium font-tabular">{row.getValue('intake')}</span>
    },
  },
  {
    accessorKey: 'tuitionUsd',
    header: 'Tuition Fee',
    cell: ({ row }) => {
      return (
        <span className="text-sm font-medium font-tabular">
          {formatCurrency(row.getValue('tuitionUsd'))}
        </span>
      )
    },
  },
  {
    accessorKey: 'submittedDate',
    header: 'Submitted',
    cell: ({ row }) => {
      return <span className="text-xs font-tabular text-muted-foreground">{row.getValue('submittedDate')}</span>
    },
  },
  {
    accessorKey: 'lastUpdate',
    header: 'Last Update',
    cell: ({ row }) => {
      return <span className="text-xs font-tabular text-muted-foreground">{row.getValue('lastUpdate')}</span>
    },
  },
  {
    id: 'actions',
    header: '',
    enableSorting: false,
    cell: ({ row }) => {
      const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (window.confirm(`Are you sure you want to delete application "${row.original.applicationRef}"?`)) {
          useApplicationsStore.getState().removeApplication(row.original.id)
        }
      }

      return (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-red-600 hover:bg-red-50"
          onClick={handleDelete}
          title="Delete application"
        >
          <Trash2 className="size-3.5" />
        </Button>
      )
    },
  },
]

