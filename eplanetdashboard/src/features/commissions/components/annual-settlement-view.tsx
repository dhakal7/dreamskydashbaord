import { useState } from 'react'
import dayjs from 'dayjs'
import {
  CheckCircle2,
  Clock,
  DollarSign,
  CreditCard,
  Loader2,
} from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  useAnnualSettlement,
  useSettleAnnualCommissions,
} from '@/hooks/use-commissions'
import { formatCurrency } from '@/lib/utils'

export function AnnualSettlementView() {
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)

  const { data: settlementData, isLoading, refetch } = useAnnualSettlement(selectedYear)
  const settleMutation = useSettleAnnualCommissions()

  // Settle modal state
  const [settlingTarget, setSettlingTarget] = useState<{
    id: string
    name: string
    role: 'counselor' | 'referral_agent'
    outstanding: number
    currency: string
    pendingIds: string[]
  } | null>(null)

  const [paymentDate, setPaymentDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [paymentRef, setPaymentRef] = useState('')
  const [notes, setNotes] = useState('')

  const handleOpenSettle = (target: {
    id: string
    name: string
    role: 'counselor' | 'referral_agent'
    outstanding: number
    currency: string
    pendingIds: string[]
  }) => {
    setSettlingTarget(target)
    setPaymentDate(dayjs().format('YYYY-MM-DD'))
    setPaymentRef(`ANNUAL-${selectedYear}-${Date.now().toString().slice(-4)}`)
    setNotes(`Annual settlement for ${selectedYear} completed via Bank Transfer.`)
  }

  const handleConfirmSettle = async () => {
    if (!settlingTarget) return
    await settleMutation.mutateAsync({
      earnerId: settlingTarget.id,
      earnerType: settlingTarget.role === 'counselor' ? 'COUNSELOR' : 'REFERRAL_AGENT',
      year: selectedYear,
      commissionIds: settlingTarget.pendingIds,
      paymentReference: paymentRef.trim(),
      paymentDate: new Date(paymentDate).toISOString(),
      notes: notes.trim(),
    })
    setSettlingTarget(null)
    refetch()
  }

  const summary = settlementData?.summary || {
    totalGenerated: 0,
    totalPaid: 0,
    totalOutstanding: 0,
    currency: 'NPR',
    commissionsCount: 0,
  }

  const counselors = settlementData?.counselors || []
  const agents = settlementData?.referralAgents || settlementData?.agents || []

  return (
    <div className="space-y-6">
      {/* ── Year Selector & Controls ── */}
      <Card className="p-4 bg-muted/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold">Annual Commission Settlement</h3>
            <p className="text-xs text-muted-foreground">
              Review annual performance earnings, audit outstanding balances, and execute annual batch settlements.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Fiscal Year:</span>
            <Select
              value={String(selectedYear)}
              onValueChange={(val) => setSelectedYear(Number(val))}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* ── Annual Financial KPI Cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{selectedYear} Total Commission Generated</p>
              <p className="text-2xl font-bold mt-1">
                {formatCurrency(summary.totalGenerated, summary.currency)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{summary.commissionsCount} commission records</p>
            </div>
            <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
              <DollarSign className="size-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{selectedYear} Total Commission Paid</p>
              <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                {formatCurrency(summary.totalPaid, summary.currency)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Disbursed successfully</p>
            </div>
            <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-500">
              <CheckCircle2 className="size-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{selectedYear} Outstanding Payable</p>
              <p className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">
                {formatCurrency(summary.totalOutstanding, summary.currency)}
              </p>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">Awaiting annual settlement</p>
            </div>
            <div className="rounded-lg bg-amber-500/10 p-2.5 text-amber-500">
              <Clock className="size-5" />
            </div>
          </div>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Calculating annual settlements...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Counselors Annual Settlement Table ── */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Counselors — {selectedYear} Annual Settlement</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Yearly earnings derived strictly from student visa approvals and confirmed departures.
                  </p>
                </div>
                <Badge variant="outline">{counselors.length} Counselors</Badge>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="py-3 px-4">Counselor</th>
                    <th className="py-3 px-4">Branch</th>
                    <th className="py-3 px-4 text-center">Visas Approved</th>
                    <th className="py-3 px-4 text-center">Departed</th>
                    <th className="py-3 px-4">Total Earned</th>
                    <th className="py-3 px-4">Total Paid</th>
                    <th className="py-3 px-4">Outstanding</th>
                    <th className="py-3 px-4 text-right">Settlement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {counselors.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-xs text-muted-foreground">
                        No counselor commission activity in {selectedYear}.
                      </td>
                    </tr>
                  ) : (
                    counselors.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-foreground">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.email}</p>
                        </td>
                        <td className="py-3 px-4 text-xs font-medium">{c.branch?.name || 'Main Office'}</td>
                        <td className="py-3 px-4 text-center font-bold text-emerald-600 dark:text-emerald-400">
                          {c.approvedCount ?? c.totalCommissionsCount}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-sky-600 dark:text-sky-400">
                          {c.departedCount ?? 0}
                        </td>
                        <td className="py-3 px-4 font-semibold">
                          {formatCurrency(c.totalGenerated ?? c.totalEarned, c.currency || summary.currency)}
                        </td>
                        <td className="py-3 px-4 text-emerald-600 dark:text-emerald-400 font-medium">
                          {formatCurrency(c.totalPaid, c.currency || summary.currency)}
                        </td>
                        <td className="py-3 px-4 font-bold text-amber-600 dark:text-amber-400">
                          {formatCurrency(c.totalOutstanding, c.currency || summary.currency)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="sm"
                            variant={c.totalOutstanding > 0 ? 'default' : 'outline'}
                            className="h-7 text-xs"
                            disabled={c.totalOutstanding <= 0}
                            onClick={() =>
                              handleOpenSettle({
                                id: c.id,
                                name: c.name,
                                role: 'counselor',
                                outstanding: c.totalOutstanding,
                                currency: c.currency || summary.currency,
                                pendingIds: c.pendingCommissionIds || c.commissionIds || [],
                              })
                            }
                          >
                            {c.totalOutstanding > 0 ? 'Settle Balance' : 'Settled'}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── Referral Agents Annual Settlement Table ── */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Referral Agents — {selectedYear} Annual Settlement</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Yearly earnings for accredited referral agents based on verified visa grants.
                  </p>
                </div>
                <Badge variant="outline">{agents.length} Agents</Badge>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="py-3 px-4">Agent Name</th>
                    <th className="py-3 px-4">Referral Code</th>
                    <th className="py-3 px-4 text-center">Visas Approved</th>
                    <th className="py-3 px-4 text-center">Departed</th>
                    <th className="py-3 px-4">Total Earned</th>
                    <th className="py-3 px-4">Total Paid</th>
                    <th className="py-3 px-4">Outstanding</th>
                    <th className="py-3 px-4 text-right">Settlement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {agents.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-xs text-muted-foreground">
                        No referral agent commission activity in {selectedYear}.
                      </td>
                    </tr>
                  ) : (
                    agents.map((a) => (
                      <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-foreground">{a.name}</p>
                          <p className="text-xs text-muted-foreground">{a.email}</p>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">{a.referralCode || '—'}</td>
                        <td className="py-3 px-4 text-center font-bold text-emerald-600 dark:text-emerald-400">
                          {a.approvedCount ?? a.totalCommissionsCount}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-sky-600 dark:text-sky-400">
                          {a.departedCount ?? 0}
                        </td>
                        <td className="py-3 px-4 font-semibold">
                          {formatCurrency(a.totalGenerated ?? a.totalEarned ?? 0, a.currency || summary.currency)}
                        </td>
                        <td className="py-3 px-4 text-emerald-600 dark:text-emerald-400 font-medium">
                          {formatCurrency(a.totalPaid, a.currency || summary.currency)}
                        </td>
                        <td className="py-3 px-4 font-bold text-amber-600 dark:text-amber-400">
                          {formatCurrency(a.totalOutstanding, a.currency || summary.currency)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="sm"
                            variant={a.totalOutstanding > 0 ? 'default' : 'outline'}
                            className="h-7 text-xs"
                            disabled={a.totalOutstanding <= 0}
                            onClick={() =>
                              handleOpenSettle({
                                id: a.id,
                                name: a.name,
                                role: 'referral_agent',
                                outstanding: a.totalOutstanding,
                                currency: a.currency || summary.currency,
                                pendingIds: a.pendingCommissionIds || a.commissionIds || [],
                              })
                            }
                          >
                            {a.totalOutstanding > 0 ? 'Settle Balance' : 'Settled'}
                          </Button>
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

      {/* ── Annual Settlement Modal ── */}
      <Dialog open={Boolean(settlingTarget)} onOpenChange={(open) => !open && setSettlingTarget(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="size-5 text-primary" />
              Settle Annual Commission — {settlingTarget?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-secondary/50 p-3 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Fiscal Year:</span>
                <span className="font-semibold text-foreground">{selectedYear}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Earner Role:</span>
                <span className="font-semibold text-foreground capitalize">
                  {settlingTarget?.role.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between text-sm font-medium pt-1 border-t border-border/60">
                <span>Outstanding Amount:</span>
                <span className="font-bold text-base text-amber-600 dark:text-amber-400">
                  {settlingTarget && formatCurrency(settlingTarget.outstanding, settlingTarget.currency)}
                </span>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Settlement / Payment Date *
              </label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Payment Reference / Bank Transaction ID *
              </label>
              <Input
                placeholder="e.g. NEFT-998231, HBL-TRANSFER-01"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Settlement Notes
              </label>
              <Input
                placeholder="Annual bonus cleared, verified with accounting ledger"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSettlingTarget(null)}
              disabled={settleMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSettle}
              disabled={settleMutation.isPending || !paymentRef.trim()}
            >
              {settleMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Confirm Annual Settlement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
