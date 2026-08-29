/**
 * dashboard-api.ts
 *
 * Axios wrappers for the dream-sky /dashboard endpoints.
 * Uses the consolidated summary endpoint to avoid 7 parallel browser calls.
 */

import { api } from '@/lib/api-client'

export interface DashboardSummary {
  totalStudents: number
  newLeads: number
  pendingFollowUps: number
  applications: number
  offerLetters: number
  visaCases: number
  enrolledOnly: number
  totalLeads: number
}

export interface CounselorSummary {
  stageBreakdown: Array<{ stage: string; count: number }>
  totalStudents: number
  activeStudents: number
  upcomingFollowUps: Array<{
    id: string
    studentName: string
    reminder: string
    date: string
  }>
  commission: {
    earned: number
    paid: number
    pending: number
    count: number
  }
}

export const dashboardApi = {
  /** GET /dashboard/summary — consolidated super-admin stats */
  getSummary(): Promise<DashboardSummary> {
    return api.get('/dashboard/summary')
  },

  /** GET /dashboard/counselor-summary?counselorId=<id> */
  getCounselorSummary(counselorId?: string): Promise<CounselorSummary> {
    return api.get('/dashboard/counselor-summary', {
      params: counselorId ? { counselorId } : undefined,
    })
  },
}
