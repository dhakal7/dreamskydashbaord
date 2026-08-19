import { useState } from 'react'
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
import { FileStack, PlaneTakeoff, FolderKanban, Wallet, Bell, ChevronRight, CheckCircle2, AlertTriangle, Download } from 'lucide-react'
import { RoleStatCards } from './shared'
import { getStudentDashboard } from '../role-selectors'
import { formatCurrency } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { useAppointmentsStore } from '@/features/appointments/store'
import { useDocumentsStore } from '@/features/documents/store'
import { useDocumentNotesStore } from '@/features/documents/document-notes-store'
import { useReviewDocument, useDownloadDocument } from '@/hooks/use-documents'
import type { StudentDocument } from '@/types'

export function StudentDashboard() {
  const linkedId = useAuthStore((s) => s.currentUser.linkedId)
  const data = getStudentDashboard(linkedId)
  const appointments = useAppointmentsStore((s) => s.appointments)
  const { documents, updateDocumentStatus } = useDocumentsStore()
  const { getNotesForDocument } = useDocumentNotesStore()
  const reviewMutation = useReviewDocument()
  const downloadFn = useDownloadDocument()

  const [requestDoc, setRequestDoc] = useState<StudentDocument | null>(null)
  const [requestComment, setRequestComment] = useState('')

  const totalTuition = data.applications.reduce((s, a) => s + a.tuitionUsd, 0)
  const myDocuments = documents.filter((d) => d.studentId === linkedId || !linkedId)
  const myAppointments = appointments
    .filter((a) => a.studentId === linkedId)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  const nextAppointment = myAppointments[0]

  const stats = [
    { label: 'Applications', value: data.applications.length, icon: FileStack, color: '#2563EB' },
    {
      label: 'Visa Status', value: data.visaCase ? `${data.visaCase.progress}%` : 'Not started', icon: PlaneTakeoff, color: '#7C3AED',
      sub: data.visaCase?.overallStatus.replace('_', ' '),
    },
    {
      label: 'Documents', value: `${myDocuments.filter((d) => d.status === 'verified').length}/${myDocuments.length}`, icon: FolderKanban, color: '#16A34A',
      sub: 'verified',
    },
    { label: 'Est. Tuition', value: formatCurrency(totalTuition), icon: Wallet, color: '#D97706' },
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
        title={`Welcome, ${data.student?.name.split(' ')[0] ?? 'Student'}`}
        description="Your applications, documents, and upcoming appointments."
      />

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
                <p className="text-[13px] font-semibold">{nextAppointment.title}</p>
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
              <CardDescription>{data.applications.length} total</CardDescription>
            </div>
            <Link to="/applications" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              View all <ChevronRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.applications.length === 0 && (
              <EmptyState icon={FileStack} title="No applications yet" description="Your counselor will submit applications on your behalf." className="py-8" />
            )}
            {data.applications.map((application) => (
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
            {myDocuments.slice(0, 5).map((doc) => {
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

        {data.visaCase && (
          <Card>
            <CardHeader>
              <CardTitle>Visa Progress</CardTitle>
              <CardDescription>{data.visaCase.overallStatus.replace('_', ' ')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Progress</span>
                  <span className="font-bold text-primary">{data.visaCase.progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-accent overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-300" style={{ width: `${data.visaCase.progress}%` }} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

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
