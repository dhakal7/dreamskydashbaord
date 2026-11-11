/**
 * report-api.ts
 *
 * Axios wrappers for dream-sky /reports endpoints.
 */

import { api } from '@/lib/api-client'
import type { ReportFilters } from '@/features/reports/report-selectors'

export interface ReportSummaryResponse {
  summary: Array<{ label: string; value: number }>
  applicationsByMonth: Array<{ month: string; applications: number }>
  leadsByMonth: Array<{ month: string; leads: number }>
  conversionTrend: Array<{ month: string; rate: number }>
  countryDistribution: Array<{ name: string; students: number; applications: number }>
  sourceDistribution: Array<{ source: string; count: number }>
  cumulativeStudents: Array<{ month: string; total: number }>
}

export interface TeacherReportsResponse {
  stats?: {
    totalClasses: number
    totalStudents: number
    overallAttendance: number
    testsRecorded: number
  }
  perClassAttendance: Array<{
    classId: string
    className: string
    overallPct: number
    weekly: Array<{ week: string; label: string; pct: number }>
    monthly: Array<{ month: string; label: string; pct: number }>
  }>
  perStudentTestResults: Array<{
    studentId: string
    studentName: string
    classId: string
    className: string
    testCount: number
    avgScore: number | null
    latestResult: { createdAt: string; id?: string; type?: string; score?: number; testDate?: string } | null
  }>
}

export const reportApi = {
  async getSummary(filters?: Partial<ReportFilters>): Promise<ReportSummaryResponse> {
    const params = {
      country: filters?.country !== 'all' ? filters?.country : undefined,
      counselorId: filters?.counselor !== 'all' ? filters?.counselor : undefined,
      universityId: filters?.university !== 'all' ? filters?.university : undefined,
      dateFrom: filters?.dateFrom || undefined,
      dateTo: filters?.dateTo || undefined,
    }
    return api.get('/reports/summary', { params })
  },

  async getTeacherReports(): Promise<TeacherReportsResponse> {
    return api.get('/reports/teacher')
  },
}

