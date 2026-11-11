import type { AttendanceRecord, ClassMaterial, ClassSession, Enrollment } from '@/types'
import { teachers } from './staff'
import { daysAgo, daysFromNow, pad, randInt } from './generators'

export const REAL_CLASS_DATA = [
  {
    id: 'cls-01',
    name: 'PTE Class (07:00-08:00 AM)',
    subject: 'PTE' as const,
    schedule: 'Sun-Fri · 07:00 AM - 08:00 AM',
    room: 'Room 101',
    capacity: 20,
    status: 'ongoing' as const,
    students: [
      'Demo Student 01',
    ],
  },
  {
    id: 'cls-02',
    name: 'PTE Class (08:00-09:00 AM)',
    subject: 'PTE' as const,
    schedule: 'Sun-Fri · 08:00 AM - 09:00 AM',
    room: 'Room 102',
    capacity: 25,
    status: 'ongoing' as const,
    students: [
      'Demo Student 02',
      'Demo Student 03',
      'Demo Student 04',
      'Demo Student 05',
      'Demo Student 06',
      'Demo Student 07',
    ],
  },
  {
    id: 'cls-03',
    name: 'PTE Class (09:00-10:00 AM)',
    subject: 'PTE' as const,
    schedule: 'Sun-Fri · 09:00 AM - 10:00 AM',
    room: 'Room 103',
    capacity: 25,
    status: 'ongoing' as const,
    students: [
      'Demo Student 08',
      'Demo Student 09',
      'Demo Student 10',
      'Demo Student 11',
      'Demo Student 12',
      'Demo Student 13',
      'Demo Student 14',
      'Demo Student 15',
      'Demo Student 16',
      'Demo Student 17',
    ],
  },
  {
    id: 'cls-04',
    name: 'PTE Class (Unassigned / Pending)',
    subject: 'PTE' as const,
    schedule: 'Flexible · Pending Joining',
    room: 'Unassigned',
    capacity: 30,
    status: 'upcoming' as const,
    students: [
      'Demo Student 18',
      'Demo Student 19',
      'Demo Student 20',
    ],
  },
  {
    id: 'cls-05',
    name: 'IELTS Class (07:00-08:00 AM)',
    subject: 'IELTS' as const,
    schedule: 'Sun-Fri · 07:00 AM - 08:00 AM',
    room: 'Room 201',
    capacity: 25,
    status: 'ongoing' as const,
    students: [
      'Demo Student 21',
      'Demo Student 22',
      'Demo Student 23',
      'Demo Student 24',
      'Demo Student 25',
      'Demo Student 26',
      'Demo Student 27',
      'Demo Student 28',
      'Demo Student 29',
      'Demo Student 30',
      'Demo Student 31',
      'Demo Student 32',
    ],
  },
  {
    id: 'cls-06',
    name: 'IELTS Class (08:00-09:00 AM)',
    subject: 'IELTS' as const,
    schedule: 'Sun-Fri · 08:00 AM - 09:00 AM',
    room: 'Room 202',
    capacity: 20,
    status: 'ongoing' as const,
    students: [
      'Demo Student 33',
      'Demo Student 34',
      'Demo Student 35',
      'Demo Student 36',
      'Demo Student 37',
      'Demo Student 38',
      'Demo Student 39',
      'Demo Student 40',
      'Demo Student 41',
    ],
  },
  {
    id: 'cls-07',
    name: 'IELTS Class (09:00-10:00 AM)',
    subject: 'IELTS' as const,
    schedule: 'Sun-Fri · 09:00 AM - 10:00 AM',
    room: 'Room 203',
    capacity: 20,
    status: 'ongoing' as const,
    students: [
      'Demo Student 42',
      'Demo Student 43',
      'Demo Student 44',
      'Demo Student 45',
      'Demo Student 46',
    ],
  },
  {
    id: 'cls-08',
    name: 'IELTS Class (Unassigned / Pending)',
    subject: 'IELTS' as const,
    schedule: 'Flexible · Pending Joining',
    room: 'Unassigned',
    capacity: 30,
    status: 'upcoming' as const,
    students: [
      'Demo Student 47',
      'Demo Student 48',
      'Demo Student 49',
    ],
  },
]

export const classes: ClassSession[] = REAL_CLASS_DATA.map((c) => {
  const teacher = teachers[0] // EPT Instructor handles live classes
  return {
    id: c.id,
    name: c.name,
    subject: c.subject,
    teacherId: teacher.id,
    teacherName: teacher.name,
    schedule: c.schedule,
    startDate: daysAgo(30),
    endDate: daysFromNow(60),
    room: c.room,
    capacity: c.capacity,
    enrolledCount: c.students.length,
    status: c.status,
    nextSessionAt: daysFromNow(1),
  }
})

export const enrollments: Enrollment[] = REAL_CLASS_DATA.flatMap((c) => {
  return c.students.map((studentName, i) => ({
    id: `enr-${c.id}-${pad(i + 1, 2)}`,
    classId: c.id,
    studentId: `stu-${c.id}-${i + 1}`,
    studentName,
    enrolledAt: daysAgo(20),
    progress: randInt(45, 95),
    attendancePct: randInt(75, 100),
  }))
})

export const attendanceRecords: AttendanceRecord[] = classes.flatMap((cls) =>
  Array.from({ length: 5 }).map((_, i) => {
    const total = cls.enrolledCount
    const present = Math.max(1, total - randInt(0, 2))
    return {
      id: `att-${cls.id}-${i + 1}`,
      classId: cls.id,
      className: cls.name,
      date: daysAgo(i * 2),
      presentCount: present,
      absentCount: total - present,
      totalCount: total,
    }
  })
)

export const classMaterials: ClassMaterial[] = classes.flatMap((cls, ci) => [
  {
    id: `mat-${cls.id}-1`,
    classId: cls.id,
    title: `${cls.subject} Speaking & Writing Syllabus`,
    type: 'material' as const,
    fileName: `${cls.subject}_Syllabus_2025.pdf`,
    fileSize: 1024,
    uploadedAt: daysAgo(10),
  },
  {
    id: `mat-${cls.id}-2`,
    classId: cls.id,
    title: `${cls.subject} Mock Exam Set ${ci + 1}`,
    type: 'assignment' as const,
    fileName: `${cls.subject}_Mock_Test_${ci + 1}.pdf`,
    fileSize: 2048,
    uploadedAt: daysAgo(5),
    dueDate: daysFromNow(5),
  },
])
