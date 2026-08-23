import { useState } from 'react'
import { ClipboardCheck, MessageSquareText, Plus, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAttendanceStore } from '../attendance-store'
import { useClassStudentNotesStore } from '../class-student-notes-store'
import { useAuthStore } from '@/store/auth-store'
import dayjs from 'dayjs'

interface StudentClassProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  studentId: string
  studentName: string
  classId: string
  className: string
}

export function StudentClassProfileDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  classId,
  className,
}: StudentClassProfileDialogProps) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const studentPresence = useAttendanceStore((s) => s.studentPresence)
  const attendanceRecords = useAttendanceStore((s) => s.attendanceRecords)
  const { addNote, getNotesForStudentInClass } = useClassStudentNotesStore()

  const [newNoteMessage, setNewNoteMessage] = useState('')
  const [newNoteType, setNewNoteType] = useState<string>('general')

  // Get attendance history for this class
  const classAttendanceRecords = attendanceRecords
    .filter((a) => a.classId === classId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Build attendance history for this specific student
  const studentAttendanceHistory = classAttendanceRecords.map((record) => {
    const sessionKey = `${classId}-${record.date}`
    const sessionPresence = studentPresence[sessionKey]
    const isPresent = sessionPresence?.[studentId] ?? null
    return {
      date: record.date,
      present: isPresent,
    }
  })

  // Get notes for this student in this class
  const studentNotes = getNotesForStudentInClass(studentId, classId)

  const handleAddNote = () => {
    if (!newNoteMessage.trim()) return
    addNote({
      classId,
      studentId,
      authorName: currentUser?.name || 'Staff User',
      message: newNoteMessage.trim(),
      type: newNoteType as 'test_result' | 'general',
    })
    setNewNoteMessage('')
    setNewNoteType('general')
  }

  const avatarLetter = studentName.charAt(0).toUpperCase()
  const presentCount = studentAttendanceHistory.filter((a) => a.present === true).length
  const totalCount = studentAttendanceHistory.filter((a) => a.present !== null).length
  const attendancePct = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {avatarLetter}
            </div>
            <div>
              <span>{studentName}</span>
              <p className="text-xs font-normal text-muted-foreground">{className}</p>
            </div>
          </DialogTitle>
          <DialogDescription>Student profile for this class</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── Attendance History ── */}
          <div>
            <h4 className="flex items-center gap-1.5 text-sm font-semibold mb-2">
              <ClipboardCheck className="size-4 text-muted-foreground" />
              Attendance History
            </h4>
            {totalCount > 0 && (
              <p className="text-xs text-muted-foreground mb-2">
                {presentCount}/{totalCount} sessions present ({attendancePct}%)
              </p>
            )}
            {studentAttendanceHistory.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No attendance records yet.</p>
            ) : (
              <div className="space-y-1.5">
                {studentAttendanceHistory.map((entry) => (
                  <div
                    key={entry.date}
                    className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2"
                  >
                    <span className="text-xs text-muted-foreground">
                      {dayjs(entry.date).format('MMM D, YYYY')}
                    </span>
                    {entry.present === null ? (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    ) : entry.present ? (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <Check className="size-3.5" /> Present
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-red-600">
                        <X className="size-3.5" /> Absent
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Teacher Notes ── */}
          <div>
            <h4 className="flex items-center gap-1.5 text-sm font-semibold mb-2">
              <MessageSquareText className="size-4 text-muted-foreground" />
              Teacher Notes
            </h4>

            {studentNotes.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No notes yet.</p>
            ) : (
              <ScrollArea className="max-h-48">
                <div className="space-y-2">
                  {studentNotes.map((note) => (
                    <div key={note.id} className="rounded-lg border border-border/70 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={note.type === 'test_result' ? 'default' : 'secondary'}
                            className="text-[10px] py-0"
                          >
                            {note.type === 'test_result' ? 'Test Result' : 'General'}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">{note.authorName}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {dayjs(note.createdAt).format('MMM D, h:mm A')}
                        </span>
                      </div>
                      <p className="text-xs">{note.message}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {/* ── Add Note Form ── */}
            <div className="mt-3 space-y-2 rounded-lg border border-border/70 p-3">
              <div className="flex items-center gap-2">
                <Select value={newNoteType} onValueChange={(v: 'test_result' | 'general') => setNewNoteType(v)}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="test_result">Test Result</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <textarea
                placeholder="Write a note..."
                value={newNoteMessage}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewNoteMessage(e.target.value)}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddNote}
                  disabled={!newNoteMessage.trim()}
                  className="gap-1"
                >
                  <Plus className="size-3.5" />
                  Add Note
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
