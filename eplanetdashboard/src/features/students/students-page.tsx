import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Info, Plus, RotateCcw, Trash2, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DataTable } from '@/components/shared/data-table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStudentsStore } from './store'
import { studentColumns } from './components/student-columns'
import { trashColumns } from './components/trash-columns'
import { StudentFiltersBar, defaultStudentFilters, type StudentFilters } from './components/student-filters'
import { StudentFormDialog } from './components/student-form-dialog'
import { TrashLeadDialog } from '@/features/leads/components/trash-lead-dialog'
import { SavedViews } from '@/components/shared/saved-views'
import type { Student } from '@/types'
import { useAuthStore } from '@/store/auth-store'
import { visibleStudents } from '@/lib/data-visibility'

import { useStudents, useTrashStudents, studentKeys } from '@/hooks/use-students'
import { useCounselors } from '@/hooks/use-counselors'
import { studentApi } from '@/api/student-api'
import { useQueryClient } from '@tanstack/react-query'
import { adaptApiStudentToStudent } from '@/lib/student-adapter'
import { isMockMode } from '@/lib/api-client'

export default function StudentsPage() {
  const navigate = useNavigate()
  const mockStudents = useStudentsStore((s) => s.students)
  const currentUser = useAuthStore((s) => s.currentUser)
  const isAdmin = currentUser.role === 'super_admin' || currentUser.role === 'branch_admin'
  const canAssignCounselor = currentUser.role === 'super_admin' || currentUser.role === 'branch_admin' || currentUser.role === 'front_desk'
  const mockMode = isMockMode()
  const [viewTab, setViewTab] = useState<'active' | 'trash'>('active')

  // Filter server-side so only ENROLLED / processing stage students are fetched for Students Page
  const listParams = useMemo(
    () => ({
      stageIn: 'ENROLLED,APPLIED,OFFER_RECEIVED,VISA_APPLIED,VISA_APPROVED,DEPARTED',
      counselorId: currentUser.role === 'counselor' ? currentUser.linkedId : undefined,
      limit: 200,
    }),
    [currentUser.role, currentUser.linkedId],
  )
  const {
    data: studentResponse,
    isLoading: isStudentsLoading,
    isError: isStudentsError,
    error: studentsError,
    refetch: refetchStudents,
  } = useStudents(listParams)

  // Dedicated targeted query for class-only enquiry records using backend JSON metadata filter
  const classOnlyListParams = useMemo(
    () => ({
      isClassOnly: true,
      counselorId: currentUser.role === 'counselor' ? currentUser.linkedId : undefined,
      limit: 200,
    }),
    [currentUser.role, currentUser.linkedId],
  )
  const { data: classOnlyResponse, isError: isClassOnlyError } = useStudents(classOnlyListParams)

  const {
    data: trashResponse,
    isLoading: isTrashLoading,
    isError: isTrashError,
    error: trashError,
    refetch: refetchTrash,
  } = useTrashStudents(
    { limit: 100 },
    isAdmin && viewTab === 'trash',
  )
  const { data: counselorOptions = [], isLoading: isCounselorsLoading } = useCounselors(canAssignCounselor)
  const queryClient = useQueryClient()

  const deleteStudents = useStudentsStore((s) => s.deleteStudents)
  const assignCounselor = useStudentsStore((s) => s.assignCounselor)
  const [filters, setFilters] = useState<StudentFilters>(defaultStudentFilters)
  const [formOpen, setFormOpen] = useState(false)
  const [bulkTrashTargets, setBulkTrashTargets] = useState<Student[]>([])
  const [isBulkTrashing, setIsBulkTrashing] = useState(false)
  const [isBulkAssigning, setIsBulkAssigning] = useState(false)

  const handleBulkDelete = (selected: Student[]) => {
    if (selected.length === 0) return
    setBulkTrashTargets(selected)
  }

  const handleConfirmBulkTrash = async (reason: string) => {
    if (bulkTrashTargets.length === 0) return
    setIsBulkTrashing(true)
    try {
      if (mockMode) {
        deleteStudents(bulkTrashTargets.map((s) => s.id))
        toast.success(`${bulkTrashTargets.length} student${bulkTrashTargets.length > 1 ? 's' : ''} moved to Trash successfully`)
        setBulkTrashTargets([])
        return
      }

      const results = await Promise.allSettled(
        bulkTrashTargets.map((s) => studentApi.remove(s.id, reason))
      )
      const succeededCount = results.filter((r) => r.status === 'fulfilled').length
      const failedResults = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')

      if (succeededCount > 0) {
        queryClient.invalidateQueries({ queryKey: studentKeys.lists() })
        queryClient.invalidateQueries({ queryKey: studentKeys.trashLists() })
        queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        queryClient.invalidateQueries({ queryKey: ['documents'] })
      }

      if (failedResults.length === 0) {
        toast.success(`${succeededCount} student${succeededCount > 1 ? 's' : ''} moved to Trash successfully`)
        setBulkTrashTargets([])
      } else if (succeededCount > 0) {
        toast.warning(
          `Moved ${succeededCount} student${succeededCount > 1 ? 's' : ''} to Trash, but ${failedResults.length} failed.`
        )
        setBulkTrashTargets([])
      } else {
        const firstReason = failedResults[0]?.reason
        const msg = firstReason instanceof Error ? firstReason.message : 'Failed to move students to Trash'
        toast.error(msg)
        throw firstReason instanceof Error ? firstReason : new Error(msg)
      }
    } finally {
      setIsBulkTrashing(false)
    }
  }

  const handleBulkAssignCounselor = async (selected: Student[], counselorId: string) => {
    if (selected.length === 0 || !counselorId) return
    if (mockMode) {
      assignCounselor(selected.map((s) => s.id), counselorId)
      toast.success(`Assigned counselor to ${selected.length} student${selected.length > 1 ? 's' : ''}`)
      return
    }

    setIsBulkAssigning(true)
    try {
      const results = await Promise.allSettled(
        selected.map((s) => studentApi.update(s.id, { assignedCounselorId: counselorId }))
      )
      const succeededCount = results.filter((r) => r.status === 'fulfilled').length
      const failedResults = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')

      if (succeededCount > 0) {
        queryClient.invalidateQueries({ queryKey: studentKeys.lists() })
        queryClient.invalidateQueries({ queryKey: studentKeys.details() })
        queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      }

      if (failedResults.length === 0) {
        toast.success(`Assigned counselor to ${succeededCount} student${succeededCount > 1 ? 's' : ''}`)
      } else if (succeededCount > 0) {
        toast.warning(
          `Assigned counselor to ${succeededCount} student${succeededCount > 1 ? 's' : ''}, but ${failedResults.length} failed.`
        )
      } else {
        const firstReason = failedResults[0]?.reason
        toast.error(firstReason instanceof Error ? firstReason.message : 'Failed to assign counselor')
      }
    } finally {
      setIsBulkAssigning(false)
    }
  }

  const handleBulkRestore = async (selected: Student[]) => {
    if (!confirm(`Restore ${selected.length} student${selected.length > 1 ? 's' : ''}? They will be returned to the active pipeline.`)) return

    const results = await Promise.allSettled(selected.map((s) => studentApi.restore(s.id)))
    const succeededCount = results.filter((r) => r.status === 'fulfilled').length
    const failedResults = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')

    if (succeededCount > 0) {
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() })
      queryClient.invalidateQueries({ queryKey: studentKeys.trashLists() })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    }

    if (failedResults.length === 0) {
      toast.success(`${succeededCount} student${succeededCount > 1 ? 's' : ''} restored successfully`)
    } else if (succeededCount > 0) {
      toast.warning(
        `Restored ${succeededCount} student${succeededCount > 1 ? 's' : ''}, but ${failedResults.length} failed.`
      )
    } else {
      const firstReason = failedResults[0]?.reason
      toast.error(firstReason instanceof Error ? firstReason.message : 'Failed to restore students')
    }
  }

  const classOnlyLeads = useMemo(() => {
    return (classOnlyResponse?.students ?? [])
      .filter((s: any) => s.isClassOnly || s.academicBackground?.isClassOnly || s.academicBackground?.serviceType === 'CLASS_ONLY')
      .map(adaptApiStudentToStudent)
  }, [classOnlyResponse])

  const students = useMemo(() => {
    if (viewTab === 'trash') {
      return (trashResponse?.students ?? []).map(adaptApiStudentToStudent)
    }
    if (!mockMode) {
      const regularStudents = (studentResponse?.students ?? []).map(adaptApiStudentToStudent)
      const existingIds = new Set(regularStudents.map((s) => s.id))
      const extraClassOnly = classOnlyLeads.filter((s) => !existingIds.has(s.id))
      return [...regularStudents, ...extraClassOnly]
    }
    // In mock mode, exclude leads unless marked class-only
    return mockStudents.filter((s) => ((s as any).status !== 'lead' && (s as any).currentStage !== 'LEAD') || (s as any).isClassOnly)
  }, [viewTab, trashResponse, studentResponse, classOnlyLeads, mockStudents, mockMode])

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase()

    // In real mode the API is already scoped by counselorId server-side, so we
    // don't need an extra client-side filter — just pass all returned students
    // through the regular visibility check (which also accepts counselors' own students).
    const scopedStudents = (!mockMode && currentUser.role === 'counselor')
      ? students
      : visibleStudents(currentUser, students, { verifiedBranchScopedApi: !mockMode })

    return scopedStudents.filter((s) => {
      if (q && !`${s.name} ${s.email} ${s.phone} ${s.studentId}`.toLowerCase().includes(q)) return false
      if (viewTab === 'active') {
        if (filters.status !== 'all' && s.status !== filters.status) return false
        if (filters.counselorId !== 'all' && s.counselorId !== filters.counselorId) return false
        if (filters.country !== 'all' && !s.preferredCountries.includes(filters.country)) return false
        if (filters.level !== 'all' && s.preferredLevel !== filters.level) return false
      }
      return true
    })
  }, [viewTab, currentUser, students, filters])

  const activeCount = filtered.filter((s) => s.status === 'active').length
  const enrolledCount = filtered.filter((s) => s.status === 'enrolled').length
  const avgDocsPct = filtered.length > 0
    ? Math.round(filtered.reduce((sum, s) => sum + (s.documentsUploaded / s.documentsRequired) * 100, 0) / filtered.length)
    : 0
  const isCurrentTabLoading = !mockMode && (viewTab === 'trash' ? isTrashLoading : isStudentsLoading)
  const isCurrentTabError = !mockMode && (viewTab === 'trash' ? isTrashError : isStudentsError)
  const currentTabError = viewTab === 'trash' ? trashError : studentsError

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

      {isCurrentTabError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-500/40 bg-danger-500/10 p-3.5 text-xs text-danger-600 dark:text-danger-400">
          <div>
            <p className="font-semibold">
              Failed to load {viewTab === 'trash' ? 'Trash records' : 'student records'} from the server
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {currentTabError instanceof Error
                ? currentTabError.message
                : 'An unexpected network or server error occurred while fetching students.'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => (viewTab === 'trash' ? refetchTrash() : refetchStudents())}
          >
            Retry
          </Button>
        </div>
      )}

      {isCurrentTabLoading && (
        <div className="rounded-lg border border-border/60 bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground">
          Loading {viewTab === 'trash' ? 'Trash records' : 'live student records'}...
        </div>
      )}

      {viewTab === 'active' && classOnlyResponse?.pagination?.isTruncated && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-300">
          <Info className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p>
            Class inquiry results may be incomplete because only the first 500 candidate records were evaluated. If a student is missing, refine your search by name, email, or phone.
          </p>
        </div>
      )}

      {viewTab === 'active' && isClassOnlyError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="size-4 shrink-0 text-muted-foreground mt-0.5" />
          <p>
            Secondary class inquiry search is temporarily unavailable. Enrolled student directory remains fully accessible.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">{viewTab === 'trash' ? 'Total in Trash' : 'Total Students'}</p>
          <p className="mt-1 text-xl font-semibold font-tabular">
            {isCurrentTabError
              ? '—'
              : viewTab === 'trash'
                ? (trashResponse?.pagination?.total ?? filtered.length)
                : (studentResponse?.pagination?.total ?? filtered.length)}
          </p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">Active</p>
          <p className="mt-1 text-xl font-semibold font-tabular">
            {!mockMode && isStudentsError ? '—' : (studentResponse?.pagination?.total ?? activeCount)}
          </p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">Enrolled</p>
          <p className="mt-1 text-xl font-semibold font-tabular">
            {!mockMode && isStudentsError ? '—' : enrolledCount}
          </p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground">Avg Docs Progress</p>
          <p className="mt-1 text-xl font-semibold font-tabular">
            {!mockMode && isStudentsError ? '—' : `${avgDocsPct}%`}
          </p>
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

      {isAdmin && (
        <div className="flex items-center justify-between border-b pb-3">
          <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as 'active' | 'trash')}>
            <TabsList>
              <TabsTrigger value="active">Active Students</TabsTrigger>
              <TabsTrigger value="trash" className="flex items-center gap-1.5">
                <Trash2 className="size-3.5" />
                Trash / Recycle Bin
                {trashResponse?.pagination?.total ? (
                  <span className="ml-1 rounded-full bg-muted-foreground/20 px-1.5 py-0.2 text-[10px] font-semibold">
                    {trashResponse.pagination.total}
                  </span>
                ) : null}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      {viewTab === 'trash' && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-200">
          <p className="font-semibold">Recycle Bin / Soft-Deleted Records</p>
          <p className="mt-0.5 text-muted-foreground">
            Showing students in Trash. Permanent purge is disabled. Records retain all history, documents, and counselor links. Restoring returns a student to their active pipeline stage without triggering notifications or portal activations.
          </p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <StudentFiltersBar filters={filters} onChange={setFilters} />
          <DataTable
            columns={viewTab === 'trash' ? trashColumns : studentColumns}
            data={filtered}
            enableRowSelection
            pageSize={10}
            onRowDoubleClick={(student) => navigate(`/students/${student.id}`)}
            bulkActions={(selected: Student[]) => (
              viewTab === 'trash' ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400"
                  onClick={() => handleBulkRestore(selected)}
                >
                  <RotateCcw className="size-3.5 mr-1" /> Restore Selected ({selected.length})
                </Button>
              ) : (
                <>
                  {canAssignCounselor && (
                    <Select
                      disabled={isBulkAssigning || isCounselorsLoading || counselorOptions.length === 0}
                      onValueChange={(counselorId) => {
                        handleBulkAssignCounselor(selected, counselorId)
                      }}
                    >
                      <SelectTrigger className="h-7 w-[140px] text-xs">
                        <UserCheck className="size-3.5 mr-1" />
                        <SelectValue placeholder={isBulkAssigning ? 'Assigning...' : 'Assign'} />
                      </SelectTrigger>
                      <SelectContent>
                        {counselorOptions.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toast.success(`Exported ${selected.length} students`)}>
                    <Download className="size-3.5" /> Export
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs text-danger-500 hover:text-danger-600"
                      disabled={isBulkTrashing}
                      onClick={() => handleBulkDelete(selected)}
                    >
                      <Trash2 className="size-3.5 mr-1" /> Move to Trash
                    </Button>
                  )}
                </>
              )
            )}
          />
        </div>
        <div className="space-y-4">
          <SavedViews />
        </div>
      </div>

      <StudentFormDialog open={formOpen} onOpenChange={setFormOpen} />

      <TrashLeadDialog
        open={bulkTrashTargets.length > 0}
        onOpenChange={(open) => {
          if (!open) setBulkTrashTargets([])
        }}
        lead={
          bulkTrashTargets.length > 0
            ? {
                id: bulkTrashTargets[0].id,
                name:
                  bulkTrashTargets.length === 1
                    ? bulkTrashTargets[0].name
                    : `${bulkTrashTargets.length} selected students`,
              }
            : null
        }
        onConfirm={handleConfirmBulkTrash}
        isSubmitting={isBulkTrashing}
      />
    </div>
  )
}
