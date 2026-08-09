import dayjs from 'dayjs'
import type { ClassSession, ClassMaterial, Enrollment, AttendanceRecord } from '@/types'
import { classes, enrollments } from '@/mock'
import type { CurrentUser } from '@/types'
import { visibleClasses } from '@/lib/data-visibility'
import { useAttendanceStore } from './attendance-store'
import { useClassMaterialsStore } from './materials-store'

export function getClassesForRole(role: string, linkedId: string): ClassSession[] {
  return [...visibleClasses({ role, linkedId } as CurrentUser, classes)]
}

export function getTeacherClassIds(teacherId: string): Set<string> {
  const myClasses = classes.filter((c) => c.teacherId === teacherId)
  return new Set(myClasses.map((c) => c.id))
}

export function getClassEnrollments(classId: string): Enrollment[] {
  return enrollments.filter((e) => e.classId === classId)
}

export function getClassAttendance(classId: string): AttendanceRecord[] {
  return useAttendanceStore
    .getState()
    .attendanceRecords.filter((a) => a.classId === classId)
    .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf())
}

export function getClassMaterials(classId: string): ClassMaterial[] {
  return useClassMaterialsStore.getState().materials.filter((m) => m.classId === classId)
}
