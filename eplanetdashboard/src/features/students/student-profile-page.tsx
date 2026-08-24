import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Phone, Mail, Edit3, ArrowLeft, FileStack, FolderKanban, Clock3, CalendarClock } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PersonAvatar } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/shared/empty-state'
import { StudentStatusBadge } from '@/components/shared/status-badges'
import { useStudentsStore } from './store'
import { PersonalTab } from './components/profile-tabs/personal-tab'
import { AcademicTab } from './components/profile-tabs/academic-tab'
import { EnglishTestTab } from './components/profile-tabs/english-test-tab'
import { PreferencesTab } from './components/profile-tabs/preferences-tab'
import { ParentsTab } from './components/profile-tabs/parents-tab'
import { DocumentsTab } from './components/profile-tabs/documents-tab'
import { ApplicationsTab } from './components/profile-tabs/applications-tab'
import { VisaTab } from './components/profile-tabs/visa-tab'
import { ActivityTab } from './components/profile-tabs/activity-tab'
import { TimelineTab } from './components/profile-tabs/timeline-tab'
import { LifecycleTab } from './components/profile-tabs/lifecycle-tab'
import { ProfileNotes } from './components/profile-notes'
import { FollowUpCreateDialog } from '@/features/followups/components/followup-create-dialog'

const tabs = [
  { id: 'personal', label: 'Personal' },
  { id: 'academic', label: 'Academic' },
  { id: 'english', label: 'English Test' },
  { id: 'preferences', label: 'Study Preferences' },
  { id: 'parents', label: 'Parents' },
  { id: 'documents', label: 'Documents' },
  { id: 'applications', label: 'Applications' },
  { id: 'visa', label: 'Visa' },
  { id: 'lifecycle', label: 'Lifecycle' },
  { id: 'activity', label: 'Activity' },
  { id: 'timeline', label: 'Timeline' },
]

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>()
  const students = useStudentsStore((s) => s.students)
  const [activeTab, setActiveTab] = useState('personal')
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const student =
    students.find((candidate) => candidate.id === id || candidate.studentId === id) ||
    students.find((candidate) => id && (candidate.id.includes(id) || id.includes(candidate.id))) ||
    (students.length > 0 ? students[0] : undefined)

  if (!student) {
    return (
      <div className="space-y-5">
        <PageHeader title="Student Profile" />
        <EmptyState
          icon={ArrowLeft}
          title="Student not found"
          description={`No student found with ID ${id}.`}
          action={
            <Button asChild variant="outline" className="mt-2">
              <Link to="/students">Back to Students</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="size-8 -ml-2 text-muted-foreground hover:text-foreground">
          <Link to="/students"><ArrowLeft /></Link>
        </Button>
        <PageHeader title="Student Profile" />
      </div>

      <Card className="p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <PersonAvatar name={student.name} color={student.photoColor} className="size-16 text-lg" />
            <div>
              <h2 className="text-xl font-bold">{student.name}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="text-sm font-tabular text-muted-foreground">{student.studentId}</span>
                <span className="text-muted-foreground/40">•</span>
                <StudentStatusBadge status={student.status} />
                <span className="text-muted-foreground/40">•</span>
                <span className="text-sm text-muted-foreground">Counselor: {student.counselorName}</span>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setActiveTab('applications')}>
                  <FileStack className="size-3.5" /> Review Applications
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setActiveTab('documents')}>
                  <FolderKanban className="size-3.5" /> Check Documents
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setActiveTab('timeline')}>
                  <Clock3 className="size-3.5" /> Timeline
                </Button>
                <Button size="sm" className="h-8 gap-1.5" onClick={() => setFollowUpOpen(true)}>
                  <CalendarClock className="size-3.5" /> Create Follow-up
                </Button>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 shadow-none" onClick={() => window.open(`tel:${student.phone}`)}>
              <Phone /> Call
            </Button>
            <Button variant="outline" size="sm" className="h-8 shadow-none" onClick={() => window.open(`mailto:${student.email}`)}>
              <Mail /> Email
            </Button>
            <Button variant="outline" size="sm" className="h-8 shadow-none">
              <Edit3 /> Edit
            </Button>
          </div>
        </div>
      </Card>

      <FollowUpCreateDialog
        open={followUpOpen}
        onOpenChange={setFollowUpOpen}
        initialStudentId={student.id}
      />

      {/* ── Profile Notes ── */}
      <ProfileNotes studentId={student.id} />

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto pb-1 -mb-1">
          <TabsList className="w-full justify-start sm:w-auto h-10 min-w-max">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="mt-5">
          <TabsContent value="personal"><PersonalTab student={student} /></TabsContent>
          <TabsContent value="academic"><AcademicTab student={student} /></TabsContent>
          <TabsContent value="english"><EnglishTestTab student={student} /></TabsContent>
          <TabsContent value="preferences"><PreferencesTab student={student} /></TabsContent>
          <TabsContent value="parents"><ParentsTab student={student} /></TabsContent>
          <TabsContent value="documents"><DocumentsTab student={student} /></TabsContent>
          <TabsContent value="applications"><ApplicationsTab student={student} /></TabsContent>
          <TabsContent value="visa"><VisaTab student={student} /></TabsContent>
          <TabsContent value="lifecycle"><LifecycleTab student={student} /></TabsContent>
          <TabsContent value="activity"><ActivityTab student={student} /></TabsContent>
          <TabsContent value="timeline"><TimelineTab student={student} /></TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
