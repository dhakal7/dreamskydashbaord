import type { AttendanceRecord, ClassMaterial, ClassSession, Enrollment } from '@/types'
import { teachers } from './staff'
import { students } from './entities'
import { daysAgo, daysFromNow, pad, pickMany, randInt } from './generators'

const classSeeds: Array<[string, ClassSession['subject'], string]> = [
  ['IELTS Morning Batch A', 'IELTS', 'Sun/Tue/Thu · 7:00 AM'],
  ['IELTS Evening Batch B', 'IELTS', 'Sun/Tue/Thu · 5:00 PM'],
  ['PTE Fast Track', 'PTE', 'Mon/Wed/Fri · 4:00 PM'],
  ['Spoken English Basics', 'Spoken English', 'Sat/Mon/Wed · 6:00 PM'],
  ['TOEFL Weekend Batch', 'TOEFL', 'Fri/Sat · 10:00 AM'],
  ['Duolingo Crash Course', 'Duolingo', 'Daily · 8:00 AM'],
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

export const enrollments: Enrollment[] = classes.flatMap((cls) => {
  const roster = pickMany(students, Math.min(cls.enrolledCount, students.length))
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
