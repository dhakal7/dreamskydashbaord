import { useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  Loader2,
  PlaneTakeoff,
  Edit3,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { VisaStatusBadge } from '@/components/shared/status-badges'
import { useVisaStore } from '@/features/visa/store'
import { useVisaCases, useUpdateDeparture } from '@/hooks/use-visa'
import { isMockMode } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth-store'
import type { Student, VisaCase, VisaStatus } from '@/types'

const BACKEND_VISA_STATUS_MAP: Record<string, VisaStatus> = {
  NOT_APPLIED: 'not_started',
  PREPARING: 'in_progress',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REFUSED: 'rejected',
  RESUBMITTING: 'in_progress',
}

function resolveVisaStatus(status?: string): VisaStatus {
  if (!status) return 'not_started'
  return BACKEND_VISA_STATUS_MAP[status.toUpperCase()] ?? (status.toLowerCase() as VisaStatus)
}

const DEPARTURE_STATUS_META: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'outline' }
> = {
  VISA_APPROVED: { label: 'Visa Approved (Pending Plan)', variant: 'info' },
  PREPARING: { label: 'Preparing Departure', variant: 'warning' },
  TICKET_BOOKED: { label: 'Ticket Booked', variant: 'secondary' },
  DEPARTED: { label: 'Departed', variant: 'success' },
  DELAYED: { label: 'Delayed / Postponed', variant: 'outline' },
}

interface VisaTabProps {
  student: Student
  apiStudent?: any
}

export function VisaTab({ student, apiStudent }: VisaTabProps) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const mockVisaCases = useVisaStore((s) => s.visaCases).filter((v) => v.studentId === student.id)
  const { data: apiVisaData, isLoading, refetch } = useVisaCases({ studentId: student.id })
  const updateDepartureMutation = useUpdateDeparture()

  // Modal dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [depStatus, setDepStatus] = useState('VISA_APPROVED')
  const [expDate, setExpDate] = useState('')
  const [actDate, setActDate] = useState('')
  const [airport, setAirport] = useState('')
  const [flightNo, setFlightNo] = useState('')
  const [depNotes, setDepNotes] = useState('')

  const cases: VisaCase[] = !isMockMode()
    ? (apiVisaData?.visaCases ?? []).map((vc) => {
        const studentObj = vc.application?.student || vc.student
        const studentName = studentObj
          ? `${studentObj.firstName} ${studentObj.lastName}`.trim()
          : student.name
        const studentId = studentObj?.id || vc.studentId || student.id
        const universityName = vc.application?.university?.name || 'University'
        const countryName = vc.country || (vc.application?.university as any)?.country?.name || 'General'
        const status = resolveVisaStatus(vc.status)

        return {
          id: vc.id,
          studentId,
          studentName,
          countryName,
          universityName,
          checklist: [],
          overallStatus: status,
          progress: status === 'approved' ? 100 : status === 'rejected' ? 0 : status === 'submitted' ? 75 : 40,
          submissionDate: vc.submittedAt ?? vc.createdAt,
          appointmentDate: vc.appointmentDate ?? undefined,
        }
      })
    : mockVisaCases

  const departureDetails = apiStudent?.academicBackground?.departureDetails
  const currentStage = apiStudent?.currentStage || (student.tags?.[0] ?? '')
  const hasApprovedVisa =
    cases.some((c) => c.overallStatus === 'approved') ||
    currentStage === 'VISA_APPROVED' ||
    currentStage === 'DEPARTED'

  // Permission: super admin, branch admin, front desk, OR counselor assigned to this student
  const canUpdateDeparture =
    currentUser &&
    (['super_admin', 'branch_admin', 'front_desk'].includes(currentUser.role) ||
      (currentUser.role === 'counselor' && student.counselorId === currentUser.id))

  const openDepartureDialog = () => {
    const d = departureDetails || {}
    setDepStatus(d.status || (currentStage === 'DEPARTED' ? 'DEPARTED' : 'VISA_APPROVED'))
    setExpDate(d.expectedDepartureDate ? dayjs(d.expectedDepartureDate).format('YYYY-MM-DD') : '')
    setActDate(d.actualDepartureDate ? dayjs(d.actualDepartureDate).format('YYYY-MM-DD') : '')
    setAirport(d.destinationAirport || '')
    setFlightNo(d.flightNumber || '')
    setDepNotes(d.notes || '')
    setDialogOpen(true)
  }

  const handleSaveDeparture = async () => {
    await updateDepartureMutation.mutateAsync({
      studentId: student.id,
      body: {
        status: depStatus,
        expectedDepartureDate: expDate ? new Date(expDate).toISOString() : null,
        actualDepartureDate: actDate ? new Date(actDate).toISOString() : null,
        destinationAirport: airport || null,
        flightNumber: flightNo || null,
        notes: depNotes || null,
      },
    })
    setDialogOpen(false)
    refetch()
  }

  if (!isMockMode() && isLoading) {
    return (
      <Card className="p-8 text-center flex flex-col items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary mb-2" />
        <p className="text-sm text-muted-foreground">Loading visa cases...</p>
      </Card>
    )
  }

  const activeDepartureStatus = departureDetails?.status || (currentStage === 'DEPARTED' ? 'DEPARTED' : 'VISA_APPROVED')
  const statusMeta = DEPARTURE_STATUS_META[activeDepartureStatus] || {
    label: activeDepartureStatus,
    variant: 'default',
  }

  return (
    <div className="space-y-5">
      {/* ── Departure & Travel Readiness Milestone Card (shown if visa approved) ── */}
      {hasApprovedVisa && (
        <Card className="border-l-4 border-l-emerald-500 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-3 bg-muted/20">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                <PlaneTakeoff className="size-5" />
              </div>
              <div>
                <CardTitle className="text-base">Departure & Travel Readiness</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Track visa-approved flight bookings, expected departure, and arrival.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={statusMeta.variant} className="text-xs">
                {statusMeta.label}
              </Badge>
              {canUpdateDeparture && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={openDepartureDialog}
                >
                  <Edit3 className="size-3.5" />
                  Update Departure
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4 grid grid-cols-1 gap-3 sm:grid-cols-4 text-xs">
            <div className="rounded-lg bg-secondary/30 p-2.5">
              <span className="text-muted-foreground block text-[11px]">Expected Departure</span>
              <span className="font-semibold text-foreground text-sm mt-0.5 block">
                {departureDetails?.expectedDepartureDate
                  ? dayjs(departureDetails.expectedDepartureDate).format('MMM D, YYYY')
                  : 'Pending plan'}
              </span>
            </div>

            <div className="rounded-lg bg-secondary/30 p-2.5">
              <span className="text-muted-foreground block text-[11px]">Actual Departure</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm mt-0.5 block">
                {departureDetails?.actualDepartureDate
                  ? dayjs(departureDetails.actualDepartureDate).format('MMM D, YYYY')
                  : 'Not yet departed'}
              </span>
            </div>

            <div className="rounded-lg bg-secondary/30 p-2.5">
              <span className="text-muted-foreground block text-[11px]">Flight & Airport</span>
              <span className="font-semibold text-foreground text-sm mt-0.5 block">
                {departureDetails?.flightNumber || 'Flight TBD'}
                {departureDetails?.destinationAirport && ` → ${departureDetails.destinationAirport}`}
              </span>
            </div>

            <div className="rounded-lg bg-secondary/30 p-2.5">
              <span className="text-muted-foreground block text-[11px]">Notes</span>
              <span className="text-foreground text-xs mt-0.5 block truncate">
                {departureDetails?.notes || 'No departure notes recorded'}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {cases.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No visa cases initiated for this student.</p>
        </Card>
      ) : (
        cases.map((vc) => (
          <Card key={vc.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">{vc.countryName} Visa</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{vc.universityName}</p>
              </div>
              <div className="flex items-center gap-2">
                <VisaStatusBadge status={vc.overallStatus} />
                <Button asChild variant="ghost" size="icon" className="size-8">
                  <Link to={`/visa/${vc.id}`}>
                    <ExternalLink className="size-4" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 pt-0">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span>Progress</span>
                  <span className="font-tabular">{vc.progress}%</span>
                </div>
                <Progress value={vc.progress} className="h-2" />
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Checklist</h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {vc.checklist.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-2">Standard documents in evaluation.</p>
                  ) : (
                    vc.checklist.map((item) => (
                      <div key={item.step} className="flex items-start gap-2.5 rounded-lg border border-border/60 p-2.5">
                        {item.status === 'approved' ? (
                          <CheckCircle2 className="size-4 text-success-500 mt-0.5 shrink-0" />
                        ) : item.status === 'in_progress' ? (
                          <Clock className="size-4 text-info-500 mt-0.5 shrink-0" />
                        ) : (
                          <Circle className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                        )}
                        <div>
                          <p className="text-[13px] font-medium capitalize">{item.step.replace('_', ' ')}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {item.status === 'approved' && item.completedDate
                              ? `Completed on ${dayjs(item.completedDate).format('MMM D')}`
                              : item.status === 'in_progress'
                                ? 'In progress'
                                : 'Pending'}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {(vc.submissionDate || vc.decisionDate) && (
                <div className="flex flex-wrap gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
                  {vc.submissionDate && (
                    <p>Submitted: <span className="font-medium text-foreground">{dayjs(vc.submissionDate).format('MMM D, YYYY')}</span></p>
                  )}
                  {vc.decisionDate && (
                    <p>Decision: <span className="font-medium text-foreground">{dayjs(vc.decisionDate).format('MMM D, YYYY')}</span></p>
                  )}
                  {vc.visaOfficer && (
                    <p>Officer: <span className="font-medium text-foreground">{vc.visaOfficer}</span></p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {/* ── Departure Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlaneTakeoff className="size-5 text-primary" />
              Update Departure Milestone — {student.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Departure Milestone Status *
              </label>
              <Select value={depStatus} onValueChange={setDepStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VISA_APPROVED">Visa Approved (Pending Travel Plan)</SelectItem>
                  <SelectItem value="PREPARING">Preparing Documents & Travel</SelectItem>
                  <SelectItem value="TICKET_BOOKED">Ticket Booked</SelectItem>
                  <SelectItem value="DEPARTED">Successfully Departed</SelectItem>
                  <SelectItem value="DELAYED">Delayed / Postponed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Expected Departure Date
                </label>
                <Input
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Actual Departure Date
                </label>
                <Input
                  type="date"
                  value={actDate}
                  onChange={(e) => setActDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Destination Airport
                </label>
                <Input
                  placeholder="e.g. SYD, LHR, YYZ"
                  value={airport}
                  onChange={(e) => setAirport(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Flight Number
                </label>
                <Input
                  placeholder="e.g. EK 584 / SQ 212"
                  value={flightNo}
                  onChange={(e) => setFlightNo(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Departure & Accommodation Notes
              </label>
              <Input
                placeholder="Airport pickup confirmed, accommodation ready..."
                value={depNotes}
                onChange={(e) => setDepNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={updateDepartureMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveDeparture}
              disabled={updateDepartureMutation.isPending}
            >
              {updateDepartureMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Save Departure Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
