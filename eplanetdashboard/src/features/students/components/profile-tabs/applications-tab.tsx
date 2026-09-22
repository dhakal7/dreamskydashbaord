import { useState } from 'react'
import dayjs from 'dayjs'
import { Link } from 'react-router-dom'
import { ExternalLink, Loader2, PlaneTakeoff } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ApplicationStageBadge } from '@/components/shared/status-badges'
import { useApplicationsStore } from '@/features/applications/store'
import { useApplications } from '@/hooks/use-applications'
import { isMockMode } from '@/lib/api-client'
import { formatCurrency } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { hasPermission } from '@/lib/rbac'
import { StartVisaDialog } from './start-visa-dialog'
import type { ApplicationStage, Student } from '@/types'

const BACKEND_STATUS_TO_STAGE: Record<string, ApplicationStage> = {
  DRAFT: 'submitted',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'university_review',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  DEFERRED: 'conditional_offer',
  WITHDRAWN: 'rejected',
}

function resolveAppStage(status?: string, offers?: any[]): ApplicationStage {
  const normStatus = (status || '').toUpperCase()
  if (normStatus === 'REJECTED' || normStatus === 'WITHDRAWN') return 'rejected'

  if (offers && offers.length > 0) {
    const sorted = [...offers].sort((a, b) => 
      new Date(b.receivedAt || b.createdAt || 0).getTime() - new Date(a.receivedAt || a.createdAt || 0).getTime()
    )
    const latestOffer = sorted[0]
    const stageInDetails = latestOffer.details?.stage as ApplicationStage | undefined
    if (stageInDetails) return stageInDetails

    if (latestOffer.type === 'CONDITIONAL') return 'conditional_offer'
    if (latestOffer.type === 'UNCONDITIONAL') {
      if (normStatus === 'ACCEPTED') return 'accepted'
      return 'unconditional_offer'
    }
  }

  if (normStatus === 'ACCEPTED') return 'accepted'
  if (!normStatus) return 'submitted'
  return BACKEND_STATUS_TO_STAGE[normStatus] ?? 'submitted'
}

export function ApplicationsTab({ student }: { student: Student }) {
  const { data: apiAppData, isLoading } = useApplications({ studentId: student.id })
  const mockApps = useApplicationsStore((s) => s.applications).filter((a) => a.studentId === student.id)
  const currentUser = useAuthStore((s) => s.currentUser)
  const canStartVisa = hasPermission(currentUser.role, 'visa.manage') ||
    (currentUser.role !== 'student' && currentUser.role !== 'referral_agent')

  // Track which application's Start Visa dialog is open (null = none)
  const [visaDialogApp, setVisaDialogApp] = useState<{
    id: string
    universityName: string
    courseName: string
    countryName: string
  } | null>(null)

  const apps = !isMockMode()
    ? (apiAppData?.applications ?? []).map((app) => ({
        id: app.id,
        applicationRef: app.id.length > 12 ? `APP-${app.id.slice(-6).toUpperCase()}` : app.id,
        studentId: app.studentId,
        studentName: app.student ? `${app.student.firstName} ${app.student.lastName}` : student.name,
        universityId: app.universityId ?? '',
        universityName: app.university?.name ?? 'Unknown University',
        courseId: app.courseId ?? '',
        courseName: app.course?.name ?? 'Course',
        countryName: 'General',
        stage: resolveAppStage(app.status, app.offers),
        counselorId: '',
        counselorName: 'Counselor',
        submittedDate: app.submittedAt ?? app.createdAt,
        intake: (app as any).intake || (app.intakeMonth && app.intakeYear ? `${app.intakeMonth} ${app.intakeYear}` : 'Upcoming'),
        tuitionUsd: 15000,
        lastUpdate: app.updatedAt ?? app.createdAt,
      }))
    : mockApps

  if (!isMockMode() && isLoading) {
    return (
      <Card className="p-8 text-center flex flex-col items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary mb-2" />
        <p className="text-sm text-muted-foreground">Loading applications...</p>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {apps.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No applications submitted.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/60">
              <tr>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ref / University</th>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Course</th>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stage</th>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Intake</th>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Updated</th>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.id} className="border-b border-border/70 last:border-0 hover:bg-accent/50">
                  <td className="whitespace-nowrap px-3.5 py-2.5">
                    <Link
                      to={`/applications/${app.id}`}
                      className="text-[13px] font-medium flex items-center gap-1.5 hover:underline cursor-pointer text-primary"
                    >
                      {app.universityName} <ExternalLink className="size-3 text-muted-foreground" />
                    </Link>
                    <p className="text-xs text-muted-foreground font-tabular">{app.applicationRef} · {app.countryName}</p>
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">
                    <p className="text-[13px]">{app.courseName}</p>
                    <p className="text-xs text-muted-foreground font-tabular">{formatCurrency(app.tuitionUsd)}</p>
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">
                    <ApplicationStageBadge stage={app.stage} />
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-[13px]">
                    {app.intake}
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-muted-foreground font-tabular">
                    {dayjs(app.lastUpdate).format('MMM D, YYYY')}
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">
                    {canStartVisa && app.stage === 'accepted' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1 border-emerald-500/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-500 font-medium"
                        onClick={() =>
                          setVisaDialogApp({
                            id: app.id,
                            universityName: app.universityName,
                            courseName: app.courseName,
                            countryName: app.countryName,
                          })
                        }
                      >
                        <PlaneTakeoff className="size-3" />
                        Start Visa Processing
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pre-filled visa creation dialog */}
      {visaDialogApp && (
        <StartVisaDialog
          open={!!visaDialogApp}
          onOpenChange={(open) => { if (!open) setVisaDialogApp(null) }}
          student={student}
          application={visaDialogApp}
        />
      )}
    </div>
  )
}
