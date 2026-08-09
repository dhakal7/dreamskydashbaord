/**
 * use-classes.ts  — Phase F4
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isMockMode } from '@/lib/api-client'
import { classApi, type ClassListParams, type AttendanceBody } from '@/api/class-api'

export const classKeys = {
  all: ['classes'] as const,
  lists: () => [...classKeys.all, 'list'] as const,
  list: (p: ClassListParams) => [...classKeys.lists(), p] as const,
  detail: (id: string) => [...classKeys.all, 'detail', id] as const,
  myClasses: () => [...classKeys.all, 'my-classes'] as const,
  content: (classId: string) => [...classKeys.all, 'content', classId] as const,
}

export function useClasses(params: ClassListParams = {}) {
  return useQuery({
    queryKey: classKeys.list(params),
    queryFn: () => classApi.list(params),
    enabled: !isMockMode(),
  })
}

/** useMyClasses — for TEACHER role, fetches GET /classes/teacher/me */
export function useMyClasses() {
  return useQuery({
    queryKey: classKeys.myClasses(),
    queryFn: () => classApi.getMyClasses(),
    enabled: !isMockMode(),
  })
}

export function useClass(id: string) {
  return useQuery({
    queryKey: classKeys.detail(id),
    queryFn: () => classApi.getOne(id),
    enabled: !isMockMode() && !!id,
  })
}

export function useClassContent(classId: string) {
  return useQuery({
    queryKey: classKeys.content(classId),
    queryFn: () => classApi.listContent(classId),
    enabled: !isMockMode() && !!classId,
  })
}

export function useMarkAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ classId, body }: { classId: string; body: AttendanceBody }) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return classApi.markAttendance(classId, body)
    },
    onSuccess: (_d, { classId }) => {
      qc.invalidateQueries({ queryKey: classKeys.detail(classId) })
      toast.success('Attendance marked')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useEnrollStudent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ classId, studentId }: { classId: string; studentId: string }) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return classApi.enrollStudent(classId, studentId)
    },
    onSuccess: (_d, { classId }) => {
      qc.invalidateQueries({ queryKey: classKeys.detail(classId) })
      toast.success('Student enrolled')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUnenrollStudent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ classId, studentId }: { classId: string; studentId: string }) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return classApi.unenrollStudent(classId, studentId)
    },
    onSuccess: (_d, { classId }) => {
      qc.invalidateQueries({ queryKey: classKeys.detail(classId) })
      toast.success('Student unenrolled')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
