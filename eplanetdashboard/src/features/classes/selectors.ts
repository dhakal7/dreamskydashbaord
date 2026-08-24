import dayjs from 'dayjs'
import type { ClassSession, ClassMaterial, Enrollment, AttendanceRecord } from '@/types'
import { classes } from '@/mock'
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
  const store = useAttendanceStore.getState()
  const direct = store.getEnrollmentsForClass(classId)
  if (direct && direct.length > 0) return direct

  // Fallback: match by class name
  const foundClass = classes.find(
    (c) => c.id === classId || c.name.toLowerCase().trim() === classId.toLowerCase().trim()
  )
  if (foundClass) {
    const matched = store.getEnrollmentsForClass(foundClass.id)
    if (matched && matched.length > 0) return matched
  }

  // Fallback by subject + time slot string
  const str = classId.toLowerCase()
  if (str.includes('pte')) {
    if (str.includes('07') || str.includes('7:00')) return store.getEnrollmentsForClass('cls-01')
    if (str.includes('08') || str.includes('8:00')) return store.getEnrollmentsForClass('cls-02')
    if (str.includes('09') || str.includes('9:00')) return store.getEnrollmentsForClass('cls-03')
    return store.getEnrollmentsForClass('cls-04')
  }
  if (str.includes('ielts')) {
    if (str.includes('07') || str.includes('7:00')) return store.getEnrollmentsForClass('cls-05')
    if (str.includes('08') || str.includes('8:00')) return store.getEnrollmentsForClass('cls-06')
    if (str.includes('09') || str.includes('9:00')) return store.getEnrollmentsForClass('cls-07')
    return store.getEnrollmentsForClass('cls-08')
  }

  return store.getEnrollmentsForClass('cls-01')
}

export function getClassAttendance(classId: string): AttendanceRecord[] {
  const allRecords = useAttendanceStore.getState().attendanceRecords
  let matched = allRecords.filter((a) => a.classId === classId)
  if (matched.length === 0) {
    const enrollments = getClassEnrollments(classId)
    const resolvedId = enrollments[0]?.classId || 'cls-01'
    matched = allRecords.filter((a) => a.classId === resolvedId)
  }
  return matched.sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf())
}

export function getClassMaterials(classId: string): ClassMaterial[] {
  const allMaterials = useClassMaterialsStore.getState().materials
  let matched = allMaterials.filter((m) => m.classId === classId)
  if (matched.length === 0) {
    const enrollments = getClassEnrollments(classId)
    const resolvedId = enrollments[0]?.classId || 'cls-01'
    matched = allMaterials.filter((m) => m.classId === resolvedId)
  }
  return matched
}
