import { useMemo, useState } from 'react'
import { Download, Plus, Trash2, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DataTable } from '@/components/shared/data-table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { counselors } from '@/mock'
import { useStudentsStore } from './store'
import { studentColumns } from './components/student-columns'
import { StudentFiltersBar, defaultStudentFilters, type StudentFilters } from './components/student-filters'
import { StudentFormDialog } from './components/student-form-dialog'
import { SavedViews } from '@/components/shared/saved-views'
import type { Student } from '@/types'
import { useAuthStore } from '@/store/auth-store'
import { visibleStudents } from '@/lib/data-visibility'

import { useStudents } from '@/hooks/use-students'
import { adaptApiStudentToStudent } from '@/lib/student-adapter'
import { isMockMode } from '@/lib/api-client'

export default function StudentsPage() {
  const mockStudents = useStudentsStore((s) => s.students)
  const currentUser = useAuthStore((s) => s.currentUser)
  const mockMode = isMockMode()

  // Counselors see only their assigned students — filter server-side so the full
  // set is fetched, not just whatever happens to be in the first page.
  const listParams = useMemo(
    () => (currentUser.role === 'counselor' ? { counselorId: currentUser.linkedId, limit: 100 } : { limit: 100 }),
    [currentUser.role, currentUser.linkedId],
  )
  const { data: studentResponse } = useStudents(listParams)

  const deleteStudents = useStudentsStore((s) => s.deleteStudents)
  const assignCounselor = useStudentsStore((s) => s.assignCounselor)
  const [filters, setFilters] = useState<StudentFilters>(defaultStudentFilters)
  const [formOpen, setFormOpen] = useState(false)

  const students = useMemo(() => {
    if (!mockMode && studentResponse?.students) {
      return studentResponse.students.map(adaptApiStudentToStudent)
    }
    if (mockMode && studentResponse?.students && studentResponse.students.length > 0) {
      return studentResponse.students.map(adaptApiStudentToStudent)
    }
    return mockStudents
  }, [studentResponse, mockStudents, mockMode])


  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase()

    // In real mode the API is already scoped by counselorId server-side, so we
    // don't need an extra client-side filter — just pass all returned students
    // through the regular visibility check (which also accepts counselors' own students).
    // In real mode the API is already scoped by counselorId server-side for counselors.
    const scopedStudents = (!mockMode && currentUser.role === 'counselor') ? students : visibleStudents(currentUser, students)

    return scopedStudents.filter((s) => {
      if (q && !`${s.name} ${s.email} ${s.phone} ${s.studentId}`.toLowerCase().includes(q)) return false
      if (filters.status !== 'all' && s.status !== filters.status) return false
      if (filters.counselorId !== 'all' && s.counselorId !== filters.counselorId) return false
      if (filters.country !== 'all' && !s.preferredCountries.includes(filters.country)) return false
      if (filters.level !== 'all' && s.preferredLevel !== filters.level) return false
      return true
    })
  }, [currentUser, students, filters])

  const activeCount = filtered.filter((s) => s.status === 'active').length
  const enrolledCount = filtered.filter((s) => s.status === 'enrolled').length
  const avgDocsPct = filtered.length > 0
    ? Math.round(filtered.reduce((sum, s) => sum + (s.documentsUploaded / s.documentsRequired) * 100, 0) / filtered.length)
    : 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Students"
        description="Manage student profiles, academics, and application progress."
        actions={
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus /> Add Student
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">Total Students</p>
          <p className="mt-1 text-xl font-semibold font-tabular">{filtered.length}</p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">Active</p>
          <p className="mt-1 text-xl font-semibold font-tabular">{activeCount}</p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">Enrolled</p>
          <p className="mt-1 text-xl font-semibold font-tabular">{enrolledCount}</p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">Avg Docs Progress</p>
          <p className="mt-1 text-xl font-semibold font-tabular">{avgDocsPct}%</p>
        </Card>
      </div>



      {currentUser.role === 'counselor' && (
        <Card className="border-brand-500/20 bg-brand-500/5 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Assigned to you</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-foreground">{filtered.length} student{filtered.length === 1 ? '' : 's'}</span>
            <span className="text-muted-foreground">are currently assigned to this counselor view.</span>
          </div>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <StudentFiltersBar filters={filters} onChange={setFilters} />
          <DataTable
            columns={studentColumns}
            data={filtered}
            enableRowSelection
            pageSize={10}
            bulkActions={(selected: Student[]) => (
              <>
                <Select onValueChange={(counselorId) => {
                  assignCounselor(selected.map((s) => s.id), counselorId)
                }}>
                  <SelectTrigger className="h-7 w-[140px] text-xs">
                    <UserCheck className="size-3.5 mr-1" />
                    <SelectValue placeholder="Assign" />
                  </SelectTrigger>
                  <SelectContent>
                    {counselors.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toast.success(`Exported ${selected.length} students`)}>
                  <Download className="size-3.5" /> Export
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs text-danger-500 hover:text-danger-600" onClick={() => deleteStudents(selected.map((s) => s.id))}>
                  <Trash2 className="size-3.5" /> Delete
                </Button>
              </>
            )}
          />
        </div>
        <div className="space-y-4">
          <SavedViews />
        </div>
      </div>

      <StudentFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  )
}
