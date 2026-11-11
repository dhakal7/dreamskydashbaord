import { useMemo } from 'react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Download, CheckCircle2, AlertTriangle, Send, AlertCircle, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { DocumentStatusBadge } from '@/components/shared/status-badges'
import { useDocumentsStore } from '@/features/documents/store'
import { useRemindersStore } from '@/features/documents/reminders-store'
import { useAuthStore } from '@/store/auth-store'
import { hasPermission } from '@/lib/rbac'
import { isMockMode } from '@/lib/api-client'
import { useDocuments, useDownloadDocument } from '@/hooks/use-documents'
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
  return docs.find((d) => d.type.toLowerCase() === type.toLowerCase())
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
  const mockMode = isMockMode()
  const mockDocs = useDocumentsStore((s) => s.documents)
  const currentUser = useAuthStore((s) => s.currentUser)
  const { reminders, sendReminder } = useRemindersStore()
  const downloadDoc = useDownloadDocument()

  const {
    data: apiDocsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useDocuments({ studentId: student.id })

  const studentDocs: StudentDocument[] = useMemo(() => {
    if (mockMode) {
      return mockDocs.filter((d) => d.studentId === student.id)
    }

    return (apiDocsData?.documents ?? []).map((d: any) => ({
      id: d.id,
      studentId: d.studentId,
      studentName: d.student ? `${d.student.firstName} ${d.student.lastName}` : student.name,
      category: (d.category || 'other').toLowerCase() as any,
      type: (d.type || 'other').toLowerCase(),
      customName: d.customName,
      fileName: d.originalName || d.fileName || `${d.type || 'document'}.pdf`,
      fileSizeKb: d.fileSize ? Math.round(d.fileSize / 1024) : (d.fileSizeKb ?? 0),
      version: d.currentVersion || d.version || 1,
      uploadedAt: d.createdAt || d.uploadedAt || new Date().toISOString(),
      uploadedBy: d.uploadedBy
        ? (typeof d.uploadedBy === 'string'
            ? d.uploadedBy
            : `${d.uploadedBy.firstName || ''} ${d.uploadedBy.lastName || ''}`.trim() || 'Staff')
        : 'Staff',
      status: (d.status || 'pending').toLowerCase() as any,
      reviewComment: d.reviewComment,
      reviewedAt: d.reviewedAt,
    }))
  }, [mockMode, mockDocs, apiDocsData, student.id, student.name])

  if (!mockMode && isLoading) {
    return (
      <div className="space-y-5 animate-pulse">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="h-4 w-48 bg-muted rounded" />
            <div className="w-44 h-2 bg-muted rounded" />
          </div>
        </Card>
        <Card className="p-4 divide-y divide-border/50">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="py-3 flex justify-between items-center">
              <div className="h-4 w-32 bg-muted rounded" />
              <div className="h-4 w-16 bg-muted rounded" />
            </div>
          ))}
        </Card>
      </div>
    )
  }

  if (!mockMode && isError) {
    return (
      <Card className="p-6 border-danger/40 bg-danger/5">
        <div className="flex items-start gap-3">
          <AlertCircle className="size-5 text-danger shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-danger">Unable to load student documents</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              {error instanceof Error ? error.message : 'A network error occurred while retrieving student documents.'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="mt-3 h-8 gap-1.5 text-xs"
            >
              <RefreshCw className="size-3" /> Retry
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  const uploadedTypes = new Set(
    studentDocs.filter((d) => d.status !== 'rejected').map((d) => d.type.toLowerCase())
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
            <Progress value={Math.min(100, (docsUploaded / docsRequired) * 100)} />
          </div>
        </div>
      </Card>

      {/* ── Document Checklist ── */}
      <Card>
        <div className="divide-y divide-border">
          {ALL_DOC_TYPES.map((type) => {
            const doc = getDocForType(studentDocs, type)
            const isUploaded = uploadedTypes.has(type.toLowerCase())

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
                <th className="whitespace-nowrap px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {studentDocs.map((doc) => (
                <tr key={doc.id} className="border-b border-border/70 last:border-0 hover:bg-accent/50">
                  <td className="whitespace-nowrap px-3.5 py-2.5">
                    <p className="text-[13px] font-medium">{doc.fileName}</p>
                    <p className="text-xs text-muted-foreground capitalize">{doc.type.replace(/_/g, ' ')} (v{doc.version})</p>
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      title="Download document"
                      onClick={() => downloadDoc(doc.id, doc.fileName)}
                    >
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
