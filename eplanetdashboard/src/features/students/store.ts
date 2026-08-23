import { create } from 'zustand'
import { toast } from 'sonner'
import type { Student, PartnerConsultancy } from '@/types'
import { students as seedStudents, counselors, partnerConsultancies as seedPartners } from '@/mock'

import { isMockMode } from '@/lib/api-client'

interface StudentsState {
  students: Student[]
  partnerConsultancies: PartnerConsultancy[]
  addStudent: (data: Omit<Student, 'id' | 'studentId' | 'documentsUploaded' | 'documentsRequired' | 'createdAt'>) => Student
  updateStudent: (id: string, patch: Partial<Student>) => void
  deleteStudents: (ids: string[]) => void
  assignCounselor: (ids: string[], counselorId: string) => void
  addPartnerConsultancy: (name: string) => PartnerConsultancy
}

export const useStudentsStore = create<StudentsState>((set, get) => ({
  students: isMockMode() ? seedStudents : [],
  partnerConsultancies: isMockMode() ? seedPartners : [],

  addStudent: (data) => {
    const current = get().students
    const nextNum = current.length + 1
    const newStudent: Student = {
      ...data,
      id: `stu-${String(nextNum).padStart(3, '0')}`,
      studentId: `EPC-2026-${String(nextNum).padStart(4, '0')}`,
      documentsUploaded: 0,
      documentsRequired: 7,
      createdAt: new Date().toISOString(),
    }
    set({ students: [...current, newStudent] })
    toast.success(`${newStudent.name} added as a student`)
    return newStudent
  },

  updateStudent: (id, patch) =>
    set((state) => {
      const student = state.students.find((s) => s.id === id)
      if (student) {
        toast.success(`${student.name}'s profile updated`)
      }
      return {
        students: state.students.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      }
    }),

  deleteStudents: (ids) =>
    set((state) => {
      toast.success(`${ids.length} student${ids.length > 1 ? 's' : ''} removed`)
      return {
        students: state.students.filter((s) => !ids.includes(s.id)),
      }
    }),

  assignCounselor: (ids, counselorId) =>
    set((state) => {
      const counselor = counselors.find((c) => c.id === counselorId)
      if (!counselor) return state
      toast.success(`${ids.length} student${ids.length > 1 ? 's' : ''} assigned to ${counselor.name}`)
      return {
        students: state.students.map((s) =>
          ids.includes(s.id) ? { ...s, counselorId, counselorName: counselor.name } : s
        ),
      }
    }),

  addPartnerConsultancy: (name) => {
    const existing = get().partnerConsultancies.find(
      (p) => p.name.toLowerCase().trim() === name.toLowerCase().trim()
    )
    if (existing) return existing

    const newPartner: PartnerConsultancy = {
      id: `partner-${Date.now()}`,
      name: name.trim(),
      createdAt: new Date().toISOString(),
    }
    set((state) => ({
      partnerConsultancies: [...state.partnerConsultancies, newPartner],
    }))
    toast.success(`Registered new partner consultancy: "${newPartner.name}"`)
    return newPartner
  },
}))

