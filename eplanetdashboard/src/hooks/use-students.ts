/**
 * use-students.ts  — Phase F2
 *
 * TanStack React Query hooks for student data.
 * All hooks are mock-mode aware: they return mock data when VITE_USE_MOCK=true.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isMockMode } from '@/lib/api-client'
import { studentApi, type StudentsListParams, type CreateStudentBody, type ChangePipelineBody } from '@/api/student-api'
import { useStudentsStore } from '@/features/students/store'

// ─── Query keys ───────────────────────────────────────────────────────────────

export const studentKeys = {
  all: ['students'] as const,
  lists: () => [...studentKeys.all, 'list'] as const,
  list: (params: StudentsListParams) => [...studentKeys.lists(), params] as const,
  details: () => [...studentKeys.all, 'detail'] as const,
  detail: (id: string) => [...studentKeys.details(), id] as const,
  timeline: (id: string) => [...studentKeys.all, 'timeline', id] as const,
}

// ─── List hook ────────────────────────────────────────────────────────────────

export function useStudents(params: StudentsListParams = {}) {
  const mockStudents = useStudentsStore((s) => s.students)

  return useQuery({
    queryKey: studentKeys.list(params),
    queryFn: () => studentApi.list(params),
    // In mock mode: return the Zustand store data shaped like a backend response
    enabled: !isMockMode(),
    placeholderData: isMockMode()
      ? {
          students: mockStudents.map((s) => ({
            id: s.id,
            firstName: s.name.split(' ')[0],
            lastName: s.name.split(' ').slice(1).join(' '),
            email: s.email,
            phone: s.phone ?? null,
            dateOfBirth: null,
            nationality: s.nationality ?? null,
            currentStage: s.status as string,
            source: null,
            assignedCounselorId: s.counselorId ?? null,
            referredByAgentId: null,
            academicBackground: null,
            financialBackground: null,
            notes: null,
            isActive: s.status !== 'inactive' && s.status !== 'dropped',
            createdAt: s.createdAt,
            updatedAt: s.createdAt,
            processingType: (s.processingType === 'partner_consultancy' ? 'PARTNER_CONSULTANCY' : 'SELF') as 'SELF' | 'PARTNER_CONSULTANCY',
            partnerConsultancyId: s.partnerConsultancyId ?? null,
            partnerConsultancy: s.partnerConsultancyName
              ? { id: s.partnerConsultancyId ?? '', name: s.partnerConsultancyName }
              : null,
          })),
          pagination: {
            page: 1,
            limit: 50,
            total: mockStudents.length,
            totalPages: 1,
          },
        }
      : undefined,
  })
}

// ─── Single student hook ──────────────────────────────────────────────────────

export function useStudent(id: string) {
  const mockStudents = useStudentsStore((s) => s.students)

  return useQuery({
    queryKey: studentKeys.detail(id),
    queryFn: () => studentApi.getOne(id),
    enabled: !isMockMode() && !!id,
    placeholderData: isMockMode()
      ? (() => {
          const s = mockStudents.find((s) => s.id === id)
          if (!s) return undefined
          return {
            id: s.id,
            firstName: s.name.split(' ')[0],
            lastName: s.name.split(' ').slice(1).join(' '),
            email: s.email,
            phone: s.phone ?? null,
            dateOfBirth: null,
            nationality: s.nationality ?? null,
            currentStage: s.status as string,
            source: null,
            assignedCounselorId: s.counselorId ?? null,
            referredByAgentId: null,
            academicBackground: null,
            financialBackground: null,
            notes: null,
            isActive: s.status !== 'inactive' && s.status !== 'dropped',
            createdAt: s.createdAt,
            updatedAt: s.createdAt,
            processingType: (s.processingType === 'partner_consultancy' ? 'PARTNER_CONSULTANCY' : 'SELF') as 'SELF' | 'PARTNER_CONSULTANCY',
            partnerConsultancyId: s.partnerConsultancyId ?? null,
            partnerConsultancy: s.partnerConsultancyName
              ? { id: s.partnerConsultancyId ?? '', name: s.partnerConsultancyName }
              : null,
          }
        })()
      : undefined,
  })
}

// ─── Create mutation ──────────────────────────────────────────────────────────

export function useCreateStudent() {
  const queryClient = useQueryClient()
  const addStudent = useStudentsStore((s) => s.addStudent)

  return useMutation({
    mutationFn: (body: CreateStudentBody) => {
      if (isMockMode()) {
        // delegate to Zustand store for mock mode
        addStudent({
          name: `${body.firstName} ${body.lastName}`,
          email: body.email,
          phone: body.phone,
          nationality: body.nationality,
          source: body.source as never,
          currentStage: 'LEAD',
          assignedCounselorId: body.assignedCounselorId,
          notes: body.notes,
          isActive: true,
          photoColor: '#64748B',
        } as never)
        return Promise.resolve(null as never)
      }
      return studentApi.create(body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() })
      toast.success('Student created')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ─── Update mutation ──────────────────────────────────────────────────────────

export function useUpdateStudent() {
  const queryClient = useQueryClient()
  const mockUpdate = useStudentsStore((s) => s.updateStudent)

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: import('@/api/student-api').UpdateStudentBody }) => {
      if (isMockMode()) {
        mockUpdate(id, body as never)
        return Promise.resolve(null as never)
      }
      return studentApi.update(id, body)
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() })
      toast.success('Student updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ─── Change pipeline stage mutation ───────────────────────────────────────────


export function useChangePipelineStage() {
  const queryClient = useQueryClient()
  const updateStudent = useStudentsStore((s) => s.updateStudent)

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ChangePipelineBody }) => {
      if (isMockMode()) {
        // In mock mode update the status field (closest equivalent to stage)
        updateStudent(id, { status: body.stage as 'active' | 'inactive' | 'enrolled' | 'dropped' })
        return Promise.resolve(null as never)
      }
      return studentApi.changePipeline(id, body)
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
