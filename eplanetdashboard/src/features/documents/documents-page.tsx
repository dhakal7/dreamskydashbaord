import { useState } from 'react'
import dayjs from 'dayjs'
import {
  FileUp, Trash2, CheckCircle2, XCircle, MessageSquare,
  ChevronDown, ChevronRight, Upload,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PersonAvatar } from '@/components/ui/avatar'
import { SearchableStudentPicker } from '@/components/shared/searchable-student-picker'
import { DocumentStatusBadge } from '@/components/shared/status-badges'
import { EmptyState } from '@/components/shared/empty-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuthStore } from '@/store/auth-store'
import { visibleDocuments, visibleStudents } from '@/lib/data-visibility'
import { hasPermission } from '@/lib/rbac'
import { students } from '@/mock'
import { useDocumentsStore, type AddDocumentData } from './store'
import { useDocumentNotesStore } from './document-notes-store'
import type { DocumentType } from '@/types'
import { cn } from '@/lib/utils'

const documentTypeOptions: { value: DocumentType; label: string }[] = [
  { value: 'passport', label: 'Passport' },
  { value: 'citizenship', label: 'Citizenship' },
  { value: 'academic', label: 'Academic' },
  { value: 'cv', label: 'CV' },
  { value: 'sop', label: 'SOP' },
  { value: 'recommendation', label: 'Recommendation' },
  { value: 'financial', label: 'Financial' },
  { value: 'offer_letter', label: 'Offer Letter' },
  { value: 'visa_letter', label: 'Visa Letter' },
]

import { useDocuments } from '@/hooks/use-documents'

export default function DocumentsPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { documents: mockDocuments, addDocument, deleteDocument, updateDocumentStatus } = useDocumentsStore()
  const { data: apiDocData } = useDocuments()
  const { addNote, deleteNote, getNotesForDocument } = useDocumentNotesStore()

  const documents = apiDocData?.documents && apiDocData.documents.length > 0
    ? apiDocData.documents.map((d) => ({
        id: d.id,
        studentId: d.studentId,
        studentName: d.student ? `${d.student.firstName} ${d.student.lastName}` : 'Student',
        type: d.type.toLowerCase() as DocumentType,
        fileName: d.originalName,
        fileSizeKb: Math.round(d.sizeBytes / 1024),
        uploadedBy: d.uploadedBy ? `${d.uploadedBy.firstName} ${d.uploadedBy.lastName}` : 'User',
        uploadedAt: d.createdAt,
        status: d.status.toLowerCase() as any,
        version: 1,
      }))
    : mockDocuments


  const [fileName, setFileName] = useState('')
  const [docType, setDocType] = useState<DocumentType>('passport')
  const [targetStudentId, setTargetStudentId] = useState('')
  const [selectedDocImage, setSelectedDocImage] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null)
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({})

  const visible = visibleDocuments(currentUser, documents, students)
  const visibleStudentsForUpload = visibleStudents(currentUser, students)
  const canManage = hasPermission(currentUser.role, 'documents.manage')
  const selectedStudent = visibleStudentsForUpload.find((student) => student.id === targetStudentId) ?? visibleStudentsForUpload[0] ?? null

  const handleUpload = () => {
    if (!fileName.trim() || !selectedStudent) return

    const data: AddDocumentData = {
      studentId: selectedStudent.id,
      studentName: selectedStudent.name,
      type: docType,
      fileName: fileName.trim(),
      previewUrl: selectedDocImage ?? undefined,
      fileSizeKb: Math.floor(Math.random() * 2400) + 120,
      uploadedBy: currentUser.name,
    }
    addDocument(data)
    setFileName('')
    setSelectedDocImage(null)
    setDocType('passport')
  }

  const handleDocumentImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setSelectedDocImage(URL.createObjectURL(file))
  }

  const handleDocumentDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragActive(false)
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    setFileName(file.name)
    setSelectedDocImage(URL.createObjectURL(file))
  }

  const handleAddNote = (docId: string) => {
    const msg = noteInputs[docId]?.trim()
    if (!msg) return

    const doc = documents.find((d) => d.id === docId)
    if (!doc) return

    addNote({
      studentId: doc.studentId,
      documentId: docId,
      authorName: currentUser.name,
      authorRole: currentUser.role,
      message: msg,
    })

    setNoteInputs((prev) => ({ ...prev, [docId]: '' }))
  }

  const docNotes = (docId: string) => getNotesForDocument(docId)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Documents"
        description="Upload, review, and manage student documents."
      />

      {/* Upload Control */}
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Document</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-background text-primary">
                    <Upload className="size-4" />
                  </div>
                  <span>Image upload section</span>
                </div>
                <p className="text-xs text-muted-foreground">Choose an image or drag it into the upload area, then select the student and document type.</p>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-[220px]">
                    <SearchableStudentPicker
                      label="Student"
                      students={visibleStudentsForUpload}
                      value={selectedStudent?.id ?? ''}
                      onChange={setTargetStudentId}
                      placeholder="Search student"
                      showDropdown={false}
                      autoSelectOnSearch
                    />
                  </div>
                  <div className="min-w-[240px] flex-1">
                    <label
                      onDragOver={(event) => {
                        event.preventDefault()
                        setDragActive(true)
                      }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={handleDocumentDrop}
                      className={`flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm shadow-soft transition ${dragActive ? 'border-primary bg-primary/10' : 'border-input bg-background hover:bg-accent/40'}`}
                    >
                      <Upload className="size-4" />
                      <span className="truncate">{fileName || 'Click or drag image here'}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleDocumentImageChange} />
                    </label>
                  </div>
                  <div className="w-[180px]">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Document Type</label>
                    <Select value={docType} onValueChange={(v) => setDocType(v as DocumentType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {documentTypeOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleUpload} disabled={!fileName.trim() || !selectedStudent || !selectedDocImage}>
                    <Upload className="size-4" />
                    Upload
                  </Button>
                </div>

                {selectedDocImage && (
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-2">
                    <img src={selectedDocImage} alt="Selected document" className="max-h-48 w-full rounded-md object-cover" />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document List */}
      {visible.length === 0 ? (
        <EmptyState
          icon={FileUp}
          title="No documents found"
          description="No documents match your current scope. Upload a new document above."
        />
      ) : (
        <div className="space-y-2">
          {visible.map((doc) => {
            const isExpanded = expandedDoc === doc.id
            const notes = docNotes(doc.id)

            return (
              <Card
                key={doc.id}
                className={cn(
                  'transition-shadow hover:shadow-elevated',
                  doc.status === 'verified' && 'ring-1 ring-green-500/20',
                  doc.status === 'rejected' && 'ring-1 ring-red-500/20',
                )}
              >
                <div className="flex items-start gap-3 p-4">
                  <PersonAvatar
                    name={doc.studentName}
                    color={students.find((s) => s.id === doc.studentId)?.photoColor}
                    className="size-9 shrink-0"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-semibold">{doc.fileName}</p>
                      <DocumentStatusBadge status={doc.status} className="shrink-0 text-[10px] py-0" />
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="capitalize">{doc.type.replace('_', ' ')}</span>
                      <span>v{doc.version}</span>
                      <span>{doc.fileSizeKb < 1024 ? `${doc.fileSizeKb} KB` : `${(doc.fileSizeKb / 1024).toFixed(1)} MB`}</span>
                      <span>{dayjs(doc.uploadedAt).format('MMM D, YYYY')}</span>
                      <span>by {doc.uploadedBy}</span>
                      <span className="font-medium text-foreground/70">{doc.studentName}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {/* Manage controls for frontdesk/counselor/admin */}
                    {canManage && doc.status !== 'verified' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                        onClick={() => updateDocumentStatus(doc.id, 'verified')}
                        title="Verify"
                      >
                        <CheckCircle2 className="size-4" />
                      </Button>
                    )}
                    {canManage && doc.status !== 'rejected' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                        onClick={() => updateDocumentStatus(doc.id, 'rejected')}
                        title="Reject"
                      >
                        <XCircle className="size-4" />
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteDocument(doc.id)}
                        title="Delete"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground"
                      onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                      title="Notes"
                    >
                      {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </Button>
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MessageSquare className="size-3" />
                      {notes.length}
                    </span>
                  </div>
                </div>

                {/* Expandable Notes Section */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">Notes & Comments</p>

                    {notes.length === 0 && (
                      <p className="mb-2 text-xs text-muted-foreground/60 italic">No notes yet.</p>
                    )}

                    <div className="mb-3 space-y-2">
                      {notes.map((note) => (
                        <div key={note.id} className="rounded-lg bg-secondary/40 px-3 py-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium">{note.authorName}</span>
                              <span className="text-[10px] text-muted-foreground capitalize">({note.authorRole.replace('_', ' ')})</span>
                              <span className="text-[10px] text-muted-foreground">{dayjs(note.createdAt).format('MMM D, h:mm A')}</span>
                            </div>
                            {(canManage || note.authorName === currentUser.name) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-5 text-muted-foreground hover:text-destructive"
                                onClick={() => deleteNote(note.id)}
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-foreground/80">{note.message}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <Input
                        placeholder="Add a note..."
                        value={noteInputs[doc.id] ?? ''}
                        onChange={(e) =>
                          setNoteInputs((prev) => ({ ...prev, [doc.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleAddNote(doc.id)
                          }
                        }}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleAddNote(doc.id)}
                        disabled={!(noteInputs[doc.id]?.trim())}
                      >
                        Post
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

