import { useState, useEffect, useRef } from 'react'
import { Plus, AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useUniversitiesStore } from '@/features/universities/store'
import { useCoursesStore } from '../store'
import type { StudyLevel } from '@/types'

const levelLabels: Record<StudyLevel, string> = {
  bachelor: 'Bachelor',
  master: 'Master',
  diploma: 'Diploma',
  foundation: 'Foundation',
  phd: 'PhD',
}

// Normalize API/DB level strings to lowercase StudyLevel keys.
// Handles both lowercase ('master') and uppercase DB enum values ('MASTER').
function normalizeLevel(raw: string | undefined): StudyLevel {
  const map: Record<string, StudyLevel> = {
    bachelor: 'bachelor', bachelors: 'bachelor', undergraduate: 'bachelor',
    master: 'master', masters: 'master', postgraduate: 'master', mba: 'master',
    diploma: 'diploma',
    foundation: 'foundation',
    phd: 'phd', doctorate: 'phd',
  }
  const normalized = map[(raw ?? '').toLowerCase().trim()]
  if (!normalized) {
    console.warn(`[CourseDialog] Unknown level value: "${raw}" — defaulting to 'bachelor'`)
  }
  return normalized ?? 'bachelor'
}

interface CourseDialogProps {
  course: {
    id: string
    name: string
    universityId: string
    level: StudyLevel
    duration: string
    intake: string[]
    tuitionUsd: number
    field: string
  } | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CourseDialog({ course, open, onOpenChange }: CourseDialogProps) {
  const universities = useUniversitiesStore((s) => s.universities)
  const addCourse = useCoursesStore((s) => s.addCourse)
  const updateCourse = useCoursesStore((s) => s.updateCourse)

  const [name, setName] = useState('')
  const [universityId, setUniversityId] = useState('')
  const [level, setLevel] = useState<StudyLevel>('bachelor')
  const [duration, setDuration] = useState('')
  const [intake, setIntake] = useState('')
  const [tuitionUsd, setTuitionUsd] = useState('')
  const [field, setField] = useState('')
  const [error, setError] = useState('')

  const isEditing = course !== null

  // Track whether the dialog was previously open so we only reset on
  // open→true transitions, not on every re-render caused by `universities`
  // refetching (which previously reset `level` back to 'bachelor').
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      // Dialog just opened — populate fields
      if (course) {
        setName(course.name)
        setUniversityId(course.universityId)
        setLevel(normalizeLevel(course.level))
        setDuration(course.duration)
        setIntake(course.intake.join(', '))
        setTuitionUsd(String(course.tuitionUsd))
        setField(course.field)
      } else {
        setName('')
        setUniversityId(universities[0]?.id || '')
        setLevel('bachelor')
        setDuration('')
        setIntake('')
        setTuitionUsd('')
        setField('')
      }
      setError('')
    }
    wasOpenRef.current = open
  }, [open, course, universities])

  function handleSubmit() {
    if (!name.trim()) {
      setError('Course name is required')
      return
    }
    const tuition = parseInt(tuitionUsd, 10)
    if (isNaN(tuition) || tuition < 0) {
      setError('Tuition must be a valid positive number')
      return
    }

    const intakeArr = intake.split(',').map((s) => s.trim()).filter(Boolean)

    if (isEditing && course) {
      updateCourse(course.id, {
        name: name.trim(),
        universityId,
        level,
        duration: duration.trim(),
        intake: intakeArr,
        tuitionUsd: tuition,
        field: field.trim(),
      })
    } else {
      addCourse({
        name: name.trim(),
        universityId,
        level,
        duration: duration.trim(),
        intake: intakeArr,
        tuitionUsd: tuition,
        field: field.trim(),
      })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Course' : 'Add Course'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Course Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Computer Science" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">University</label>
            <Select value={universityId} onValueChange={setUniversityId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {universities.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Level</label>
              <Select value={level} onValueChange={(v) => setLevel(v as StudyLevel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(levelLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Duration</label>
              <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 3-4 years" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Field of Study</label>
            <Input value={field} onChange={(e) => setField(e.target.value)} placeholder="e.g. Computer Science" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Tuition (USD/yr)</label>
            <Input type="number" min={0} value={tuitionUsd} onChange={(e) => setTuitionUsd(e.target.value)} placeholder="e.g. 24000" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Intakes (comma separated)</label>
            <Input value={intake} onChange={(e) => setIntake(e.target.value)} placeholder="e.g. Feb, Jul" />
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-xs text-danger-600">
              <AlertTriangle className="size-3" /> {error}
            </p>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit}>
            <Plus className="size-3.5 mr-1" />
            {isEditing ? 'Save Changes' : 'Add Course'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
