import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  DollarSign,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
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
import { Settings2 } from 'lucide-react'
import { useReferralAgents } from '@/hooks/use-referral-agents'
import { useReferralAgentCommissionProfile } from '@/hooks/use-commissions'
import { useAuthStore } from '@/store/auth-store'
import { formatCurrency } from '@/lib/utils'
import { ConfigureCommissionRuleDialog } from './configure-commission-rule-dialog'

interface AgentProfileViewProps {
  initialAgentId?: string
}

export function AgentProfileView({ initialAgentId }: AgentProfileViewProps) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const isAgent = currentUser?.role === 'referral_agent'
  const canSwitchAgent = currentUser?.role === 'super_admin' || currentUser?.role === 'branch_admin'

  const { data: agents = [], isLoading: isLoadingAgents } = useReferralAgents()

  const defaultAgentId = isAgent
    ? currentUser.id
    : initialAgentId || agents[0]?.id || ''

  const [selectedAgentId, setSelectedAgentId] = useState(defaultAgentId)
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const isAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'branch_admin'

  useEffect(() => {
    if (!selectedAgentId && agents.length > 0) {
      setSelectedAgentId(defaultAgentId || agents[0].id)
    }
  }, [agents, defaultAgentId, selectedAgentId])

  const { data: profile, isLoading, error, refetch } = useReferralAgentCommissionProfile(selectedAgentId)
  const activeAgent = agents.find((a) => a.id === selectedAgentId)
  const agentDisplayName = (profile?.agent.name && profile.agent.name !== 'Referral Agent')
    ? profile.agent.name
    : (activeAgent?.name || 'Referral Agent')
  const agentDisplayEmail = profile?.agent.email || activeAgent?.email || ''
  const agentDisplayCode = profile?.agent.referralCode || activeAgent?.referralCode || ''

  if (isLoadingAgents && !selectedAgentId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading referral agents list...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Agent Selector Banner ── */}
      {canSwitchAgent && (
        <Card className="p-4 bg-muted/30">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Select Referral Agent Profile</p>
              <p className="text-xs text-muted-foreground">
                Review referred student attribution, visa success rates, and commission payouts.
              </p>
            </div>
            <div className="w-full sm:w-[280px]">
              <Select
                value={selectedAgentId}
                onValueChange={(val) => setSelectedAgentId(val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a Referral Agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.referralCode || 'No Code'})
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
          <p className="text-sm text-muted-foreground">Loading referral agent profile...</p>
        </div>
      ) : !profile ? (
        <Card className="p-8 flex flex-col items-center justify-center text-center gap-3">
          <p className="text-sm text-muted-foreground">
            {error ? 'Unable to load profile data. Please verify your connection or retry.' : 'No referral agent selected or profile data unavailable.'}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 text-xs">
            <RefreshCw className="size-3.5" />
            Retry Connection
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* ── Header Card ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-4">
              <PersonAvatar name={agentDisplayName} className="size-14 text-base" />
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold">{agentDisplayName}</h3>
                  <Badge variant="info">Referral Agent</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {agentDisplayEmail} • Code: <span className="font-mono font-semibold">{agentDisplayCode || '—'}</span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Earned</p>
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(profile.financials.totalEarned, profile.financials.currency)}
                </p>
              </div>
              <div className="h-8 w-px bg-border hidden sm:block" />
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
                  {formatCurrency(profile.financials.totalOutstanding, profile.financials.currency)}
                </p>
              </div>
              {isAdmin && (
                <>
                  <div className="h-8 w-px bg-border hidden sm:block" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-9 text-xs"
                    onClick={() => setRuleDialogOpen(true)}
                  >
                    <Settings2 className="size-3.5" />
                    Configure Rule
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* ── Active Referral Rule Banner ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 rounded-lg border border-primary/25 bg-primary/5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-primary">Active Referral Commission Rule:</span>
              <span className="font-medium text-foreground">NPR 25,000 Fixed per Verified Visa Grant</span>
              <span className="text-muted-foreground">• Qualifying Milestone: On Visa Approval</span>
            </div>
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-primary hover:text-primary px-2 self-start sm:self-auto"
                onClick={() => setRuleDialogOpen(true)}
              >
                Adjust Rate
              </Button>
            )}
          </div>

          {/* ── Funnel Performance Metrics ── */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Referral Performance Funnel
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Card className="p-3.5">
                <p className="text-xs text-muted-foreground">Referred</p>
                <p className="text-xl font-bold mt-1">{profile.performance.totalReferred}</p>
                <p className="text-[11px] text-muted-foreground">Total leads</p>
              </Card>

              <Card className="p-3.5">
                <p className="text-xs text-muted-foreground">Processed</p>
                <p className="text-xl font-bold mt-1">{profile.performance.totalProcessed}</p>
                <p className="text-[11px] text-muted-foreground">Counseled students</p>
              </Card>

              <Card className="p-3.5">
                <p className="text-xs text-muted-foreground">Visa Lodged</p>
                <p className="text-xl font-bold mt-1">{profile.performance.totalVisaApplications}</p>
                <p className="text-[11px] text-muted-foreground">Visa applications</p>
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
                <p className="text-[11px] text-muted-foreground">Flown abroad</p>
              </Card>

              <Card className="p-3.5">
                <p className="text-xs text-muted-foreground">Conversion</p>
                <p className="text-xl font-bold mt-1">{profile.performance.conversionRate}%</p>
                <p className="text-[11px] text-muted-foreground">Approved / Referred</p>
              </Card>
            </div>
          </div>

          {/* ── Financial Ledger Cards ── */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Commission Financials
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card className="p-4 bg-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Earned</p>
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
                    <p className="text-xs text-muted-foreground">Total Paid</p>
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
                    <p className="text-xs text-muted-foreground">Outstanding Balance</p>
                    <p className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">
                      {formatCurrency(profile.financials.totalOutstanding, profile.financials.currency)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
                    <Clock className="size-5" />
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* ── Student Referrals Table ── */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Referred Students & Attribution</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Original referral attribution is permanently retained regardless of counselor assignment.
                  </p>
                </div>
                <Badge variant="outline">{profile.referrals.length} Referrals</Badge>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Counselor</th>
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
                  {profile.referrals.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-xs text-muted-foreground">
                        No students referred by this agent yet.
                      </td>
                    </tr>
                  ) : (
                    profile.referrals.map((r) => {
                      const isApproved = r.visaStatus === 'APPROVED'

                      return (
                        <tr key={r.studentId} className="hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-4">
                            <Link
                              to={`/students/${r.studentId}`}
                              className="font-medium hover:underline text-foreground block"
                            >
                              {r.studentName}
                            </Link>
                            <span className="text-xs text-muted-foreground">
                              Referred: {dayjs(r.referralDate).format('MMM D, YYYY')}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs font-medium">{r.counselorName}</td>
                          <td className="py-3 px-4">
                            <p className="font-medium">{r.universityName}</p>
                            <p className="text-xs text-muted-foreground">
                              {r.destinationCountry} • {r.courseName}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={isApproved ? 'success' : 'outline'} className="text-xs">
                              {r.visaStatus}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {r.visaGrantDate ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                {dayjs(r.visaGrantDate).format('MMM D, YYYY')}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={r.departureStatus === 'DEPARTED' ? 'success' : 'outline'}
                              className="text-xs"
                            >
                              {r.departureStatus}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 font-semibold">
                            {r.commissionAmount > 0
                              ? formatCurrency(r.commissionAmount, profile.financials.currency)
                              : isApproved
                              ? 'Rule Inactive'
                              : '—'}
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={r.commissionStatus === 'PAID' ? 'success' : r.commissionAmount > 0 ? 'warning' : 'outline'}
                              className="text-xs"
                            >
                              {r.commissionStatus}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                              <Link to={`/students/${r.studentId}`}>
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
              <CardTitle className="text-base">Commission Payment History</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Generated Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Paid Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {profile.commissionHistory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                        No commission payment transactions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    profile.commissionHistory.map((h) => (
                      <tr key={h.id} className="hover:bg-muted/20">
                        <td className="py-3 px-4 font-medium">{h.studentName}</td>
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

      {/* ── Configure Commission Rule Modal ── */}
      <ConfigureCommissionRuleDialog
        open={ruleDialogOpen}
        onOpenChange={setRuleDialogOpen}
        defaultRole="REFERRAL_AGENT"
        targetName={profile?.agent.name}
      />
    </div>
  )
}
