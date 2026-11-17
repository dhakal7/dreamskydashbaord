import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { ApplicationStageBadge, DocumentStatusBadge } from '@/components/shared/status-badges'
import { FileStack, PlaneTakeoff, FolderKanban, CalendarClock, Bell, ChevronRight, CheckCircle2, AlertTriangle, Download, AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { RoleStatCards } from './shared'
import { getStudentDashboard } from '../role-selectors'
import { useAuthStore } from '@/store/auth-store'
import { useAppointmentsStore } from '@/features/appointments/store'
import { useDocumentsStore } from '@/features/documents/store'
import { useReviewDocument, useDownloadDocument } from '@/hooks/use-documents'
import type { StudentDocument } from '@/types'
import { isMockMode } from '@/lib/api-client'
import {
  usePortalDashboard,
  usePortalApplications,
  usePortalVisaCases,
  usePortalDocuments,
  usePortalAppointments,
} from '@/hooks/use-portal'

const VISA_PROGRESS_BY_STATUS: Record<string, number> = {
  PREPARATION: 20,
  DOCUMENTS_READY: 35,
  SUBMITTED: 50,
  BIOMETRICS: 65,
  INTERVIEW: 80,
  DECISION_PENDING: 90,
  APPROVED: 100,
  GRANTED: 100,
  REJECTED: 100,
  REFUSED: 100,
}

export function StudentDashboard() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const linkedId = currentUser.linkedId
  const isMock = isMockMode()
  const mockData = isMock ? getStudentDashboard(linkedId) : null

  // Live Student Portal APIs (strictly scoped to /:studentId on the backend)
  const dashboardQuery = usePortalDashboard(linkedId)
  const appsQuery = usePortalApplications(linkedId)
  const visaQuery = usePortalVisaCases(linkedId)
  const docsQuery = usePortalDocuments(linkedId)
  const apptsQuery = usePortalAppointments(linkedId)

  const appointments = useAppointmentsStore((s) => s.appointments)
  const { documents, updateDocumentStatus } = useDocumentsStore()
  const reviewMutation = useReviewDocument()
  const downloadFn = useDownloadDocument()

  const [requestDoc, setRequestDoc] = useState<StudentDocument | null>(null)
  const [requestComment, setRequestComment] = useState('')

  const isLoading =
    !isMock &&
    Boolean(linkedId) &&
    (dashboardQuery.isLoading || appsQuery.isLoading || visaQuery.isLoading || docsQuery.isLoading || apptsQuery.isLoading)

  const isError =
    !isMock &&
    Boolean(linkedId) &&
    (dashboardQuery.isError || appsQuery.isError || visaQuery.isError || docsQuery.isError || apptsQuery.isError)

  const refetchAll = () => {
    void dashboardQuery.refetch()
    void appsQuery.refetch()
    void visaQuery.refetch()
    void docsQuery.refetch()
    void apptsQuery.refetch()
  }

  // Resolve applications: Student Portal API in real mode, mock store in mock mode
  const liveApplications = useMemo(() => {
    if (isMock) return mockData?.applications ?? []
    const list = Array.isArray(appsQuery.data) ? appsQuery.data : []
    return list.map((app) => ({
      id: app.id,
      applicationRef: app.id,
      studentId: app.studentId,
      studentName: dashboardQuery.data?.student
        ? `${dashboardQuery.data.student.firstName} ${dashboardQuery.data.student.lastName}`.trim()
        : currentUser.name,
      universityId: app.universityId ?? '',
      universityName: app.university?.name ?? 'Unknown University',
      courseId: app.courseId ?? '',
      courseName: app.course?.name ?? 'Course',
      countryName: app.intake ?? 'Upcoming Intake',
      stage: (app.status?.toLowerCase() || 'submitted') as any,
      counselorId: '',
      counselorName: '',
      submittedDate: app.submittedAt ?? app.createdAt,
      intake: app.intake ?? 'Upcoming',
      lastUpdate: app.updatedAt ?? app.createdAt,
    }))
  }, [isMock, mockData, appsQuery.data, dashboardQuery.data, currentUser.name])

  // Resolve visa case: Student Portal API in real mode, mock store in mock mode
  const liveVisaCase = useMemo(() => {
    if (isMock) return mockData?.visaCase ?? null
    const list = Array.isArray(visaQuery.data) ? visaQuery.data : []
    const myCase = list[0]
    if (!myCase) return null
    const rawStatus = (myCase.status || 'PREPARATION').toUpperCase()
    return {
      ...myCase,
      progress: VISA_PROGRESS_BY_STATUS[rawStatus] ?? 25,
      overallStatus: rawStatus.toLowerCase(),
    }
  }, [isMock, mockData, visaQuery.data])

  const studentFirstName = isMock
    ? (mockData?.student?.name?.split(' ')[0] ?? 'Student')
    : (dashboardQuery.data?.student?.firstName || currentUser.name.split(' ')[0] || 'Student')

  const myDocuments = useMemo(() => {
    if (isMock) {
      return documents.filter((d) => d.studentId === linkedId || !linkedId)
    }
    const rawList = Array.isArray(docsQuery.data) ? docsQuery.data : []
    return rawList.map((d) => ({
      id: d.id,
      studentId: linkedId,
      name: d.originalName || d.type?.replace(/_/g, ' ') || 'Document',
      category: d.type || 'Other',
      type: d.type || 'Other',
      status: (d.status?.toLowerCase() as any) || 'uploaded',
      fileUrl: '',
      uploadedAt: d.createdAt,
      size: '—',
      version: 1,
      customName: d.originalName ?? undefined,
      fileName: d.originalName ?? undefined,
    }))
  }, [isMock, docsQuery.data, documents, linkedId])

  const myAppointments = useMemo(() => {
    if (isMock) {
      return appointments
        .filter((a) => a.studentId === linkedId)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    }
    const rawList = Array.isArray(apptsQuery.data) ? apptsQuery.data : []
    const nowMs = Date.now()
    return rawList
      .filter((a) => a.status === 'SCHEDULED' && new Date(a.datetime).getTime() >= nowMs)
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
      .map((a) => ({
        id: a.id,
        title: a.type ? a.type.replace(/_/g, ' ') : 'Counseling Session',
        start: a.datetime,
        counselorName: a.counselor
          ? `${a.counselor.firstName} ${a.counselor.lastName}`.trim()
          : 'Assigned Counselor',
        meetingMode: a.meetingMode,
      }))
  }, [isMock, appointments, apptsQuery.data, linkedId])

  const nextAppointment = myAppointments[0]

  const stats = [
    {
      label: 'Applications',
      value: isMock ? liveApplications.length : (dashboardQuery.data?.counts?.applications ?? liveApplications.length),
      icon: FileStack,
      color: '#2563EB',
    },
    {
      label: 'Visa Status',
      value: liveVisaCase ? `${liveVisaCase.progress}%` : 'Not started',
      icon: PlaneTakeoff,
      color: '#7C3AED',
      sub: liveVisaCase?.overallStatus?.replace(/_/g, ' '),
    },
    {
      label: 'Documents',
      value: `${myDocuments.filter((d: any) => d.status === 'verified').length}/${myDocuments.length}`,
      icon: FolderKanban,
      color: '#16A34A',
      sub: 'verified',
    },
    {
      label: 'Upcoming Appts',
      value: isMock ? myAppointments.length : (dashboardQuery.data?.counts?.upcomingAppointments ?? myAppointments.length),
      icon: CalendarClock,
      color: '#D97706',
    },
  ]


  const handleApprove = (doc: StudentDocument) => {
    reviewMutation.mutate(
      { id: doc.id, action: 'APPROVE' },
      {
        onSuccess: () => {
          updateDocumentStatus(doc.id, 'verified')
        },
      }
    )
  }

  const handleRequestChangesSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!requestDoc || !requestComment.trim()) return

    reviewMutation.mutate(
      { id: requestDoc.id, action: 'REQUEST_CHANGES', comment: requestComment.trim() },
      {
        onSuccess: () => {
          updateDocumentStatus(requestDoc.id, 'changes_requested')
          setRequestDoc(null)
          setRequestComment('')
        },
      }
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Welcome, ${studentFirstName}`}
        description="Your applications, documents, and upcoming appointments."
        actions={
          !isMock && linkedId ? (
            <Button variant="outline" size="sm" onClick={refetchAll} disabled={isLoading}>
              <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          ) : undefined
        }
      />

      {!isMock && !linkedId && (
        <EmptyState
          icon={AlertCircle}
          title="Student profile not linked"
          description="Your user account is not yet linked to a student record. Please contact your counselor or administrator."
          className="py-12"
        />
      )}

      {isError && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>Unable to load some of your portal details. Please try again.</span>
          </div>
          <Button variant="outline" size="sm" onClick={refetchAll}>
            Retry
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Loader2 className="size-7 animate-spin text-primary mb-2" />
          <p className="text-sm text-muted-foreground">Loading your student portal...</p>
        </div>
      ) : (!isMock && !linkedId) ? null : (
        <>
          <RoleStatCards stats={stats} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Next Appointment</CardTitle>
                <CardDescription>Your upcoming session</CardDescription>
              </CardHeader>
              <CardContent>
                {!nextAppointment ? (
                  <EmptyState icon={Bell} title="No upcoming appointment" description="Your counselor will schedule one when ready." className="py-8" />
                ) : (
                  <div className="rounded-lg border border-border/70 p-3">
                    <p className="text-[13px] font-semibold capitalize">{nextAppointment.title.toLowerCase()}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{dayjs(nextAppointment.start).format('MMM D, h:mm A')}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Counselor: {nextAppointment.counselorName}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>My Applications</CardTitle>
                  <CardDescription>{liveApplications.length} total</CardDescription>
                </div>
                <Link to="/applications" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  View all <ChevronRight className="size-3" />
                </Link>
              </CardHeader>
              <CardContent className="space-y-2">
                {liveApplications.length === 0 && (
                  <EmptyState icon={FileStack} title="No applications yet" description="Your counselor will submit applications on your behalf." className="py-8" />
                )}
                {liveApplications.map((application) => (
                  <div key={application.id} className="flex items-center gap-3 rounded-lg border border-border/70 p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{application.universityName}</p>
                      <p className="truncate text-xs text-muted-foreground">{application.courseName} · {application.countryName}</p>
                    </div>
                    <ApplicationStageBadge stage={application.stage} className="shrink-0 text-[10px] py-0" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* ── My Documents (Student Review System) ── */}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>My Documents</CardTitle>
                  <CardDescription>{myDocuments.length} total uploaded by staff</CardDescription>
                </div>
                <Link to="/documents" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  View all <ChevronRight className="size-3" />
                </Link>
              </CardHeader>
              <CardContent className="space-y-3">
                {myDocuments.length === 0 && (
                  <EmptyState icon={FolderKanban} title="No documents uploaded" description="Your counselor will upload your documents here for review." className="py-8" />
                )}
                {myDocuments.slice(0, 5).map((doc: any) => {
                  const title = doc.customName || doc.fileName || doc.type.replace(/_/g, ' ')
                  const isVerified = doc.status === 'verified'
                  const isChangesRequested = doc.status === 'changes_requested'

                  return (
                    <div key={doc.id} className="rounded-xl border border-border/80 p-3 space-y-2 bg-accent/10">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{title}</p>
                          <p className="text-xs text-muted-foreground">
                            {(doc.category || 'document').toUpperCase()} · v{doc.version || 1} · {dayjs(doc.uploadedAt).format('MMM D, YYYY')}
                          </p>
                        </div>
                        <DocumentStatusBadge status={doc.status} className="shrink-0 text-[10px]" />
                      </div>

                      {/* Student Review Actions */}
                      {!isVerified && (
                        <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => downloadFn(doc.id, doc.fileName || `${doc.type}.pdf`)}
                          >
                            <Download className="size-3" /> Preview
                          </Button>

                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs px-2.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => setRequestDoc(doc)}
                            >
                              <AlertTriangle className="size-3 mr-1" /> Request Changes
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs px-2.5 gap-1 bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => handleApprove(doc)}
                            >
                              <CheckCircle2 className="size-3" /> Approve
                            </Button>
                          </div>
                        </div>
                      )}

                      {isChangesRequested && doc.reviewComment && (
                        <p className="text-[11px] text-destructive bg-destructive/10 p-2 rounded border border-destructive/20">
                          <span className="font-semibold">Your Request:</span> "{doc.reviewComment}"
                        </p>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {liveVisaCase && (
              <Card>
                <CardHeader>
                  <CardTitle>Visa Progress</CardTitle>
                  <CardDescription>{liveVisaCase.overallStatus.replace(/_/g, ' ')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Progress</span>
                      <span className="font-bold text-primary">{liveVisaCase.progress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-accent overflow-hidden">
                      <div className="h-full bg-primary transition-all duration-300" style={{ width: `${liveVisaCase.progress}%` }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {/* ── Request Changes Dialog Modal ── */}
      {requestDoc && (
        <Dialog open={Boolean(requestDoc)} onOpenChange={(op) => !op && setRequestDoc(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Request Document Correction</DialogTitle>
              <DialogDescription>
                Specify what needs correction in <span className="font-semibold text-foreground">{requestDoc.customName || requestDoc.fileName || requestDoc.type}</span>. Your counselor will receive a notification to re-upload.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleRequestChangesSubmit} className="space-y-4 py-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Reason / Feedback *</label>
                <Input
                  value={requestComment}
                  onChange={(e) => setRequestComment(e.target.value)}
                  placeholder="e.g. The passport image is blurred or missing the expiration date page."
                  required
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRequestDoc(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={!requestComment.trim() || reviewMutation.isPending}>
                  {reviewMutation.isPending ? 'Submitting...' : 'Submit Request'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
