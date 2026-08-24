import { create } from 'zustand'
import type { StudentDocument } from '@/types'

import { studentDocuments } from '@/mock'

export type AddDocumentData = Omit<StudentDocument, 'id' | 'version' | 'uploadedAt' | 'status'>

let nextId = 1

interface DocumentsState {
  documents: StudentDocument[]
  addDocument: (data: AddDocumentData) => void
  deleteDocument: (id: string) => void
  updateDocumentStatus: (id: string, status: StudentDocument['status']) => void
}

export const useDocumentsStore = create<DocumentsState>((set) => ({
  documents: [...studentDocuments],

  addDocument: (data) =>
    set((state) => {
      const id = `doc-${String(nextId).padStart(3, '0')}`
      nextId++
      const existing = state.documents.filter(
        (d) => d.studentId === data.studentId && d.type === data.type
      )
      const nextVersion = existing.length > 0
        ? Math.max(...existing.map((d) => d.version)) + 1
        : 1
      const newDoc: StudentDocument = {
        ...data,
        id,
        version: nextVersion,
        status: 'pending_review',
        uploadedAt: new Date().toISOString(),
      }
      return { documents: [newDoc, ...state.documents] }
    }),

  deleteDocument: (id) =>
    set((state) => ({
      documents: state.documents.filter((doc) => doc.id !== id),
    })),

  updateDocumentStatus: (id, status) =>
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === id ? { ...doc, status } : doc
      ),
    })),
}))

