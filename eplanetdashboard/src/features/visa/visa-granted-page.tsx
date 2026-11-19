import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import {
  Award,
  PlaneTakeoff,
  PlaneLanding,
  Search,
  ExternalLink,
  Edit3,
  Ticket,
  LayoutGrid,
  List,
  Loader2,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PersonAvatar } from '@/components/ui/avatar'
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
import { EmptyState } from '@/components/shared/empty-state'
import { useAuthStore } from '@/store/auth-store'
import {
  useVisaGrantedStudents,
  useVisaGrantedAnalytics,
  useUpdateDeparture,
} from '@/hooks/use-visa'
import type { VisaGrantedStudent } from '@/api/visa-api'

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

export default function VisaGrantedPage() {
  const currentUser = useAuthStore((s) => s.currentUser)

  const [search, setSearch] = useState('')
  const [selectedCounselor, setSelectedCounselor] = useState(() =>
    currentUser?.role === 'counselor' ? currentUser.id : 'all'
  )
  const [selectedAgent, setSelectedAgent] = useState(() =>
    currentUser?.role === 'referral_agent' ? currentUser.id : 'all'
  )
  const [selectedCountry, setSelectedCountry] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')

  // Selected student for departure update dialog
  const [editingStudent, setEditingStudent] = useState<VisaGrantedStudent | null>(null)
  const [depStatus, setDepStatus] = useState('VISA_APPROVED')
  const [expDate, setExpDate] = useState('')
  const [actDate, setActDate] = useState('')
  const [airport, setAirport] = useState('')
  const [flightNo, setFlightNo] = useState('')
  const [depNotes, setDepNotes] = useState('')

  // Queries
  const { data: analytics } = useVisaGrantedAnalytics()
  const {
    data: students = [],
    isLoading: isLoadingStudents,
    refetch,
  } = useVisaGrantedStudents({
    counselorId: selectedCounselor !== 'all' ? selectedCounselor : undefined,
    referralAgentId: selectedAgent !== 'all' ? selectedAgent : undefined,
    country: selectedCountry !== 'all' ? selectedCountry : undefined,
    departureStatus: selectedStatus !== 'all' ? selectedStatus : undefined,
    search: search.trim() ? search.trim() : undefined,
  })

  const updateDepartureMutation = useUpdateDeparture()

  // Counselors & agents options with counts from analytics
  const counselorOptions = analytics?.counselors || []
  const agentOptions = analytics?.referralAgents || []
  const countryOptions = analytics?.countries || []

  // Check if current user has permission to update departure for a student
  const canUpdateStudentDeparture = (student: VisaGrantedStudent) => {
    if (!currentUser) return false
    const role = currentUser.role
    if (['super_admin', 'branch_admin', 'front_desk'].includes(role)) return true
    if (role === 'counselor' && student.assignedCounselorId === currentUser.id) return true
    return false
  }

  const openDepartureDialog = (student: VisaGrantedStudent) => {
    setEditingStudent(student)
    const d = student.departureDetails || {}
    setDepStatus(student.departureStatus || 'VISA_APPROVED')
    setExpDate(d.expectedDepartureDate ? dayjs(d.expectedDepartureDate).format('YYYY-MM-DD') : '')
    setActDate(d.actualDepartureDate ? dayjs(d.actualDepartureDate).format('YYYY-MM-DD') : '')
    setAirport(d.destinationAirport || '')
    setFlightNo(d.flightNumber || '')
    setDepNotes(d.notes || '')
  }

  const handleSaveDeparture = async () => {
    if (!editingStudent) return
    if ((depStatus === 'DELAYED' || depStatus === 'DEPARTURE_DELAYED') && !depNotes.trim()) {
      toast.error('A delay reason or explanation is required when postponing departure.')
      return
    }
    if (depStatus === 'DEPARTED' && !actDate) {
      toast.error('Please specify the confirmed actual departure date.')
      return
    }
    await updateDepartureMutation.mutateAsync({
      studentId: editingStudent.studentId,
      body: {
        status: depStatus,
        expectedDepartureDate: expDate ? new Date(expDate).toISOString() : null,
        actualDepartureDate: actDate ? new Date(actDate).toISOString() : null,
        destinationAirport: airport || null,
        flightNumber: flightNo || null,
        notes: depNotes || null,
      },
    })
    setEditingStudent(null)
    refetch()
  }

  // Filter students locally as well for instant responsiveness
  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter((s) => {
      if (q) {
        const code = s.studentCode || s.studentRefId || s.studentId
        const matchesName = s.studentName.toLowerCase().includes(q)
        const matchesId = code.toLowerCase().includes(q)
        const matchesEmail = s.email?.toLowerCase().includes(q)
        const matchesPhone = s.phone?.includes(q)
        const matchesUni = s.universityName?.toLowerCase().includes(q)
        const matchesCounselor = s.assignedCounselorName?.toLowerCase().includes(q)
        if (!matchesName && !matchesId && !matchesEmail && !matchesPhone && !matchesUni && !matchesCounselor) {
          return false
        }
      }
      if (selectedCounselor !== 'all' && s.assignedCounselorId !== selectedCounselor) return false
      if (selectedAgent !== 'all' && s.referredByAgentId !== selectedAgent) return false
      if (selectedCountry !== 'all' && s.countryName.toLowerCase() !== selectedCountry.toLowerCase()) return false
      if (selectedStatus !== 'all' && s.departureStatus !== selectedStatus) return false
      return true
    })
  }, [students, search, selectedCounselor, selectedAgent, selectedCountry, selectedStatus])

  const summary = analytics?.summary || {
    totalApproved: students.length,
    visaGrantedOnly: students.filter((s) => s.departureStatus === 'VISA_APPROVED').length,
    preparingDeparture: students.filter((s) => s.departureStatus === 'PREPARING').length,
    ticketBooked: students.filter((s) => s.departureStatus === 'TICKET_BOOKED').length,
    departed: students.filter((s) => s.departureStatus === 'DEPARTED').length,
    departureRate: 0,
  }

  const isCounselor = currentUser?.role === 'counselor'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visa Granted / Success Students"
        description={
          isCounselor
            ? "Track your visa-approved students, monitor their travel readiness, and record departures."
            : "Centralized tracking of all students with approved visas, departure milestones, counselor performance, and commission eligibility."
        }
      />

      {/* ── KPI Stat Cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4 border-l-4 border-l-sky-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Visa Approved</p>
              <h3 className="mt-1 text-2xl font-bold">{summary.totalApproved}</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Successful visa grants</p>
            </div>
            <div className="rounded-lg bg-sky-500/10 p-2.5 text-sky-500">
              <Award className="size-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Preparing Departure</p>
              <h3 className="mt-1 text-2xl font-bold">{summary.preparingDeparture}</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Visas ready, travel in prep</p>
            </div>
            <div className="rounded-lg bg-amber-500/10 p-2.5 text-amber-500">
              <PlaneTakeoff className="size-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-indigo-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Ticket Booked</p>
              <h3 className="mt-1 text-2xl font-bold">{summary.ticketBooked}</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Flight confirmed</p>
            </div>
            <div className="rounded-lg bg-indigo-500/10 p-2.5 text-indigo-500">
              <Ticket className="size-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Successfully Departed</p>
              <h3 className="mt-1 text-2xl font-bold">{summary.departed}</h3>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                {summary.departureRate}% Departure Rate
              </p>
            </div>
            <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-500">
              <PlaneLanding className="size-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* ── Filters & Search Bar ── */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by student name, ref ID, passport, university..."
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Counselor Filter with Counts */}
            {currentUser?.role !== 'counselor' ? (
              <Select value={selectedCounselor} onValueChange={setSelectedCounselor}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Counselors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Counselors ({summary.totalApproved})</SelectItem>
                  {counselorOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.approvedCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="h-9 px-3 rounded-md border border-border bg-muted/40 flex items-center text-xs font-medium">
                My Assigned Students
              </div>
            )}

            {/* Referral Agent Filter */}
            {currentUser?.role !== 'referral_agent' && agentOptions.length > 0 && (
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Referral Agents</SelectItem>
                  {agentOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.approvedCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Country Filter */}
            {countryOptions.length > 0 && (
              <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All Countries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  {countryOptions.map((co) => (
                    <SelectItem key={co.country} value={co.country}>
                      {co.country} ({co.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Departure Status Filter */}
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departure Statuses</SelectItem>
                <SelectItem value="VISA_APPROVED">Visa Approved (Pending)</SelectItem>
                <SelectItem value="PREPARING">Preparing Departure</SelectItem>
                <SelectItem value="TICKET_BOOKED">Ticket Booked</SelectItem>
                <SelectItem value="DEPARTED">Departed</SelectItem>
                <SelectItem value="DELAYED">Delayed</SelectItem>
              </SelectContent>
            </Select>

            {/* Layout Toggle */}
            <div className="flex items-center rounded-md border border-border p-0.5">
              <Button
                variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
                size="icon"
                className="size-8"
                onClick={() => setViewMode('cards')}
                title="Grid Cards"
              >
                <LayoutGrid className="size-4" />
              </Button>
              <Button
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size="icon"
                className="size-8"
                onClick={() => setViewMode('table')}
                title="Table View"
              >
                <List className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Content View ── */}
      {isLoadingStudents ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading visa granted students...</p>
        </div>
      ) : filteredStudents.length === 0 ? (
        <EmptyState
          icon={Award}
          title="No Visa Granted Students Found"
          description={
            search || selectedCounselor !== 'all' || selectedStatus !== 'all'
              ? 'No approved students match the applied search or filter criteria.'
              : 'Students will appear here automatically once their visa status is marked as Approved.'
          }
        />
      ) : viewMode === 'cards' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredStudents.map((s) => {
            const statusMeta = DEPARTURE_STATUS_META[s.departureStatus] || {
              label: s.departureStatus,
              variant: 'default',
            }
            const canEdit = canUpdateStudentDeparture(s)

            return (
              <Card
                key={s.studentId}
                className="overflow-hidden border border-border hover:border-primary/50 transition-all shadow-sm flex flex-col justify-between"
              >
                <div>
                  {/* Card Top Header */}
                  <div className="p-4 border-b border-border/60 bg-muted/20">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <PersonAvatar name={s.studentName} className="size-11" />
                        <div>
                          <Link
                            to={`/students/${s.studentId}`}
                            className="font-semibold text-base hover:underline text-foreground block"
                          >
                            {s.studentName}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            ID: <span className="font-mono">{s.studentCode || s.studentRefId || s.studentId}</span>
                            {s.passportNumber && ` • Passport: ${s.passportNumber}`}
                          </p>
                        </div>
                      </div>
                      <Badge variant={statusMeta.variant} className="text-[11px] shrink-0">
                        {statusMeta.label}
                      </Badge>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 space-y-3 text-sm">
                    {/* Destination & Program */}
                    <div className="rounded-lg bg-secondary/30 p-2.5 space-y-1">
                      <div className="flex items-center gap-1.5 font-medium">
                        <span className="text-base">{s.countryFlag}</span>
                        <span>{s.universityName}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="truncate">{s.courseName}</span>
                        {s.intake && <Badge variant="outline" className="text-[10px]">{s.intake}</Badge>}
                      </div>
                    </div>

                    {/* Attribution Details */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Responsible Counselor</span>
                        <span className="font-medium text-foreground">{s.assignedCounselorName}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Referral Attribution</span>
                        <span className="font-medium text-foreground">
                          {s.referralAgentName ? `${s.referralAgentName} (${s.referralCode})` : 'Direct / Non-referred'}
                        </span>
                      </div>
                    </div>

                    {/* Dates & Departure Milestone */}
                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/50">
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Visa Grant Date</span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">
                          {s.visaGrantDate ? dayjs(s.visaGrantDate).format('MMM D, YYYY') : 'Verified'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Flight / Departure</span>
                        <span className="font-medium text-foreground">
                          {s.departureDetails?.actualDepartureDate
                            ? `Departed ${dayjs(s.departureDetails.actualDepartureDate).format('MMM D, YYYY')}`
                            : s.departureDetails?.expectedDepartureDate
                            ? `Exp: ${dayjs(s.departureDetails.expectedDepartureDate).format('MMM D, YYYY')}`
                            : 'Pending booking'}
                        </span>
                      </div>
                    </div>

                    {/* Flight & Airport info if present */}
                    {(s.departureDetails?.flightNumber || s.departureDetails?.destinationAirport) && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 px-2 py-1.5 rounded">
                        <PlaneTakeoff className="size-3.5 text-primary shrink-0" />
                        <span>
                          {s.departureDetails.flightNumber && `Flight ${s.departureDetails.flightNumber}`}
                          {s.departureDetails.destinationAirport && ` to ${s.departureDetails.destinationAirport}`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="p-3 border-t border-border/60 bg-muted/10 flex items-center justify-between gap-2">
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="text-xs h-8 text-muted-foreground hover:text-foreground"
                  >
                    <Link to={`/students/${s.studentId}`}>
                      <ExternalLink className="size-3.5 mr-1" />
                      View Student Profile
                    </Link>
                  </Button>

                  {canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8 gap-1.5"
                      onClick={() => openDepartureDialog(s)}
                    >
                      <Edit3 className="size-3.5 text-primary" />
                      Update Departure
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        /* Table View */
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <tr>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Destination & University</th>
                  <th className="py-3 px-4">Counselor</th>
                  <th className="py-3 px-4">Referral Agent</th>
                  <th className="py-3 px-4">Grant Date</th>
                  <th className="py-3 px-4">Departure Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredStudents.map((s) => {
                  const statusMeta = DEPARTURE_STATUS_META[s.departureStatus] || {
                    label: s.departureStatus,
                    variant: 'default',
                  }
                  const canEdit = canUpdateStudentDeparture(s)

                  return (
                    <tr key={s.studentId} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <PersonAvatar name={s.studentName} className="size-8" />
                          <div>
                            <Link
                              to={`/students/${s.studentId}`}
                              className="font-medium hover:underline text-foreground"
                            >
                              {s.studentName}
                            </Link>
                            <p className="text-xs text-muted-foreground">{s.studentCode || s.studentRefId || s.studentId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium flex items-center gap-1.5">
                          <span>{s.countryFlag}</span>
                          <span>{s.universityName}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{s.courseName}</p>
                      </td>
                      <td className="py-3 px-4 text-xs font-medium">
                        {s.assignedCounselorName}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {s.referralAgentName ? (
                          <span>
                            {s.referralAgentName}{' '}
                            <span className="text-muted-foreground">({s.referralCode})</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        {s.visaGrantDate ? dayjs(s.visaGrantDate).format('MMM D, YYYY') : 'Verified'}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={statusMeta.variant} className="text-xs">
                          {statusMeta.label}
                        </Badge>
                        {s.departureDetails?.expectedDepartureDate && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Exp: {dayjs(s.departureDetails.expectedDepartureDate).format('MMM D, YYYY')}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canEdit && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => openDepartureDialog(s)}
                            >
                              Update Departure
                            </Button>
                          )}
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                          >
                            <Link to={`/students/${s.studentId}`}>View</Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Departure Update Dialog ── */}
      <Dialog open={Boolean(editingStudent)} onOpenChange={(open) => !open && setEditingStudent(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlaneTakeoff className="size-5 text-primary" />
              Update Departure Status — {editingStudent?.studentName}
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
                placeholder="Airport pickup confirmed, hostel booked, sim card arranged..."
                value={depNotes}
                onChange={(e) => setDepNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingStudent(null)}
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
