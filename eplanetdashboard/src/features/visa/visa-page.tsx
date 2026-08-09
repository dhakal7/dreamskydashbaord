import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlaneTakeoff, CheckCircle2, Clock, XCircle, FileStack } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { PersonAvatar } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { useVisaStore } from './store'
import { useStudentsStore } from '@/features/students/store'
import { useAuthStore } from '@/store/auth-store'
import { visibleVisaCases } from '@/lib/data-visibility'
import { VisaStatusBadge } from '@/components/shared/status-badges'
import { EmptyState } from '@/components/shared/empty-state'
import { countries } from '@/mock'
import type { VisaCase, VisaStatus } from '@/types'
import { useVisaCases } from '@/hooks/use-visa'



export default function VisaPage() {
  const navigate = useNavigate()
  const mockVisaCases = useVisaStore((s) => s.visaCases)
  const { data: apiVisaData } = useVisaCases()
  const students = useStudentsStore((s) => s.students)
  const currentUser = useAuthStore((s) => s.currentUser)

  const visaCases: VisaCase[] = apiVisaData?.visaCases && apiVisaData.visaCases.length > 0
    ? apiVisaData.visaCases.map((vc) => ({
        id: vc.id,
        studentId: vc.studentId,
        studentName: vc.student ? `${vc.student.firstName} ${vc.student.lastName}` : 'Unknown Student',
        countryName: vc.country ?? 'USA',
        universityName: 'University',
        checklist: [],
        overallStatus: vc.status.toLowerCase() as VisaStatus,
        progress: vc.status === 'APPROVED' ? 100 : vc.status === 'REJECTED' ? 0 : 50,
        submissionDate: vc.submittedAt ?? vc.createdAt,
        appointmentDate: vc.appointmentDate ?? undefined,
      }))
    : mockVisaCases



  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<VisaStatus | 'all'>('all')
  const [countryFilter, setCountryFilter] = useState('all')

  const visible = visibleVisaCases(currentUser, visaCases, students)

  const uniqueCountries = useMemo(() => {
    const countrySet = new Set(visible.map((vc) => vc.countryName))
    return Array.from(countrySet).sort()
  }, [visible])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return visible.filter((vc) => {
      if (q && !`${vc.studentName} ${vc.countryName} ${vc.universityName} ${vc.id}`.toLowerCase().includes(q)) {
        return false
      }
      if (statusFilter !== 'all' && vc.overallStatus !== statusFilter) return false
      if (countryFilter !== 'all' && vc.countryName !== countryFilter) return false
      return true
    })
  }, [visible, search, statusFilter, countryFilter])

  const totalCount = filtered.length
  const inProgressCount = filtered.filter((vc) => vc.overallStatus === 'in_progress').length
  const approvedCount = filtered.filter((vc) => vc.overallStatus === 'approved').length
  const rejectedCount = filtered.filter((vc) => vc.overallStatus === 'rejected').length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Visa Processing"
        description="Track visa applications from medical exams through embassy decision."
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Total Cases</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{totalCount}</p>
          </div>
          <div className="size-10 rounded-lg bg-brand-50 dark:bg-brand-950/20 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <FileStack className="size-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">In Progress</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{inProgressCount}</p>
          </div>
          <div className="size-10 rounded-lg bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Clock className="size-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Approved</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{approvedCount}</p>
          </div>
          <div className="size-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="size-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between border-border/70 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Rejected</p>
            <p className="mt-1 text-2xl font-bold font-tabular">{rejectedCount}</p>
          </div>
          <div className="size-10 rounded-lg bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 flex items-center justify-center">
            <XCircle className="size-5" />
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search cases..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[240px] h-9"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as VisaStatus | 'all')}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="not_started">Not Started</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={countryFilter} onValueChange={setCountryFilter}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Countries</SelectItem>
            {uniqueCountries.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Visa Case Cards */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={PlaneTakeoff}
          title="No visa cases found"
          description="No visa cases match your current filters or scope."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((vc) => {
            const studentData = students.find((s) => s.id === vc.studentId)
            return (
              <Card
                key={vc.id}
                className="p-4 border-border/70 shadow-sm hover:shadow-elevated transition-shadow cursor-pointer"
                onClick={() => navigate(`/visa/${vc.id}`)}
              >
                <div className="flex items-start gap-3">
                  <PersonAvatar
                    name={vc.studentName}
                    color={studentData?.photoColor}
                    className="size-10 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm truncate">{vc.studentName}</p>
                      <VisaStatusBadge status={vc.overallStatus} className="shrink-0 text-[10px] py-0" />
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span>{countries.find((c) => c.name === vc.countryName)?.flag}</span>
                        <span>{vc.countryName}</span>
                      </span>
                      <span className="truncate">{vc.universityName}</span>
                    </div>
                    <div className="mt-2.5 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground font-medium">Progress</span>
                        <span className="font-tabular font-semibold text-foreground">{vc.progress}%</span>
                      </div>
                      <Progress value={vc.progress} className="h-1.5" />
                    </div>
                    {vc.submissionDate && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Submitted: <span className="font-medium text-foreground">{vc.submissionDate}</span>
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
