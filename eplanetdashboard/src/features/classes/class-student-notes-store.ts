import { create } from 'zustand'

export interface StudentClassNote {
  id: string
  classId: string
  studentId: string
  authorName: string
  message: string
  type: 'test_result' | 'general'
  createdAt: string
}

let nextNoteId = 1

interface ClassStudentNotesState {
  notes: StudentClassNote[]
  addNote: (data: Omit<StudentClassNote, 'id' | 'createdAt'>) => void
  getNotesForStudentInClass: (studentId: string, classId: string) => StudentClassNote[]
}

export const useClassStudentNotesStore = create<ClassStudentNotesState>((set, get) => ({
  notes: [],

  addNote: (data) =>
    set((state) => {
      const id = `cls-note-${String(nextNoteId).padStart(3, '0')}`
      nextNoteId++
      const newNote: StudentClassNote = {
        ...data,
        id,
        createdAt: new Date().toISOString(),
      }
      return { notes: [...state.notes, newNote] }
    }),

  getNotesForStudentInClass: (studentId, classId) =>
    get().notes.filter(
      (note) => note.studentId === studentId && note.classId === classId,
    ),
}))
