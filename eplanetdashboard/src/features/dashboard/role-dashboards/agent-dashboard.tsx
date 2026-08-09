import dayjs from 'dayjs'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { LeadStageBadge } from '@/components/shared/status-badges'
import { Link2, Users, TrendingUp, Wallet, Copy, ChevronRight } from 'lucide-react'
import { RoleStatCards } from './shared'
import { getAgentDashboard } from '../role-selectors'
import { formatCurrency } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { toast } from 'sonner'

export function ReferralAgentDashboard() {
  const linkedId = useAuthStore((s) => s.currentUser.linkedId)
  const data = getAgentDashboard(linkedId)

  const stats = [
    { label: 'Total Referrals', value: data.agent?.totalReferrals ?? 0, icon: Users, color: '#2563EB' },
    { label: 'Conversion Rate', value: `${data.conversionRate}%`, icon: TrendingUp, color: '#0891B2' },
    { label: 'Commission Earned', value: formatCurrency(data.commission.earned), icon: Wallet, color: '#16A34A' },
    { label: 'Pending Payout', value: formatCurrency(data.commission.pending), icon: Wallet, color: '#D97706' },
  ]

  function copyReferralLink() {
    const link = `https://eplanetconsultancy.com/refer/${data.agent?.referralCode}`
    navigator.clipboard?.writeText(link)
    toast.success('Referral link copied to clipboard')
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Welcome, ${data.agent?.name.split(' ')[0] ?? 'Partner'}`}
        description="Your referrals, commission, and performance."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={copyReferralLink}><Copy /> Copy Referral Link</Button>
          </>
        }
      />

      <RoleStatCards stats={stats} />

      <Card>
        <CardHeader>
          <CardTitle>Your Referral Code</CardTitle>
          <CardDescription>Share this link — every signup is tracked automatically</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-secondary/40 p-3">
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
            <code className="min-w-0 flex-1 truncate text-[13px]">
              eplanetconsultancy.com/refer/{data.agent?.referralCode}
            </code>
            <Button variant="ghost" size="sm" onClick={copyReferralLink}>Copy</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>My Referrals</CardTitle>
            <CardDescription>{data.referrals.length} students referred</CardDescription>
          </div>
          <Link to="/referrals" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            View all <ChevronRight className="size-3" />
          </Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.referrals.length === 0 && (
            <EmptyState icon={Users} title="No referrals yet" description="Share your referral link to get started." className="py-8" />
          )}
          {data.referrals.slice(0, 6).map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border/70 p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{r.studentName}</p>
                <p className="truncate text-xs text-muted-foreground">Referred {dayjs(r.referredAt).fromNow()}</p>
              </div>
              <LeadStageBadge stage={r.stage} className="shrink-0 text-[10px] py-0" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
