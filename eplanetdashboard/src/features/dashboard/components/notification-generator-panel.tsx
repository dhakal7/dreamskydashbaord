import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { SearchableStudentMultiPicker } from '@/components/shared/searchable-student-picker'
import { Bell, X } from 'lucide-react'
import { useStudentsStore } from '@/features/students/store'
import { useAuthStore } from '@/store/auth-store'
import { useNotificationsStore } from '@/store/notifications-store'
import { visibleStudents } from '@/lib/data-visibility'
import type { AppNotification } from '@/types'

const notificationTypes: Array<{ value: AppNotification['type']; label: string }> = [
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'application', label: 'Application' },
  { value: 'visa', label: 'Visa' },
  { value: 'document', label: 'Document' },
  { value: 'fee_due', label: 'Fee Due' },
  { value: 'system', label: 'System' },
]

export function NotificationGeneratorPanel() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const allStudents = useStudentsStore((s) => s.students)
  const addNotification = useNotificationsStore((s) => s.addNotification)

  // Get students visible to current user
  const availableStudents = useMemo(
    () => visibleStudents(currentUser, allStudents),
    [currentUser, allStudents],
  )

  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [notificationType, setNotificationType] = useState<AppNotification['type']>('follow_up')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const selectedStudents = availableStudents.filter((s) => selectedStudentIds.includes(s.id))

  const handleRemoveStudent = (studentId: string) => {
    setSelectedStudentIds((prev) => prev.filter((id) => id !== studentId))
  }

  const handleSend = async () => {
    if (!title.trim() || !description.trim() || selectedStudentIds.length === 0) {
      return
    }

    setIsSubmitting(true)

    // Send notification to each selected student
    selectedStudentIds.forEach((studentId) => {
      const student = availableStudents.find((item) => item.id === studentId)
      addNotification({
        title,
        description,
        type: notificationType,
        read: false,
        recipientIds: [studentId],
        recipientEmails: student?.email ? [student.email] : [],
        sendEmail,
      })
    })

    // Reset form
    setTitle('')
    setDescription('')
    setSelectedStudentIds([])
    setNotificationType('follow_up')
    setSendEmail(true)
    setIsSubmitting(false)
  }

  const canSend = title.trim() && description.trim() && selectedStudentIds.length > 0

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4.5" />
          Send Notification
        </CardTitle>
        <CardDescription>Create and send notifications to students</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Notification Type */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Notification Type</label>
          <Select value={notificationType} onValueChange={(value) => setNotificationType(value as AppNotification['type'])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {notificationTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <Input
            placeholder="e.g., Fee payment due"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <Input
            placeholder="e.g., Your tuition fee is due by March 31st"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Student Selector */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Select Students ({selectedStudentIds.length})
          </label>
          <SearchableStudentMultiPicker
            students={availableStudents}
            values={selectedStudentIds}
            onChange={setSelectedStudentIds}
            placeholder="Search student by name or ID"
          />
        </div>

        {/* Selected Students */}
        {selectedStudents.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Recipients ({selectedStudents.length})
            </label>
            <div className="flex flex-wrap gap-2">
              {selectedStudents.map((student) => (
                <Badge key={student.id} variant="secondary" className="gap-1 pl-2.5">
                  {student.name}
                  <button
                    onClick={() => handleRemoveStudent(student.id)}
                    className="ml-1 hover:text-muted-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <Checkbox id="notify-email-toggle" checked={sendEmail} onCheckedChange={(checked) => setSendEmail(Boolean(checked))} />
          <label htmlFor="notify-email-toggle" className="cursor-pointer text-sm">Also send by email</label>
        </div>

        {/* Send Button */}
        <Button
          onClick={handleSend}
          disabled={!canSend || isSubmitting}
          className="w-full"
        >
          {isSubmitting ? 'Sending...' : 'Send Notification'}
        </Button>
      </CardContent>
    </Card>
  )
}
