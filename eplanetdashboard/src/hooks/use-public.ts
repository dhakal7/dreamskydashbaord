/**
 * use-public.ts  — Phase F5
 *
 * Hooks for the public website pages (unauthenticated) and
 * the staff inquiry inbox (SUPER_ADMIN / COUNSELOR).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isMockMode } from '@/lib/api-client'
import { publicApi, type PublicInquiryBody, type InquiryListParams } from '@/api/public-api'

export const inquiryKeys = {
  all: ['inquiries'] as const,
  lists: () => [...inquiryKeys.all, 'list'] as const,
  list: (p: InquiryListParams) => [...inquiryKeys.lists(), p] as const,
  detail: (id: string) => [...inquiryKeys.all, 'detail', id] as const,
}

// ── Public catalog queries (usable on the public website, no auth) ─────────────

export function usePublicCountries() {
  return useQuery({
    queryKey: ['public', 'countries'],
    queryFn: () => publicApi.listCountries(),
    staleTime: 10 * 60_000,
  })
}

export function usePublicUniversities(params?: { countryId?: string; search?: string }) {
  return useQuery({
    queryKey: ['public', 'universities', params],
    queryFn: () => publicApi.listUniversities(params),
    staleTime: 10 * 60_000,
  })
}

export function usePublicCourses(params?: { universityId?: string; level?: string }) {
  return useQuery({
    queryKey: ['public', 'courses', params],
    queryFn: () => publicApi.listCourses(params),
    staleTime: 10 * 60_000,
  })
}

// ── Public inquiry form submission ────────────────────────────────────────────

export function useSubmitInquiry() {
  return useMutation({
    mutationFn: (body: PublicInquiryBody) => {
      if (isMockMode()) {
        // In mock mode simulate a successful submission after a short delay
        return new Promise<{ id: string; message: string }>((resolve) =>
          setTimeout(() => resolve({ id: 'mock-inquiry-1', message: 'Thank you, we will be in touch!' }), 500),
        )
      }
      return publicApi.submitInquiry(body)
    },
    onSuccess: () => toast.success('Your inquiry has been submitted. We will contact you shortly.'),
    onError: (err: Error) => toast.error(err.message),
  })
}

// ── Staff inquiry inbox ───────────────────────────────────────────────────────

export function useInquiries(params: InquiryListParams = {}) {
  return useQuery({
    queryKey: inquiryKeys.list(params),
    queryFn: () => publicApi.listInquiries(params),
    enabled: !isMockMode(),
  })
}

export function useMarkInquiryConverted() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return publicApi.markConverted(id)
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: inquiryKeys.detail(id) })
      qc.invalidateQueries({ queryKey: inquiryKeys.lists() })
      toast.success('Inquiry marked as converted')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
