import { useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { Phone, MoreHorizontal, Pencil, GraduationCap, Trash2 } from 'lucide-react'
import type { Lead } from '@/types'
import { PersonAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { useLeadsStore } from '../store'
import { LeadStageBadge, PriorityBadge } from '@/components/shared/status-badges'
import { useDeleteLiveLead } from '@/hooks/use-leads-live'
import { isMockMode } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth-store'
import { hasPermission } from '@/lib/rbac'
import { ConvertLeadDialog } from './convert-lead-dialog'

export const leadColumns: ColumnDef<Lead, any>[] = [
  {
    accessorKey: 'name',
    header: 'Lead',
    cell: ({ row }) => (
      <div className="flex items-center gap-2.5">
        <PersonAvatar name={row.original.name} color={row.original.photoColor} className="size-8" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{row.original.name}</p>
          {(!row.original.email || row.original.email.includes('@no-email') || row.original.email.includes('eplanet') || !row.original.email.includes('@')) ? (
            <p className="truncate text-[11px] font-medium text-amber-600 dark:text-amber-400">Email Missing</p>
          ) : (
            <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
          )}
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'phone',
    header: 'Contact',
    cell: ({ row }) => (
      <div className="text-xs text-muted-foreground space-y-0.5">
        <p className="flex items-center gap-1.5"><Phone className="size-3" /> {row.original.phone}</p>
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: 'interestedCountry',
    header: 'Interest',
    cell: ({ row }) => {
      const countriesList = row.original.interestedCountries && row.original.interestedCountries.length > 0
        ? row.original.interestedCountries
        : row.original.interestedCountry ? row.original.interestedCountry.split(',').map(s => s.trim()) : []
      return (
        <div className="text-[13px]">
          <div className="flex flex-wrap gap-1">
            {countriesList.length > 0 ? (
              countriesList.map((c) => (
                <Badge key={c} variant="outline" className="text-[10px] py-0 font-normal">
                  {c}
                </Badge>
              ))
            ) : (
              <p>{row.original.interestedCountry}</p>
            )}
          </div>
          <p className="text-[11px] capitalize text-muted-foreground mt-0.5">{row.original.interestedLevel}</p>
        </div>
      )
    },
  },
  {
    accessorKey: 'stage',
    header: 'Stage',
    cell: ({ row }) => <LeadStageBadge stage={row.original.stage} />,
  },
  {
    accessorKey: 'source',
    header: 'Source',
    cell: ({ row }) => (
      <Badge variant="slate" className="capitalize">{row.original.source.replace('_', ' ')}</Badge>
    ),
  },
  {
    accessorKey: 'priority',
    header: 'Priority',
    cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
  },
  {
    accessorKey: 'counselorName',
    header: 'Counselor',
    cell: ({ row }) => <span className="text-[13px]">{row.original.counselorName}</span>,
  },
  {
    accessorKey: 'nextFollowUp',
    header: 'Next Follow-up',
    cell: ({ row }) => <span className="text-xs text-muted-foreground font-tabular">{dayjs(row.original.nextFollowUp).format('MMM D, YYYY')}</span>,
  },
]

/**
 * ActionsCell is a component so it can use hooks (useDeleteLiveLead, useAuthStore, etc.)
 */
function ActionsCell({ lead, onEdit }: { lead: Lead; onEdit?: (lead: Lead) => void }) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const removeLead = useLeadsStore((s) => s.removeLead)
  const deleteLiveLead = useDeleteLiveLead()
  const [convertOpen, setConvertOpen] = useState(false)

  const canManageLeads = hasPermission(currentUser.role, 'leads.manage')
  const canChangeStage = hasPermission(currentUser.role, 'leads.change-stage')
  const isRegisterable = (lead.stage === 'counseling' || lead.stage === 'interested') && canChangeStage

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (window.confirm(`Are you sure you want to delete lead "${lead.name}"?`)) {
      if (isMockMode()) {
        removeLead(lead.id)
        toast.success(`Lead "${lead.name}" deleted.`)
      } else {
        deleteLiveLead.mutate(lead.id, {
          onSuccess: () => toast.success(`Lead "${lead.name}" deleted.`),
        })
      }
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onEdit && canManageLeads && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(lead); }}>
              <Pencil className="mr-2 size-3.5" /> Edit Details
            </DropdownMenuItem>
          )}
          {isRegisterable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  setConvertOpen(true)
                }}
                className="text-brand-600 focus:text-brand-700 focus:bg-brand-50 dark:focus:bg-brand-950/50"
              >
                <GraduationCap className="mr-2 size-3.5" />
                Convert to Student
              </DropdownMenuItem>
            </>
          )}
          {canManageLeads && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onClick={handleDelete}>
                <Trash2 className="mr-2 size-3.5" /> Delete Lead
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConvertLeadDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        lead={lead}
      />
    </>
  )
}

export function getLeadColumns(onEdit?: (lead: Lead) => void): ColumnDef<Lead, any>[] {
  return [
    ...leadColumns.filter(c => c.id !== 'actions'),
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => <ActionsCell lead={row.original} onEdit={onEdit} />,
    },
  ]
}
