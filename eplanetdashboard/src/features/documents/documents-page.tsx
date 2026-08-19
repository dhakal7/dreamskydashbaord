import { useState, useMemo } from 'react'
import dayjs from 'dayjs'
import {
  Search, Upload, FolderKanban, CheckCircle2, Clock, AlertTriangle, ChevronRight, User, Plus, Filter, FileCheck
} from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PersonAvatar } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/shared/empty-state'
import { DocumentUploadDialog } from './document-upload-dialog'
import { StudentDocumentProfileDialog } from './student-document-profile-dialog'
import { useStudentDocumentProfiles, useDocuments } from '@/hooks/use-documents'
import { useStudentsStore } from '@/features/students/store'
import { useDocumentsStore } from './store'
import { useAuthStore } from '@/store/auth-store'
import type { StudentDocumentProfile, StudentDocument } from '@/types'

export default function DocumentsPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const students = useStudentsStore((s) => s.students)
  const { documents: mockDocs, deleteDocument: deleteMockDoc } = useDocumentsStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState<StudentDocumentProfile | null>(null)

  // Fetch real student document profiles from backend REST API
  const { data: apiProfiles, isLoading } = useStudentDocumentProfiles(searchQuery)
  const { data: apiDocsData } = useDocuments()

  // Generate fallback student profile cards if using mock store or before backend response
  const profiles: StudentDocumentProfile[] = useMemo(() => {
    if (apiProfiles && apiProfiles.length > 0) {
      return apiProfiles
    }

    // Adapt students + documents store into Student Profile Cards
    const docsToUse = apiDocsData?.documents && apiDocsData.documents.length > 0
      ? apiDocsData.documents.map((d: any) => ({
          id: d.id,
          studentId: d.studentId,
          studentName: d.student ? `${d.student.firstName} ${d.student.lastName}` : 'Student',
          category: (d.category || 'other').toLowerCase() as any,
          type: (d.type || 'other').toLowerCase(),
          customName: d.customName,
          fileName: d.originalName || `${d.type}.pdf`,
          fileSizeKb: d.sizeBytes ? Math.round(d.sizeBytes / 1024) : 150,
          version: d.currentVersion || 1,
          uploadedAt: d.createdAt,
          uploadedBy: d.uploadedBy ? `${d.uploadedBy.firstName} ${d.uploadedBy.lastName}` : 'Counselor',
          status: (d.status || 'uploaded').toLowerCase() as any,
          reviewComment: d.reviewComment,
          reviewedAt: d.reviewedAt,
        }))
      : mockDocs

    // Group documents by student ID
    const docsByStudentId = new Map<string, StudentDocument[]>()
    docsToUse.forEach((d) => {
      const existing = docsByStudentId.get(d.studentId) || []
      existing.push(d)
      docsByStudentId.set(d.studentId, existing)
    })

    // Filter students by search query
    const q = searchQuery.toLowerCase().trim()
    const matchingStudents = students.filter((s) => {
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        (s.studentId && s.studentId.toLowerCase().includes(q)) ||
        (s.passportNumber && s.passportNumber.toLowerCase().includes(q)) ||
        (s.counselorName && s.counselorName.toLowerCase().includes(q))
      )
    })

    const REQUIRED_TARGET = 15

    return matchingStudents.map((s) => {
      const sDocs = docsByStudentId.get(s.id) || []
      const verified = sDocs.filter((d) => d.status === 'verified').length
      const pending = sDocs.filter((d) => ['uploaded', 'pending_student_review', 're_uploaded', 'pending_review', 'pending'].includes(d.status)).length
      const changesRequested = sDocs.filter((d) => d.status === 'changes_requested').length
      const completionPercentage = Math.min(Math.round((verified / REQUIRED_TARGET) * 100), 100)
      const lastUpdated = sDocs.length > 0 ? sDocs[0].uploadedAt : s.createdAt

      return {
        studentId: s.id,
        studentName: s.name,
        applicationId: s.studentId || `EP-2026-${s.id.slice(-4).toUpperCase()}`,
        passportNumber: s.passportNumber || 'PA-PENDING',
        assignedCounselor: s.counselorName || 'Counselor',
        totalDocuments: sDocs.length,
        verifiedDocuments: verified,
        pendingDocuments: pending,
        changesRequestedDocuments: changesRequested,
        completionPercentage,
        lastUpdated,
        documents: sDocs,
      }
    })
  }, [apiProfiles, apiDocsData, mockDocs, students, searchQuery])

  // Sync selectedProfile if updated
  const activeProfile = selectedProfile
    ? profiles.find((p) => p.studentId === selectedProfile.studentId) || selectedProfile
    : null

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Student Documents"
          description="Manage student document profiles, version history, and verification workflows."
        />
        <Button onClick={() => setUploadDialogOpen(true)} className="gap-2 shrink-0 shadow-soft">
          <Upload className="size-4" /> Upload Document
        </Button>
      </div>

      {/* ── Search & Filter Controls Top Bar ── */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Student Name, Application ID, Passport Number, or Counselor..."
              className="pl-9 text-sm"
            />
          </div>
          <Button variant="outline" onClick={() => setSearchQuery('')} className="shrink-0 text-xs">
            Clear Search
          </Button>
        </div>
      </Card>

      {/* ── Student Profile Cards Grid (Student-Centric Primary View) ── */}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading student document profiles...</div>
      ) : profiles.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No Student Document Profiles Found"
          description={
            searchQuery
              ? `No student matching "${searchQuery}" was found.`
              : 'Start building student document profiles by uploading the first document.'
          }
          action={
            <Button onClick={() => setUploadDialogOpen(true)} className="mt-3 gap-2">
              <Plus className="size-4" /> + Upload First Document
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => (
            <Card
              key={profile.studentId}
              className="flex flex-col justify-between p-5 hover:border-primary/50 transition-all duration-200 shadow-soft hover:shadow-md border-border/80"
            >
              <div className="space-y-4">
                {/* Profile Card Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <PersonAvatar name={profile.studentName} className="size-11 font-semibold text-sm" />
                    <div>
                      <h3 className="font-bold text-base text-foreground leading-tight">{profile.studentName}</h3>
                      <p className="text-xs font-tabular font-medium text-muted-foreground mt-0.5">{profile.applicationId}</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                    {profile.totalDocuments} Docs
                  </span>
                </div>

                {/* Info Pills */}
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground bg-accent/20 p-2.5 rounded-lg border border-border/50">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground/70 block">Counselor</span>
                    <span className="font-medium text-foreground truncate block">{profile.assignedCounselor}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground/70 block">Passport</span>
                    <span className="font-tabular font-medium text-foreground truncate block">{profile.passportNumber}</span>
                  </div>
                </div>

                {/* Metrics Breakdown */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-green-500/10 p-2 border border-green-500/20">
                    <span className="block text-lg font-extrabold text-green-600 dark:text-green-400">{profile.verifiedDocuments}</span>
                    <span className="text-[10px] font-medium text-muted-foreground">Verified</span>
                  </div>
                  <div className="rounded-lg bg-amber-500/10 p-2 border border-amber-500/20">
                    <span className="block text-lg font-extrabold text-amber-600 dark:text-amber-400">{profile.pendingDocuments}</span>
                    <span className="text-[10px] font-medium text-muted-foreground">Pending</span>
                  </div>
                  <div className="rounded-lg bg-red-500/10 p-2 border border-red-500/20">
                    <span className="block text-lg font-extrabold text-red-600 dark:text-red-400">{profile.changesRequestedDocuments}</span>
                    <span className="text-[10px] font-medium text-muted-foreground">Requested</span>
                  </div>
                </div>

                {/* Document Completion Progress Bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-muted-foreground">Completion</span>
                    <span className="text-primary font-bold">{profile.completionPercentage}%</span>
                  </div>
                  <Progress value={profile.completionPercentage} className="h-2" />
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-5 pt-3 border-t border-border/60 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  Updated {dayjs(profile.lastUpdated).format('MMM D, YYYY')}
                </span>
                <Button
                  onClick={() => setSelectedProfile(profile)}
                  size="sm"
                  className="gap-1.5 text-xs font-semibold px-3 shadow-soft"
                >
                  Open Documents <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Main Document Upload Modal ── */}
      <DocumentUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
      />

      {/* ── Full Student Document Profile Modal ── */}
      <StudentDocumentProfileDialog
        profile={activeProfile}
        open={Boolean(activeProfile)}
        onOpenChange={(open) => !open && setSelectedProfile(null)}
        onDeleteDocument={(docId) => deleteMockDoc(docId)}
      />
    </div>
  )
}
