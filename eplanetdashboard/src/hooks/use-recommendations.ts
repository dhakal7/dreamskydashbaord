/**
 * use-recommendations.ts  — Phase F5
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isMockMode } from '@/lib/api-client'
import { recommendationApi, type RecommendationCriteria } from '@/api/recommendation-api'

export const recommendationKeys = {
  all: ['recommendations'] as const,
  latest: (studentId: string) => [...recommendationKeys.all, 'latest', studentId] as const,
  history: (studentId: string) => [...recommendationKeys.all, 'history', studentId] as const,
}

export function useLatestRecommendation(studentId: string) {
  return useQuery({
    queryKey: recommendationKeys.latest(studentId),
    queryFn: () => recommendationApi.getLatest(studentId),
    enabled: !isMockMode() && !!studentId,
    // Don't auto-refetch — recommendations are generated on demand
    staleTime: Infinity,
  })
}

export function useRecommendationHistory(studentId: string) {
  return useQuery({
    queryKey: recommendationKeys.history(studentId),
    queryFn: () => recommendationApi.getHistory(studentId),
    enabled: !isMockMode() && !!studentId,
    staleTime: Infinity,
  })
}

export function useGenerateRecommendations() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (criteria: RecommendationCriteria) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return recommendationApi.generate(criteria)
    },
    onSuccess: (_data, criteria) => {
      // Invalidate cached results for this student so the new record is shown
      qc.invalidateQueries({ queryKey: recommendationKeys.latest(criteria.studentId) })
      qc.invalidateQueries({ queryKey: recommendationKeys.history(criteria.studentId) })
      toast.success('Recommendations generated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
