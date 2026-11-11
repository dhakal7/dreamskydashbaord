import type { ColumnDef } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { RotateCcw, Phone } from 'lucide-react'
import type { Student } from '@/types'
import { PersonAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useRestoreStudent } from '@/hooks/use-students'
import { toast } from 'sonner'

function TrashRowActions({ student }: { student: Student }) {
  const restoreMutation = useRestoreStudent()

  const handleRestore = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`Restore ${student.name}? This will return the student to the active pipeline without sending notifications or activating the portal.`)) {
      restoreMutation.mutate(student.id, {
        onSuccess: () => {
          toast.success(`Student ${student.name} restored successfully`)
        },
      })
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs gap-1.5 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400"
      onClick={handleRestore}
      disabled={restoreMutation.isPending}
    >
      <RotateCcw className="size-3" />
      {restoreMutation.isPending ? 'Restoring...' : 'Restore'}
    </Button>
  )
}

export const trashColumns: ColumnDef<Student, any>[] = [
  {
    accessorKey: 'name',
    header: 'Student',
    cell: ({ row }) => (
      <div className="flex items-center gap-2.5">
        <PersonAvatar name={row.original.name} color={row.original.photoColor} className="size-8 opacity-75" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-medium text-muted-foreground">{row.original.name}</p>
            <Badge variant="secondary" className="text-[10px] bg-muted/60 text-muted-foreground">
              Archived
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'studentId',
    header: 'Student ID',
    cell: ({ row }) => <span className="font-tabular text-xs text-muted-foreground">{row.original.studentId}</span>,
  },
  {
    accessorKey: 'counselorName',
    header: 'Counselor',
    cell: ({ row }) => <span className="text-[13px] text-muted-foreground">{row.original.counselorName || '—'}</span>,
  },
  {
    accessorKey: 'status',
    header: 'Preserved Stage',
    cell: ({ row }) => (
      <Badge variant="outline" className="text-xs uppercase font-medium">
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: 'phone',
    header: 'Phone Number',
    cell: ({ row }) => (
      row.original.phone ? (
        <span className="inline-flex items-center gap-1.5 font-tabular text-xs text-muted-foreground">
          <Phone className="size-3 shrink-0 text-muted-foreground" />
          <span>{row.original.phone}</span>
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      )
    ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Archived / Updated',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground font-tabular">
        {dayjs(row.original.createdAt).format('MMM D, YYYY')}
      </span>
    ),
  },
  {
    id: 'actions',
    header: '',
    enableSorting: false,
    cell: ({ row }) => <TrashRowActions student={row.original} />,
  },
]
