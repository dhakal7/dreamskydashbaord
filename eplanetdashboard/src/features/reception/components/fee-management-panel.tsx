import { useState, useMemo } from 'react'
import {
  Wallet, Mail, CheckCircle2, Clock, AlertCircle, Search, Send, DollarSign, RefreshCw
} from 'lucide-react'
import { toast } from 'sonner'
import dayjs from 'dayjs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { PersonAvatar } from '@/components/ui/avatar'
import type { StudentFeeRecord, FeePaymentStatus } from '@/types'

const INITIAL_FEES: StudentFeeRecord[] = [
  {
    id: 'fee-001',
    studentId: 'stu-001',
    studentName: 'Aarav Sharma',
    studentEmail: 'aarav.sharma@example.com',
    studentPhone: '9841234567',
    feeCategory: 'Application Fee',
    totalAmount: 15000,
    paidAmount: 15000,
    dueAmount: 0,
    currency: 'NPR',
    status: 'FULL_PAID',
    dueDate: '2026-08-10',
    lastPaymentDate: '2026-08-10',
    notes: 'Paid via Bank Transfer receipt #TXN-9081',
  },
  {
    id: 'fee-002',
    studentId: 'stu-002',
    studentName: 'Bipana Thapa',
    studentEmail: 'bipana.thapa@example.com',
    studentPhone: '9801987654',
    feeCategory: 'Class Fee',
    totalAmount: 12000,
    paidAmount: 5000,
    dueAmount: 7000,
    currency: 'NPR',
    status: 'DUE',
    dueDate: '2026-08-25',
    lastPaymentDate: '2026-08-01',
    notes: 'Partial payment of NPR 5,000 received at frontdesk.',
  },
  {
    id: 'fee-003',
    studentId: 'stu-003',
    studentName: 'Rohan Shrestha',
    studentEmail: 'rohan.shrestha@example.com',
    studentPhone: '9851098765',
    feeCategory: 'Processing Fee',
    totalAmount: 25000,
    paidAmount: 0,
    dueAmount: 25000,
    currency: 'NPR',
    status: 'UNPAID',
    dueDate: '2026-08-20',
    notes: 'Awaiting visa document verification before payment.',
  },
  {
    id: 'fee-004',
    studentId: 'stu-004',
    studentName: 'Smriti Giri',
    studentEmail: 'smriti.giri@example.com',
    studentPhone: '9812345678',
    feeCategory: 'Tuition Fee',
    totalAmount: 50000,
    paidAmount: 50000,
    dueAmount: 0,
    currency: 'NPR',
    status: 'FULL_PAID',
    dueDate: '2026-08-05',
    lastPaymentDate: '2026-08-04',
    notes: 'Full payment received.',
  },
  {
    id: 'fee-005',
    studentId: 'stu-005',
    studentName: 'Suman Adhikari',
    studentEmail: 'suman.adhikari@example.com',
    studentPhone: '9860112233',
    feeCategory: 'Registration Fee',
    totalAmount: 8000,
    paidAmount: 2000,
    dueAmount: 6000,
    currency: 'NPR',
    status: 'DUE',
    dueDate: '2026-08-22',
    lastPaymentDate: '2026-08-12',
    notes: 'NPR 2,000 paid cash at reception.',
  },
  {
    id: 'fee-006',
    studentId: 'stu-006',
    studentName: 'Kripa Bhattarai',
    studentEmail: 'kripa.bhattarai@example.com',
    studentPhone: '9841887766',
    feeCategory: 'Class Fee',
    totalAmount: 10000,
    paidAmount: 0,
    dueAmount: 10000,
    currency: 'NPR',
    status: 'UNPAID',
    dueDate: '2026-08-18',
    notes: 'PTE preparation class registration pending payment.',
  },
]

export function FeeManagementPanel() {
  const [fees, setFees] = useState<StudentFeeRecord[]>(INITIAL_FEES)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | FeePaymentStatus>('ALL')

  // Edit Modal State
  const [editRecord, setEditRecord] = useState<StudentFeeRecord | null>(null)
  const [newPaidAmount, setNewPaidAmount] = useState<number>(0)
  const [newStatus, setNewStatus] = useState<FeePaymentStatus>('FULL_PAID')
  const [updateNotes, setUpdateNotes] = useState('')

  // Mail Modal State
  const [mailRecord, setMailRecord] = useState<StudentFeeRecord | null>(null)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [isSendingMail, setIsSendingMail] = useState(false)

  // Computed Statistics
  const stats = useMemo(() => {
    const totalCollected = fees.reduce((acc, f) => acc + f.paidAmount, 0)
    const totalDue = fees.reduce((acc, f) => acc + f.dueAmount, 0)
    const fullyPaidCount = fees.filter((f) => f.status === 'FULL_PAID').length
    const dueCount = fees.filter((f) => f.status === 'DUE').length
    const unpaidCount = fees.filter((f) => f.status === 'UNPAID').length

    return { totalCollected, totalDue, fullyPaidCount, dueCount, unpaidCount }
  }, [fees])

  // Filtered Fee Roster
  const filteredFees = useMemo(() => {
    return fees.filter((fee) => {
      const matchesSearch =
        fee.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fee.studentEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fee.feeCategory.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'ALL' || fee.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [fees, searchQuery, statusFilter])

  // Open Edit Modal
  function handleOpenUpdateModal(record: StudentFeeRecord) {
    setEditRecord(record)
    setNewPaidAmount(record.paidAmount)
    setNewStatus(record.status)
    setUpdateNotes(record.notes || '')
  }

  // Handle Fee Status Update
  function handleSaveFeeStatus() {
    if (!editRecord) return
    const total = editRecord.totalAmount
    const paid = Math.min(Math.max(0, Number(newPaidAmount)), total)
    const due = Math.max(0, total - paid)

    let finalStatus: FeePaymentStatus = newStatus
    if (paid >= total) {
      finalStatus = 'FULL_PAID'
    } else if (paid > 0 && paid < total) {
      finalStatus = 'DUE'
    } else if (paid === 0) {
      finalStatus = 'UNPAID'
    }

    setFees((prev) =>
      prev.map((f) =>
        f.id === editRecord.id
          ? {
              ...f,
              paidAmount: paid,
              dueAmount: due,
              status: finalStatus,
              notes: updateNotes,
              lastPaymentDate: paid > f.paidAmount ? dayjs().format('YYYY-MM-DD') : f.lastPaymentDate,
            }
          : f
      )
    )

    toast.success(`Fee record updated for ${editRecord.studentName}`)
    setEditRecord(null)
  }

  // Open Mail Modal
  function handleOpenMailModal(record: StudentFeeRecord) {
    setMailRecord(record)
    setEmailSubject(`Fee Payment Reminder — ${record.feeCategory} Due (${record.currency} ${record.dueAmount.toLocaleString()})`)
    setEmailBody(
      `Dear ${record.studentName},\n\nThis is a friendly notice from DreamSky Education Consultancy regarding your outstanding ${record.feeCategory}.\n\n` +
      `Details:\n- Fee Description: ${record.feeCategory}\n- Outstanding Due: ${record.currency} ${record.dueAmount.toLocaleString()}\n- Due Date: ${record.dueDate}\n\n` +
      `Please clear your due fee at the Front Desk or transfer via online banking at your earliest convenience.\n\nThank you,\nFront Desk Team\nDreamSky Education Consultancy`
    )
  }

  // Handle Send Fee Due Mail
  async function handleSendFeeEmail() {
    if (!mailRecord) return
    setIsSendingMail(true)

    try {
      // Simulate sending email via backend email service
      await new Promise((resolve) => setTimeout(resolve, 600))

      setFees((prev) =>
        prev.map((f) =>
          f.id === mailRecord.id
            ? { ...f, lastReminderSentAt: dayjs().format('YYYY-MM-DD HH:mm') }
            : f
        )
      )

      toast.success(`Fee due reminder email sent to ${mailRecord.studentName} (${mailRecord.studentEmail})`)
      setMailRecord(null)
    } catch (err) {
      toast.error('Failed to send email. Please check server email credentials.')
    } finally {
      setIsSendingMail(false)
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Wallet className="size-4 text-primary" />
              Front Desk Fee & Payment Collection
            </CardTitle>
            <CardDescription className="text-xs">
              View due & fully paid student fees, update collection statuses, and dispatch email reminders.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs py-1 bg-emerald-50 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="size-3 mr-1 text-emerald-600" />
              Fully Paid: {stats.fullyPaidCount}
            </Badge>
            <Badge variant="outline" className="text-xs py-1 bg-amber-50 text-amber-700 border-amber-200">
              <Clock className="size-3 mr-1 text-amber-600" />
              Due: {stats.dueCount}
            </Badge>
            <Badge variant="outline" className="text-xs py-1 bg-rose-50 text-rose-700 border-rose-200">
              <AlertCircle className="size-3 mr-1 text-rose-600" />
              Unpaid: {stats.unpaidCount}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* Stat Highlights */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <p className="text-[11px] font-medium text-muted-foreground">Total Fee Collected</p>
            <p className="mt-1 text-lg font-bold text-emerald-600">NPR {stats.totalCollected.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <p className="text-[11px] font-medium text-muted-foreground">Total Fee Outstanding Due</p>
            <p className="mt-1 text-lg font-bold text-amber-600">NPR {stats.totalDue.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <p className="text-[11px] font-medium text-muted-foreground">Fully Paid Accounts</p>
            <p className="mt-1 text-lg font-bold text-foreground">{stats.fullyPaidCount}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <p className="text-[11px] font-medium text-muted-foreground">Pending / Overdue Action</p>
            <p className="mt-1 text-lg font-bold text-rose-600">{stats.dueCount + stats.unpaidCount}</p>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search student, email, or fee category…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <Button
              size="sm"
              variant={statusFilter === 'ALL' ? 'default' : 'outline'}
              className="h-8 text-xs px-3"
              onClick={() => setStatusFilter('ALL')}
            >
              All ({fees.length})
            </Button>
            <Button
              size="sm"
              variant={statusFilter === 'FULL_PAID' ? 'default' : 'outline'}
              className="h-8 text-xs px-3"
              onClick={() => setStatusFilter('FULL_PAID')}
            >
              Fully Paid ({stats.fullyPaidCount})
            </Button>
            <Button
              size="sm"
              variant={statusFilter === 'DUE' ? 'default' : 'outline'}
              className="h-8 text-xs px-3"
              onClick={() => setStatusFilter('DUE')}
            >
              Due ({stats.dueCount})
            </Button>
            <Button
              size="sm"
              variant={statusFilter === 'UNPAID' ? 'default' : 'outline'}
              className="h-8 text-xs px-3"
              onClick={() => setStatusFilter('UNPAID')}
            >
              Unpaid ({stats.unpaidCount})
            </Button>
          </div>
        </div>

        {/* Table Roster */}
        <div className="rounded-lg border border-border/70 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground border-b border-border/60">
                <tr>
                  <th className="p-3 font-semibold">Student Details</th>
                  <th className="p-3 font-semibold">Fee Category</th>
                  <th className="p-3 font-semibold">Total Amount</th>
                  <th className="p-3 font-semibold">Paid Amount</th>
                  <th className="p-3 font-semibold">Due Balance</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 bg-background">
                {filteredFees.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      No fee records found matching your query.
                    </td>
                  </tr>
                )}
                {filteredFees.map((fee) => {
                  const isFullyPaid = fee.status === 'FULL_PAID'
                  const isDue = fee.status === 'DUE'
                  const isUnpaid = fee.status === 'UNPAID'

                  return (
                    <tr key={fee.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <PersonAvatar name={fee.studentName} className="size-7" />
                          <div>
                            <p className="font-semibold text-foreground">{fee.studentName}</p>
                            <p className="text-[11px] text-muted-foreground">{fee.studentEmail}</p>
                          </div>
                        </div>
                      </td>

                      <td className="p-3">
                        <p className="font-medium text-foreground">{fee.feeCategory}</p>
                        <p className="text-[10px] text-muted-foreground">Due: {fee.dueDate}</p>
                      </td>

                      <td className="p-3 font-medium">
                        {fee.currency} {fee.totalAmount.toLocaleString()}
                      </td>

                      <td className="p-3 font-semibold text-emerald-600">
                        {fee.currency} {fee.paidAmount.toLocaleString()}
                      </td>

                      <td className="p-3 font-semibold text-amber-600">
                        {fee.currency} {fee.dueAmount.toLocaleString()}
                      </td>

                      <td className="p-3">
                        {isFullyPaid && (
                          <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 border-emerald-300">
                            Fully Paid
                          </Badge>
                        )}
                        {isDue && (
                          <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 border-amber-300">
                            Fee Due
                          </Badge>
                        )}
                        {isUnpaid && (
                          <Badge className="bg-rose-500/15 text-rose-700 hover:bg-rose-500/20 border-rose-300">
                            Unpaid
                          </Badge>
                        )}
                        {fee.lastReminderSentAt && (
                          <p className="text-[9px] text-muted-foreground mt-0.5">
                            Reminder sent: {fee.lastReminderSentAt}
                          </p>
                        )}
                      </td>

                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] gap-1 px-2"
                            onClick={() => handleOpenUpdateModal(fee)}
                          >
                            <RefreshCw className="size-3 text-muted-foreground" />
                            Update Status
                          </Button>

                          {!isFullyPaid && (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-[11px] gap-1 px-2 bg-amber-600 hover:bg-amber-700 text-white"
                              onClick={() => handleOpenMailModal(fee)}
                            >
                              <Mail className="size-3" />
                              Send Mail
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>

      {/* ── Modal: Update Fee Status ──────────────────────────────────── */}
      {editRecord && (
        <Dialog open={Boolean(editRecord)} onOpenChange={() => setEditRecord(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <DollarSign className="size-4 text-emerald-600" />
                Update Fee Status — {editRecord.studentName}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Record new payments, change payment status, or update notes.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs space-y-1">
                <p><strong>Fee Category:</strong> {editRecord.feeCategory}</p>
                <p><strong>Total Fee Amount:</strong> {editRecord.currency} {editRecord.totalAmount.toLocaleString()}</p>
                <p><strong>Current Paid:</strong> {editRecord.currency} {editRecord.paidAmount.toLocaleString()}</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Amount Paid ({editRecord.currency})</label>
                <Input
                  type="number"
                  value={newPaidAmount}
                  onChange={(e) => setNewPaidAmount(Number(e.target.value))}
                  className="h-9 text-sm font-semibold"
                />
                <p className="text-[11px] text-muted-foreground">
                  Remaining Due: {editRecord.currency} {Math.max(0, editRecord.totalAmount - Number(newPaidAmount)).toLocaleString()}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Payment Status Override</label>
                <Select
                  value={newStatus}
                  onValueChange={(val) => setNewStatus(val as FeePaymentStatus)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL_PAID">Fully Paid</SelectItem>
                    <SelectItem value="DUE">Partial / Fee Due</SelectItem>
                    <SelectItem value="UNPAID">Unpaid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Notes / Receipt Number</label>
                <Input
                  placeholder="e.g. Receipt #4092, Bank Transfer to Nabil Bank"
                  value={updateNotes}
                  onChange={(e) => setUpdateNotes(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditRecord(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveFeeStatus}>
                Save Payment Status
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Modal: Send Fee Due Email ─────────────────────────────────── */}
      {mailRecord && (
        <Dialog open={Boolean(mailRecord)} onOpenChange={() => setMailRecord(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <Mail className="size-4 text-amber-600" />
                Send Fee Due Email Notice
              </DialogTitle>
              <DialogDescription className="text-xs">
                Dispatch an official email reminder to {mailRecord.studentName} about their pending fee.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3 text-xs rounded-lg border border-border/70 bg-muted/20 p-3">
                <div>
                  <p className="text-muted-foreground">Recipient Student:</p>
                  <p className="font-semibold text-foreground">{mailRecord.studentName}</p>
                  <p className="text-[11px] text-muted-foreground">{mailRecord.studentEmail}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Outstanding Amount:</p>
                  <p className="font-semibold text-rose-600">{mailRecord.currency} {mailRecord.dueAmount.toLocaleString()}</p>
                  <p className="text-[11px] text-muted-foreground">Due: {mailRecord.dueDate}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Email Subject</label>
                <Input
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Email Body Message</label>
                <textarea
                  rows={6}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full rounded-md border border-border p-2.5 text-xs font-sans focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setMailRecord(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={handleSendFeeEmail}
                disabled={isSendingMail}
              >
                <Send className="size-3.5" />
                {isSendingMail ? 'Sending Email…' : 'Send Reminder Email'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  )
}
