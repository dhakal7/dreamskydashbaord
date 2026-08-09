/**
 * use-followups.ts  — Phase F2
 *
 * TanStack React Query hooks for follow-up data.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isMockMode } from '@/lib/api-client'
import { followUpApi, type FollowUpListParams, type CreateFollowUpBody, type UpdateFollowUpBody } from '@/api/followup-api'

export const followUpKeys = {
  all: ['follow-ups'] as const,
  lists: () => [...followUpKeys.all, 'list'] as const,
  list: (params: FollowUpListParams) => [...followUpKeys.lists(), params] as const,
  studentTimeline: (studentId: string) => [...followUpKeys.all, 'student', studentId] as const,
  detail: (id: string) => [...followUpKeys.all, 'detail', id] as const,
}

export function useFollowUps(params: FollowUpListParams = {}) {
  return useQuery({
    queryKey: followUpKeys.list(params),
    queryFn: () => followUpApi.list(params),
    enabled: !isMockMode(),
  })
}

export function useStudentFollowUps(studentId: string) {
  return useQuery({
    queryKey: followUpKeys.studentTimeline(studentId),
    queryFn: () => followUpApi.getStudentTimeline(studentId),
    enabled: !isMockMode() && !!studentId,
  })
}

export function useCreateFollowUp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateFollowUpBody) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return followUpApi.create(body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: followUpKeys.lists() })
      toast.success('Follow-up logged')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateFollowUp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateFollowUpBody }) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return followUpApi.update(id, body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: followUpKeys.lists() })
      toast.success('Follow-up updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
