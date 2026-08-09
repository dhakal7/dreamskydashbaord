import { create } from 'zustand'
import type { Role } from '@/types'

export type ProfileNoteCategory = 'document' | 'follow_up' | 'general'

export interface ProfileNote {
  id: string
  studentId: string
  authorName: string
  authorRole: Role
  message: string
  category: ProfileNoteCategory
  createdAt: string
}

let nextId = 1

interface ProfileNotesState {
  notes: ProfileNote[]
  addNote: (studentId: string, authorName: string, authorRole: Role, message: string, category: ProfileNoteCategory) => void
}

export const useProfileNotesStore = create<ProfileNotesState>((set, get) => ({
  notes: [],

  addNote: (studentId, authorName, authorRole, message, category) => {
    const note: ProfileNote = {
      id: `pn-${String(nextId).padStart(4, '0')}`,
      studentId,
      authorName,
      authorRole,
      message,
      category,
      createdAt: new Date().toISOString(),
    }
    nextId++
    set({ notes: [...get().notes, note] })
  },
}))
