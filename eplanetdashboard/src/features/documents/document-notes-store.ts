import { create } from 'zustand'

export interface DocumentNote {
  id: string
  studentId: string
  documentId?: string
  authorName: string
  authorRole: string
  message: string
  createdAt: string
}

let nextNoteId = 1

interface DocumentNotesState {
  notes: DocumentNote[]
  addNote: (note: Omit<DocumentNote, 'id' | 'createdAt'>) => void
  deleteNote: (id: string) => void
  getNotesForDocument: (documentId: string) => DocumentNote[]
}

export const useDocumentNotesStore = create<DocumentNotesState>((set, get) => ({
  notes: [],

  addNote: (data) =>
    set((state) => {
      const id = `note-${String(nextNoteId).padStart(3, '0')}`
      nextNoteId++
      const newNote: DocumentNote = {
        ...data,
        id,
        createdAt: new Date().toISOString(),
      }
      return { notes: [...state.notes, newNote] }
    }),

  deleteNote: (id) =>
    set((state) => ({
      notes: state.notes.filter((note) => note.id !== id),
    })),

  getNotesForDocument: (documentId) =>
    get().notes.filter((note) => note.documentId === documentId),
}))

