import { useMemo, useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
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
import { counselors, students } from '@/mock'
import { useAuthStore } from '@/store/auth-store'
import { visibleStudents } from '@/lib/data-visibility'
import { useFollowUpsStore } from '../store'
import { isMockMode } from '@/lib/api-client'
import { useCreateFollowUp } from '@/hooks/use-followups'
import type { FollowUp } from '@/types'

const channels: FollowUp['channel'][] = ['call', 'email', 'whatsapp', 'in_person', 'sms']
const priorities: FollowUp['priority'][] = ['low', 'medium', 'high', 'urgent']

interface FollowUpCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialStudentId?: string
}

export function FollowUpCreateDialog({ open, onOpenChange, initialStudentId }: FollowUpCreateDialogProps) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const addFollowUpMock = useFollowUpsStore((s) => s.addFollowUp)
  const createFollowUpApi = useCreateFollowUp()

  const availableStudents = useMemo(
    () => visibleStudents(currentUser, students),
    [currentUser],
  )

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
            placeholder="Search student by name or ID"
            emptyMessage="No students available"
          />

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
