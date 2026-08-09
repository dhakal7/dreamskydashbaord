/**
 * document-api.ts  — Phase F3
 *
 * Axios wrappers for dream-sky /documents endpoints.
 * File uploads use FormData (multipart/form-data).
 */

import { api } from '@/lib/api-client'
import axiosInstance from '@/lib/api-client'

export interface ApiDocument {
  id: string
  studentId: string
  uploadedById: string | null
  type: string
  status: string
  originalName: string
  storagePath: string
  mimeType: string
  sizeBytes: number
  notes: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  student?: { id: string; firstName: string; lastName: string }
  uploadedBy?: { id: string; firstName: string; lastName: string } | null
}

export interface DocumentListParams {
  page?: number
  limit?: number
  studentId?: string
  type?: string
  status?: string
}

export interface DocumentListResponse {
  documents: ApiDocument[]
  total: number
  page: number
  limit: number
}

export interface UploadDocumentBody {
  file: File
  studentId: string
  type: string
  notes?: string
  expiresAt?: string
}

export const documentApi = {
  list(params?: DocumentListParams): Promise<DocumentListResponse> {
    return api.get('/documents', { params })
  },

  getOne(id: string): Promise<ApiDocument> {
    return api.get(`/documents/${id}`)
  },

  /**
   * POST /documents/upload
   * Sends multipart/form-data — uses axiosInstance directly so we can set
   * the Content-Type boundary automatically (don't set it manually, Axios/browser does it).
   */
  upload(body: UploadDocumentBody): Promise<ApiDocument> {
    const form = new FormData()
    form.append('file', body.file)
    form.append('studentId', body.studentId)
    form.append('type', body.type)
    if (body.notes) form.append('notes', body.notes)
    if (body.expiresAt) form.append('expiresAt', body.expiresAt)
    return axiosInstance.post('/documents/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }) as Promise<ApiDocument>
  },

  /**
   * GET /documents/:id/download
   * Returns a Blob — consumer is responsible for creating an object URL.
   */
  download(id: string): Promise<Blob> {
    return axiosInstance.get(`/documents/${id}/download`, {
      responseType: 'blob',
    }) as Promise<Blob>
  },

  verify(id: string, notes?: string): Promise<ApiDocument> {
    return api.patch(`/documents/${id}/verify`, { status: 'VERIFIED', notes })
  },

  update(id: string, body: { notes?: string; expiresAt?: string; type?: string }): Promise<ApiDocument> {
    return api.put(`/documents/${id}`, body)
  },

  remove(id: string): Promise<void> {
    return api.delete(`/documents/${id}`)
  },
}
