import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { toast } from 'sonner'
import type { Course } from '@/types'
import { courses as seedCourses } from '@/mock'
import { useUniversitiesStore } from '@/features/universities/store'

interface CoursesState {
  courses: Course[]
  addCourse: (data: Omit<Course, 'id' | 'universityName' | 'countryName'>) => void
  updateCourse: (id: string, patch: Partial<Course>) => void
  removeCourse: (id: string) => void
}

export const useCoursesStore = create<CoursesState>()(
  persist(
    (set, get) => ({
      courses: seedCourses,

  addCourse: (data) => {
    const uni = useUniversitiesStore.getState().universities.find((u) => u.id === data.universityId)
    if (!uni) {
      toast.error('University not found')
      return
    }
    const existing = get().courses.filter((c) => c.universityId === data.universityId)
    const index = existing.length + 1
    const id = `course-${data.universityId}-${index}`
    const newCourse: Course = {
      ...data,
      id,
      universityName: uni.name,
      countryName: uni.countryName,
    }
    set({ courses: [...get().courses, newCourse] })
    useUniversitiesStore.getState().updateUniversity(uni.id, { courseCount: uni.courseCount + 1 })
    toast.success(`${data.name} added as a course`)
  },

  updateCourse: (id, patch) =>
    set((state) => {
      const course = state.courses.find((c) => c.id === id)
      if (course) toast.success(`${course.name} updated`)
      return { courses: state.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)) }
    }),

  removeCourse: (id) =>
    set((state) => {
      const course = state.courses.find((c) => c.id === id)
      if (!course) return state
      const uni = useUniversitiesStore.getState().universities.find((u) => u.id === course.universityId)
      if (uni) {
        useUniversitiesStore.getState().updateUniversity(uni.id, { courseCount: Math.max(0, uni.courseCount - 1) })
      }
      toast.success(`${course.name} removed`)
      return { courses: state.courses.filter((c) => c.id !== id) }
    }),
  }),
  {
    name: 'dreamsky-courses-store',
  }
)
)

