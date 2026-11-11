/**
 * use-reports.ts
 *
 * React Query hooks for reports and analytics.
 */

import { useQuery } from '@tanstack/react-query'
import { isMockMode } from '@/lib/api-client'
import { reportApi } from '@/api/report-api'
import type { ReportFilters } from '@/features/reports/report-selectors'

export const reportKeys = {
  all: ['reports'] as const,
  summary: (filters?: Partial<ReportFilters>) => [...reportKeys.all, 'summary', filters] as const,
  teacher: () => [...reportKeys.all, 'teacher'] as const,
}

export function useReportSummary(filters?: Partial<ReportFilters>) {
  return useQuery({
    queryKey: reportKeys.summary(filters),
    queryFn: () => reportApi.getSummary(filters),
    enabled: !isMockMode(),
    staleTime: 60_000,
  })
}

export function useTeacherReports() {
  return useQuery({
    queryKey: reportKeys.teacher(),
    queryFn: () => reportApi.getTeacherReports(),
    enabled: !isMockMode(),
    staleTime: 60_000,
  })
}

