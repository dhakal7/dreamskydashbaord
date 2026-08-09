import { useMemo, useState } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DataTable } from '@/components/shared/data-table'
import { classColumns } from './components/class-columns'
import { ClassFiltersBar, defaultClassFilters, type ClassFilters } from './components/class-filters'

import { getClassesForRole } from './selectors'
import type { ClassSession } from '@/types'
import { useClasses, useMyClasses } from '@/hooks/use-classes'



export default function ClassesPage() {
  const role = useAuthStore((s) => s.currentUser.role)
  const linkedId = useAuthStore((s) => s.currentUser.linkedId)
  const mockClasses = getClassesForRole(role, linkedId)
  const { data: allClassesData } = useClasses()
  const { data: myClassesData } = useMyClasses()

  const baseClasses: ClassSession[] = useMemo(() => {
    const rawList = role === 'teacher' ? (myClassesData ?? []) : (allClassesData?.classes ?? [])
    if (rawList.length > 0) {
      return rawList.map((c) => ({
        id: c.id,
        name: c.name,
        subject: (c.subject ?? 'IELTS') as any,
        teacherId: c.teacherId,
        teacherName: c.teacher ? `${c.teacher.firstName} ${c.teacher.lastName}` : 'Teacher',
        schedule: c.schedule ?? 'Sun/Tue/Thu · 10:00 AM',
        room: 'Room 101',
        startDate: c.startDate ?? c.createdAt,
        endDate: c.endDate ?? c.createdAt,
        capacity: c.capacity,
        enrolledCount: c.enrollments?.length ?? 0,
        status: (c.status?.toLowerCase() ?? 'ongoing') as any,
        nextSessionAt: c.startDate ?? c.createdAt,
      }))
    }
    return mockClasses
  }, [allClassesData, myClassesData, mockClasses, role])


  const [filters, setFilters] = useState<ClassFilters>(defaultClassFilters)


  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return baseClasses.filter((c) => {
      if (q && !`${c.name} ${c.subject} ${c.teacherName} ${c.room}`.toLowerCase().includes(q)) return false
      if (filters.subject !== 'all' && c.subject !== filters.subject) return false
      if (filters.status !== 'all' && c.status !== filters.status) return false
      if (filters.teacherId !== 'all' && c.teacherId !== filters.teacherId) return false
      return true
    })
  }, [baseClasses, filters])

  const ongoingCount = filtered.filter((c) => c.status === 'ongoing').length
  const upcomingCount = filtered.filter((c) => c.status === 'upcoming').length
  const totalStudents = filtered.reduce((sum, c) => sum + c.enrolledCount, 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Classes"
        description="Manage class schedules, rosters, attendance, and materials."
        actions={
          <Button size="sm" disabled>
            Add Class
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">Total Classes</p>
          <p className="mt-1 text-xl font-semibold font-tabular">{filtered.length}</p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">Ongoing</p>
          <p className="mt-1 text-xl font-semibold font-tabular">{ongoingCount}</p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">Upcoming</p>
          <p className="mt-1 text-xl font-semibold font-tabular">{upcomingCount}</p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">Enrolled Students</p>
          <p className="mt-1 text-xl font-semibold font-tabular">{totalStudents}</p>
        </Card>
      </div>

      <ClassFiltersBar filters={filters} onChange={setFilters} />

      <DataTable
        columns={classColumns}
        data={filtered}
        enableRowSelection={false}
        pageSize={10}
        emptyState={
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <p className="font-semibold text-lg">No Classes Found</p>
            <p className="text-sm text-muted-foreground max-w-sm mt-1">
              Try adjusting your filters or search terms to locate specific classes.
            </p>
          </div>
        }
      />
    </div>
  )
}
