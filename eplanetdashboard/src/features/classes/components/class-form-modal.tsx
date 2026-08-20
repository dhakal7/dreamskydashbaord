import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import type { ClassSession } from '@/types'

interface ClassFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: ClassSession | null
  onSubmit: (data: Partial<ClassSession>) => void
  isLoading?: boolean
}

export function ClassFormModal({
  open,
  onOpenChange,
  initialData,
  onSubmit,
  isLoading = false,
}: ClassFormModalProps) {
  const isEditing = !!initialData

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('IELTS')
  const [teacherName, setTeacherName] = useState('')
  const [schedule, setSchedule] = useState('')
  const [capacity, setCapacity] = useState('20')
  const [status, setStatus] = useState('ongoing')

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '')
      setSubject(initialData.subject || 'IELTS')
      setTeacherName(initialData.teacherName || '')
      setSchedule(initialData.schedule || '')
      setCapacity(String(initialData.capacity || 20))
      setStatus(initialData.status || 'ongoing')
    } else {
      setName('')
      setSubject('IELTS')
      setTeacherName('')
      setSchedule('Sun/Tue/Thu · 10:00 AM')
      setCapacity('20')
      setStatus('ongoing')
    }
  }, [initialData, open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    onSubmit({
      id: initialData?.id,
      name: name.trim(),
      subject: subject as any,
      teacherName: teacherName.trim() || 'Teacher',
      schedule: schedule.trim() || 'Sun/Tue/Thu · 10:00 AM',
      capacity: parseInt(capacity, 10) || 20,
      status: status as any,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Class' : 'Add New Class'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Class Name</label>
            <Input
              placeholder="e.g. IELTS Morning Batch A"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Subject</label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Subject" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IELTS">IELTS</SelectItem>
                  <SelectItem value="PTE">PTE</SelectItem>
                  <SelectItem value="TOEFL">TOEFL</SelectItem>
                  <SelectItem value="SAT">SAT</SelectItem>
                  <SelectItem value="Spoken English">Spoken English</SelectItem>
                  <SelectItem value="Duolingo">Duolingo</SelectItem>
                  <SelectItem value="Japanese">Japanese</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ongoing">Ongoing</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Assigned Teacher</label>
            <Input
              placeholder="e.g. Anup Rijal"
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Schedule</label>
              <Input
                placeholder="e.g. Sun/Tue/Thu · 7:00 AM"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Max Capacity</label>
              <Input
                type="number"
                min="1"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="pt-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isEditing ? 'Save Changes' : 'Create Class'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
