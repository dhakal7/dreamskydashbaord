/**
 * use-partner-consultancies.ts
 *
 * TanStack React Query hooks for partner consultancy data.
 * Mock-mode aware: falls back to Zustand store when VITE_USE_MOCK=true.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isMockMode } from '@/lib/api-client'
import { partnerConsultancyApi, type ApiPartnerConsultancy } from '@/api/partner-consultancy-api'
import { useStudentsStore } from '@/features/students/store'

// ─── Query keys ───────────────────────────────────────────────────────────────

export const partnerKeys = {
  all: ['partner-consultancies'] as const,
  list: () => [...partnerKeys.all, 'list'] as const,
}

// ─── List hook ────────────────────────────────────────────────────────────────

/**
 * Returns all registered partner consultancies.
 * In mock mode, returns the Zustand store's in-memory partner list.
 */
export function usePartnerConsultancies() {
  const mockPartners = useStudentsStore((s) => s.partnerConsultancies)

  return useQuery<ApiPartnerConsultancy[]>({
    queryKey: partnerKeys.list(),
    queryFn: () => partnerConsultancyApi.list(),
    enabled: !isMockMode(),
    // Seed from Zustand in mock mode so the dropdown still works
    placeholderData: isMockMode()
      ? mockPartners.map((p) => ({
          id: p.id,
          name: p.name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }))
      : undefined,
    staleTime: 5 * 60 * 1000, // 5 min — partners rarely change
  })
}

// ─── Create / find mutation ───────────────────────────────────────────────────

/**
 * Creates a new partner consultancy on the backend (or finds existing by name).
 * In mock mode, delegates to the Zustand store's addPartnerConsultancy().
 */
export function useCreateOrFindPartnerConsultancy() {
  const queryClient = useQueryClient()
  const addMock = useStudentsStore((s) => s.addPartnerConsultancy)

  return useMutation<ApiPartnerConsultancy, Error, string>({
    mutationFn: (name: string) => {
      if (isMockMode()) {
        // Delegate to mock store and return shaped object
        const partner = addMock(name)
        return Promise.resolve({
          id: partner.id,
          name: partner.name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }
      return partnerConsultancyApi.createOrFind(name)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: partnerKeys.list() })
    },
    onError: (err) => toast.error(`Failed to save partner: ${err.message}`),
  })
}
