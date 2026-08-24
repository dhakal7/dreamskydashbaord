import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, ShieldAlert, ChevronRight, CheckCircle2, Clock, Circle,
  MapPin, GraduationCap, Mail, Phone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PersonAvatar } from '@/components/ui/avatar'
import { useVisaStore } from './store'
import { useStudentsStore } from '@/features/students/store'
import { useAuthStore } from '@/store/auth-store'
import { hasPermission } from '@/lib/rbac'
import { Stepper, type Step, type TerminalStep } from '@/components/shared/stepper'
import { VisaStatusBadge, visaStatusMeta } from '@/components/shared/status-badges'
import type { VisaStep, VisaStatus } from '@/types'

const visaStepLabels: Record<VisaStep, string> = {
  medical: 'Medical Exam',
  biometric: 'Biometric Enrollment',
  financial: 'Financial Verification',
  interview: 'Visa Interview',
  embassy_submission: 'Embassy Submission',
  decision: 'Final Decision',
}

const visaStepDescriptions: Record<VisaStep, string> = {
  medical: 'Health examination completed',
  biometric: 'Fingerprints & photo captured',
  financial: 'Proof of funds verified',
  interview: 'Consulate interview attended',
  embassy_submission: 'Application submitted to embassy',
  decision: 'Visa outcome received',
}

export default function VisaCaseDetailPage() {
  const { id } = useParams<{ id: string }>()

  const visaCases = useVisaStore((s) => s.visaCases)
  const updateChecklistItem = useVisaStore((s) => s.updateChecklistItem)
  const updateOverallStatus = useVisaStore((s) => s.updateOverallStatus)

  const students = useStudentsStore((s) => s.students)
  const currentUser = useAuthStore((s) => s.currentUser)

  const visaCase =
    visaCases.find((vc) => vc.id === id || (vc as any).caseRef === id) ||
    visaCases.find((vc) => id && (vc.id.includes(id) || id.includes(vc.id))) ||
    (visaCases.length > 0 ? visaCases[0] : undefined)

  const student = visaCase ? (students.find((s) => s.id === visaCase.studentId) || students[0]) : null
  const canView = Boolean(visaCase && student)
  const canManage = hasPermission(currentUser.role, 'visa.manage')

  if (!visaCase || !canView) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-center">
        <ShieldAlert className="size-12 text-destructive mb-4 animate-bounce" />
        <h3 className="text-xl font-bold">Visa Case Not Found</h3>
        <p className="text-muted-foreground mt-2">No visa case could be located with ID {id}.</p>
        <Button asChild className="mt-4" variant="outline">
          <Link to="/visa">
            <ArrowLeft className="mr-2 size-4" /> Back to Visa Processing
          </Link>
        </Button>
      </div>
    )
  }

  const steps: Step[] = [
    { key: 'medical', label: visaStepLabels.medical, description: visaStepDescriptions.medical },
    { key: 'biometric', label: visaStepLabels.biometric, description: visaStepDescriptions.biometric },
    { key: 'financial', label: visaStepLabels.financial, description: visaStepDescriptions.financial },
    { key: 'interview', label: visaStepLabels.interview, description: visaStepDescriptions.interview },
    { key: 'embassy_submission', label: visaStepLabels.embassy_submission, description: visaStepDescriptions.embassy_submission },
    { key: 'decision', label: visaStepLabels.decision, description: visaStepDescriptions.decision },
  ]

  const terminalSteps: TerminalStep[] = [
    { key: 'rejected', label: 'Visa Rejected', description: 'Application denied by embassy', variant: 'danger' },
  ]

  const stepDates: Record<string, string> = {}
  visaCase.checklist.forEach((item) => {
    if (item.completedDate) {
      stepDates[item.step] = item.completedDate
    }
  })

  const currentStepIndex = visaCase.checklist.findIndex((item) => item.status === 'in_progress')
  const currentStepKey = currentStepIndex >= 0 ? visaCase.checklist[currentStepIndex].step : 'decision'

  const activeTerminalKey = visaCase.overallStatus === 'rejected' ? 'rejected' : undefined

  const completedSteps = visaCase.checklist
    .filter((item) => item.status === 'approved' && item.completedDate)
    .sort((a, b) => new Date(b.completedDate!).getTime() - new Date(a.completedDate!).getTime())

  const handleStepUpdate = (step: VisaStep, newStatus: VisaStatus) => {
    updateChecklistItem(visaCase.id, step, newStatus)
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs & Navigation */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/visa" className="hover:text-foreground">Visa Processing</Link>
          <ChevronRight className="size-3" />
          <span className="text-foreground font-medium font-mono">{visaCase.id}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon" className="size-9 shrink-0">
              <Link to="/visa">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-sm font-semibold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
                  {visaCase.id}
                </span>
                <h1 className="text-2xl font-bold text-foreground">{visaCase.studentName}</h1>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {visaCase.countryName} — <span className="font-semibold text-foreground">{visaCase.universityName}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <VisaStatusBadge status={visaCase.overallStatus} className="text-sm" />
            {canManage && (
              <Select
                value={visaCase.overallStatus}
                onValueChange={(val) => updateOverallStatus(visaCase.id, val as VisaStatus)}
              >
                <SelectTrigger className="w-[160px] h-9 border-border/70">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(visaStatusMeta).map(([k, meta]) => (
                    <SelectItem key={k} value={k}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </div>

      {/* Progress Summary */}
      <Card className="p-5 border-border/70 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Overall Progress</h3>
          <span className="text-lg font-bold font-tabular text-foreground">{visaCase.progress}%</span>
        </div>
        <Progress value={visaCase.progress} className="h-3" />
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          {visaCase.submissionDate && (
            <span>Submitted: <span className="font-semibold text-foreground">{visaCase.submissionDate}</span></span>
          )}
          {visaCase.decisionDate && (
            <span>Decision: <span className="font-semibold text-foreground">{visaCase.decisionDate}</span></span>
          )}
          {visaCase.visaOfficer && (
            <span>Officer: <span className="font-semibold text-foreground">{visaCase.visaOfficer}</span></span>
          )}
        </div>
      </Card>

      {/* Stepper Card */}
      <Card className="p-6 md:p-8 border-border/70 shadow-sm bg-card/60 backdrop-blur">
        <h2 className="text-sm font-bold text-foreground mb-6 uppercase tracking-wider">Visa Checklist Timeline</h2>
        <Stepper
          steps={steps}
          currentStepKey={currentStepKey}
          terminalSteps={terminalSteps}
          activeTerminalKey={activeTerminalKey}
          stepDates={stepDates}
          orientation="horizontal"
        />
      </Card>

      {/* Main Grid Detail Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Checklist Details + Actions */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5 border-border/70 shadow-sm">
            <div className="flex items-start justify-between border-b border-border/60 pb-4 mb-4">
              <div>
                <h3 className="font-bold text-lg text-foreground">Checklist Steps</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Detailed status for each visa requirement</p>
              </div>
            </div>

            <div className="space-y-3">
              {visaCase.checklist.map((item) => (
                <div
                  key={item.step}
                  className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-4"
                >
                  <div className="flex items-start gap-3">
                    {item.status === 'approved' ? (
                      <CheckCircle2 className="size-5 text-emerald-500 mt-0.5 shrink-0" />
                    ) : item.status === 'in_progress' ? (
                      <Clock className="size-5 text-blue-500 mt-0.5 shrink-0" />
                    ) : item.status === 'submitted' ? (
                      <Clock className="size-5 text-amber-500 mt-0.5 shrink-0" />
                    ) : item.status === 'rejected' ? (
                      <Circle className="size-5 text-red-500 mt-0.5 shrink-0" />
                    ) : (
                      <Circle className="size-5 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-semibold">{visaStepLabels[item.step]}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.status === 'approved' && item.completedDate
                          ? `Completed on ${item.completedDate}`
                          : item.status === 'in_progress'
                            ? 'In progress'
                            : item.status === 'submitted'
                              ? 'Submitted, awaiting decision'
                              : item.status === 'rejected'
                                ? 'Rejected'
                                : 'Not yet started'}
                      </p>
                    </div>
                  </div>

                  {canManage && (
                    <Select
                      value={item.status}
                      onValueChange={(val) => handleStepUpdate(item.step, val as VisaStatus)}
                    >
                      <SelectTrigger className="w-[140px] h-8 border-border/70 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(visaStatusMeta).map(([k, meta]) => (
                          <SelectItem key={k} value={k}>
                            {meta.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Sidebar - Student Info & Timeline */}
        <div className="space-y-6">
          {/* Student Card */}
          {student && (
            <Card className="p-5 border-border/70 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-foreground uppercase tracking-wider">Student Information</h3>
              <div className="flex items-center gap-3">
                <PersonAvatar name={student.name} color={student.photoColor} className="size-11" />
                <div>
                  <Link to={`/students/${student.id}`} className="text-sm font-bold text-brand-600 hover:underline">
                    {student.name}
                  </Link>
                  <p className="text-xs text-muted-foreground font-tabular">{student.studentId}</p>
                </div>
              </div>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="size-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <Mail className="size-3.5 text-muted-foreground" />
                  </div>
                  <a href={`mailto:${student.email}`} className="font-medium text-foreground hover:underline font-tabular truncate">
                    {student.email}
                  </a>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="size-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <Phone className="size-3.5 text-muted-foreground" />
                  </div>
                  <a href={`tel:${student.phone}`} className="font-medium text-foreground hover:underline font-tabular">
                    {student.phone}
                  </a>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="size-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <MapPin className="size-3.5 text-muted-foreground" />
                  </div>
                  <span className="text-muted-foreground">{student.address}</span>
                </div>
              </div>
            </Card>
          )}

          {/* Timeline Log */}
          <Card className="p-5 border-border/70 shadow-sm space-y-3.5">
            <h3 className="font-bold text-sm text-foreground uppercase tracking-wider">Completion Timeline</h3>
            {completedSteps.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No steps completed yet.</p>
            ) : (
              <div className="space-y-3">
                {completedSteps.map((item) => (
                  <div key={item.step} className="flex items-start gap-3">
                    <div className="mt-1 size-2 rounded-full bg-emerald-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{visaStepLabels[item.step]}</p>
                      <p className="text-[11px] text-muted-foreground font-tabular">{item.completedDate}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* University Info */}
          <Card className="p-5 border-border/70 shadow-sm space-y-3.5">
            <h3 className="font-bold text-sm text-foreground uppercase tracking-wider">University Details</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <GraduationCap className="size-4 text-muted-foreground shrink-0" />
                <span className="font-semibold text-foreground">{visaCase.universityName}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="size-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">{visaCase.countryName}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
