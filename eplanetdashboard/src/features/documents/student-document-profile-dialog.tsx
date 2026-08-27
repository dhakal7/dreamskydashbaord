import { useState } from 'react'
import dayjs from 'dayjs'
import {
  FolderKanban, Eye, Download, Edit2, Replace, History, Trash2, AlertCircle, Plus, FileText
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DocumentStatusBadge } from '@/components/shared/status-badges'
import { PersonAvatar } from '@/components/ui/avatar'
import { DocumentUploadDialog } from './document-upload-dialog'
import { VersionHistoryDialog } from './version-history-dialog'
import { useDownloadDocument, useReplaceDocument, useRenameDocument, useDeleteDocument } from '@/hooks/use-documents'
import type { StudentDocumentProfile, StudentDocument, DocumentCategory } from '@/types'
import { Input } from '@/components/ui/input'

interface StudentDocumentProfileDialogProps {
  profile: StudentDocumentProfile | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleteDocument?: (docId: string) => void
}

const CATEGORIES: { id: DocumentCategory; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'academic', label: 'Academic' },
  { id: 'english_test', label: 'English / Test' },
  { id: 'finance', label: 'Finance' },
  { id: 'visa', label: 'Visa' },
  { id: 'other', label: 'Other' },
]

export function StudentDocumentProfileDialog({
  profile,
  open,
  onOpenChange,
  onDeleteDocument,
}: StudentDocumentProfileDialogProps) {
  const [activeCategory, setActiveCategory] = useState<DocumentCategory>('identity')
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [historyDocId, setHistoryDocId] = useState<string | null>(null)
  const [previewDoc, setPreviewDoc] = useState<StudentDocument | null>(null)
  const [replaceDoc, setReplaceDoc] = useState<StudentDocument | null>(null)
  const [replaceFile, setReplaceFile] = useState<File | null>(null)
  const [replaceNotes, setReplaceNotes] = useState('')
  const [renameDocId, setRenameDocId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const downloadFn = useDownloadDocument()
  const replaceMutation = useReplaceDocument()
  const renameMutation = useRenameDocument()
  const deleteMutation = useDeleteDocument()

  if (!profile) return null

  const documents = profile.documents || []

  // Group documents by category
  const docsByCategory: Record<DocumentCategory, StudentDocument[]> = {
    identity: [],
    academic: [],
    english_test: [],
    finance: [],
    visa: [],
    other: [],
  }

  documents.forEach((doc) => {
    // Normalize to lowercase so 'ACADEMIC', 'Academic', 'academic' all match
    const rawCat = (doc.category || 'other').toLowerCase().trim() as DocumentCategory
    if (docsByCategory[rawCat]) {
      docsByCategory[rawCat].push(doc)
    } else {
      docsByCategory.other.push(doc)
    }
  })

  // Category counts
  const categoryCounts: Record<DocumentCategory, { total: number; verified: number }> = {
    identity: { total: docsByCategory.identity.length, verified: docsByCategory.identity.filter((d) => d.status === 'verified').length },
    academic: { total: docsByCategory.academic.length, verified: docsByCategory.academic.filter((d) => d.status === 'verified').length },
    english_test: { total: docsByCategory.english_test.length, verified: docsByCategory.english_test.filter((d) => d.status === 'verified').length },
    finance: { total: docsByCategory.finance.length, verified: docsByCategory.finance.filter((d) => d.status === 'verified').length },
    visa: { total: docsByCategory.visa.length, verified: docsByCategory.visa.filter((d) => d.status === 'verified').length },
    other: { total: docsByCategory.other.length, verified: docsByCategory.other.filter((d) => d.status === 'verified').length },
  }

  const handleReplaceSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!replaceDoc || !replaceFile) return

    replaceMutation.mutate(
      {
        id: replaceDoc.id,
        body: {
          file: replaceFile,
          notes: replaceNotes.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          setReplaceDoc(null)
          setReplaceFile(null)
          setReplaceNotes('')
        },
      }
    )
  }

  const handleSaveRename = (docId: string) => {
    if (!renameValue.trim()) return
    renameMutation.mutate(
      { id: docId, customName: renameValue.trim() },
      {
        onSuccess: () => {
          setRenameDocId(null)
          setRenameValue('')
        },
      }
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader className="pb-2 border-b border-border/60">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <PersonAvatar name={profile.studentName} className="size-12 text-base font-semibold" />
                <div>
                  <DialogTitle className="text-xl font-bold">{profile.studentName}</DialogTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-tabular font-medium text-foreground">{profile.applicationId}</span>
                    <span>•</span>
                    <span>Passport: {profile.passportNumber}</span>
                    <span>•</span>
                    <span>Counselor: {profile.assignedCounselor}</span>
                  </div>
                </div>
              </div>

              <Button onClick={() => setUploadDialogOpen(true)} className="gap-1.5 shrink-0 shadow-soft">
                <Plus className="size-4" /> Upload Document
              </Button>
            </div>

            {/* Document Progress Summary Header */}
            <div className="mt-4 rounded-xl bg-accent/30 p-3.5 border border-border/70">
              <div className="flex items-center justify-between gap-4 mb-2">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overall Document Progress</span>
                  <p className="text-sm font-bold mt-0.5">
                    {profile.verifiedDocuments} Verified / {profile.totalDocuments} Total Uploaded
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-lg font-extrabold text-primary">{profile.completionPercentage}%</span>
                  <p className="text-[11px] text-muted-foreground">Last updated {dayjs(profile.lastUpdated).format('MMM D, YYYY')}</p>
                </div>
              </div>
              <Progress value={profile.completionPercentage} className="h-2" />
            </div>
          </DialogHeader>

          {/* Category Tabs */}
          <div className="flex-1 overflow-hidden flex flex-col py-2">
            <Tabs value={activeCategory} onValueChange={(v) => setActiveCategory(v as DocumentCategory)} className="flex-1 flex flex-col min-h-0">
              <TabsList className="w-full justify-start overflow-x-auto h-11 p-1 bg-accent/30 rounded-xl mb-4 gap-1">
                {CATEGORIES.map((cat) => {
                  const counts = categoryCounts[cat.id]
                  return (
                    <TabsTrigger key={cat.id} value={cat.id} className="text-xs font-medium px-3 py-1.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                      {cat.label}
                      <span className="ml-1.5 rounded-full bg-muted/80 px-1.5 py-0.2 text-[10px] font-bold">
                        {counts.verified}/{counts.total}
                      </span>
                    </TabsTrigger>
                  )
                })}
              </TabsList>

              {CATEGORIES.map((cat) => (
                <TabsContent key={cat.id} value={cat.id} className="flex-1 overflow-y-auto pr-1 min-h-0 space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span className="font-semibold text-foreground">{cat.label} Documents ({docsByCategory[cat.id].length})</span>
                    <span>{categoryCounts[cat.id].verified} Verified</span>
                  </div>

                  {docsByCategory[cat.id].length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/80 p-8 text-center bg-accent/10">
                      <FolderKanban className="size-8 mx-auto text-muted-foreground/60 mb-2" />
                      <p className="text-sm font-medium text-foreground">No {cat.label} Documents Uploaded Yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Click below to upload the first document in this category.</p>
                      <Button variant="outline" size="sm" onClick={() => setUploadDialogOpen(true)} className="mt-3 gap-1.5">
                        <Plus className="size-3.5" /> Upload {cat.label} Document
                      </Button>
                    </div>
                  ) : (
                    docsByCategory[cat.id].map((doc) => {
                      const isRenaming = renameDocId === doc.id
                      const docTitle = doc.customName || doc.fileName || doc.type.replace(/_/g, ' ')

                      return (
                        <Card key={doc.id} className="p-4 space-y-3 border-border/80 hover:border-primary/40 transition shadow-soft">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                {isRenaming ? (
                                  <div className="flex items-center gap-2 max-w-sm">
                                    <Input
                                      value={renameValue}
                                      onChange={(e) => setRenameValue(e.target.value)}
                                      className="h-8 text-xs"
                                      autoFocus
                                    />
                                    <Button size="sm" className="h-8 text-xs px-2.5" onClick={() => handleSaveRename(doc.id)}>
                                      Save
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-8 text-xs px-2" onClick={() => setRenameDocId(null)}>
                                      Cancel
                                    </Button>
                                  </div>
                                ) : (
                                  <>
                                    <h4 className="text-sm font-semibold text-foreground truncate">{docTitle}</h4>
                                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                                      v{doc.version || 1}
                                    </span>
                                  </>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                                <span>Uploaded {dayjs(doc.uploadedAt).format('MMM D, YYYY')}</span>
                                <span>•</span>
                                <span>By {doc.uploadedBy || 'Counselor'}</span>
                                {doc.fileSizeKb > 0 && (
                                  <>
                                    <span>•</span>
                                    <span>{doc.fileSizeKb} KB</span>
                                  </>
                                )}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <DocumentStatusBadge status={doc.status} />

                              {/* Document Action Buttons */}
                              <div className="flex items-center gap-1 bg-accent/40 rounded-lg p-1 border border-border/60">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground hover:text-foreground"
                                  title="Preview"
                                  onClick={() => setPreviewDoc(doc)}
                                >
                                  <Eye className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground hover:text-foreground"
                                  title="Download"
                                  onClick={() => downloadFn(doc.id, doc.fileName || `${doc.type}.pdf`)}
                                >
                                  <Download className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground hover:text-foreground"
                                  title="Rename"
                                  onClick={() => {
                                    setRenameDocId(doc.id)
                                    setRenameValue(doc.customName || doc.fileName || doc.type)
                                  }}
                                >
                                  <Edit2 className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground hover:text-foreground"
                                  title="Replace with new version"
                                  onClick={() => setReplaceDoc(doc)}
                                >
                                  <Replace className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground hover:text-foreground"
                                  title="View Version History"
                                  onClick={() => setHistoryDocId(doc.id)}
                                >
                                  <History className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title="Delete Document"
                                  onClick={() => {
                                    if (confirm(`Are you sure you want to delete "${doc.customName || doc.fileName || doc.type}"?`)) {
                                      if (onDeleteDocument) onDeleteDocument(doc.id)
                                      deleteMutation.mutate(doc.id)
                                    }
                                  }}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>

                          {/* Student Feedback / Changes Requested Notification Box */}
                          {doc.status === 'changes_requested' && doc.reviewComment && (
                            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-2.5 text-xs text-destructive flex items-start gap-2">
                              <AlertCircle className="size-4 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold">Student Change Request:</span> "{doc.reviewComment}"
                              </div>
                            </div>
                          )}
                        </Card>
                      )
                    })
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      {/* Internal Continuous Upload Dialog */}
      <DocumentUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        preselectedStudentId={profile.studentId}
      />

      {/* Version History Modal */}
      <VersionHistoryDialog
        documentId={historyDocId}
        open={Boolean(historyDocId)}
        onOpenChange={(op) => !op && setHistoryDocId(null)}
      />

      {/* Preview Modal */}
      {previewDoc && (
        <Dialog open={Boolean(previewDoc)} onOpenChange={(op) => !op && setPreviewDoc(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{previewDoc.customName || previewDoc.fileName || previewDoc.type}</DialogTitle>
              <DialogDescription>Document Preview</DialogDescription>
            </DialogHeader>
            <div className="py-4 flex flex-col items-center justify-center bg-accent/20 rounded-xl min-h-[300px]">
              {previewDoc.previewUrl ? (
                <img src={previewDoc.previewUrl} alt="Preview" className="max-h-[400px] object-contain rounded-lg shadow-soft" />
              ) : (
                <div className="text-center space-y-3">
                  <FileText className="size-16 text-primary mx-auto" />
                  <p className="text-sm font-medium">{previewDoc.fileName}</p>
                  <Button variant="outline" size="sm" onClick={() => downloadFn(previewDoc.id, previewDoc.fileName)}>
                    <Download className="size-4 mr-2" /> Download File
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Replace Document Modal */}
      {replaceDoc && (
        <Dialog open={Boolean(replaceDoc)} onOpenChange={(op) => !op && setReplaceDoc(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Replace Document (Upload New Version)</DialogTitle>
              <DialogDescription>
                Replacing <span className="font-semibold text-foreground">{replaceDoc.customName || replaceDoc.fileName || replaceDoc.type}</span> will create <span className="font-bold text-primary">Version {(replaceDoc.version || 1) + 1}</span> while keeping Version {replaceDoc.version || 1} available in history.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleReplaceSubmit} className="space-y-4 py-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Select New File *</label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setReplaceFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes for this version (Optional)</label>
                <Input
                  value={replaceNotes}
                  onChange={(e) => setReplaceNotes(e.target.value)}
                  placeholder="e.g. Re-uploaded clearer passport scan"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setReplaceDoc(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!replaceFile || replaceMutation.isPending}>
                  {replaceMutation.isPending ? 'Uploading...' : 'Upload New Version'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
