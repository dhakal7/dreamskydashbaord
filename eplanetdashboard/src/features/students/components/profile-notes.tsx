import { useState } from 'react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { ChevronDown, ChevronRight, Send } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PersonAvatar } from '@/components/ui/avatar'
import { useAuthStore } from '@/store/auth-store'
import { hasPermission } from '@/lib/rbac'
import { useProfileNotesStore } from '../profile-notes-store'
import type { ProfileNote, ProfileNoteCategory } from '../profile-notes-store'

dayjs.extend(relativeTime)

const categoryMeta: Record<ProfileNoteCategory, { label: string; variant: 'warning' | 'default' | 'secondary' }> = {
  document: { label: 'Document Issue', variant: 'warning' },
  follow_up: { label: 'Follow-up', variant: 'secondary' },
  general: { label: 'General', variant: 'default' },
}

export function ProfileNotes({ studentId }: { studentId: string }) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { notes, addNote } = useProfileNotesStore()

  const [expanded, setExpanded] = useState(false)
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState<ProfileNoteCategory>('general')

  const studentNotes = notes
    .filter((n) => n.studentId === studentId)
    .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())

  const canPost = hasPermission(currentUser.role, 'documents.manage')

  const handlePost = () => {
    const msg = message.trim()
    if (!msg) return
    addNote(studentId, currentUser.name, currentUser.role, msg, category)
    setMessage('')
  }

  return (
    <Card>
      <CardHeader
        className="flex-row items-center justify-between gap-2 cursor-pointer select-none py-3 px-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold">Notes & Comments</CardTitle>
          {studentNotes.length > 0 && (
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
              {studentNotes.length}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" className="size-6 text-muted-foreground">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </Button>
      </CardHeader>

      {expanded && (
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          {/* Compose area */}
          {canPost && (
            <div className="space-y-2">
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setCategory('general')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    category === 'general'
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  General
                </button>
                <button
                  type="button"
                  onClick={() => setCategory('document')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    category === 'document'
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Document Issue
                </button>
                <button
                  type="button"
                  onClick={() => setCategory('follow_up')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    category === 'follow_up'
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Follow-up
                </button>
              </div>
              <textarea
                placeholder="Write a note..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={handlePost}
                  disabled={!message.trim()}
                >
                  <Send className="size-3.5" />
                  Post
                </Button>
              </div>
            </div>
          )}

          {/* Notes list */}
          {studentNotes.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 italic">
              {canPost ? 'No notes yet. Post the first note above.' : 'No notes.'}
            </p>
          ) : (
            <div className="space-y-2">
              {studentNotes.map((note) => (
                <NoteCard key={note.id} note={note} />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function NoteCard({ note }: { note: ProfileNote }) {
  const meta = categoryMeta[note.category]
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <PersonAvatar name={note.authorName} className="size-6 shrink-0 text-[10px]" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-medium">{note.authorName}</span>
              <Badge variant="secondary" className="text-[9px] py-0 px-1 leading-none capitalize">
                {note.authorRole.replace('_', ' ')}
              </Badge>
              <Badge variant={meta.variant} className="text-[9px] py-0 px-1 leading-none">
                {meta.label}
              </Badge>
            </div>
            <span className="text-[10px] text-muted-foreground">{dayjs(note.createdAt).fromNow()}</span>
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-foreground/80 whitespace-pre-wrap">{note.message}</p>
    </div>
  )
}
