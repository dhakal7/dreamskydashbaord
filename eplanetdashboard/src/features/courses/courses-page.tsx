import { useMemo, useState } from 'react'
import { GraduationCap, BookOpen, Clock, DollarSign, Plus, Pencil, Trash2, X, Search } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/shared/empty-state'
import { formatCurrency } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { hasPermission } from '@/lib/rbac'
import { useCoursesStore } from './store'
import { CourseDialog } from './components/course-dialog'
import type { Course, StudyLevel } from '@/types'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useUniversitiesStore } from '@/features/universities/store'
import { useUniversities } from '@/hooks/use-universities'
import { universities as seedUniversities } from '@/mock'

const levelMeta: Record<StudyLevel, { label: string; variant: 'default' | 'info' | 'secondary' | 'success' | 'warning' }> = {
  bachelor: { label: 'Bachelor', variant: 'default' },
  master: { label: 'Master', variant: 'info' },
  diploma: { label: 'Diploma', variant: 'secondary' },
  foundation: { label: 'Foundation', variant: 'success' },
  phd: { label: 'PhD', variant: 'warning' },
}

export default function CoursesPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const canManage = hasPermission(currentUser.role, 'courses.manage')
  const { courses, removeCourse } = useCoursesStore()
  const storeUniversities = useUniversitiesStore((s) => s.universities)
  const { data: apiUniData } = useUniversities()

  const universities = apiUniData?.universities && apiUniData.universities.length > 0
    ? apiUniData.universities.map((u) => ({
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
    : (storeUniversities.length > 0 ? storeUniversities : seedUniversities)

  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState('all')
  const [uniFilter, setUniFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return courses.filter((course) => {
      if (q && !`${course.name} ${course.field} ${course.universityName}`.toLowerCase().includes(q)) return false
      if (levelFilter !== 'all' && (course.level ?? '').toLowerCase() !== levelFilter) return false
      if (uniFilter !== 'all' && course.universityId !== uniFilter) return false
      return true
    })
  }, [courses, search, levelFilter, uniFilter])

  const totalCount = filtered.length
  const bachelorCount = filtered.filter((c) => (c.level ?? '').toLowerCase() === 'bachelor').length
  const masterCount = filtered.filter((c) => (c.level ?? '').toLowerCase() === 'master').length
  const diplomaCount = filtered.filter((c) => (c.level ?? '').toLowerCase() === 'diploma').length

  const isFiltered = search || levelFilter !== 'all' || uniFilter !== 'all'

  function handleAdd() {
    setEditingCourse(null)
    setDialogOpen(true)
  }

  function handleEdit(course: Course) {
    setEditingCourse(course)
    setDialogOpen(true)
  }

  function handleDelete(course: Course) {
    if (window.confirm(`Remove ${course.name}? This cannot be undone.`)) {
      removeCourse(course.id)
    }
  }

  function clearFilters() {
    setSearch('')
    setLevelFilter('all')
    setUniFilter('all')
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Courses"
        description="Browse courses by level, duration, intake, and tuition across all partner universities."
        actions={canManage ? (
          <Button size="sm" onClick={handleAdd}>
            <Plus className="mr-1 size-4" /> Add Course
          </Button>
        ) : undefined}
      />

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Total Courses</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{totalCount}</p>
          </div>
          <div className="size-10 rounded-lg bg-brand-50 dark:bg-brand-950/20 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <GraduationCap className="size-5" />
          </div>
        </Card>
        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Bachelor Programs</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{bachelorCount}</p>
          </div>
          <div className="size-10 rounded-lg bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <BookOpen className="size-5" />
          </div>
        </Card>
        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Master Programs</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{masterCount}</p>
          </div>
          <div className="size-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <GraduationCap className="size-5" />
          </div>
        </Card>
        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Diploma Programs</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{diplomaCount}</p>
          </div>
          <div className="size-10 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Clock className="size-5" />
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            icon={<Search />}
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-56"
          />
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              {Object.entries(levelMeta).map(([key, meta]) => (
                <SelectItem key={key} value={key}>{meta.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={uniFilter} onValueChange={setUniFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="University" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Universities</SelectItem>
              {universities.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isFiltered && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1 size-3.5" /> Clear
            </Button>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No courses found"
            description="Try adjusting your filters or search terms."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((course) => {
              const level = levelMeta[course.level]
              return (
                <Card key={course.id} className="p-5 border-border/70 shadow-sm hover:shadow-elevated transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-foreground truncate">{course.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{course.universityName}</p>
                    </div>
                    <Badge variant={level.variant} className="shrink-0 text-[10px] py-0 ml-2">{level.label}</Badge>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Country:</span>
                      <span className="font-medium text-foreground">{course.countryName}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="size-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Duration:</span>
                      <span className="font-medium text-foreground">{course.duration}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="size-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Tuition:</span>
                      <span className="font-medium text-foreground font-tabular">{formatCurrency(course.tuitionUsd, 'USD')}/yr</span>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-border/60">
                    <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-medium">Intakes</p>
                    <div className="flex flex-wrap gap-1.5">
                      {course.intake.map((month) => (
                        <Badge key={month} variant="outline" className="text-[10px] py-0">{month}</Badge>
                      ))}
                    </div>
                  </div>

                  {canManage && (
                    <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={() => handleEdit(course)} title="Edit">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(course)} title="Delete">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <CourseDialog
        course={editingCourse}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}
