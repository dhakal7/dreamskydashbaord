import type { ColumnDef } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { Phone, MoreHorizontal } from 'lucide-react'
import type { Lead } from '@/types'
import { PersonAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LeadStageBadge, PriorityBadge } from '@/components/shared/status-badges'

export const leadColumns: ColumnDef<Lead, any>[] = [
  {
    accessorKey: 'name',
    header: 'Lead',
    cell: ({ row }) => (
      <div className="flex items-center gap-2.5">
        <PersonAvatar name={row.original.name} color={row.original.photoColor} className="size-8" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{row.original.name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
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
          <DropdownMenuItem>Log a call</DropdownMenuItem>
          <DropdownMenuItem>Send email</DropdownMenuItem>
          <DropdownMenuItem>Convert to student</DropdownMenuItem>
          <DropdownMenuItem destructive>Delete lead</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
]
