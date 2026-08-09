import { useState, useEffect } from 'react'
import { CalendarClock, CheckCircle, Clock, FileText, Phone, MessageSquare, Mail, User } from 'lucide-react'
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
              <p className="text-xs text-muted-foreground">Priority</p>
              <div className="mt-1">
                <PriorityBadge priority={followup.priority} />
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <div className="mt-1">
                <FollowUpStatusBadge status={followup.status} />
              </div>
            </div>
            <div className="col-span-2 border-t border-border/40 pt-2.5 mt-1 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Scheduled Date</p>
                <p className="mt-0.5 font-medium text-foreground font-tabular">{followup.date}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Scheduled Time</p>
                <p className="mt-0.5 font-medium text-foreground font-tabular">{followup.time}</p>
              </div>
            </div>
          </div>

          {/* Quick Actions (e.g. Mark Complete) */}
          {followup.status !== 'completed' && (
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                className="flex-1 font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleMarkComplete}
              >
                <CheckCircle className="size-4 mr-1.5" /> Mark Completed
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsRescheduling(!isRescheduling)}
              >
                <Clock className="size-4 mr-1.5" /> {isRescheduling ? 'Cancel Reschedule' : 'Reschedule'}
              </Button>
            </div>
          )}

          {/* Reschedule Form */}
          {isRescheduling && (
            <form onSubmit={handleReschedule} className="space-y-3 border border-border/80 rounded-xl p-3.5 bg-background shadow-inner">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="size-3.5 text-primary" /> Reschedule Follow-up
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] text-muted-foreground">New Date</label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1 h-9 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">New Time</label>
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
            <div className="flex justify-end">
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
