import { useMemo, useState, useEffect } from 'react'
import { Plus, Mail, Phone } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchableStudentPicker } from '@/components/shared/searchable-student-picker'
import { useAuthStore } from '@/store/auth-store'
import { useFollowUpsStore } from '../store'
import { isMockMode } from '@/lib/api-client'
import { useCreateFollowUp } from '@/hooks/use-followups'
import { useStudents, useStudent } from '@/hooks/use-students'
import { useStudentsStore } from '@/features/students/store'
import { canViewStudent } from '@/lib/data-visibility'
import { useUsersStore } from '@/features/users/store'
import { counselors as mockCounselors } from '@/mock'
import type { FollowUp } from '@/types'

const channels: FollowUp['channel'][] = ['call', 'email', 'whatsapp', 'in_person', 'sms']
const priorities: FollowUp['priority'][] = ['low', 'medium', 'high', 'urgent']

interface FollowUpCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialStudentId?: string
}

// ── Debounce helper ───────────────────────────────────────────────────────────
function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export function FollowUpCreateDialog({ open, onOpenChange, initialStudentId }: FollowUpCreateDialogProps) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const addFollowUpMock = useFollowUpsStore((s) => s.addFollowUp)
  const createFollowUpApi = useCreateFollowUp()

  // ── Live students (server-side searchable) ──────────────────────────────
  const [studentSearch, setStudentSearch] = useState('')
  const debouncedSearch = useDebouncedValue(studentSearch.trim(), 300)
  const { data: apiStudentData, isLoading: isLoadingStudents, isError: isErrorStudents } = useStudents(
    isMockMode() ? { limit: 500 } : { limit: 50, search: debouncedSearch || undefined, stageIn: 'LEAD,PROSPECT,ENROLLED,APPLIED,OFFER_RECEIVED,VISA_APPLIED,VISA_APPROVED,DEPARTED,LOST' }
  )
  const mockStudents = useStudentsStore((s) => s.students)
  const { data: initialStudent } = useStudent(initialStudentId ?? '')

  const availableStudents = useMemo(() => {
    if (!isMockMode()) {
      const mapped = (apiStudentData?.students ?? []).map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        studentId: s.id.length > 12 ? `STU-${s.id.slice(-6).toUpperCase()}` : s.id,
        email: s.email,
        phone: s.phone ?? undefined,
      }))
      if (initialStudentId && initialStudent && !mapped.some((s) => s.id === initialStudentId)) {
        mapped.unshift({
          id: initialStudent.id,
          name: `${initialStudent.firstName} ${initialStudent.lastName}`.trim(),
          studentId: initialStudent.id.length > 12 ? `STU-${initialStudent.id.slice(-6).toUpperCase()}` : initialStudent.id,
          email: initialStudent.email,
          phone: initialStudent.phone ?? undefined,
        })
      }
      return mapped
    }
    return mockStudents
      .filter((s) => canViewStudent(currentUser, s))
      .filter((s) => {
        const q = debouncedSearch.toLowerCase()
        if (!q) return true
        return `${s.name} ${s.studentId} ${s.email} ${s.phone}`.toLowerCase().includes(q)
      })
      .map((s) => ({
        id: s.id,
        name: s.name,
        studentId: s.studentId,
        email: s.email,
        phone: s.phone,
      }))
  }, [apiStudentData, mockStudents, currentUser, debouncedSearch, initialStudent, initialStudentId])

  // ── Counselors (live from users API or mock) ────────────────────────────
  const users = useUsersStore((s) => s.users)
  const fetchUsers = useUsersStore((s) => s.fetchUsers)
  const counselors = useMemo(() => {
    if (!isMockMode()) {
      return users
        .filter((u) => u.role === 'counselor' || u.role === 'super_admin' || u.role === 'front_desk')
        .map((u) => ({ id: u.id, name: u.name, email: u.email }))
    }
    return mockCounselors.map((c) => ({ id: c.id, name: c.name, email: c.email }))
  }, [users])

  useEffect(() => {
    if (open && !isMockMode()) {
      fetchUsers()
    }
  }, [open, fetchUsers])

  const [studentId, setStudentId] = useState('')
  const [counselorId, setCounselorId] = useState('')
  const [reminder, setReminder] = useState('')
  const [priority, setPriority] = useState<FollowUp['priority']>('medium')
  const [channel, setChannel] = useState<FollowUp['channel']>('call')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:30')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (currentUser.role === 'counselor') {
      setCounselorId(currentUser.linkedId)
    } else if (!counselorId && counselors.length > 0) {
      setCounselorId(counselors[0].id)
    }
  }, [currentUser, counselorId])

  useEffect(() => {
    if (open) {
      const now = new Date()
      const defaultDate = now.toISOString().slice(0, 10)
      const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(Math.ceil(now.getMinutes() / 15) * 15).padStart(2, '0')}`
      setDate(defaultDate)
      setTime(defaultTime === '24:00' ? '23:45' : defaultTime)
      if (initialStudentId && availableStudents.some((student) => student.id === initialStudentId)) {
        setStudentId(initialStudentId)
      }
    }
  }, [availableStudents, initialStudentId, open])

  const selectedStudent = availableStudents.find((student) => student.id === studentId)
  const selectedCounselor = counselors.find((c) => c.id === counselorId)

  const resetForm = () => {
    setStudentId('')
    setReminder('')
    setPriority('medium')
    setChannel('call')
    setDate(new Date().toISOString().slice(0, 10))
    setTime('09:30')
    setNotes('')
    if (currentUser.role !== 'counselor' && counselors.length > 0) {
      setCounselorId(counselors[0].id)
    }
  }

  const handleCreate = () => {
    if (!studentId || !reminder.trim() || !date || !time) return

    const nextFollowUpAt = `${date}T${time}:00`

    if (!isMockMode()) {
      createFollowUpApi.mutate(
        {
          studentId,
          channel: channel.toUpperCase(),
          direction: 'OUTBOUND',
          content: reminder.trim(),
          nextFollowUpAt,
        },
        {
          onSuccess: () => {
            onOpenChange(false)
            resetForm()
          },
        }
      )
      return
    }

    // Mock mode: write to Zustand store
    if (!selectedStudent || !selectedCounselor) return
    addFollowUpMock({
      studentId: selectedStudent.id,
      studentName: selectedStudent.name,
      counselorId: selectedCounselor.id,
      counselorName: selectedCounselor.name,
      reminder: reminder.trim(),
      priority,
      date,
      time,
      channel,
      notes: notes.trim() || undefined,
    })
    onOpenChange(false)
    resetForm()
  }

  const canCreate = Boolean(studentId && counselorId && reminder.trim() && date && time)

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) { onOpenChange(value); resetForm() } else onOpenChange(value) }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Follow-up</DialogTitle>
          <DialogDescription>
            Schedule a new follow-up reminder for a student and assign it to a counselor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <SearchableStudentPicker
            label="Student"
            students={availableStudents}
            value={studentId}
            onChange={setStudentId}
            onSearchChange={setStudentSearch}
            searching={isMockMode() ? false : isLoadingStudents}
            placeholder={isLoadingStudents ? "Loading students..." : "Search student by name or ID"}
            emptyMessage={isErrorStudents ? "Failed to load students. Check your connection." : "No students available"}
          />
          {selectedStudent && (
            selectedStudent.email ? (
              <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 p-2.5 text-[11px] text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <Mail className="size-3.5 shrink-0 text-emerald-500" />
                <span>Automated follow-up notification will be emailed to <strong>{selectedStudent.email}</strong>.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md bg-amber-500/10 p-2.5 text-[11px] text-amber-700 dark:text-amber-300 border border-amber-500/20">
                <Phone className="size-3.5 shrink-0 text-amber-500" />
                <span><strong>No email registered:</strong> Frontdesk officer must manually call {selectedStudent.phone ? <strong>{selectedStudent.phone}</strong> : 'the student'} to remind about this follow-up.</span>
              </div>
            )
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Counselor</label>
            <Select value={counselorId} onValueChange={setCounselorId} disabled={currentUser.role === 'counselor'}>
              <SelectTrigger>
                <SelectValue placeholder="Select counselor" />
              </SelectTrigger>
              <SelectContent>
                {counselors.map((counselor) => (
                  <SelectItem key={counselor.id} value={counselor.id}>
                    {counselor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Reminder</label>
            <Input
              placeholder="What should the counselor follow up on?"
              value={reminder}
              onChange={(event) => setReminder(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Time</label>
              <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <Select value={priority} onValueChange={(value) => setPriority(value as FollowUp['priority'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((item) => (
                    <SelectItem key={item} value={item} className="capitalize">
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Channel</label>
              <Select value={channel} onValueChange={(value) => setChannel(value as FollowUp['channel'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {channels.map((item) => (
                    <SelectItem key={item} value={item} className="capitalize">
                      {item.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <Input
              placeholder="Any extra context for the counselor"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { onOpenChange(false); resetForm() }}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate}>
            <Plus className="size-4 mr-2" /> Create Follow-up
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
