import { create } from 'zustand'
import type { AttendanceRecord, Enrollment } from '@/types'
import { attendanceRecords as mockAttendance, enrollments as mockEnrollments } from '@/mock'



export interface StudentPresence {
  studentId: string
  present: boolean
}

let nextId = mockAttendance.length + 1

interface AttendanceState {
  attendanceRecords: AttendanceRecord[]
  enrollments: Enrollment[]
  /** Per-session presence map keyed by `${classId}-${date}` → Record<studentId, present> */
  studentPresence: Record<string, Record<string, boolean>>

  getAttendanceForClass: (classId: string) => AttendanceRecord[]
  getEnrollmentsForClass: (classId: string) => Enrollment[]
  submitAttendance: (
    classId: string,
    className: string,
    date: string,
    presence: StudentPresence[],
  ) => void
  unenrollStudent: (classId: string, studentId: string) => void
}

export const useAttendanceStore = create<AttendanceState>((set, get) => ({
  attendanceRecords: [...mockAttendance],
  enrollments: [...mockEnrollments],
  studentPresence: {},

  unenrollStudent: (classId, studentId) => {
    set((state) => ({
      enrollments: state.enrollments.filter(
        (e) => !(e.classId === classId && e.studentId === studentId)
      ),
    }))
  },

  getAttendanceForClass: (classId) =>
    get()
      .attendanceRecords.filter((a) => a.classId === classId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),

  getEnrollmentsForClass: (classId) =>
    get().enrollments.filter((e) => e.classId === classId),

  submitAttendance: (classId, className, date, presence) =>
    set((state) => {
      const presentCount = presence.filter((p) => p.present).length
      const totalCount = presence.length
      const absentCount = totalCount - presentCount

      const id = `att-${classId}-${String(nextId).padStart(3, '0')}`
      nextId++

      const newRecord: AttendanceRecord = {
        id,
        classId,
        className,
        date,
        presentCount,
        absentCount,
        totalCount,
      }

      // Store per-session presence
      const sessionKey = `${classId}-${date}`
      const presenceMap: Record<string, boolean> = {}
      for (const p of presence) {
        presenceMap[p.studentId] = p.present
      }

      // Recalculate attendancePct for each student in this class
      // Count total sessions for this class (including the new one)
      const classSessionKeys = Object.keys(state.studentPresence).filter((k) =>
        k.startsWith(`${classId}-`),
      )
      // Add current session key (it's not in state yet)
      const allSessionKeys = [...classSessionKeys, sessionKey]

      const updatedEnrollments = state.enrollments.map((e) => {
        if (e.classId !== classId) return e

        // Count how many sessions this student was present across all sessions
        let presentSessions = 0
        for (const sessionKey of allSessionKeys) {
          const presenceData =
            sessionKey === sessionKey
              ? presenceMap[e.studentId]
              : state.studentPresence[sessionKey]?.[e.studentId]
          if (presenceData) presentSessions++
        }

        const pct =
          allSessionKeys.length > 0
            ? Math.round((presentSessions / allSessionKeys.length) * 100)
            : 0

        return { ...e, attendancePct: pct }
      })

      return {
        attendanceRecords: [...state.attendanceRecords, newRecord],
        enrollments: updatedEnrollments,
        studentPresence: {
          ...state.studentPresence,
          [sessionKey]: presenceMap,
        },
      }
    }),
}))

