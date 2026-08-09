import { useState } from 'react'
import { Globe2, Landmark, Users, DollarSign, Plus, Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { hasPermission } from '@/lib/rbac'
import { useUniversitiesStore } from '@/features/universities/store'
import { toast } from 'sonner'
import { useCountriesStore } from './store'
import { CountryDialog } from './components/country-dialog'
import type { Country } from '@/types'

const visaDifficultyMeta: Record<Country['visaDifficulty'], { label: string; variant: 'success' | 'warning' | 'danger' }> = {
  easy: { label: 'Easy', variant: 'success' },
  moderate: { label: 'Moderate', variant: 'warning' },
  strict: { label: 'Strict', variant: 'danger' },
}

export default function CountriesPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const canManage = hasPermission(currentUser.role, 'countries.manage')
  const { countries, removeCountry } = useCountriesStore()
  const universities = useUniversitiesStore((s) => s.universities)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCountry, setEditingCountry] = useState<Country | null>(null)

  const totalStudents = countries.reduce((sum, c) => sum + c.studentCount, 0)
  const totalUniversities = universities.length
  const avgTuition = countries.length > 0
    ? Math.round(countries.reduce((sum, c) => sum + c.avgTuitionUsd, 0) / countries.length)
    : 0

  function handleAdd() {
    setEditingCountry(null)
    setDialogOpen(true)
  }

  function handleEdit(country: Country) {
    setEditingCountry(country)
    setDialogOpen(true)
  }

  function handleDelete(country: Country) {
    const linked = universities.filter((u) => u.countryId === country.id)
    if (linked.length > 0) {
      toast.error(`Remove its universities first (${linked.length} linked)`)
      return
    }
    if (window.confirm(`Remove ${country.name}? This cannot be undone.`)) {
      removeCountry(country.id)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Countries"
        description="Explore study destinations with university counts, visa difficulty, and popular courses."
        actions={canManage ? (
          <Button size="sm" onClick={handleAdd}>
            <Plus className="mr-1 size-4" /> Add Country
          </Button>
        ) : undefined}
      />

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Total Countries</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{countries.length}</p>
          </div>
          <div className="size-10 rounded-lg bg-brand-50 dark:bg-brand-950/20 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <Globe2 className="size-5" />
          </div>
        </Card>
        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Total Students</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{totalStudents.toLocaleString()}</p>
          </div>
          <div className="size-10 rounded-lg bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Users className="size-5" />
          </div>
        </Card>
        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Total Universities</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{totalUniversities}</p>
          </div>
          <div className="size-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Landmark className="size-5" />
          </div>
        </Card>
        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Avg. Tuition</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{formatCurrency(avgTuition, 'USD')}</p>
          </div>
          <div className="size-10 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <DollarSign className="size-5" />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {countries.map((country) => {
          const difficulty = visaDifficultyMeta[country.visaDifficulty]
          const uniCount = universities.filter((u) => u.countryId === country.id).length

          return (
            <Card key={country.id} className="p-5 border-border/70 shadow-sm hover:shadow-elevated transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{country.flag}</span>
                  <div>
                    <h3 className="font-bold text-foreground">{country.name}</h3>
                    <p className="text-xs text-muted-foreground">{country.code}</p>
                  </div>
                </div>
                <Badge variant={difficulty.variant} className="text-[10px] py-0">
                  {difficulty.label}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <Landmark className="size-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Universities:</span>
                  <span className="font-semibold text-foreground">{uniCount}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="size-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Students:</span>
                  <span className="font-semibold text-foreground">{country.studentCount}</span>
                </div>
              </div>

              <div className="mb-3">
                <p className="text-xs text-muted-foreground mb-1">Avg. Tuition</p>
                <p className="font-semibold text-foreground font-tabular">{formatCurrency(country.avgTuitionUsd, 'USD')}/yr</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Popular Courses</p>
                <div className="flex flex-wrap gap-1.5">
                  {country.popularCourses.slice(0, 3).map((course) => (
                    <Badge key={course} variant="secondary" className="text-[10px] py-0">{course}</Badge>
                  ))}
                </div>
              </div>

              {canManage && (
                <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={() => handleEdit(country)} title="Edit">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(country)} title="Delete">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <CountryDialog country={editingCountry} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
