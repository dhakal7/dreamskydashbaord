import type { AttendanceRecord, ClassMaterial, ClassSession, Enrollment } from '@/types'
import { teachers } from './staff'
import { students } from './entities'
import { daysAgo, daysFromNow, pad, randInt } from './generators'

const classSeeds: Array<[string, ClassSession['subject'], string]> = [
  ['PTE Morning Batch (07:00-08:00 AM)', 'PTE', 'Sun-Fri · 7:00 AM - 8:00 AM'],
  ['PTE Morning Batch (08:00-09:00 AM)', 'PTE', 'Sun-Fri · 8:00 AM - 9:00 AM'],
  ['PTE Morning Batch (09:00-10:00 AM)', 'PTE', 'Sun-Fri · 9:00 AM - 10:00 AM'],
  ['IELTS Morning Batch (07:00-08:00 AM)', 'IELTS', 'Sun-Fri · 7:00 AM - 8:00 AM'],
  ['IELTS Morning Batch (08:00-09:00 AM)', 'IELTS', 'Sun-Fri · 8:00 AM - 9:00 AM'],
  ['IELTS Morning Batch (09:00-10:00 AM)', 'IELTS', 'Sun-Fri · 9:00 AM - 10:00 AM'],
]

export const classes: ClassSession[] = classSeeds.map(([name, subject, schedule], i) => {
  const teacher = teachers[0] // EPT Instructor handles all class batches
  const status: ClassSession['status'] = i < 4 ? 'ongoing' : i < 5 ? 'upcoming' : 'completed'
  const capacity = randInt(15, 25)
  return {
    id: `cls-${pad(i + 1, 2)}`,
    name,
    subject,
    teacherId: teacher.id,
    teacherName: teacher.name,
    schedule,
    startDate: status === 'upcoming' ? daysFromNow(randInt(3, 20)) : daysAgo(randInt(10, 60)),
    endDate: status === 'completed' ? daysAgo(randInt(1, 8)) : daysFromNow(randInt(20, 70)),
    room: `Room ${randInt(1, 4)}`,
    capacity,
    enrolledCount: status === 'upcoming' ? randInt(4, 12) : randInt(12, capacity),
    status,
    nextSessionAt: status === 'ongoing' ? daysFromNow(randInt(0, 3)) : daysFromNow(randInt(3, 20)),
  }
})

export const enrollments: Enrollment[] = classes.flatMap((cls, classIdx) => {
  const chunkSize = Math.floor(students.length / classes.length)
  const startIdx = classIdx * chunkSize
  const roster = students.slice(startIdx, startIdx + chunkSize)
  cls.enrolledCount = roster.length

  return roster.map((s, i) => ({
    id: `enr-${cls.id}-${pad(i + 1, 2)}`,
    classId: cls.id,
    studentId: s.id,
    studentName: s.name,
    enrolledAt: cls.startDate,
    progress: cls.status === 'completed' ? randInt(80, 100) : randInt(15, 90),
    attendancePct: randInt(60, 100),
  }))
})

export const attendanceRecords: AttendanceRecord[] = classes
  .filter((c) => c.status !== 'upcoming')
  .flatMap((cls) =>
    Array.from({ length: 5 }).map((_, i) => {
      const total = cls.enrolledCount
      const present = randInt(Math.max(1, total - 5), total)
      return {
        id: `att-${cls.id}-${i + 1}`,
        classId: cls.id,
        className: cls.name,
        date: daysAgo(i * 3),
        presentCount: present,
        absentCount: total - present,
        totalCount: total,
      }
    })
  )

export const classMaterials: ClassMaterial[] = classes.flatMap((cls, ci) =>
  [0, 1].map((i) => ({
    id: `mat-${cls.id}-${i + 1}`,
    classId: cls.id,
    title: i === 0 ? `${cls.subject} Practice Set ${ci + 1}` : `${cls.subject} Mock Test ${ci + 1}`,
    type: (i === 0 ? 'material' : 'assignment') as ClassMaterial['type'],
    uploadedAt: daysAgo(randInt(1, 20)),
    dueDate: i === 1 ? daysFromNow(randInt(2, 10)) : undefined,
  }))
)
