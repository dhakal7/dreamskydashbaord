import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  DollarSign,
  PlaneTakeoff,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PersonAvatar } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCounselors } from '@/hooks/use-counselors'
import { useCounselorCommissionProfile } from '@/hooks/use-commissions'
import { useAuthStore } from '@/store/auth-store'
import { formatCurrency } from '@/lib/utils'

interface CounselorProfileViewProps {
  initialCounselorId?: string
}

export function CounselorProfileView({ initialCounselorId }: CounselorProfileViewProps) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const isCounselor = currentUser?.role === 'counselor'
  const canSwitchCounselor = currentUser?.role === 'super_admin' || currentUser?.role === 'branch_admin'

  const { data: counselors = [], isLoading: isLoadingCounselors } = useCounselors()

  const defaultCounselorId = isCounselor
    ? currentUser.id
    : initialCounselorId || counselors[0]?.id || ''

  const [selectedCounselorId, setSelectedCounselorId] = useState(defaultCounselorId)

  useEffect(() => {
    if (!selectedCounselorId && counselors.length > 0) {
      setSelectedCounselorId(defaultCounselorId || counselors[0].id)
    }
  }, [counselors, defaultCounselorId, selectedCounselorId])

  const { data: profile, isLoading, error } = useCounselorCommissionProfile(selectedCounselorId)

  if (isLoadingCounselors && !selectedCounselorId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading counselors list...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Counselor Selector Banner ── */}
      {canSwitchCounselor && (
        <Card className="p-4 bg-muted/30">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Select Counselor Profile</p>
              <p className="text-xs text-muted-foreground">
                Inspect funnel metrics, visa-granted students, and commission ledger for any counselor.
              </p>
            </div>
            <div className="w-full sm:w-[280px]">
              <Select
                value={selectedCounselorId}
                onValueChange={(val) => setSelectedCounselorId(val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a Counselor" />
                </SelectTrigger>
                <SelectContent>
                  {counselors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading counselor commission profile...</p>
        </div>
      ) : !profile ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {error ? 'Failed to load profile. Please verify connection.' : 'No counselor selected or profile data unavailable.'}
        </Card>
      ) : (
        <div className="space-y-6">
          {/* ── Counselor Info Header ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-4">
              <PersonAvatar name={profile.counselor.name} className="size-14 text-base" />
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold">{profile.counselor.name}</h3>
                  <Badge variant="info">Counselor</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {profile.counselor.email}
                  {profile.counselor.branchName && ` • Branch: ${profile.counselor.branchName}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Earned</p>
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(profile.financials.totalEarned, profile.financials.currency)}
                </p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
                  {formatCurrency(profile.financials.totalOutstanding, profile.financials.currency)}
                </p>
              </div>
            </div>
          </div>

          {/* ── Funnel Performance Metrics ── */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Counselor Performance Funnel
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Card className="p-3.5">
                <p className="text-xs text-muted-foreground">Assigned</p>
                <p className="text-xl font-bold mt-1">{profile.performance.totalAssigned}</p>
                <p className="text-[11px] text-muted-foreground">Total students</p>
              </Card>

              <Card className="p-3.5">
                <p className="text-xs text-muted-foreground">Counseled</p>
                <p className="text-xl font-bold mt-1">{profile.performance.totalCounseled}</p>
                <p className="text-[11px] text-muted-foreground">Past lead stage</p>
              </Card>

              <Card className="p-3.5">
                <p className="text-xs text-muted-foreground">Applications</p>
                <p className="text-xl font-bold mt-1">{profile.performance.totalApplications}</p>
                <p className="text-[11px] text-muted-foreground">Uni submitted</p>
              </Card>

              <Card className="p-3.5">
                <p className="text-xs text-muted-foreground">Visa Lodged</p>
                <p className="text-xl font-bold mt-1">{profile.performance.totalVisaApplications}</p>
                <p className="text-[11px] text-muted-foreground">Active cases</p>
              </Card>

              <Card className="p-3.5 border-l-4 border-l-emerald-500">
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Visa Approved</p>
                <p className="text-xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                  {profile.performance.totalVisaApproved}
                </p>
                <p className="text-[11px] text-muted-foreground">Eligible for comm.</p>
              </Card>

              <Card className="p-3.5 border-l-4 border-l-sky-500">
                <p className="text-xs text-sky-600 dark:text-sky-400 font-medium">Departed</p>
                <p className="text-xl font-bold mt-1 text-sky-600 dark:text-sky-400">
                  {profile.performance.totalDeparted}
                </p>
                <p className="text-[11px] text-muted-foreground">{profile.performance.conversionRate}% Success</p>
              </Card>
            </div>
          </div>

          {/* ── Financial Ledger Cards ── */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Commission Financials
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <Card className="p-4 bg-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Eligible</p>
                    <p className="text-2xl font-bold mt-1">
                      {formatCurrency(profile.financials.totalEarned, profile.financials.currency)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <DollarSign className="size-5" />
                  </div>
                </div>
              </Card>

              <Card className="p-4 bg-card border-l-4 border-l-emerald-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Paid Commission</p>
                    <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(profile.financials.totalPaid, profile.financials.currency)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
                    <CheckCircle2 className="size-5" />
                  </div>
                </div>
              </Card>

              <Card className="p-4 bg-card border-l-4 border-l-amber-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Outstanding Payable</p>
                    <p className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">
                      {formatCurrency(profile.financials.totalOutstanding, profile.financials.currency)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
                    <Clock className="size-5" />
                  </div>
                </div>
              </Card>

              <Card className="p-4 bg-card border-l-4 border-l-sky-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Pending Departure</p>
                    <p className="text-2xl font-bold mt-1 text-sky-600 dark:text-sky-400">
                      {formatCurrency(profile.financials.totalPending || 0, profile.financials.currency)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-sky-500/10 p-2 text-sky-500">
                    <PlaneTakeoff className="size-5" />
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* ── Student-Wise Commission Breakdown ── */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Assigned Students & Commission Status</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Per-student visa approvals, departure tracking, and associated commission credit.
                  </p>
                </div>
                <Badge variant="outline">{profile.students.length} Students</Badge>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Destination & University</th>
                    <th className="py-3 px-4">Visa Status</th>
                    <th className="py-3 px-4">Grant Date</th>
                    <th className="py-3 px-4">Departure</th>
                    <th className="py-3 px-4">Commission</th>
                    <th className="py-3 px-4">Payment</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {profile.students.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-xs text-muted-foreground">
                        No students assigned to this counselor yet.
                      </td>
                    </tr>
                  ) : (
                    profile.students.map((s) => {
                      const isApproved = s.visaStatus === 'APPROVED' || s.isCommissionEligible || s.isEligible
                      const isDeparted = s.departureStatus === 'DEPARTED'

                      return (
                        <tr key={s.studentId} className="hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-4">
                            <Link
                              to={`/students/${s.studentId}`}
                              className="font-medium hover:underline text-foreground block"
                            >
                              {s.studentName}
                            </Link>
                            <span className="text-xs text-muted-foreground font-mono">{s.studentRefId || s.studentId}</span>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium">{s.universityName}</p>
                            <p className="text-xs text-muted-foreground">
                              {s.destinationCountry} • {s.courseName}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={isApproved ? 'success' : 'outline'}
                              className="text-xs"
                            >
                              {s.visaStatus}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {s.visaGrantDate ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                {dayjs(s.visaGrantDate).format('MMM D, YYYY')}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={isDeparted ? 'success' : s.departureStatus === 'PREPARING' ? 'warning' : 'outline'}
                              className="text-xs"
                            >
                              {s.departureStatus}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 font-semibold">
                            {s.commissionAmount > 0
                              ? formatCurrency(s.commissionAmount, profile.financials.currency)
                              : isApproved
                              ? 'Rule Inactive'
                              : '—'}
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={s.commissionStatus === 'PAID' ? 'success' : s.commissionAmount > 0 ? 'warning' : 'outline'}
                              className="text-xs"
                            >
                              {s.commissionStatus}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                              <Link to={`/students/${s.studentId}`}>
                                <ExternalLink className="size-3.5" />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── Transaction History ── */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-base">Commission Transaction History</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Trigger Stage</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Generated Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Paid Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {profile.commissionHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                        No commission transactions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    profile.commissionHistory.map((h) => (
                      <tr key={h.id} className="hover:bg-muted/20">
                        <td className="py-3 px-4 font-medium">{h.studentName}</td>
                        <td className="py-3 px-4 text-xs font-mono">{h.triggerStage}</td>
                        <td className="py-3 px-4 font-bold">{formatCurrency(h.amount, h.currency)}</td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {dayjs(h.generatedAt).format('MMM D, YYYY')}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={h.status === 'PAID' ? 'success' : 'warning'} className="text-xs">
                            {h.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {h.paidAt ? dayjs(h.paidAt).format('MMM D, YYYY') : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
