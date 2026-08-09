import type { ColumnDef } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { MoreHorizontal } from 'lucide-react'
import type { ClassSession } from '@/types'
import { PersonAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Link } from 'react-router-dom'
import { ClassStatusBadge } from '@/components/shared/status-badges'

export const classColumns: ColumnDef<ClassSession, any>[] = [
  {
    accessorKey: 'name',
    header: 'Class',
    cell: ({ row }) => (
      <Link to={`/classes/${row.original.id}`} className="flex items-center gap-2.5 hover:underline">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{row.original.name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.schedule}</p>
        </div>
      </Link>
    ),
  },
  {
    accessorKey: 'subject',
    header: 'Subject',
    cell: ({ row }) => <span className="text-[13px]">{row.original.subject}</span>,
  },
  {
    accessorKey: 'teacherName',
    header: 'Teacher',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <PersonAvatar name={row.original.teacherName} className="size-7 text-xs" />
        <span className="text-[13px]">{row.original.teacherName}</span>
      </div>
    ),
  },
  {
    accessorKey: 'room',
    header: 'Room',
    cell: ({ row }) => <span className="text-[13px]">{row.original.room}</span>,
  },
  {
    accessorKey: 'enrollment',
    header: 'Enrollment',
    cell: ({ row }) => {
      const c = row.original
      const pct = c.capacity > 0 ? Math.round((c.enrolledCount / c.capacity) * 100) : 0
      return (
        <div className="flex items-center gap-2 min-w-[120px]">
          <Progress value={pct} className="h-1.5 flex-1" />
          <span className="font-tabular text-xs text-muted-foreground shrink-0">
            {c.enrolledCount}/{c.capacity}
          </span>
        </div>
      )
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <ClassStatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'nextSessionAt',
    header: 'Next Session',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground font-tabular">
        {dayjs(row.original.nextSessionAt).format('MMM D, h:mm A')}
      </span>
    ),
  },
  {
    accessorKey: 'startDate',
    header: 'Start Date',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground font-tabular">
        {dayjs(row.original.startDate).format('MMM D, YYYY')}
      </span>
    ),
  },
  {
    id: 'actions',
    header: '',
    enableSorting: false,
    cell: () => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>View details</DropdownMenuItem>
          <DropdownMenuItem>Edit class</DropdownMenuItem>
          <DropdownMenuItem destructive>Archive class</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
]
