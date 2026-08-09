import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Download, CheckCircle2, AlertTriangle, Send } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { DocumentStatusBadge } from '@/components/shared/status-badges'
import { useDocumentsStore } from '@/features/documents/store'
import { useRemindersStore } from '@/features/documents/reminders-store'
import { useAuthStore } from '@/store/auth-store'
import { hasPermission } from '@/lib/rbac'
import type { Student, DocumentType, StudentDocument } from '@/types'

dayjs.extend(relativeTime)

const ALL_DOC_TYPES: DocumentType[] = [
  'passport',
  'citizenship',
  'academic',
  'cv',
  'sop',
  'recommendation',
  'financial',
  'offer_letter',
  'visa_letter',
]

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  passport: 'Passport',
  citizenship: 'Citizenship',
  academic: 'Academic',
  cv: 'CV',
  sop: 'SOP',
  recommendation: 'Recommendation Letter',
  financial: 'Financial',
  offer_letter: 'Offer Letter',
  visa_letter: 'Visa Letter',
}

function getDocForType(docs: StudentDocument[], type: DocumentType) {
  return docs.find((d) => d.type === type)
}

function hasRecentReminder(
  reminders: { studentId: string; docType: DocumentType; sentAt: string }[],
  studentId: string,
  docType: DocumentType
) {
  const threeDaysAgo = dayjs().subtract(3, 'day')
  return reminders.some(
    (r) =>
      r.studentId === studentId &&
      r.docType === docType &&
      dayjs(r.sentAt).isAfter(threeDaysAgo)
  )
}

export function DocumentsTab({ student }: { student: Student }) {
  const { documents } = useDocumentsStore()
  const currentUser = useAuthStore((s) => s.currentUser)
  const { reminders, sendReminder } = useRemindersStore()

  const studentDocs = documents.filter((d) => d.studentId === student.id)
  const uploadedTypes = new Set(
    studentDocs.filter((d) => d.status !== 'rejected').map((d) => d.type)
  )
  const docsUploaded = studentDocs.filter((d) => d.status !== 'rejected').length
  const docsRequired = ALL_DOC_TYPES.length
  const canRemind = hasPermission(currentUser.role, 'documents.manage')

  return (
    <div className="space-y-5">
      {/* ── Progress Summary ── */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {docsUploaded} of {docsRequired} required documents uploaded
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {docsRequired - docsUploaded} document{docsRequired - docsUploaded !== 1 ? 's' : ''} still needed
            </p>
          </div>
          <div className="w-44">
            <Progress value={(docsUploaded / docsRequired) * 100} />
          </div>
        </div>
      </Card>

      {/* ── Document Checklist ── */}
      <Card>
        <div className="divide-y divide-border">
          {ALL_DOC_TYPES.map((type) => {
            const doc = getDocForType(studentDocs, type)
            const isUploaded = uploadedTypes.has(type)

            return (
              <div key={type} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  {isUploaded ? (
                    <CheckCircle2 className="size-4 shrink-0 text-green-600" />
                  ) : (
                    <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                  )}
                  <span className="text-sm">{DOC_TYPE_LABELS[type]}</span>
                  {doc && (
                    <DocumentStatusBadge status={doc.status} className="shrink-0 text-[10px] py-0" />
                  )}
                </div>
                <div className="shrink-0">
                  {!isUploaded && canRemind && (
                    hasRecentReminder(reminders, student.id, type) ? (
                      <span className="text-xs text-muted-foreground">
                        Reminded {dayjs(
                          reminders.find(
                            (r) => r.studentId === student.id && r.docType === type
                          )!.sentAt
                        ).fromNow()} ago
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          sendReminder(
                            student.id,
                            student.name,
                            type,
                            currentUser.name,
                            currentUser.role
                          )
                        }
                      >
                        <Send className="size-3" />
                        Send Reminder
                      </Button>
                    )
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* ── Document List ── */}
      {studentDocs.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No documents uploaded.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/60">
              <tr>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Document</th>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Size</th>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Uploaded</th>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {studentDocs.map((doc) => (
                <tr key={doc.id} className="border-b border-border/70 last:border-0 hover:bg-accent/50">
                  <td className="whitespace-nowrap px-3.5 py-2.5">
                    <p className="text-[13px] font-medium">{doc.fileName}</p>
                    <p className="text-xs text-muted-foreground capitalize">{doc.type.replace('_', ' ')} (v{doc.version})</p>
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-muted-foreground">
                    {doc.fileSizeKb < 1024 ? `${doc.fileSizeKb} KB` : `${(doc.fileSizeKb / 1024).toFixed(1)} MB`}
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">
                    <DocumentStatusBadge status={doc.status} />
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">
                    <p className="text-xs font-tabular">{dayjs(doc.uploadedAt).format('MMM D, YYYY')}</p>
                    <p className="text-[11px] text-muted-foreground">by {doc.uploadedBy}</p>
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-right">
                    <Button variant="ghost" size="icon" className="size-7">
                      <Download className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
