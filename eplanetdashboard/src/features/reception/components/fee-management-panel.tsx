import { useState, useMemo, useEffect } from 'react'
import {
  Wallet, Mail, CheckCircle2, Clock, AlertCircle, Search, Send, DollarSign, RefreshCw, Plus
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
import { students as seedStudents } from '@/mock'
import { useStudentsStore } from '@/features/students/store'
import type { StudentFeeRecord, FeePaymentStatus } from '@/types'
import { api } from '@/lib/api-client'

const REAL_EXCEL_FEES: StudentFeeRecord[] = [
  {
    id: 'fee-001',
    studentId: 'stu-prajwol',
    studentName: 'Prajwol Bishwokarma',
    studentEmail: 'student_9815937637@dreamsky.com',
    studentPhone: '9815937637',
    feeCategory: 'Class Fee',
    totalAmount: 2500,
    paidAmount: 2000,
    dueAmount: 500,
    currency: 'NPR',
    status: 'DUE',
    dueDate: '2026-08-30',
    lastPaymentDate: '2026-08-20',
    notes: 'NPR 500 due payment',
  },
  {
    id: 'fee-002',
    studentId: 'stu-binit',
    studentName: 'Binit Tamang',
    studentEmail: 'student_9813069109@dreamsky.com',
    studentPhone: '9813069109',
    feeCategory: 'Class Fee',
    totalAmount: 12000,
    paidAmount: 0,
    dueAmount: 12000,
    currency: 'NPR',
    status: 'UNPAID',
    dueDate: '2026-09-01',
    notes: 'PTE preparation class fee pending',
  },
  {
    id: 'fee-003',
    studentId: 'stu-amrit',
    studentName: 'Amrit Tamang',
    studentEmail: 'student_9803863309@dreamsky.com',
    studentPhone: '9803863309',
    feeCategory: 'Class Fee',
    totalAmount: 12000,
    paidAmount: 0,
    dueAmount: 12000,
    currency: 'NPR',
    status: 'UNPAID',
    dueDate: '2026-09-01',
    notes: 'IELTS preparation class fee pending',
  },
  {
    id: 'fee-004',
    studentId: 'stu-bahadur',
    studentName: 'Bahadur Gurung',
    studentEmail: 'student_9707560808@dreamsky.com',
    studentPhone: '9707560808',
    feeCategory: 'Class Fee',
    totalAmount: 10000,
    paidAmount: 0,
    dueAmount: 10000,
    currency: 'NPR',
    status: 'UNPAID',
    dueDate: '2026-08-28',
    notes: 'Class fee due',
  },
  {
    id: 'fee-005',
    studentId: 'stu-john',
    studentName: 'John Tamang',
    studentEmail: 'student_9706129373@dreamsky.com',
    studentPhone: '9706129373',
    feeCategory: 'Class Fee',
    totalAmount: 10000,
    paidAmount: 0,
    dueAmount: 10000,
    currency: 'NPR',
    status: 'UNPAID',
    dueDate: '2026-08-28',
    notes: 'Class fee due',
  },
]

export function FeeManagementPanel() {
  const storeStudents = useStudentsStore((s) => s.students)
  const [fees, setFees] = useState<StudentFeeRecord[]>(REAL_EXCEL_FEES)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | FeePaymentStatus>('ALL')

  // Students list for Fee Creation
  const [students, setStudents] = useState<Array<{ id: string; name: string; email?: string; phone?: string; studentId?: string }>>([])

  const allStudents = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email?: string; phone?: string; studentId?: string }>()

    students.forEach((s) => map.set(s.id, s))

    storeStudents.forEach((s) => {
      if (!map.has(s.id)) {
        map.set(s.id, { id: s.id, name: s.name, email: s.email, phone: s.phone, studentId: s.studentId })
      }
    })

    seedStudents.forEach((s) => {
      if (!map.has(s.id)) {
        map.set(s.id, { id: s.id, name: s.name, email: s.email, phone: s.phone, studentId: s.studentId })
      }
    })

    return Array.from(map.values())
  }, [students, storeStudents])

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [feeCategory, setFeeCategory] = useState('Class Fee')
  const [totalAmountInput, setTotalAmountInput] = useState('12000')
  const [paidAmountInput, setPaidAmountInput] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [notesInput, setNotesInput] = useState('')
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false)

  // Edit Modal State
  const [editRecord, setEditRecord] = useState<StudentFeeRecord | null>(null)
  const [newTotalAmount, setNewTotalAmount] = useState<number>(0)
  const [newPaidAmount, setNewPaidAmount] = useState<number>(0)
  const [newStatus, setNewStatus] = useState<FeePaymentStatus>('FULL_PAID')
  const [updateNotes, setUpdateNotes] = useState('')

  // Mail Modal State
  const [mailRecord, setMailRecord] = useState<StudentFeeRecord | null>(null)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [isSendingMail, setIsSendingMail] = useState(false)

  const fetchFees = async () => {
    try {
      const res = await api.get<{ data: StudentFeeRecord[] }>('/payments')
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        setFees(res.data)
      }
    } catch {
      // Fallback to real Excel payments
    }
  }

  // Fetch students for Fee creation modal
  const fetchStudents = async () => {
    try {
      const res = await api.get<any>('/students?limit=500')
      let list: any[] = []

      if (Array.isArray(res.data)) {
        list = res.data
      } else if (res.data && Array.isArray(res.data.students)) {
        list = res.data.students
      } else if (res.students && Array.isArray(res.students)) {
        list = res.students
      }

      if (list.length > 0) {
        setStudents(
          list.map((s) => ({
            id: s.id,
            name: `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.name || 'Unknown Student',
            email: s.email || '',
            phone: s.phone || '',
            studentId: s.studentId || s.id,
          }))
        )
      }
    } catch {
      // Fallback sample list
    }
  }

  useEffect(() => {
    fetchFees()
    fetchStudents()
  }, [])

  // Computed Statistics
  const stats = useMemo(() => {
    const totalCollected = fees.reduce((acc, f) => acc + (f.paidAmount || 0), 0)
    const totalDue = fees.reduce((acc, f) => acc + (f.dueAmount || 0), 0)
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
    setNewTotalAmount(record.totalAmount)
    setNewPaidAmount(record.paidAmount)
    setNewStatus(record.status)
    setUpdateNotes(record.notes || '')
  }

  // Handle Fee Status Update
  async function handleSaveFeeStatus() {
    if (!editRecord) return
    const total = Math.max(0, Number(newTotalAmount))
    const paid = Math.min(Math.max(0, Number(newPaidAmount)), total)
    const due = Math.max(0, total - paid)

    let finalStatus: FeePaymentStatus = newStatus
    if (paid >= total && total > 0) {
      finalStatus = 'FULL_PAID'
    } else if (paid > 0 && paid < total) {
      finalStatus = 'DUE'
    } else if (paid === 0) {
      finalStatus = 'UNPAID'
    }

    try {
      await api.patch(`/payments/${editRecord.id}`, {
        totalAmount: total,
        paidAmount: paid,
        status: finalStatus,
        notes: updateNotes,
      })
    } catch {
      // Local fallback
    }

    setFees((prev) =>
      prev.map((f) =>
        f.id === editRecord.id
          ? {
              ...f,
              totalAmount: total,
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

  // Handle Create New Fee Record
  async function handleCreateFeeRecord() {
    if (!selectedStudentId) {
      toast.error('Please select a student')
      return
    }

    const total = Number(totalAmountInput) || 0
    const paid = Number(paidAmountInput) || 0
    const due = Math.max(0, total - paid)
    const targetStudent = allStudents.find((s) => s.id === selectedStudentId)

    setIsSubmittingCreate(true)

    try {
      const res = await api.post<{ data: StudentFeeRecord }>('/payments', {
        studentId: selectedStudentId,
        feeCategory,
        totalAmount: total,
        paidAmount: paid,
        paymentMethod,
        notes: notesInput,
      })

      if (res.data) {
        setFees((prev) => [res.data, ...prev])
      } else {
        throw new Error('Fallback create')
      }
    } catch {
      // Fallback local create
      let computedStatus: FeePaymentStatus = 'UNPAID'
      if (paid >= total) computedStatus = 'FULL_PAID'
      else if (paid > 0) computedStatus = 'DUE'

      const newRecord: StudentFeeRecord = {
        id: `fee-${Date.now()}`,
        studentId: selectedStudentId,
        studentName: targetStudent?.name || 'Selected Student',
        studentEmail: targetStudent?.email || 'N/A',
        studentPhone: 'N/A',
        feeCategory: feeCategory as any,
        totalAmount: total,
        paidAmount: paid,
        dueAmount: due,
        currency: 'NPR',
        status: computedStatus,
        dueDate: dayjs().add(15, 'days').format('YYYY-MM-DD'),
        notes: notesInput,
      }
      setFees((prev) => [newRecord, ...prev])
    } finally {
      setIsSubmittingCreate(false)
      setIsCreateOpen(false)
      toast.success('New student fee record created!')
    }
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
      await api.post(`/payments/${mailRecord.id}/remind`)
      setFees((prev) =>
        prev.map((f) =>
          f.id === mailRecord.id
            ? { ...f, lastReminderSentAt: dayjs().format('YYYY-MM-DD HH:mm') }
            : f
        )
      )

      toast.success(`Fee due reminder email sent to ${mailRecord.studentName}`)
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
              View due & fully paid student fees, record new payment collections, and dispatch email reminders.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8"
              onClick={() => setIsCreateOpen(true)}
            >
              <Plus className="size-3.5" />
              Add Student Fee
            </Button>
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
            <p className="text-[11px] font-medium text-muted-foreground">Fully Paid Accounts</p>
            <p className="mt-1 text-lg font-bold text-foreground">{stats.fullyPaidCount}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <p className="text-[11px] font-medium text-muted-foreground">Pending / Overdue Action</p>
            <p className="mt-1 text-lg font-bold text-rose-600">
              {stats.dueCount + stats.unpaidCount}
            </p>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
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

        {/* Fee Collection Roster Table */}
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
                  const isPaid = fee.status === 'FULL_PAID'
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

                          {!isPaid && (
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

      {/* CREATE STUDENT FEE MODAL */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
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
                placeholder="Search student by name, email, or phone..."
              />
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
            <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateFeeRecord} disabled={isSubmittingCreate}>
              {isSubmittingCreate ? 'Saving...' : 'Save Fee Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* UPDATE FEE STATUS MODAL */}
      {editRecord && (
        <Dialog open={!!editRecord} onOpenChange={() => setEditRecord(null)}>
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
                    value={newTotalAmount}
                    onChange={(e) => setNewTotalAmount(Number(e.target.value))}
                    className="h-9 text-xs font-semibold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">Amount Paid ({editRecord.currency})</label>
                  <Input
                    type="number"
                    value={newPaidAmount}
                    onChange={(e) => setNewPaidAmount(Number(e.target.value))}
                    className="h-9 text-xs font-semibold text-emerald-600"
                  />
                </div>
              </div>
              <p className="text-[11px] font-medium text-amber-600">
                Remaining Due: {editRecord.currency}{' '}
                {Math.max(0, Number(newTotalAmount) - Number(newPaidAmount)).toLocaleString()}
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Payment Status Override</label>
                <Select value={newStatus} onValueChange={(val) => setNewStatus(val as FeePaymentStatus)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
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

      {/* SEND FEE DUE EMAIL MODAL */}
      {mailRecord && (
        <Dialog open={!!mailRecord} onOpenChange={() => setMailRecord(null)}>
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
                  <p className="font-semibold text-rose-600">
                    {mailRecord.currency} {mailRecord.dueAmount.toLocaleString()}
                  </p>
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
