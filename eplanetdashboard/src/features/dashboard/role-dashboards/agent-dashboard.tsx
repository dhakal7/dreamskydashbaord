import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { LeadStageBadge } from '@/components/shared/status-badges'
import { Link2, Users, TrendingUp, Wallet, Copy, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react'
import { RoleStatCards } from './shared'
import { formatCurrency } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { isMockMode } from '@/lib/api-client'
import { useReferrals, useReferralAgents } from '@/hooks/use-referrals'
import { useCommissions } from '@/hooks/use-commissions'
import { getAgentDashboard } from '../role-selectors'
import { toast } from 'sonner'

dayjs.extend(relativeTime)

export function ReferralAgentDashboard() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const isMock = isMockMode()

  // Real mode hooks
  const {
    data: liveReferrals = [],
    isLoading: isReferralsLoading,
    isError: isReferralsError,
    error: referralsError,
    refetch: refetchReferrals,
  } = useReferrals()

  const {
    data: liveCommissions = [],
    isLoading: isCommissionsLoading,
    isError: isCommissionsError,
    error: commissionsError,
    refetch: refetchCommissions,
  } = useCommissions()

  const { data: liveAgents = [] } = useReferralAgents()

  // Mock mode fallback
  const mockData = isMock ? getAgentDashboard(currentUser.linkedId) : null

  // Resolve referral code
  const referralCode = (() => {
    if (isMock && mockData?.agent?.referralCode) {
      return mockData.agent.referralCode
    }
    const fromReferral = (liveReferrals[0] as any)?.referralCode
    if (fromReferral && fromReferral !== 'N/A') return fromReferral

    const matchedAgent = liveAgents.find(
      (a) => a.id === currentUser.linkedId || a.id === currentUser.id || a.email.toLowerCase() === currentUser.email.toLowerCase()
    )
    if (matchedAgent?.referralCode && matchedAgent.referralCode !== 'N/A') {
      return matchedAgent.referralCode
    }

    return currentUser.name
      ? `REF-${currentUser.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}`
      : 'PARTNER'
  })()

  // Referrals dataset
  const referrals = isMock ? (mockData?.referrals ?? []) : liveReferrals

  // KPI Calculations
  const totalReferrals = isMock ? (mockData?.agent?.totalReferrals ?? 0) : referrals.length
  const converted = isMock
    ? referrals.filter((r) => r.stage === 'completed' || r.stage === 'visa').length
    : referrals.filter(
        (r) =>
          r.stage === 'completed' ||
          r.stage === 'visa' ||
          (r as any).rawStage === 'ENROLLED' ||
          (r as any).rawStage === 'VISA_APPROVED'
      ).length

  const conversionRate = isMock
    ? (mockData?.conversionRate ?? 0)
    : totalReferrals > 0
    ? Math.round((converted / totalReferrals) * 100)
    : 0

  const commissionEarned = isMock
    ? (mockData?.commission?.earned ?? 0)
    : liveCommissions
        .filter((c) => String(c.status).toUpperCase() === 'PAID')
        .reduce((sum, c) => sum + (c.amount || 0), 0)

  const commissionPending = isMock
    ? (mockData?.commission?.pending ?? 0)
    : liveCommissions
        .filter((c) => String(c.status).toUpperCase() !== 'PAID')
        .reduce((sum, c) => sum + (c.amount || 0), 0)

  const stats = [
    { label: 'Total Referrals', value: totalReferrals, icon: Users, color: '#2563EB' },
    { label: 'Conversion Rate', value: `${conversionRate}%`, icon: TrendingUp, color: '#0891B2' },
    { label: 'Commission Earned', value: formatCurrency(commissionEarned), icon: Wallet, color: '#16A34A' },
    { label: 'Pending Payout', value: formatCurrency(commissionPending), icon: Wallet, color: '#D97706' },
  ]

  const referralLink = `https://dreamskyeducation.com/refer/${referralCode}`

  function copyReferralLink() {
    navigator.clipboard?.writeText(referralLink)
    toast.success('Referral link copied to clipboard')
  }

  const isLoading = !isMock && (isReferralsLoading || isCommissionsLoading)
  const isError = !isMock && (isReferralsError || isCommissionsError)

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Welcome, ${currentUser.name.split(' ')[0] || 'Partner'}`}
        description="Your referrals, commission, and performance."
        actions={
          <div className="flex items-center gap-2">
            {!isMock && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  refetchReferrals()
                  refetchCommissions()
                }}
                disabled={isLoading}
              >
                <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={copyReferralLink}>
              <Copy className="size-3.5" /> Copy Referral Link
            </Button>
          </div>
        }
      />

      {isError && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>
              {(referralsError as Error)?.message ||
                (commissionsError as Error)?.message ||
                'Unable to load live referral or commission data.'}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchReferrals()
              refetchCommissions()
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="h-24 animate-pulse bg-muted/40 p-4" />
          ))}
        </div>
      ) : (
        <RoleStatCards stats={stats} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your Referral Code</CardTitle>
          <CardDescription>Share this link — every signup is tracked automatically</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-secondary/40 p-3">
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
            <code className="min-w-0 flex-1 truncate text-[13px]">
              {referralLink}
            </code>
            <Button variant="ghost" size="sm" onClick={copyReferralLink}>Copy</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>My Referrals</CardTitle>
            <CardDescription>{totalReferrals} students referred</CardDescription>
          </div>
          <Link to="/referrals" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            View all <ChevronRight className="size-3" />
          </Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="space-y-2 py-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-muted/40" />
              ))}
            </div>
          ) : referrals.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No referrals yet"
              description="Share your referral link to get started."
              className="py-8"
            />
          ) : (
            referrals.slice(0, 6).map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border/70 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{r.studentName}</p>
                  <p className="truncate text-xs text-muted-foreground">Referred {dayjs(r.referredAt).fromNow()}</p>
                </div>
                <LeadStageBadge stage={r.stage} className="shrink-0 text-[10px] py-0" />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
