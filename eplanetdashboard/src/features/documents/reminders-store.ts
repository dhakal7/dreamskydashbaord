import { create } from 'zustand'
import { toast } from 'sonner'
import type { DocumentType } from '@/types'

export interface DocumentReminder {
  id: string
  studentId: string
  docType: DocumentType
  sentBy: string
  sentByRole: string
  sentAt: string
}

let nextId = 1

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  passport: 'Passport',
  citizenship: 'Citizenship',
  academic: 'Academic',
  cv: 'CV',
  sop: 'SOP',
  recommendation: 'Recommendation Letter',
  financial: 'Financial',
  offer_letter: 'Offer Letter',
  visa_letter: 'Visa Letter',
}

interface RemindersState {
  reminders: DocumentReminder[]
  sendReminder: (studentId: string, studentName: string, docType: DocumentType, sentBy: string, sentByRole: string) => void
}

export const useRemindersStore = create<RemindersState>((set, get) => ({
  reminders: [],

  sendReminder: (studentId, studentName, docType, sentBy, sentByRole) => {
    const reminder: DocumentReminder = {
      id: `rem-${String(nextId).padStart(4, '0')}`,
      studentId,
      docType,
      sentBy,
      sentByRole,
      sentAt: new Date().toISOString(),
    }
    nextId++
    set({ reminders: [...get().reminders, reminder] })
    toast.success(`Reminder sent to ${studentName} for ${DOCUMENT_TYPE_LABELS[docType]}`)
  },
}))
