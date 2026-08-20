/**
 * use-documents.ts — TanStack Query hooks for real document REST APIs.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isMockMode } from '@/lib/api-client'
import { documentApi, type UploadDocumentBody, type ReplaceDocumentBody } from '@/api/document-api'

export const documentKeys = {
  all: ['documents'] as const,
  profiles: (search?: string) => [...documentKeys.all, 'profiles', search ?? ''] as const,
  lists: () => [...documentKeys.all, 'list'] as const,
  detail: (id: string) => [...documentKeys.all, 'detail', id] as const,
  history: (id: string) => [...documentKeys.all, 'history', id] as const,
}

export function useStudentDocumentProfiles(search?: string) {
  return useQuery({
    queryKey: documentKeys.profiles(search),
    queryFn: () => documentApi.listStudentProfiles(search),
    enabled: !isMockMode(),
  })
}

export function useDocumentHistory(id: string | null) {
  return useQuery({
    queryKey: documentKeys.history(id ?? ''),
    queryFn: () => documentApi.getHistory(id!),
    enabled: Boolean(id) && !isMockMode(),
  })
}

export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UploadDocumentBody) => documentApi.upload(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentKeys.all })
      toast.success('Document uploaded successfully')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useReplaceDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ReplaceDocumentBody }) => documentApi.replace(id, body),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: documentKeys.all })
      qc.invalidateQueries({ queryKey: documentKeys.history(id) })
      toast.success('Document replaced with new version')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useReviewDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action, comment }: { id: string; action: 'APPROVE' | 'REQUEST_CHANGES'; comment?: string }) =>
      documentApi.review(id, action, comment),
    onSuccess: (_d, { action }) => {
      qc.invalidateQueries({ queryKey: documentKeys.all })
      toast.success(action === 'APPROVE' ? 'Document approved and verified' : 'Change request submitted to counselor')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useRenameDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, customName }: { id: string; customName: string }) => documentApi.rename(id, customName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentKeys.all })
      toast.success('Document renamed')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDocuments(params: { studentId?: string; category?: string; type?: string; status?: string } = {}) {
  return useQuery({
    queryKey: [...documentKeys.lists(), params],
    queryFn: () => documentApi.list(params),
    enabled: !isMockMode(),
  })
}

export function useVerifyDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => documentApi.verify(id, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentKeys.all })
      toast.success('Document verified')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDownloadDocument() {
  return async (id: string, filename: string) => {
    try {
      const blob = await documentApi.download(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed')
    }
  }
}

export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => documentApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentKeys.all })
      toast.success('Document deleted')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
