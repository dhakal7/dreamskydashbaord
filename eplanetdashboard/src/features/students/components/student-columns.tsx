import { useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { MoreHorizontal, Phone } from 'lucide-react'
import type { Student } from '@/types'
import { PersonAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StudentStatusBadge } from '@/components/shared/status-badges'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/auth-store'
import { useDeleteStudent, useResendCredentials } from '@/hooks/use-students'
import { TrashLeadDialog } from '@/features/leads/components/trash-lead-dialog'
import { toast } from 'sonner'
import { Link, useNavigate } from 'react-router-dom'

function StudentRowActions({ student }: { student: Student }) {
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.currentUser)
  const isAdmin = currentUser.role === 'super_admin' || currentUser.role === 'branch_admin'
  const deleteMutation = useDeleteStudent()
  const resendMutation = useResendCredentials()
  const [trashDialogOpen, setTrashDialogOpen] = useState(false)

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setTrashDialogOpen(true)
  }

  const handleConfirmTrash = async (reason: string) => {
    await deleteMutation.mutateAsync({ id: student.id, reason })
    toast.success(`Student ${student.name} moved to Trash`)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate(`/students/${student.id}`)}>
            View profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`/students/${student.id}`)}>
            Edit details
          </DropdownMenuItem>
          {(currentUser?.role === 'super_admin' || currentUser?.role === 'branch_admin' || currentUser?.role === 'counselor') && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                resendMutation.mutate(student.id)
              }}
              disabled={resendMutation.isPending || !student.email}
            >
              {resendMutation.isPending ? 'Sending credentials...' : 'Send portal credentials'}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => window.open(`tel:${student.phone}`)}>
            Log a call
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => window.open(`mailto:${student.email}`)}>
            Send email
          </DropdownMenuItem>
          {isAdmin && (
            <DropdownMenuItem destructive onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Moving to Trash...' : 'Move to Trash'}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <TrashLeadDialog
        open={trashDialogOpen}
        onOpenChange={setTrashDialogOpen}
        lead={{ id: student.id, name: student.name }}
        onConfirm={handleConfirmTrash}
        isSubmitting={deleteMutation.isPending}
      />
    </>
  )
}

export const studentColumns: ColumnDef<Student, any>[] = [
  {
    accessorKey: 'name',
    header: 'Student',
    cell: ({ row }) => (
      <div className="flex items-center gap-2.5">
        <PersonAvatar name={row.original.name} color={row.original.photoColor} className="size-8" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Link
              to={`/students/${row.original.id}`}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              className="truncate text-[13px] font-medium text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs"
            >
              {row.original.name}
            </Link>
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
    accessorKey: 'phone',
    header: 'Phone Number',
    cell: ({ row }) => (
      row.original.phone ? (
        <a
          href={`tel:${row.original.phone}`}
          className="inline-flex items-center gap-1.5 font-tabular text-xs text-muted-foreground hover:text-foreground hover:underline"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <Phone className="size-3 shrink-0 text-muted-foreground" />
          <span>{row.original.phone}</span>
        </a>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      )
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5 flex-wrap">
        <StudentStatusBadge status={row.original.status} />
        {row.original.isClassOnly && (
          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 font-semibold text-[10px] py-0">
            Class Only
          </Badge>
        )}
      </div>
    ),
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
    cell: ({ row }) => <StudentRowActions student={row.original} />,
  },
]
