/**
 * use-universities.ts  — Phase F5
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isMockMode } from '@/lib/api-client'
import { universityApi, courseApi, type UniversityListParams, type CourseListParams, type CountryListParams } from '@/api/university-api'

export const universityKeys = {
  all: ['universities'] as const,
  lists: () => [...universityKeys.all, 'list'] as const,
  list: (p: UniversityListParams) => [...universityKeys.lists(), p] as const,
  detail: (id: string) => [...universityKeys.all, 'detail', id] as const,
  countries: () => [...universityKeys.all, 'countries'] as const,
  countryList: (p: CountryListParams) => [...universityKeys.countries(), p] as const,
}

export const courseKeys = {
  all: ['courses'] as const,
  lists: () => [...courseKeys.all, 'list'] as const,
  list: (p: CourseListParams) => [...courseKeys.lists(), p] as const,
  detail: (id: string) => [...courseKeys.all, 'detail', id] as const,
}

// ── Countries ─────────────────────────────────────────────────────────────────

export function useCountries(params: CountryListParams = {}) {
  return useQuery({
    queryKey: universityKeys.countryList(params),
    queryFn: () => universityApi.listCountries(params),
    enabled: !isMockMode(),
    staleTime: 5 * 60_000, // countries change rarely
  })
}

// ── Universities ──────────────────────────────────────────────────────────────

export function useUniversities(params: UniversityListParams = {}) {
  return useQuery({
    queryKey: universityKeys.list(params),
    queryFn: () => universityApi.list(params),
    enabled: !isMockMode(),
    staleTime: 5 * 60_000,
  })
}

export function useUniversity(id: string) {
  return useQuery({
    queryKey: universityKeys.detail(id),
    queryFn: () => universityApi.getOne(id),
    enabled: !isMockMode() && !!id,
  })
}

// ── Courses ───────────────────────────────────────────────────────────────────

export function useCourses(params: CourseListParams = {}) {
  return useQuery({
    queryKey: courseKeys.list(params),
    queryFn: () => courseApi.list(params),
    enabled: !isMockMode(),
    staleTime: 5 * 60_000,
  })
}

export function useCourse(id: string) {
  return useQuery({
    queryKey: courseKeys.detail(id),
    queryFn: () => courseApi.getOne(id),
    enabled: !isMockMode() && !!id,
  })
}

// ── Mutations (SUPER_ADMIN only) ──────────────────────────────────────────────

export function useCreateUniversity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Parameters<typeof universityApi.create>[0]) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return universityApi.create(body)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: universityKeys.lists() }); toast.success('University created') },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useCreateCourse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Parameters<typeof courseApi.create>[0]) => {
      if (isMockMode()) return Promise.resolve(null as never)
      return courseApi.create(body)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: courseKeys.lists() }); toast.success('Course created') },
    onError: (err: Error) => toast.error(err.message),
  })
}
