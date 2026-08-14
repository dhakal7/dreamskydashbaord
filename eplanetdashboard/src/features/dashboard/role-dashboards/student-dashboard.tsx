import dayjs from 'dayjs'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { ApplicationStageBadge } from '@/components/shared/status-badges'
import { FileStack, PlaneTakeoff, FolderKanban, Wallet, Bell, ChevronRight, MessageSquare } from 'lucide-react'
import { RoleStatCards } from './shared'
import { getStudentDashboard } from '../role-selectors'
import { formatCurrency } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { useAppointmentsStore } from '@/features/appointments/store'
import { useDocumentsStore } from '@/features/documents/store'
import { useDocumentNotesStore } from '@/features/documents/document-notes-store'

export function StudentDashboard() {
  const linkedId = useAuthStore((s) => s.currentUser.linkedId)
  const data = getStudentDashboard(linkedId)
  const appointments = useAppointmentsStore((s) => s.appointments)
  const { documents } = useDocumentsStore()
  const { getNotesForDocument } = useDocumentNotesStore()
  const totalTuition = data.applications.reduce((s, a) => s + a.tuitionUsd, 0)
  const myDocuments = documents.filter((d) => d.studentId === linkedId)
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
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Documents</CardTitle>
              <CardDescription>{myDocuments.length} uploaded</CardDescription>
            </div>
            <Link to="/documents" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              View all <ChevronRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {myDocuments.length === 0 && (
              <EmptyState icon={FolderKanban} title="No documents uploaded" description="Upload documents via the Documents page." className="py-8" />
            )}
            {myDocuments.slice(0, 5).map((document) => {
              const notes = getNotesForDocument(document.id)
              return (
                <div key={document.id} className="rounded-lg border border-border/70 p-2.5 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{document.fileName}</p>
                      <p className="text-xs text-muted-foreground">{document.type.replace('_', ' ')} · {dayjs(document.uploadedAt).format('MMM D')}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${document.status === 'verified' ? 'bg-green-50 text-green-700' : document.status === 'pending_review' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                      {document.status}
                    </span>
                  </div>
                  {notes.length > 0 && (
                    <div className="bg-secondary/40 rounded-lg p-2 text-xs space-y-1 border border-border/60">
                      <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <MessageSquare className="size-3 text-muted-foreground/80" /> Feedback ({notes.length})
                      </p>
                      {notes.map((note) => (
                        <div key={note.id} className="text-muted-foreground text-[11px] leading-relaxed">
                          <span className="font-medium text-foreground">{note.authorName} ({note.authorRole.replace('_', ' ')}):</span>{' '}
                          {note.message}
                        </div>
                      ))}
                    </div>
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
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium font-tabular">{data.visaCase.progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${data.visaCase.progress}%` }} />
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
                  Next step: {data.visaCase.checklist.find((item) => item.status === 'not_started' || item.status === 'in_progress')?.step.replace(/_/g, ' ') ?? 'All complete'}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
