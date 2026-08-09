import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileStack, Plus, GraduationCap, CheckCircle2, FileCheck } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DataTable } from '@/components/shared/data-table'
import { useApplicationsStore } from './store'
import { applicationColumns } from './components/application-columns'
import { ApplicationFiltersBar, defaultApplicationFilters, type ApplicationFilters } from './components/application-filters'
import { useAuthStore } from '@/store/auth-store'
import { useStudentsStore } from '@/features/students/store'
import { visibleApplications } from '@/lib/data-visibility'
import { hasPermission } from '@/lib/rbac'
import type { Application } from '@/types'
import { useApplications } from '@/hooks/use-applications'



export default function ApplicationsPage() {
  const navigate = useNavigate()
  const mockApplications = useApplicationsStore((s) => s.applications)
  const { data: apiAppData } = useApplications()
  const students = useStudentsStore((s) => s.students)
  const currentUser = useAuthStore((s) => s.currentUser)
  const canManage = hasPermission(currentUser.role, 'applications.manage')
  const [filters, setFilters] = useState<ApplicationFilters>(defaultApplicationFilters)

  const applications: Application[] = apiAppData?.applications && apiAppData.applications.length > 0
    ? apiAppData.applications.map((app) => ({
        id: app.id,
        applicationRef: app.id,
        studentId: app.studentId,
        studentName: app.student ? `${app.student.firstName} ${app.student.lastName}` : 'Unknown Student',
        universityId: app.universityId ?? '',
        universityName: app.university?.name ?? 'Unknown University',
        courseId: app.courseId ?? '',
        courseName: app.course?.name ?? 'Course',
        countryName: 'General',
        stage: (app.status.toLowerCase() ?? 'submitted') as any,
        counselorId: '',
        counselorName: 'Counselor',
        submittedDate: app.submittedAt ?? app.createdAt,
        intake: app.intakeMonth && app.intakeYear ? `${app.intakeMonth} ${app.intakeYear}` : 'Fall 2026',
        tuitionUsd: 15000,
        lastUpdate: app.updatedAt ?? app.createdAt,
      }))
    : mockApplications



  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return visibleApplications(currentUser, applications, students).filter((app) => {
      if (q && !`${app.studentName} ${app.applicationRef} ${app.courseName} ${app.universityName}`.toLowerCase().includes(q)) {
        return false
      }
      if (filters.stage !== 'all' && app.stage !== filters.stage) return false
      if (filters.country !== 'all' && app.countryName !== filters.country) return false
      if (filters.university !== 'all' && app.universityName !== filters.university) return false
      if (filters.counselor !== 'all' && app.counselorName !== filters.counselor) return false
      return true
    })
  }, [applications, currentUser, filters, students])

  // Count helper functions
  const totalCount = filtered.length
  const pendingReviewCount = filtered.filter((a) => a.stage === 'university_review').length
  const offerCount = filtered.filter((a) => a.stage === 'conditional_offer' || a.stage === 'unconditional_offer').length
  const acceptedCount = filtered.filter((a) => a.stage === 'accepted').length

  const handleRowClick = (app: any) => {
    navigate(`/applications/${app.id}`)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Applications"
        description="Track applications from submission through university review to offer and acceptance."
        actions={
          canManage ? (
            <Button size="sm">
              <Plus className="mr-1 size-4" /> Add Application
            </Button>
          ) : undefined
        }
      />

      {/* KPI stats */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Total Applications</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{totalCount}</p>
          </div>
          <div className="size-10 rounded-lg bg-brand-50 dark:bg-brand-950/20 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <FileStack className="size-5" />
          </div>
        </Card>
        
        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Under Review</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{pendingReviewCount}</p>
          </div>
          <div className="size-10 rounded-lg bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <GraduationCap className="size-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Offers Received</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{offerCount}</p>
          </div>
          <div className="size-10 rounded-lg bg-warning-50 dark:bg-warning-950/20 text-warning-600 dark:text-warning-400 flex items-center justify-center">
            <FileCheck className="size-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Enrolled / Accepted</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{acceptedCount}</p>
          </div>
          <div className="size-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="size-5" />
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <ApplicationFiltersBar filters={filters} onChange={setFilters} />
        
        <DataTable
          columns={applicationColumns}
          data={filtered}
          enableRowSelection={false}
          onRowClick={handleRowClick}
          pageSize={10}
          emptyState={
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <FileStack className="size-10 text-muted-foreground/50 mb-3" />
              <h3 className="font-semibold text-lg">No Applications Found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-1">
                Try adjusting your filters or search terms to locate specific records.
              </p>
            </div>
          }
        />
      </div>
    </div>
  )
}
