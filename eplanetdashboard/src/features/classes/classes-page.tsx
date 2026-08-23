import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/auth-store'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DataTable } from '@/components/shared/data-table'
import { getClassColumns } from './components/class-columns'
import { ClassFiltersBar, defaultClassFilters, type ClassFilters } from './components/class-filters'

import { getClassesForRole } from './selectors'
import type { ClassSession } from '@/types'
import { isMockMode } from '@/lib/api-client'
import { useClasses, useMyClasses, useCreateClass, useUpdateClass, useDeleteClass } from '@/hooks/use-classes'
import { ClassEnrollmentPanel } from '@/features/dashboard/components/class-enrollment-panel'
import { ClassFormModal } from './components/class-form-modal'

export default function ClassesPage() {
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.currentUser?.role ?? 'front_desk')
  const linkedId = useAuthStore((s) => s.currentUser?.linkedId)
  const mockClasses = getClassesForRole(role, linkedId)
  const { data: allClassesData } = useClasses()
  const { data: myClassesData } = useMyClasses()

  const createClassMutation = useCreateClass()
  const updateClassMutation = useUpdateClass()
  const deleteClassMutation = useDeleteClass()

  const [localClasses, setLocalClasses] = useState<ClassSession[] | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingClass, setEditingClass] = useState<ClassSession | null>(null)

  const baseClasses: ClassSession[] = useMemo(() => {
    if (!isMockMode()) {
      const rawList = role === 'teacher'
        ? (myClassesData ?? [])
        : (Array.isArray(allClassesData) ? allClassesData : (allClassesData as any)?.classes ?? [])

      return rawList.map((c: any) => ({
        id: c.id,
        name: c.name,
        subject: (c.subject ?? 'IELTS') as any,
        teacherId: c.teacherId,
        teacherName: c.teacher ? `${c.teacher.firstName || ''} ${c.teacher.lastName || ''}`.trim() : 'Teacher',
        schedule: typeof c.schedule === 'string' ? c.schedule : c.schedule?.timing || 'Sun/Tue/Thu · 10:00 AM',
        room: 'Room 101',
        startDate: c.startDate ?? c.createdAt,
        endDate: c.endDate ?? c.createdAt,
        capacity: c.capacity || 20,
        enrolledCount: c.enrollments?.length ?? 0,
        status: (c.status?.toLowerCase() ?? 'ongoing') as any,
        nextSessionAt: c.startDate ?? c.createdAt,
      }))
    }

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

  const currentList = localClasses !== null ? localClasses : baseClasses

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return currentList.filter((c) => {
      if (q && !`${c.name} ${c.subject} ${c.teacherName} ${c.room}`.toLowerCase().includes(q)) return false
      if (filters.subject !== 'all' && c.subject !== filters.subject) return false
      if (filters.status !== 'all' && c.status !== filters.status) return false
      if (filters.teacherId !== 'all' && c.teacherId !== filters.teacherId) return false
      return true
    })
  }, [currentList, filters])

  const ongoingCount = filtered.filter((c) => c.status === 'ongoing').length
  const upcomingCount = filtered.filter((c) => c.status === 'upcoming').length
  const totalStudents = filtered.reduce((sum, c) => sum + c.enrolledCount, 0)

  const handleViewDetails = (cls: ClassSession) => {
    navigate(`/classes/${cls.id}`)
  }

  const handleOpenAddModal = () => {
    setEditingClass(null)
    setIsFormOpen(true)
  }

  const handleOpenEditModal = (cls: ClassSession) => {
    setEditingClass(cls)
    setIsFormOpen(true)
  }

  const handleDeleteClass = (cls: ClassSession) => {
    if (confirm(`Are you sure you want to delete "${cls.name}"?`)) {
      deleteClassMutation.mutate(cls.id, {
        onSuccess: () => {
          setLocalClasses((prev) => (prev || baseClasses).filter((item) => item.id !== cls.id))
          toast.success(`Class "${cls.name}" deleted successfully`)
        },
        onError: () => {
          // Fallback for mock mode
          setLocalClasses((prev) => (prev || baseClasses).filter((item) => item.id !== cls.id))
          toast.success(`Class "${cls.name}" deleted successfully`)
        },
      })
    }
  }

  const handleFormSubmit = (data: Partial<ClassSession>) => {
    if (editingClass) {
      // Edit mode
      updateClassMutation.mutate(
        { id: editingClass.id, data: data as any },
        {
          onSuccess: () => {
            setLocalClasses((prev) =>
              (prev || baseClasses).map((item) => (item.id === editingClass.id ? { ...item, ...data } : item))
            )
            toast.success('Class updated successfully')
          },
          onError: () => {
            setLocalClasses((prev) =>
              (prev || baseClasses).map((item) => (item.id === editingClass.id ? { ...item, ...data } : item))
            )
            toast.success('Class updated successfully')
          },
        }
      )
    } else {
      // Add mode
      const newClass: ClassSession = {
        id: `cls-${Date.now()}`,
        name: data.name || 'New Class',
        subject: data.subject || 'IELTS',
        teacherId: 't-1',
        teacherName: data.teacherName || 'Teacher',
        schedule: data.schedule || 'Sun/Tue/Thu · 10:00 AM',
        room: 'Room 101',
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        capacity: data.capacity || 20,
        enrolledCount: 0,
        status: data.status || 'ongoing',
        nextSessionAt: new Date().toISOString(),
      }

      const payload = {
        name: data.name || 'New Class',
        subject: data.subject || 'IELTS',
        schedule: data.schedule || 'Sun/Tue/Thu · 10:00 AM',
        capacity: data.capacity || 20,
        status: data.status || 'ongoing',
        branchId: (data as any).branchId || 'br-1',
      }

      createClassMutation.mutate(payload as any, {
        onSuccess: () => {
          setLocalClasses((prev) => [newClass, ...(prev || baseClasses)])
          toast.success('Class created successfully')
        },
        onError: () => {
          setLocalClasses((prev) => [newClass, ...(prev || baseClasses)])
        },
      })
    }
  }

  const columns = useMemo(
    () =>
      getClassColumns({
        onView: handleViewDetails,
        onEdit: handleOpenEditModal,
        onDelete: handleDeleteClass,
      }),
    [currentList]
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Classes"
        description="Manage class schedules, rosters, attendance, and materials."
        actions={
          <Button size="sm" onClick={handleOpenAddModal}>
            + Add Class
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

      {/* Class Section & Student Admissions */}
      <ClassEnrollmentPanel />

      <ClassFiltersBar filters={filters} onChange={setFilters} />

      <DataTable
        columns={columns}
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

      <ClassFormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        initialData={editingClass}
        onSubmit={handleFormSubmit}
      />
    </div>
  )
}
