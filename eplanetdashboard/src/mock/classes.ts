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
      'Alisha Kafle',
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
      'Jenisha Bishwokarma',
      'Puja Tamang',
      'Sana Shrestha',
      'Manish Thakur',
      'Sarita Tamang',
      'Dawa Sangmu Rokaya',
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
      'Sushma Pudasaini',
      'Rajiv Khadka',
      'Ronak Shrestha',
      'Urgen Sonam Sherpa',
      'Prajwol Bishwokarma',
      'Siddhant Rai',
      'Upasana Rai',
      'Sonam Lama',
      'Pralad Lama',
      'Prayush Lama',
    ],
  },
  {
    id: 'cls-04',
    name: 'IELTS Class (07:00-08:00 AM)',
    subject: 'IELTS' as const,
    schedule: 'Sun-Fri · 07:00 AM - 08:00 AM',
    room: 'Room 201',
    capacity: 25,
    status: 'ongoing' as const,
    students: [
      'Pragya Rai',
      'Sandesh Lama',
      'Nima Lopchan',
      'Prativa Lama',
      'Rijan Dhahal',
      'Binu Tamang',
      'Angela Basnet',
      'Liza Tamang',
      'Chorten Dolma Tamang',
      'Chhedar Dhoke',
      'Bahadur Gurung',
      'John Tamang',
    ],
  },
  {
    id: 'cls-05',
    name: 'IELTS Class (08:00-09:00 AM)',
    subject: 'IELTS' as const,
    schedule: 'Sun-Fri · 08:00 AM - 09:00 AM',
    room: 'Room 202',
    capacity: 20,
    status: 'ongoing' as const,
    students: [
      'Kavya Basnet',
      'Mandira Kharel',
      'Jibika Sapkota',
      'Roshan Shah',
      'Anisha Badal',
      'Arpana Khadka',
      'Reesu',
      'Asmita Tamang',
      'Sudikhya Kharel',
    ],
  },
  {
    id: 'cls-06',
    name: 'IELTS Class (09:00-10:00 AM)',
    subject: 'IELTS' as const,
    schedule: 'Sun-Fri · 09:00 AM - 10:00 AM',
    room: 'Room 203',
    capacity: 20,
    status: 'ongoing' as const,
    students: [
      'Sangye Khando Lama',
      'Aakanshya Rana',
      'Binit Tamang',
      'Amrit Tamang',
      'Karuna Balampaki',
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
