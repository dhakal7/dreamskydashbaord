/**
 * use-documents.ts  — Phase F3
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isMockMode } from '@/lib/api-client'
import { documentApi, type DocumentListParams, type UploadDocumentBody } from '@/api/document-api'

export const documentKeys = {
  all: ['documents'] as const,
  lists: () => [...documentKeys.all, 'list'] as const,
  list: (p: DocumentListParams) => [...documentKeys.lists(), p] as const,
  detail: (id: string) => [...documentKeys.all, 'detail', id] as const,
}

export function useDocuments(params: DocumentListParams = {}) {
  return useQuery({
    queryKey: documentKeys.list(params),
    queryFn: () => documentApi.list(params),
    enabled: !isMockMode(),
  })
}

export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UploadDocumentBody) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return documentApi.upload(body)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: documentKeys.lists() }); toast.success('Document uploaded') },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useVerifyDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return documentApi.verify(id, notes)
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: documentKeys.detail(id) })
      qc.invalidateQueries({ queryKey: documentKeys.lists() })
      toast.success('Document verified')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * useDownloadDocument — triggers a browser file download.
 * Designed to be called imperatively (not as a query), so it returns a plain function.
 */
export function useDownloadDocument() {
  return async (id: string, filename: string) => {
    if (isMockMode()) { toast.info('Download not available in mock mode'); return }
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
