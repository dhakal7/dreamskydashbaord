import { useState, useMemo } from 'react'
import {
  Wallet, Mail, CheckCircle2, Clock, AlertCircle, Search, DollarSign, RefreshCw, Plus, Trash2,
  Database, FileText, Lock, History, AlertTriangle
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
import { SearchableStudentPicker } from '@/components/shared/searchable-student-picker'
import { useStudentsStore } from '@/features/students/store'
import { useStudents } from '@/hooks/use-students'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import type { FeePaymentStatus } from '@/types'
import { api, isMockMode } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth-store'
import { usePayments, paymentKeys } from '@/hooks/use-payments'
import { useQueryClient } from '@tanstack/react-query'
import type { ApiPaymentItem, ApiPaymentTransaction } from '@/api/payment-api'

export interface DisplayFeeRecord {
  id: string
  studentId: string
  studentName: string
  studentEmail: string
  studentPhone: string
  feeCategory: string
  totalAmount: number
  paidAmount: number
  dueAmount: number
  currency: string
  status: FeePaymentStatus
  dueDate?: string
  lastPaymentDate?: string
  lastReminderSentAt?: string
  notes?: string
  transactions?: ApiPaymentTransaction[]
  source: 'database'
}

export function FeeManagementPanel() {
  const storeStudents = useStudentsStore((s) => s.students)
  const currentUser = useAuthStore((s) => s.currentUser)
  const queryClient = useQueryClient()
  const isMock = isMockMode()
  const canCreateFee = ['super_admin', 'branch_admin', 'front_desk'].includes(currentUser.role)
  const canManageFees = canCreateFee
  const canSendReminder = ['super_admin', 'branch_admin', 'front_desk', 'counselor'].includes(currentUser.role)
  const canDeleteFee = currentUser.role === 'super_admin'

  // ── 1. TanStack Query for Live Database Payments ───────────────────────────
  const {
    data: dbPayments,
    isLoading: isPaymentsLoading,
    isError: isPaymentsError,
    error: paymentsError,
    refetch: refetchPayments,
    isFetching: isPaymentsFetching,
  } = usePayments()

  // ── 2. Database Fee List ────────────────────────────────────────────────────
  const combinedFees = useMemo<DisplayFeeRecord[]>(() => {
    if (isMock) {
      return []
    }

    const liveList: DisplayFeeRecord[] = (dbPayments || []).map((p: ApiPaymentItem) => ({
      id: p.id,
      studentId: p.studentId,
      studentName: p.studentName || 'Unknown Student',
      studentEmail: p.studentEmail || 'N/A',
      studentPhone: p.studentPhone || 'N/A',
      feeCategory: p.feeCategory || 'Fee',
      totalAmount: p.totalAmount,
      paidAmount: p.paidAmount,
      dueAmount: p.dueAmount,
      currency: p.currency || 'NPR',
      status: p.status,
      dueDate: p.dueDate || (p.createdAt ? dayjs(p.createdAt).format('YYYY-MM-DD') : 'N/A'),
      lastPaymentDate: p.lastPaymentDate ? dayjs(p.lastPaymentDate).format('YYYY-MM-DD') : undefined,
      lastReminderSentAt: p.lastReminderSentAt,
      notes: p.notes,
      transactions: p.transactions || [],
      source: 'database' as const,
    }))

    return liveList
  }, [isMock, dbPayments])

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | FeePaymentStatus>('ALL')
  const [studentSearch, setStudentSearch] = useState('')
  const debouncedStudentSearch = useDebouncedValue(studentSearch.trim(), 300)

  // Modals & Inspection States
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [feeCategory, setFeeCategory] = useState('Class Fee')
  const [totalAmountInput, setTotalAmountInput] = useState('12000')
  const [paidAmountInput, setPaidAmountInput] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [notesInput, setNotesInput] = useState('')
  const [isCreatingFee, setIsCreatingFee] = useState(false)

  // Edit Modal State
  const [editRecord, setEditRecord] = useState<DisplayFeeRecord | null>(null)
  const [newTotalAmount, setNewTotalAmount] = useState<number>(0)
  const [newPaidAmount, setNewPaidAmount] = useState<number>(0)
  const [newStatus, setNewStatus] = useState<FeePaymentStatus>('FULL_PAID')
  const [updateNotes, setUpdateNotes] = useState('')
  const [isUpdatingFee, setIsUpdatingFee] = useState(false)

  // Installment Modal State
  const [installmentRecord, setInstallmentRecord] = useState<DisplayFeeRecord | null>(null)
  const [installmentAmountInput, setInstallmentAmountInput] = useState('')
  const [installmentMethod, setInstallmentMethod] = useState('Cash')
  const [installmentNotes, setInstallmentNotes] = useState('')
  const [isRecordingInstallment, setIsRecordingInstallment] = useState(false)

  // Mail Modal State
  const [mailRecord, setMailRecord] = useState<DisplayFeeRecord | null>(null)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [isSendingReminder, setIsSendingReminder] = useState(false)

  // Delete Confirmation State
  const [deleteRecord, setDeleteRecord] = useState<DisplayFeeRecord | null>(null)

  // Transaction History Modal State (Read-Only)
  const [historyRecord, setHistoryRecord] = useState<DisplayFeeRecord | null>(null)

  // Server-side searchable student options for Fee Creation picker
  const {
    data: liveStudentsData,
    isLoading: isStudentsLoading,
    isError: isStudentsError,
    refetch: refetchStudents,
  } = useStudents(
    isMock
      ? { limit: 500 }
      : {
          limit: 50,
          search: debouncedStudentSearch || undefined,
          stageIn: 'LEAD,PROSPECT,ENROLLED,APPLIED,OFFER_RECEIVED,VISA_APPLIED,VISA_APPROVED,DEPARTED,LOST',
        },
    { enabled: isCreateOpen && !isMock }
  )

  const allStudents = useMemo(() => {
    if (isMock) {
      return storeStudents.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        phone: s.phone,
        studentId: s.studentId,
      }))
    }
    const list = liveStudentsData?.students || []
    return list.map((s) => ({
      id: s.id,
      name: `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unknown Student',
      email: s.email || '',
      phone: s.phone || '',
      studentId: s.id,
    }))
  }, [isMock, liveStudentsData, storeStudents])

  // Computed Statistics
  const stats = useMemo(() => {
    const list = combinedFees
    const totalCollected = list.reduce((acc, f) => acc + (f.paidAmount || 0), 0)
    const totalDue = list.reduce((acc, f) => acc + (f.dueAmount || 0), 0)
    const fullyPaidCount = list.filter((f) => f.status === 'FULL_PAID').length
    const dueCount = list.filter((f) => f.status === 'DUE').length
    const unpaidCount = list.filter((f) => f.status === 'UNPAID').length

    return { totalCollected, totalDue, fullyPaidCount, dueCount, unpaidCount }
  }, [combinedFees])

  // Filtered Fee Roster
  const filteredFees = useMemo(() => {
    return combinedFees.filter((fee) => {
      const matchesSearch =
        fee.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fee.studentEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fee.feeCategory.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'ALL' || fee.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [combinedFees, searchQuery, statusFilter])

  // Open Edit Modal
  function handleOpenUpdateModal(record: DisplayFeeRecord) {
    setEditRecord(record)
    setNewTotalAmount(record.totalAmount)
    setNewPaidAmount(record.paidAmount)
    setNewStatus(record.status)
    setUpdateNotes(record.notes || '')
  }

  // ── Handle Fee Status Update ───────────────────────────────
  async function handleSaveFeeStatus() {
    if (!editRecord || !canManageFees || isUpdatingFee) return
    const total = Number(newTotalAmount)
    const collected = editRecord.paidAmount

    if (!Number.isFinite(total) || total <= 0) {
      toast.error('Total fee amount must be greater than 0')
      return
    }
    if (total < collected) {
      toast.error(`Total amount cannot be lower than already collected amount (${editRecord.currency} ${collected.toLocaleString()})`)
      return
    }

    let finalStatus: FeePaymentStatus = newStatus
    if (newStatus !== 'CANCELLED') {
      if (collected >= total && total > 0) finalStatus = 'FULL_PAID'
      else if (collected > 0 && collected < total) finalStatus = 'DUE'
      else finalStatus = 'UNPAID'
    }

    if (isMock) {
      toast.success('Fee record updated (demo mode)')
      setEditRecord(null)
      return
    }

    setIsUpdatingFee(true)
    try {
      await api.patch(`/payments/${editRecord.id}`, {
        totalAmount: total,
        status: finalStatus,
        notes: updateNotes.trim() || undefined,
      })
      toast.success('Payment record updated successfully')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paymentKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['payments'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      setEditRecord(null)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update payment record')
    } finally {
      setIsUpdatingFee(false)
    }
  }

  function handleOpenInstallmentModal(record: DisplayFeeRecord) {
    setInstallmentRecord(record)
    setInstallmentAmountInput(record.dueAmount > 0 ? String(record.dueAmount) : '')
    setInstallmentMethod('Cash')
    setInstallmentNotes('')
  }

  // ── Handle Record Subsequent Installment ───────────────────
  async function handleRecordInstallment() {
    if (!installmentRecord || !canManageFees || isRecordingInstallment) return
    const amount = Number(installmentAmountInput)
    const remainingDue = Math.max(0, installmentRecord.dueAmount)

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Installment amount must be greater than 0')
      return
    }
    if (amount > remainingDue) {
      toast.error(`Installment amount cannot exceed remaining due (${installmentRecord.currency} ${remainingDue.toLocaleString()})`)
      return
    }
    if (!installmentMethod.trim()) {
      toast.error('Please select a payment method')
      return
    }

    if (isMock) {
      toast.success('Installment recorded (demo mode)')
      setInstallmentRecord(null)
      return
    }

    setIsRecordingInstallment(true)
    try {
      await api.post(`/payments/${installmentRecord.id}/transactions`, {
        amount,
        paymentMethod: installmentMethod,
        notes: installmentNotes.trim() || undefined,
      })
      toast.success('Installment recorded successfully')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paymentKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['payments'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      setInstallmentRecord(null)
      setInstallmentAmountInput('')
      setInstallmentNotes('')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record installment')
    } finally {
      setIsRecordingInstallment(false)
    }
  }

  // ── Handle Create New Fee Record ───────────────────────────
  async function handleCreateFeeRecord() {
    if (!canCreateFee) {
      toast.error('You do not have permission to create fee records')
      return
    }
    if (!selectedStudentId) {
      toast.error('Please select a student')
      return
    }
    if (!feeCategory.trim()) {
      toast.error('Please select a fee category')
      return
    }

    const total = Number(totalAmountInput)
    const paid = Number(paidAmountInput || 0)

    if (!Number.isFinite(total) || total <= 0) {
      toast.error('Total amount must be greater than 0')
      return
    }
    if (!Number.isFinite(paid) || paid < 0) {
      toast.error('Paid amount cannot be negative')
      return
    }
    if (paid > total) {
      toast.error('Paid amount cannot exceed total amount')
      return
    }
    if (paid > 0 && !paymentMethod.trim()) {
      toast.error('Please select a payment method')
      return
    }

    if (isMock) {
      toast.success('Fee record created (demo mode)')
      setIsCreateOpen(false)
      return
    }

    setIsCreatingFee(true)
    try {
      await api.post('/payments', {
        studentId: selectedStudentId,
        feeCategory: feeCategory.trim(),
        totalAmount: total,
        paidAmount: paid,
        paymentMethod,
        notes: notesInput.trim() || undefined,
      })
      toast.success('Student fee record created successfully')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paymentKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['payments'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      setIsCreateOpen(false)
      setSelectedStudentId('')
      setPaidAmountInput('0')
      setNotesInput('')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create fee record')
    } finally {
      setIsCreatingFee(false)
    }
  }

  // Open Mail Modal
  function handleOpenMailModal(record: DisplayFeeRecord) {
    setMailRecord(record)
    setEmailSubject(`Fee Payment Reminder — ${record.feeCategory} Due (${record.currency} ${record.dueAmount.toLocaleString()})`)
    setEmailBody(
      `Dear ${record.studentName},\n\nThis is a friendly notice from DreamSky Education Consultancy regarding your outstanding ${record.feeCategory}.\n\n` +
      `Details:\n- Fee Description: ${record.feeCategory}\n- Outstanding Due: ${record.currency} ${record.dueAmount.toLocaleString()}\n- Due Date: ${record.dueDate || 'N/A'}\n\n` +
      `Please clear your due fee at the Front Desk or transfer via online banking at your earliest convenience.\n\nThank you,\nFront Desk Team\nDreamSky Education Consultancy`
    )
  }

  // ── Handle Send Fee Due Mail ───────────────────────────────
  async function handleSendFeeEmail() {
    if (!mailRecord || !canSendReminder || isSendingReminder) return
    if (mailRecord.dueAmount <= 0) {
      toast.error('Cannot send reminder when there is no outstanding balance')
      return
    }
    if (!mailRecord.studentEmail || !mailRecord.studentEmail.includes('@')) {
      toast.error('Student does not have a valid email address on record')
      return
    }
    if (isMock) {
      toast.success('Fee reminder email simulated (demo mode)')
      setMailRecord(null)
      return
    }

    setIsSendingReminder(true)
    try {
      await api.post(`/payments/${mailRecord.id}/remind`)
      toast.success(`Fee reminder sent to ${mailRecord.studentName}`)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paymentKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['payments'] }),
      ])
      setMailRecord(null)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to dispatch payment reminder email')
    } finally {
      setIsSendingReminder(false)
    }
  }

  // ── Handle Delete Fee Record (Preserve Financial Audit History) ────────────
  async function handleDeleteFee() {
    toast.error('Financial transactions cannot be deleted directly to preserve ledger and audit history. Please update status or record adjustments.')
    setDeleteRecord(null)
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-col gap-3">
          {/* Live Finance Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3.5 py-2.5 text-xs text-emerald-900">
            <div className="flex items-start sm:items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <span className="font-semibold">Live Financial Ledger Active:</span>{' '}
                Connected to live database payments. Fee creations, installments, status updates, and reminder dispatches are recorded directly in PostgreSQL.
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300">
                <Wallet className="size-3 mr-1" /> Live Ledger
              </Badge>
              {!isMock && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px] gap-1 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100"
                  onClick={() => refetchPayments()}
                  disabled={isPaymentsFetching}
                >
                  <RefreshCw className={`size-3 ${isPaymentsFetching ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <Wallet className="size-4 text-primary" />
                Front Desk Fee & Payment Collection
              </CardTitle>
              <CardDescription className="text-xs">
                Inspect live database payment records, view transaction installments, and reference local drafts.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canCreateFee && (
                <Button
                  size="sm"
                  className="gap-1.5 bg-primary/80 hover:bg-primary/90 text-primary-foreground text-xs h-8"
                  onClick={() => setIsCreateOpen(true)}
                >
                  <Plus className="size-3.5" />
                  Add Student Fee
                </Button>
              )}
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
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* Error State Banner */}
        {isPaymentsError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50/90 p-4 text-xs text-rose-900 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="size-4 text-rose-600" />
                Error Loading Database Payments
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-rose-300 bg-white hover:bg-rose-100 text-rose-800"
                onClick={() => refetchPayments()}
              >
                <RefreshCw className="size-3 mr-1" /> Retry Connection
              </Button>
            </div>
            <p className="text-rose-700">
              {paymentsError?.message || 'Failed to fetch live payments from GET /api/payments. Please verify network or session.'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Note: The system does not silently replace database payments with hardcoded records upon failure.
            </p>
          </div>
        )}

        {/* Metric Summary Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <p className="text-[11px] font-medium text-muted-foreground">Total Fee Collected</p>
            <p className="mt-1 text-lg font-bold text-emerald-600">
              NPR {stats.totalCollected.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <p className="text-[11px] font-medium text-muted-foreground">Total Fee Outstanding Due</p>
            <p className="mt-1 text-lg font-bold text-amber-600">
              NPR {stats.totalDue.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <p className="text-[11px] font-medium text-muted-foreground">Total Fee Records</p>
            <p className="mt-1 text-lg font-bold text-foreground">
              {combinedFees.length} <span className="text-xs font-normal text-muted-foreground">records</span>
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <p className="text-[11px] font-medium text-muted-foreground">Outstanding Fee Records</p>
            <p className="mt-1 text-lg font-bold text-amber-700">
              {stats.dueCount + stats.unpaidCount} <span className="text-xs font-normal text-muted-foreground">pending</span>
            </p>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search student, email, or fee category…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Status Filter */}
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={statusFilter === 'ALL' ? 'default' : 'outline'}
                className="h-8 text-xs px-2.5"
                onClick={() => setStatusFilter('ALL')}
              >
                All Status
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'FULL_PAID' ? 'default' : 'outline'}
                className="h-8 text-xs px-2.5"
                onClick={() => setStatusFilter('FULL_PAID')}
              >
                Fully Paid ({stats.fullyPaidCount})
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'DUE' ? 'default' : 'outline'}
                className="h-8 text-xs px-2.5"
                onClick={() => setStatusFilter('DUE')}
              >
                Due ({stats.dueCount})
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'UNPAID' ? 'default' : 'outline'}
                className="h-8 text-xs px-2.5"
                onClick={() => setStatusFilter('UNPAID')}
              >
                Unpaid ({stats.unpaidCount})
              </Button>
            </div>
          </div>
        </div>

        {/* Fee Collection Roster Table */}
        <div className="rounded-lg border border-border/70 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground border-b border-border/60">
                <tr>
                  <th className="p-3 font-semibold">Student Details</th>
                  <th className="p-3 font-semibold">Source</th>
                  <th className="p-3 font-semibold">Fee Category</th>
                  <th className="p-3 font-semibold">Total Amount</th>
                  <th className="p-3 font-semibold">Paid Amount</th>
                  <th className="p-3 font-semibold">Due Balance</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 bg-background">
                {/* Loading skeleton */}
                {isPaymentsLoading && !isMock && (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="size-5 animate-spin text-primary" />
                        <span>Loading verified payment records from database…</span>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Empty State */}
                {!isPaymentsLoading && filteredFees.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted-foreground">
                      No fee records found matching your query.
                    </td>
                  </tr>
                )}

                {/* Populated records */}
                {!isPaymentsLoading && filteredFees.map((fee) => {
                  const isPaid = fee.status === 'FULL_PAID'
                  const isDue = fee.status === 'DUE'
                  const isUnpaid = fee.status === 'UNPAID'
                  const isCancelled = fee.status === 'CANCELLED'
                  const isDatabase = fee.source === 'database'
                  const txCount = fee.transactions ? fee.transactions.length : 0

                  return (
                    <tr key={fee.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <PersonAvatar name={fee.studentName} className="size-7" />
                          <div>
                            <p className="font-semibold text-foreground">{fee.studentName}</p>
                            <p className="text-[11px] text-muted-foreground">{fee.studentEmail}</p>
                            {fee.studentPhone && fee.studentPhone !== 'N/A' && (
                              <p className="text-[10px] text-muted-foreground">{fee.studentPhone}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        {isDatabase ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1 py-0.5">
                            <Database className="size-2.5" />
                            Live DB
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[10px] gap-1 py-0.5">
                            <FileText className="size-2.5" />
                            Local Draft
                          </Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <p className="font-medium text-foreground">{fee.feeCategory}</p>
                        <p className="text-[10px] text-muted-foreground">Due: {fee.dueDate || 'N/A'}</p>
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
                        {isPaid && (
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
                        {isCancelled && (
                          <Badge variant="secondary" className="text-muted-foreground">
                            Cancelled
                          </Badge>
                        )}
                        {fee.lastReminderSentAt && (
                          <p className="text-[9px] text-muted-foreground mt-0.5">
                            Reminder: {fee.lastReminderSentAt}
                          </p>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Transaction history button */}
                          {txCount > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] gap-1 px-2 text-primary hover:bg-primary/5"
                              onClick={() => setHistoryRecord(fee)}
                            >
                              <History className="size-3" />
                              History ({txCount})
                            </Button>
                          )}

                          {canManageFees && !isPaid && !isCancelled && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] gap-1 px-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              onClick={() => handleOpenInstallmentModal(fee)}
                            >
                              <Plus className="size-3" />
                              Installment
                            </Button>
                          )}

                          {canManageFees && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] gap-1 px-2 text-muted-foreground hover:text-foreground"
                              onClick={() => handleOpenUpdateModal(fee)}
                            >
                              <RefreshCw className="size-3 text-muted-foreground" />
                              Update Fee
                            </Button>
                          )}

                          {!isPaid && !isCancelled && canSendReminder && (
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

                          {canDeleteFee && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] gap-1 px-2 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              onClick={() => setDeleteRecord(fee)}
                            >
                              <Trash2 className="size-3" />
                              Delete
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

      {/* CREATE STUDENT FEE MODAL */}
      <Dialog open={isCreateOpen && canCreateFee} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Plus className="size-4 text-primary" />
              Add Student Fee Record
            </DialogTitle>
            <DialogDescription className="text-xs">
              Assign a new tuition, class, or application fee to an enrolled student.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <SearchableStudentPicker
                label="Select Student"
                students={allStudents}
                value={selectedStudentId}
                onChange={setSelectedStudentId}
                onSearchChange={isMock ? undefined : setStudentSearch}
                searching={isMock ? false : isStudentsLoading}
                placeholder={isStudentsLoading ? 'Searching students...' : 'Search student by name, email, or phone...'}
                emptyMessage={debouncedStudentSearch ? 'No matching students found.' : 'Type to search students...'}
              />
              {!isMock && isStudentsError && (
                <div className="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                  <span>Unable to load students from server.</span>
                  <button
                    type="button"
                    onClick={() => refetchStudents()}
                    className="font-semibold underline hover:no-underline"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Fee Category</label>
              <Select value={feeCategory} onValueChange={setFeeCategory}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select fee category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Class Fee">Class Fee (IELTS/PTE)</SelectItem>
                  <SelectItem value="Registration Fee">Registration Fee</SelectItem>
                  <SelectItem value="Application Fee">Application Fee</SelectItem>
                  <SelectItem value="Tuition Fee">Tuition Fee</SelectItem>
                  <SelectItem value="Visa Processing Fee">Visa Processing Fee</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Total Amount (NPR)</label>
                <Input
                  type="number"
                  value={totalAmountInput}
                  onChange={(e) => setTotalAmountInput(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Paid Amount (NPR)</label>
                <Input
                  type="number"
                  value={paidAmountInput}
                  onChange={(e) => setPaidAmountInput(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Payment Method</label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash at Front Desk</SelectItem>
                  <SelectItem value="Fonepay">Fonepay / QR Code</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Card">Credit / Debit Card</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Notes / Receipt Remarks</label>
              <Input
                placeholder="e.g. NPR 500 due, Receipt #9041"
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(false)} disabled={isCreatingFee}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateFeeRecord} disabled={isCreatingFee || !canCreateFee}>
              {isCreatingFee ? 'Saving...' : 'Save Fee Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* UPDATE FEE MODAL */}
      {editRecord && canManageFees && (
        <Dialog open={!!editRecord} onOpenChange={() => setEditRecord(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <DollarSign className="size-4 text-emerald-600" />
                Update Fee — {editRecord.studentName}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Update total fee amount or notes. Use Record Installment to log new payments.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs space-y-1">
                <p>
                  <strong>Record Source:</strong> {editRecord.source === 'database' ? 'Live Database' : 'Local Draft'}
                </p>
                <p>
                  <strong>Fee Category:</strong> {editRecord.feeCategory}
                </p>
                <p>
                  <strong>Student Email:</strong> {editRecord.studentEmail}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">Total Fee Amount ({editRecord.currency})</label>
                  <Input
                    type="number"
                    min={editRecord.paidAmount}
                    value={newTotalAmount}
                    onChange={(e) => setNewTotalAmount(Number(e.target.value))}
                    className="h-9 text-xs font-semibold"
                    disabled={isUpdatingFee}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">Collected Paid ({editRecord.currency})</label>
                  <Input
                    type="number"
                    value={newPaidAmount}
                    className="h-9 text-xs font-semibold text-emerald-600 bg-muted/40"
                    disabled
                  />
                </div>
              </div>
              <p className="text-[11px] font-medium text-amber-600">
                Remaining Due: {editRecord.currency}{' '}
                {Math.max(0, Number(newTotalAmount) - editRecord.paidAmount).toLocaleString()}
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Payment Status</label>
                <Select value={newStatus} onValueChange={(val) => setNewStatus(val as FeePaymentStatus)} disabled={isUpdatingFee}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL_PAID" disabled={editRecord.paidAmount < Number(newTotalAmount)}>
                      Fully Paid
                    </SelectItem>
                    <SelectItem value="DUE" disabled={editRecord.paidAmount <= 0 || editRecord.paidAmount >= Number(newTotalAmount)}>
                      Partial / Fee Due
                    </SelectItem>
                    <SelectItem value="UNPAID" disabled={editRecord.paidAmount > 0}>
                      Unpaid
                    </SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
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
                  disabled={isUpdatingFee}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditRecord(null)} disabled={isUpdatingFee}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveFeeStatus} disabled={isUpdatingFee}>
                {isUpdatingFee ? 'Saving...' : 'Save Fee Update'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* RECORD INSTALLMENT MODAL */}
      {installmentRecord && canManageFees && (
        <Dialog open={!!installmentRecord} onOpenChange={() => setInstallmentRecord(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <Plus className="size-4 text-emerald-600" />
                Record Installment — {installmentRecord.studentName}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Log a subsequent payment transaction against {installmentRecord.feeCategory}. Existing transactions remain preserved.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs grid grid-cols-3 gap-2">
                <div>
                  <p className="text-muted-foreground">Total</p>
                  <p className="font-semibold">{installmentRecord.currency} {installmentRecord.totalAmount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Collected</p>
                  <p className="font-semibold text-emerald-600">{installmentRecord.currency} {installmentRecord.paidAmount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Remaining Due</p>
                  <p className="font-semibold text-amber-600">{installmentRecord.currency} {installmentRecord.dueAmount.toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Installment Amount ({installmentRecord.currency})</label>
                <Input
                  type="number"
                  min={1}
                  max={installmentRecord.dueAmount}
                  value={installmentAmountInput}
                  onChange={(e) => setInstallmentAmountInput(e.target.value)}
                  placeholder="Enter amount collected"
                  className="h-9 text-xs"
                  disabled={isRecordingInstallment}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Payment Method</label>
                <Select value={installmentMethod} onValueChange={setInstallmentMethod} disabled={isRecordingInstallment}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash at Front Desk</SelectItem>
                    <SelectItem value="Fonepay">Fonepay / QR Code</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Card">Credit / Debit Card</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Notes / Receipt Reference (Optional)</label>
                <Input
                  value={installmentNotes}
                  onChange={(e) => setInstallmentNotes(e.target.value)}
                  placeholder="e.g. Installment #2, Receipt #1055"
                  className="h-9 text-xs"
                  disabled={isRecordingInstallment}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setInstallmentRecord(null)} disabled={isRecordingInstallment}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleRecordInstallment} disabled={isRecordingInstallment}>
                {isRecordingInstallment ? 'Recording...' : 'Record Installment'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* SEND FEE DUE EMAIL MODAL */}
      {mailRecord && canSendReminder && (
        <Dialog open={!!mailRecord} onOpenChange={() => setMailRecord(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <Mail className="size-4 text-amber-600" />
                Send Fee Due Email Notice
              </DialogTitle>
              <DialogDescription className="text-xs">
                Dispatch official server-generated fee reminder for {mailRecord.studentName}.
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
                  <p className="font-semibold text-rose-600">
                    {mailRecord.currency} {mailRecord.dueAmount.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Due: {mailRecord.dueDate || 'N/A'}</p>
                </div>
              </div>

              {(mailRecord.dueAmount <= 0 || !mailRecord.studentEmail || !mailRecord.studentEmail.includes('@')) && (
                <div className="rounded-md border border-rose-200 bg-rose-50/80 p-2.5 text-xs text-rose-800 flex items-center gap-2">
                  <AlertTriangle className="size-4 text-rose-600 shrink-0" />
                  <span>
                    {mailRecord.dueAmount <= 0
                      ? 'Reminder disabled: there is no outstanding balance on this fee record.'
                      : 'Reminder disabled: student does not have a valid email address on record.'}
                  </span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Email Subject (Server Preview)</label>
                <Input
                  value={emailSubject}
                  readOnly
                  className="h-9 text-xs bg-muted/20"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Email Body Preview (Generated by Server)</label>
                <textarea
                  rows={6}
                  value={emailBody}
                  readOnly
                  className="w-full rounded-md border border-border p-2.5 text-xs font-sans focus:outline-none bg-muted/20"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setMailRecord(null)} disabled={isSendingReminder}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={handleSendFeeEmail}
                disabled={
                  isSendingReminder ||
                  mailRecord.dueAmount <= 0 ||
                  !mailRecord.studentEmail ||
                  !mailRecord.studentEmail.includes('@')
                }
              >
                <Mail className="size-3.5" />
                {isSendingReminder ? 'Sending...' : 'Send Reminder Email'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* DELETE CONFIRMATION DIALOG (Phase 3A Guarded) */}
      <Dialog open={!!deleteRecord} onOpenChange={(open) => { if (!open) setDeleteRecord(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <Trash2 className="size-4" />
              Delete Fee Record?
            </DialogTitle>
            <DialogDescription className="text-sm space-y-1">
              <span>
                Record for <strong>{deleteRecord?.studentName}</strong> — <strong>{deleteRecord?.feeCategory}</strong> (NPR {deleteRecord?.totalAmount.toLocaleString()}).
              </span>
            </DialogDescription>
          </DialogHeader>

          {/* Phase 3A Mutation Warning */}
          <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 flex items-center gap-2">
            <Lock className="size-4 text-rose-600 shrink-0" />
            <span>
              <strong>Phase 3A Notice:</strong> Record deletion is strictly locked to prevent loss of financial data.
            </span>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteRecord(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-rose-600 text-white gap-1.5"
              onClick={handleDeleteFee}
              disabled={true}
            >
              <Lock className="size-3.5" />
              Locked (Phase 3A Read-Only)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TRANSACTION INSTALLMENTS HISTORY MODAL (Read-Only) */}
      {historyRecord && (
        <Dialog open={!!historyRecord} onOpenChange={() => setHistoryRecord(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <History className="size-4 text-primary" />
                Payment Installment History — {historyRecord.studentName}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Verified database transactions for {historyRecord.feeCategory} ({historyRecord.currency} {historyRecord.totalAmount.toLocaleString()}).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between text-xs rounded-lg border border-border/70 bg-muted/20 p-3">
                <div>
                  <p className="text-muted-foreground">Total Paid:</p>
                  <p className="font-semibold text-emerald-600">
                    {historyRecord.currency} {historyRecord.paidAmount.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Outstanding Due:</p>
                  <p className="font-semibold text-amber-600">
                    {historyRecord.currency} {historyRecord.dueAmount.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Installments:</p>
                  <p className="font-semibold text-foreground">
                    {historyRecord.transactions?.length || 0}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border/70 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 text-muted-foreground border-b border-border/60">
                    <tr>
                      <th className="p-2.5 font-semibold">Date</th>
                      <th className="p-2.5 font-semibold">Amount</th>
                      <th className="p-2.5 font-semibold">Method</th>
                      <th className="p-2.5 font-semibold">Receipt / Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {(!historyRecord.transactions || historyRecord.transactions.length === 0) ? (
                      <tr>
                        <td colSpan={4} className="text-center py-6 text-muted-foreground">
                          No transactions recorded.
                        </td>
                      </tr>
                    ) : (
                      historyRecord.transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-muted/20">
                          <td className="p-2.5">
                            {tx.paidAt ? dayjs(tx.paidAt).format('YYYY-MM-DD HH:mm') : 'N/A'}
                          </td>
                          <td className="p-2.5 font-semibold text-emerald-600">
                            {historyRecord.currency} {tx.amount.toLocaleString()}
                          </td>
                          <td className="p-2.5 font-medium">
                            <Badge variant="outline" className="text-[10px] py-0">
                              {tx.method}
                            </Badge>
                          </td>
                          <td className="p-2.5 text-muted-foreground">
                            {tx.receiptNumber ? (
                              <span className="font-mono text-[11px] text-foreground block">
                                #{tx.receiptNumber}
                              </span>
                            ) : null}
                            <span>{tx.notes || '—'}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <DialogFooter>
              <Button size="sm" onClick={() => setHistoryRecord(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  )
}
