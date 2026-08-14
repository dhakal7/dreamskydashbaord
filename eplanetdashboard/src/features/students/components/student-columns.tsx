import type { ColumnDef } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { MoreHorizontal } from 'lucide-react'
import type { Student } from '@/types'
import { PersonAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StudentStatusBadge } from '@/components/shared/status-badges'
import { useAuthStore } from '@/store/auth-store'
import { useStudentsStore } from '../store'
import { toast } from 'sonner'

export const studentColumns: ColumnDef<Student, any>[] = [
  {
    accessorKey: 'name',
    header: 'Student',
    cell: ({ row }) => (
      <div className="flex items-center gap-2.5">
        <PersonAvatar name={row.original.name} color={row.original.photoColor} className="size-8" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-medium">{row.original.name}</p>
            {row.original.processingType === 'partner_consultancy' && (
              <span className="inline-flex items-center rounded-xs bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 shrink-0">
                B2B: {row.original.partnerConsultancyName || 'Partner'}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'studentId',
    header: 'Student ID',
    cell: ({ row }) => <span className="font-tabular text-xs">{row.original.studentId}</span>,
  },
  {
    accessorKey: 'counselorName',
    header: 'Counselor',
    cell: ({ row }) => <span className="text-[13px]">{row.original.counselorName}</span>,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StudentStatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'preferredCountries',
    header: 'Country / Level',
    cell: ({ row }) => (
      <div className="text-[13px]">
        <p>{row.original.preferredCountries[0]}</p>
        <p className="text-xs capitalize text-muted-foreground">{row.original.preferredLevel}</p>
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: 'englishTest',
    header: 'English Test',
    cell: ({ row }) => {
      const test = row.original.englishTest
      if (test.type === 'None') return <span className="text-xs text-muted-foreground">—</span>
      return (
        <span className="font-tabular text-[13px]">
          {test.type} {test.overallScore}
        </span>
      )
    },
    enableSorting: false,
  },
  {
    accessorKey: 'documentsUploaded',
    header: 'Documents',
    cell: ({ row }) => {
      const pct = Math.round((row.original.documentsUploaded / row.original.documentsRequired) * 100)
      return (
        <div className="flex items-center gap-2 min-w-[100px]">
          <Progress value={pct} className="h-1.5 flex-1" />
          <span className="font-tabular text-xs text-muted-foreground shrink-0">
            {row.original.documentsUploaded}/{row.original.documentsRequired}
          </span>
        </div>
      )
    },
    enableSorting: false,
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
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
    cell: ({ row }) => {
      const student = row.original
      const currentUser = useAuthStore.getState().currentUser
      const isAdmin = currentUser.role === 'super_admin'

      const handleDelete = () => {
        useStudentsStore.getState().deleteStudents([student.id])
        toast.success(`Student ${student.name} deleted successfully`)
      }

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>View profile</DropdownMenuItem>
            <DropdownMenuItem>Edit details</DropdownMenuItem>
            <DropdownMenuItem>Log a call</DropdownMenuItem>
            <DropdownMenuItem>Send email</DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem destructive onClick={handleDelete}>
                Delete student
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
