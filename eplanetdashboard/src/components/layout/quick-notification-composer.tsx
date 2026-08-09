import { useMemo, useState } from 'react'
import { BellRing, Users, UserRound, UserPlus, SendHorizonal } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { SearchableStudentPicker } from '@/components/shared/searchable-student-picker'
import { useAuthStore } from '@/store/auth-store'
import { useStudentsStore } from '@/features/students/store'
import { useNotificationsStore } from '@/store/notifications-store'
import { visibleStudents } from '@/lib/data-visibility'
import type { AppNotification } from '@/types'

const notificationTypes: Array<{ value: AppNotification['type']; label: string }> = [
  { value: 'fee_due', label: 'Fee Due' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'application', label: 'Application' },
  { value: 'visa', label: 'Visa' },
  { value: 'document', label: 'Document' },
  { value: 'system', label: 'System' },
]

type RecipientScope = 'all_students' | 'staff_only' | 'individual'

export function QuickNotificationComposer() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const addNotification = useNotificationsStore((s) => s.addNotification)
  const allStudents = useStudentsStore((s) => s.students)

  const availableStudents = useMemo(
    () => visibleStudents(currentUser, allStudents),
    [currentUser, allStudents],
  )

  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<RecipientScope>('all_students')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [type, setType] = useState<AppNotification['type']>('fee_due')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const resetForm = () => {
    setScope('all_students')
    setSelectedStudentId('')
    setType('fee_due')
    setTitle('')
    setDescription('')
    setSendEmail(true)
  }

  const handleSend = () => {
    if (!title.trim() || !description.trim()) return

    setIsSubmitting(true)

    const basePayload = {
      title: title.trim(),
      description: description.trim(),
      type,
      read: false,
    }

    if (scope === 'all_students') {
      addNotification({
        ...basePayload,
        targetScope: 'all_students',
        recipientCount: availableStudents.length,
        recipientEmails: availableStudents.map((student) => student.email).filter(Boolean),
        sendEmail,
      })
    } else if (scope === 'staff_only') {
      addNotification({
        ...basePayload,
        targetScope: 'staff_only',
        recipientCount: 1,
        recipientEmails: currentUser?.email ? [currentUser.email] : [],
        sendEmail,
      })
    } else if (scope === 'individual' && selectedStudentId) {
      const student = availableStudents.find((item) => item.id === selectedStudentId)
      if (student) {
        addNotification({
          ...basePayload,
          targetScope: 'individual',
          recipientCount: 1,
          recipientIds: [student.id],
          recipientEmails: student.email ? [student.email] : [],
          sendEmail,
        })
      }
    }

    setIsSubmitting(false)
    setOpen(false)
    resetForm()
  }

  const canSend = Boolean(title.trim() && description.trim() && (scope !== 'individual' || selectedStudentId))
  const scopeLabel = scope === 'all_students'
    ? 'All students'
    : scope === 'staff_only'
      ? 'Only staff'
      : 'Individual student'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="flex w-full items-center gap-2.5 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-2.5 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10"
        >
          <BellRing className="size-4 shrink-0" />
          <span>Quick Notify</span>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send a Notification</DialogTitle>
          <DialogDescription>
            Notify the selected audience with a fee reminder, follow-up, or other update.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Send to</label>
            <Select value={scope} onValueChange={(value) => setScope(value as RecipientScope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_students">All students</SelectItem>
                <SelectItem value="staff_only">Only staff</SelectItem>
                <SelectItem value="individual">Individual student</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === 'individual' && (
            <SearchableStudentPicker
              label="Select student"
              students={availableStudents}
              value={selectedStudentId}
              onChange={setSelectedStudentId}
            />
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Notification type</label>
            <Select value={type} onValueChange={(value) => setType(value as AppNotification['type'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {notificationTypes.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <Input
              placeholder="e.g. Fee payment reminder"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Input
              placeholder="e.g. Your fee is due next week."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            <Checkbox id="send-email-also" checked={sendEmail} onCheckedChange={(checked) => setSendEmail(Boolean(checked))} />
            <label htmlFor="send-email-also" className="cursor-pointer text-sm">Also send by email</label>
          </div>

          <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              {scope === 'all_students' ? <Users className="size-4" /> : scope === 'staff_only' ? <UserPlus className="size-4" /> : <UserRound className="size-4" />}
              <span>Audience: {scopeLabel}</span>
            </div>
            {(scope === 'all_students' || scope === 'individual') && (
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="secondary">{scope === 'all_students' ? availableStudents.length : 1} recipient{scope === 'all_students' && availableStudents.length !== 1 ? 's' : ''}</Badge>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!canSend || isSubmitting}>
            <SendHorizonal className="mr-2 size-4" />
            {isSubmitting ? 'Sending...' : 'Send Notification'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
