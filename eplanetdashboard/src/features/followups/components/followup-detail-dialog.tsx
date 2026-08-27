import { useState, useEffect } from 'react'
import { CalendarClock, CheckCircle, Clock, FileText, Phone, MessageSquare, Mail, User, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PriorityBadge, FollowUpStatusBadge } from '@/components/shared/status-badges'
import { useFollowUpsStore } from '../store'
import type { FollowUp } from '@/types'

const channelIcons = {
  call: Phone,
  email: Mail,
  whatsapp: MessageSquare,
  in_person: User,
  sms: MessageSquare,
}

interface FollowUpDetailDialogProps {
  followup: FollowUp | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FollowUpDetailDialog({
  followup,
  open,
  onOpenChange,
}: FollowUpDetailDialogProps) {
  const markComplete = useFollowUpsStore((s) => s.markComplete)
  const reschedule = useFollowUpsStore((s) => s.reschedule)
  const addNote = useFollowUpsStore((s) => s.addNote)
  const removeFollowUp = useFollowUpsStore((s) => s.removeFollowUp)

  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')
  const [isRescheduling, setIsRescheduling] = useState(false)

  useEffect(() => {
    if (followup) {
      setDate(followup.date)
      setTime(followup.time)
      setNotes(followup.notes || '')
      setIsRescheduling(false)
    }
  }, [followup])

  if (!followup) return null

  const ChannelIcon = channelIcons[followup.channel] || Phone

  const handleMarkComplete = () => {
    markComplete(followup.id)
    onOpenChange(false)
  }

  const handleReschedule = (e: React.FormEvent) => {
    e.preventDefault()
    if (!date || !time) return
    reschedule(followup.id, date, time)
    setIsRescheduling(false)
  }

  const handleSaveNotes = () => {
    addNote(followup.id, notes)
  }

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete this follow-up for "${followup.studentName}"?`)) {
      removeFollowUp(followup.id)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-5 overflow-hidden">
        <DialogHeader className="pb-2 border-b border-border/60">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            <CalendarClock className="size-3.5" /> Follow-up Details
          </div>
          <DialogTitle className="mt-1 text-lg font-bold text-foreground">
            {followup.reminder}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            Student: <span className="font-semibold text-foreground">{followup.studentName}</span> (ID: {followup.studentId})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-[13px]">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-3 bg-secondary/30 rounded-xl p-3.5 border border-border/50">
            <div>
              <p className="text-xs text-muted-foreground">Counselor</p>
              <p className="mt-0.5 font-medium text-foreground">{followup.counselorName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Channel</p>
              <div className="mt-0.5 flex items-center gap-1.5 font-medium text-foreground capitalize">
                <ChannelIcon className="size-3.5 text-muted-foreground" />
                {followup.channel.replace('_', ' ')}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Due Date</p>
              <p className="mt-0.5 font-medium text-foreground font-tabular">{followup.date} at {followup.time}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Priority / Status</p>
              <div className="mt-0.5 flex items-center gap-2">
                <PriorityBadge priority={followup.priority} />
                <FollowUpStatusBadge status={followup.status} />
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            {followup.status !== 'completed' && (
              <Button
                variant="default"
                size="sm"
                className="flex-1 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleMarkComplete}
              >
                <CheckCircle className="size-3.5" /> Mark Completed
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs gap-1.5"
              onClick={() => setIsRescheduling(!isRescheduling)}
            >
              <Clock className="size-3.5" /> {isRescheduling ? 'Cancel Reschedule' : 'Reschedule'}
            </Button>
          </div>

          {/* Reschedule Form */}
          {isRescheduling && (
            <form onSubmit={handleReschedule} className="bg-secondary/40 rounded-xl p-3 border border-border/60 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">New Date</label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1 h-9 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">New Time</label>
                  <Input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="mt-1 h-9 text-xs"
                    required
                  />
                </div>
              </div>
              <Button type="submit" size="sm" className="w-full text-xs mt-1">
                Confirm Reschedule
              </Button>
            </form>
          )}

          {/* Notes Section */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FileText className="size-3.5 text-muted-foreground" /> Counselor Notes
            </label>
            <textarea
              className="w-full min-h-[80px] rounded-lg border border-border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Add follow-up notes here..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-red-600 hover:bg-red-50 hover:text-red-700 gap-1 h-8"
                onClick={handleDelete}
              >
                <Trash2 className="size-3.5" /> Delete Follow-up
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="text-xs"
                onClick={handleSaveNotes}
                disabled={notes === (followup.notes || '')}
              >
                Save Notes
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
