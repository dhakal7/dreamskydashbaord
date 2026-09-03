/**
 * document-api.ts — Real REST API client for dream-sky /documents endpoints.
 */

import { api } from '@/lib/api-client'
import { uploadAxiosInstance } from '@/lib/api-client'
import type { StudentDocumentProfile, StudentDocument } from '@/types'

export interface UploadDocumentBody {
  file: File
  studentId: string
  category?: string
  type: string
  customName?: string
  notes?: string
  expiryDate?: string
}

export interface ReplaceDocumentBody {
  file: File
  notes?: string
  customName?: string
}

export const documentApi = {
  /**
   * GET /documents/student-profiles
   * Returns list of student profiles with document counts and document records.
   */
  listStudentProfiles(search?: string): Promise<StudentDocumentProfile[]> {
    return api.get('/documents/student-profiles', { params: { search } })
  },

  /**
   * GET /documents
   */
  list(params?: { studentId?: string; category?: string; type?: string; status?: string }): Promise<{ documents: StudentDocument[] }> {
    return api.get('/documents', { params })
  },

  getOne(id: string): Promise<StudentDocument> {
    return api.get(`/documents/${id}`)
  },

  getHistory(id: string): Promise<StudentDocument> {
    return api.get(`/documents/${id}/history`)
  },

  /**
   * POST /documents/upload (multipart/form-data)
   */
  upload(body: UploadDocumentBody): Promise<StudentDocument> {
    const form = new FormData()
    form.append('file', body.file)
    form.append('studentId', body.studentId)
    form.append('type', body.type)
    if (body.category) form.append('category', body.category)
    if (body.customName) form.append('customName', body.customName)
    if (body.notes) form.append('notes', body.notes)
    if (body.expiryDate) form.append('expiryDate', body.expiryDate)

    return uploadAxiosInstance.post('/documents/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }) as Promise<StudentDocument>
  },

  /**
   * POST /documents/:id/replace (multipart/form-data)
   */
  replace(id: string, body: ReplaceDocumentBody): Promise<StudentDocument> {
    const form = new FormData()
    form.append('file', body.file)
    if (body.notes) form.append('notes', body.notes)
    if (body.customName) form.append('customName', body.customName)

    return uploadAxiosInstance.post(`/documents/${id}/replace`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }) as Promise<StudentDocument>
  },

  /**
   * POST /documents/:id/review (Student approval / Request changes)
   */
  review(id: string, action: 'APPROVE' | 'REQUEST_CHANGES', comment?: string): Promise<StudentDocument> {
    return api.post(`/documents/${id}/review`, { action, comment })
  },

  rename(id: string, customName: string): Promise<StudentDocument> {
    return api.patch(`/documents/${id}/rename`, { customName })
  },

  verify(id: string, notes?: string): Promise<StudentDocument> {
    return api.patch(`/documents/${id}/verify`, { status: 'VERIFIED', notes })
  },

  download(id: string): Promise<Blob> {
    return uploadAxiosInstance.get(`/documents/${id}/download`, {
      responseType: 'blob',
    }) as Promise<Blob>
  },

  remove(id: string): Promise<void> {
    return api.delete(`/documents/${id}`)
  },
}
