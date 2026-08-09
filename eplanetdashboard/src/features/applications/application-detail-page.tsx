import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Mail, Phone, GraduationCap, MapPin, Calendar, DollarSign, User, ShieldAlert, Award, FileText, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useApplicationsStore } from './store'
import { useStudentsStore } from '@/features/students/store'
import { Stepper, type Step, type TerminalStep } from '@/components/shared/stepper'
import { universities } from '@/mock'
import type { ApplicationStage } from '@/types'
import { ApplicationStageBadge, applicationStageMeta } from '@/components/shared/status-badges'
import { useAuthStore } from '@/store/auth-store'
import { canViewStudent } from '@/lib/data-visibility'
import { hasPermission } from '@/lib/rbac'

// Helper to add days to a YYYY-MM-DD string
function addDays(dateStr: string, days: number): string {
  try {
    const date = new Date(dateStr)
    date.setDate(date.getDate() + days)
    const today = new Date()
    // Make sure we don't generate a date in the future relative to today
    const finalDate = date > today ? today : date
    return finalDate.toISOString().split('T')[0]
  } catch {
    return dateStr
  }
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>()
  
  const applications = useApplicationsStore((s) => s.applications)
  const moveApplication = useApplicationsStore((s) => s.moveApplication)
  
  const students = useStudentsStore((s) => s.students)
  const currentUser = useAuthStore((s) => s.currentUser)
  
  const app = applications.find((candidate) => candidate.id === id)
  const student = app ? students.find((s) => s.id === app.studentId) : null
  const canView = Boolean(app && student && canViewStudent(currentUser, student))
  const canManage = hasPermission(currentUser.role, 'applications.manage')
  const uni = app ? universities.find((u) => u.id === app.universityId) : null

  if (!app || !canView) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-center">
        <ShieldAlert className="size-12 text-destructive mb-4 animate-bounce" />
        <h3 className="text-xl font-bold">Application Not Found</h3>
        <p className="text-muted-foreground mt-2">No application could be located with ID {id}.</p>
        <Button asChild className="mt-4" variant="outline">
          <Link to="/applications">
            <ArrowLeft className="mr-2 size-4" /> Back to Applications
          </Link>
        </Button>
      </div>
    )
  }

  // Linear progression steps
  const steps: Step[] = [
    { key: 'submitted', label: 'Application Submitted', description: 'Submitted to university portals' },
    { key: 'university_review', label: 'University Review', description: 'Under evaluation by admissions' },
    { key: 'conditional_offer', label: 'Conditional Offer', description: 'Pending academic/language conditions' },
    { key: 'unconditional_offer', label: 'Unconditional Offer', description: 'All conditions satisfied' },
    { key: 'accepted', label: 'Accepted', description: 'Deposit paid, place confirmed' },
  ]

  const terminalSteps: TerminalStep[] = [
    { key: 'rejected', label: 'Application Rejected', description: 'Rejected by admissions', variant: 'danger' }
  ]

  // Construct dates for stages based on submittedDate and lastUpdate
  const stepDates: Record<string, string> = {
    submitted: app.submittedDate,
  }

  // Deterministic milestones
  const uReviewDate = addDays(app.submittedDate, 5)
  const condOfferDate = addDays(app.submittedDate, 14)
  const uncondOfferDate = addDays(app.submittedDate, 22)

  if (app.stage === 'university_review') {
    stepDates.university_review = app.lastUpdate
  } else if (app.stage === 'conditional_offer') {
    stepDates.university_review = uReviewDate
    stepDates.conditional_offer = app.lastUpdate
  } else if (app.stage === 'unconditional_offer') {
    stepDates.university_review = uReviewDate
    stepDates.conditional_offer = condOfferDate
    stepDates.unconditional_offer = app.lastUpdate
  } else if (app.stage === 'accepted') {
    stepDates.university_review = uReviewDate
    stepDates.conditional_offer = condOfferDate
    stepDates.unconditional_offer = uncondOfferDate
    stepDates.accepted = app.lastUpdate
  } else if (app.stage === 'rejected') {
    // If rejected, simulate dates up to when rejection occurred (e.g. at university review level)
    stepDates.university_review = uReviewDate
    stepDates.rejected = app.lastUpdate
  }

  // Next stage transition sequence helper
  const linearFlow: ApplicationStage[] = ['submitted', 'university_review', 'conditional_offer', 'unconditional_offer', 'accepted']
  const nextStageIndex = linearFlow.indexOf(app.stage) + 1
  const nextStage = nextStageIndex < linearFlow.length ? linearFlow[nextStageIndex] : null

  const handleNextStage = () => {
    if (nextStage) {
      moveApplication(app.id, nextStage)
    }
  }

  const handleReopen = () => {
    moveApplication(app.id, 'submitted')
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs & Navigation */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/applications" className="hover:text-foreground">Applications</Link>
          <ChevronRight className="size-3" />
          <span className="text-foreground font-medium font-mono">{app.applicationRef}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon" className="size-9 shrink-0">
              <Link to="/applications">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-sm font-semibold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
                  {app.applicationRef}
                </span>
                <h1 className="text-2xl font-bold text-foreground">{app.studentName}</h1>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Managed by Counselor: <span className="font-semibold text-foreground">{app.counselorName}</span>
              </p>
            </div>
          </div>

          {/* Quick Actions / Advancement */}
          <div className="flex items-center gap-2.5">
            {canManage ? (
              <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 shadow-sm">
                <span className="text-xs text-muted-foreground font-medium">Stage:</span>
                <Select value={app.stage} onValueChange={(val) => moveApplication(app.id, val as ApplicationStage)}>
                  <SelectTrigger className="w-[170px] h-7 border-none bg-transparent shadow-none focus:ring-0 p-0 text-sm font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(applicationStageMeta).map(([k, meta]) => (
                      <SelectItem key={k} value={k}>
                        {meta.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 shadow-sm">
                <span className="text-xs text-muted-foreground font-medium">Stage:</span>
                <ApplicationStageBadge stage={app.stage} />
              </div>
            )}

            {canManage && app.stage === 'rejected' && (
              <Button size="sm" variant="outline" onClick={handleReopen} className="h-9">
                Reopen Application
              </Button>
            )}
            {canManage && app.stage !== 'rejected' && nextStage && (
              <Button size="sm" onClick={handleNextStage} className="h-9 bg-brand-600 hover:bg-brand-700 text-white font-medium">
                Move to Next Stage
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stepper Card */}
      <Card className="p-6 md:p-8 border-border/70 shadow-sm bg-card/60 backdrop-blur">
        <h2 className="text-sm font-bold text-foreground mb-6 uppercase tracking-wider">Application Tracking Timeline</h2>
        <Stepper
          steps={steps}
          currentStepKey={app.stage}
          terminalSteps={terminalSteps}
          activeTerminalKey={app.stage === 'rejected' ? 'rejected' : undefined}
          stepDates={stepDates}
          orientation="horizontal"
        />
      </Card>

      {/* Main Grid Detail Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Course & Uni Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5 border-border/70 shadow-sm">
            <div className="flex items-start justify-between border-b border-border/60 pb-4 mb-4">
              <div>
                <h3 className="font-bold text-lg text-foreground">Course & University Information</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Academic placement records</p>
              </div>
              <div className="size-10 rounded-full bg-brand-50 dark:bg-brand-950/20 text-brand-600 dark:text-brand-400 flex items-center justify-center font-bold">
                {uni?.logoInitial || 'U'}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground block font-medium">University</span>
                <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                  <span>{uni?.flag}</span>
                  <span>{app.universityName}</span>
                </span>
                <span className="text-xs text-muted-foreground block mt-0.5">
                  Ranking: <span className="font-semibold text-foreground">#{uni?.ranking || 'N/A'}</span>
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-muted-foreground block font-medium">Course Program</span>
                <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                  <GraduationCap className="size-4 text-muted-foreground" />
                  <span>{app.courseName}</span>
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-muted-foreground block font-medium">Tuition Fees</span>
                <span className="font-semibold text-foreground text-sm flex items-center gap-1.5 font-tabular">
                  <DollarSign className="size-4 text-muted-foreground" />
                  <span>{uni ? `${uni.tuitionFromUsd.toLocaleString()} USD / Year` : `${app.tuitionUsd.toLocaleString()} USD`}</span>
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-muted-foreground block font-medium">Intake Session</span>
                <span className="font-semibold text-foreground text-sm flex items-center gap-1.5 font-tabular">
                  <Calendar className="size-4 text-muted-foreground" />
                  <span>{app.intake}</span>
                </span>
              </div>
            </div>
          </Card>

          {/* Student Profile Card (if found) */}
          {student && (
            <Card className="p-5 border-border/70 shadow-sm">
              <div className="flex items-start justify-between border-b border-border/60 pb-4 mb-4">
                <div>
                  <h3 className="font-bold text-lg text-foreground">Student Academic & English Assessment</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Submitted eligibility credentials</p>
                </div>
                <div className="size-10 rounded-full bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <User className="size-5" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground block font-medium">Academic GPA</span>
                  <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                    <Award className="size-4 text-emerald-500" />
                    <span>{student.academics[0]?.gpaOrPercentage || 'N/A'}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground block">
                    {student.academics[0]?.institution}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground block font-medium">English Test</span>
                  <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                    <FileText className="size-4 text-blue-500" />
                    <span>{student.englishTest?.type} ({student.englishTest?.overallScore || 'N/A'})</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground block">
                    Date: {student.englishTest?.testDate || 'N/A'}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground block font-medium">Country Preference</span>
                  <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                    <MapPin className="size-4 text-rose-500" />
                    <span>{student.preferredCountries.join(', ')}</span>
                  </span>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar Info - Student Contacts & Dates */}
        <div className="space-y-6">
          <Card className="p-5 border-border/70 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-foreground uppercase tracking-wider">Contact & Basic Info</h3>
            
            {student ? (
              <div className="space-y-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <User className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block font-medium">Student Name</span>
                    <Link to={`/students/${student.id}`} className="text-sm font-semibold text-brand-600 hover:underline">
                      {student.name}
                    </Link>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <Mail className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block font-medium">Email Address</span>
                    <a href={`mailto:${student.email}`} className="text-sm font-semibold text-foreground hover:underline font-tabular">
                      {student.email}
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <Phone className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block font-medium">Phone Number</span>
                    <a href={`tel:${student.phone}`} className="text-sm font-semibold text-foreground hover:underline font-tabular">
                      {student.phone}
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No student details found</p>
            )}
          </Card>

          <Card className="p-5 border-border/70 shadow-sm space-y-3.5">
            <h3 className="font-bold text-sm text-foreground uppercase tracking-wider">Timeline Milestones</h3>
            <div className="space-y-2.5 text-xs text-muted-foreground font-tabular">
              <div className="flex justify-between">
                <span>Submitted:</span>
                <span className="font-semibold text-foreground">{app.submittedDate}</span>
              </div>
              <div className="flex justify-between">
                <span>Last Updated:</span>
                <span className="font-semibold text-foreground">{app.lastUpdate}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
