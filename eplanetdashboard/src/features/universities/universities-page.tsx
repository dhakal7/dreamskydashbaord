import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Landmark, GraduationCap, Globe2, DollarSign, Award, Plus, Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { universityColumns } from './components/university-columns'
import { UniversityFiltersBar, defaultUniversityFilters, type UniversityFilters } from './components/university-filters'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { hasPermission } from '@/lib/rbac'
import { useCoursesStore } from '@/features/courses/store'
import { useUniversitiesStore } from './store'
import { UniversityDialog } from './components/university-dialog'
import type { University } from '@/types'

import { useUniversities } from '@/hooks/use-universities'
import { isMockMode } from '@/lib/api-client'

export default function UniversitiesPage() {
  const [searchParams] = useSearchParams()
  const initialCountry = searchParams.get('country') || 'all'
  const currentUser = useAuthStore((s) => s.currentUser)
  const canManage = hasPermission(currentUser.role, 'universities.manage')
  const { universities: mockUniversities, removeUniversity } = useUniversitiesStore()
  const { data: apiUniData } = useUniversities()
  const courses = useCoursesStore((s) => s.courses)

  const universities = !isMockMode()
    ? (apiUniData?.universities ?? []).map((u) => ({
        id: u.id,
        name: u.name,
        countryId: u.countryId,
        countryName: u.country?.name ?? 'Country',
        countryFlag: '🌐',
        city: u.city ?? 'City',
        logo: u.logoUrl ?? undefined,
        website: u.websiteUrl ?? '',
        qsRanking: u.ranking ?? 500,
        scholarshipAvailable: true,
        scholarshipDetails: 'Available',
        tuitionFromUsd: 15000,
        isActive: u.isActive,
      }))
    : mockUniversities


  const [filters, setFilters] = useState<UniversityFilters>({
    ...defaultUniversityFilters,
    country: initialCountry,
  })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUniversity, setEditingUniversity] = useState<University | null>(null)

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return universities.filter((uni) => {
      if (q && !`${uni.name} ${uni.city} ${uni.countryName}`.toLowerCase().includes(q)) return false
      if (filters.country !== 'all' && uni.countryId !== filters.country) return false
      if (filters.scholarship === 'available' && !uni.scholarshipAvailable) return false
      if (filters.scholarship === 'none' && uni.scholarshipAvailable) return false
      return true
    })
  }, [universities, filters])

  const totalCount = filtered.length
  const scholarshipCount = filtered.filter((u) => u.scholarshipAvailable).length
  const avgTuition = filtered.length > 0
    ? Math.round(filtered.reduce((sum, u) => sum + u.tuitionFromUsd, 0) / filtered.length)
    : 0
  const uniqueCountries = new Set(filtered.map((u) => u.countryName)).size

  const columns = useMemo(() => {
    if (!canManage) return universityColumns
    return [
      ...universityColumns,
      {
        id: 'actions',
        header: '' as any,
        cell: ({ row }: { row: { original: University } }) => {
          const uni = row.original
          return (
            <div className="flex items-center justify-end gap-1">
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={() => handleEdit(uni)} title="Edit">
                <Pencil className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(uni)} title="Delete">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )
        },
      } as any,
    ]
  }, [canManage])

  function handleAdd() {
    setEditingUniversity(null)
    setDialogOpen(true)
  }

  function handleEdit(uni: University) {
    setEditingUniversity(uni)
    setDialogOpen(true)
  }

  function handleDelete(uni: University) {
    const linked = courses.filter((c) => c.universityId === uni.id)
    if (linked.length > 0) {
      toast.error(`Remove its courses first (${linked.length} linked)`)
      return
    }
    if (window.confirm(`Remove ${uni.name}? This cannot be undone.`)) {
      removeUniversity(uni.id)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Universities"
        description="Browse partner universities with rankings, scholarships, and deadlines."
        actions={canManage ? (
          <Button size="sm" onClick={handleAdd}>
            <Plus className="mr-1 size-4" /> Add University
          </Button>
        ) : undefined}
      />

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Total Universities</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{totalCount}</p>
          </div>
          <div className="size-10 rounded-lg bg-brand-50 dark:bg-brand-950/20 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <Landmark className="size-5" />
          </div>
        </Card>
        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Countries</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{uniqueCountries}</p>
          </div>
          <div className="size-10 rounded-lg bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Globe2 className="size-5" />
          </div>
        </Card>
        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Avg. Tuition</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{formatCurrency(avgTuition, 'USD')}</p>
          </div>
          <div className="size-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <DollarSign className="size-5" />
          </div>
        </Card>
        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">With Scholarships</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{scholarshipCount}</p>
          </div>
          <div className="size-10 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Award className="size-5" />
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <UniversityFiltersBar filters={filters} onChange={setFilters} />

        <DataTable
          columns={columns}
          data={filtered}
          enableRowSelection={false}
          pageSize={10}
          emptyState={
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <GraduationCap className="size-10 text-muted-foreground/50 mb-3" />
              <h3 className="font-semibold text-lg">No Universities Found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-1">Try adjusting your filters or search terms.</p>
            </div>
          }
        />
      </div>

      <UniversityDialog university={editingUniversity} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
