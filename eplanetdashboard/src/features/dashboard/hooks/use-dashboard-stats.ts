/**
 * use-dashboard-stats.ts  — Phase F7
 *
 * Mock-aware dashboard data hooks.
 *
 *  - MOCK mode  (VITE_USE_MOCK=true): delegates to the existing mock selectors,
 *    so demo behaviour is unchanged.
 *  - REAL mode  (VITE_USE_MOCK=false): computes the same stats from the dream-sky
 *    API (students, follow-ups, appointments, commissions). The shapes returned
 *    to the dashboard components are identical in both modes.
 *
 * React Query usage mirrors the other feature hooks (useStudents, etc.):
 * the query is disabled in mock mode and `placeholderData` supplies the data,
 * so `data` is never undefined.
 */

import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'
import { isMockMode } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth-store'
import { useAppointmentsStore } from '@/features/appointments/store'
import { visibleAppointments, visibleFollowUps } from '@/lib/data-visibility'
import { studentApi } from '@/api/student-api'
import { followUpApi } from '@/api/followup-api'
import { appointmentApi } from '@/api/appointment-api'
import { commissionApi } from '@/api/commission-api'
import { dashboardApi } from '@/api/dashboard-api'
import { getFrontDeskStats, getCounselorDashboard } from '../role-selectors'
import { getUpcomingFollowUps, getDashboardStats } from '../selectors'
import type { AppointmentStatus, LeadStage, Priority } from '@/types'

// ─── Query keys ───────────────────────────────────────────────────────────────

const dashboardKeys = {
  all: ['dashboard'] as const,
  superAdmin: () => [...dashboardKeys.all, 'super-admin'] as const,
  frontDesk: () => [...dashboardKeys.all, 'front-desk'] as const,
  counselor: (linkedId: string) => [...dashboardKeys.all, 'counselor', linkedId] as const,
  todayAppointments: (date: string) => [...dashboardKeys.all, 'today-appointments', date] as const,
  upcomingFollowUps: () => [...dashboardKeys.all, 'upcoming-follow-ups'] as const,
}

// ─── Real-mode stage helpers (dream-sky Student.currentStage enum) ───────────

const ALL_STAGES = [
  'LEAD', 'PROSPECT', 'ENROLLED', 'APPLIED', 'OFFER_RECEIVED',
  'VISA_APPLIED', 'VISA_APPROVED', 'DEPARTED', 'LOST',
]
const PIPELINE_STAGES = ['LEAD', 'PROSPECT', 'APPLIED', 'OFFER_RECEIVED', 'VISA_APPLIED', 'VISA_APPROVED']
const FEE_STAGES = 'OFFER_RECEIVED,VISA_APPLIED,VISA_APPROVED'

// Map dream-sky stages onto the frontend lead-stage labels the pipeline card renders.
const STAGE_TO_LEAD_STAGE: Record<string, LeadStage> = {
  LEAD: 'new',
  PROSPECT: 'contacted',
  APPLIED: 'application',
  OFFER_RECEIVED: 'offer_letter',
  VISA_APPLIED: 'visa',
  VISA_APPROVED: 'travel',
  ENROLLED: 'completed',
  DEPARTED: 'completed',
}

// ─── Super Admin ─────────────────────────────────────────────────────────────

export interface SuperAdminStatItem {
  label: string
  value: number
  delta: string
  trend: 'up' | 'down' | 'flat'
}

export function useSuperAdminStats() {
  return useQuery<SuperAdminStatItem[]>({
    queryKey: dashboardKeys.superAdmin(),
    queryFn: async () => {
      // Single consolidated request — backend runs all counts in parallel server-side
      const summary = await dashboardApi.getSummary()

      return [
        { label: 'Total Students',      value: summary.totalStudents,   delta: `${summary.totalStudents} total`,       trend: 'up'   as const },
        { label: 'New Leads',           value: summary.newLeads,         delta: 'Last 30 days',                         trend: 'up'   as const },
        { label: "Today's Follow-ups",  value: summary.pendingFollowUps, delta: 'Upcoming',                             trend: 'flat' as const },
        { label: 'Applications',        value: summary.applications,     delta: `${summary.applications} active`,       trend: 'up'   as const },
        { label: 'Offer Letters',       value: summary.offerLetters,     delta: `${summary.offerLetters} received`,     trend: 'up'   as const },
        { label: 'Visa Processing',     value: summary.visaCases,        delta: `${summary.visaCases} total cases`,     trend: 'flat' as const },
        { label: 'Enrolled Students',   value: summary.enrolledOnly,     delta: `${summary.enrolledOnly} enrolled`,     trend: 'up'   as const },
      ]
    },
    staleTime: 2 * 60 * 1000,     // 2 minutes — refresh dashboard data more often
    enabled: !isMockMode(),
    // In real mode: return undefined (not []) so the dashboard shows a loading state
    // until the first successful fetch. In mock mode: return pre-computed mock data.
    placeholderData: (previousData) =>
      previousData ?? (isMockMode() ? getDashboardStats() : undefined),
  })
}

// ─── Front Desk ───────────────────────────────────────────────────────────────

export interface FrontDeskStats {
  newLeadsToday: number
  todaysAppointments: number
  feeCollectionQueue: number
  pendingFollowUps: number
}

const ZERO_FRONT_DESK: FrontDeskStats = {
  newLeadsToday: 0,
  todaysAppointments: 0,
  feeCollectionQueue: 0,
  pendingFollowUps: 0,
}

export { ZERO_FRONT_DESK }

export function useFrontDeskStats() {
  return useQuery<FrontDeskStats>({
    queryKey: dashboardKeys.frontDesk(),
    queryFn: async () => {
      const todayStart = dayjs().startOf('day').toISOString()
      const todayEnd = dayjs().endOf('day').toISOString()
      const [newLeads, pendingFollowUps, feeQueue] = await Promise.all([
        studentApi.list({ createdFrom: todayStart, createdTo: todayEnd, limit: 1 }),
        followUpApi.list({ status: 'upcoming', limit: 1 }),
        studentApi.list({ stageIn: FEE_STAGES, limit: 1 }),
      ])
      return {
        newLeadsToday: newLeads.pagination.total,
        pendingFollowUps: pendingFollowUps.pagination.total,
        feeCollectionQueue: feeQueue.pagination.total,
        todaysAppointments: 0, // sourced live from the Today's Appointments panel
      }
    },
    enabled: !isMockMode(),
    placeholderData: isMockMode() ? getFrontDeskStats() : ZERO_FRONT_DESK,
  })
}

// ─── Counselor ────────────────────────────────────────────────────────────────

export interface CounselorDashboardData {
  counselor: { name: string; conversionRate: number; studentsHandled: number } | null
  totalStudents: number
  activeStudents: number
  totalLeads: number
  stageBreakdown: Array<{ stage: string; count: number }>
  upcomingFollowUps: Array<{ id: string; studentName: string; reminder: string; date: string; priority: Priority }>
  commission: { earned: number; paid: number; pending: number; count: number }
}

const ZERO_COUNSELOR: CounselorDashboardData = {
  counselor: null,
  totalStudents: 0,
  activeStudents: 0,
  totalLeads: 0,
  stageBreakdown: [],
  upcomingFollowUps: [],
  commission: { earned: 0, paid: 0, pending: 0, count: 0 },
}

export { ZERO_COUNSELOR }

export function useCounselorDashboard(linkedId: string) {
  const currentUser = useAuthStore((s) => s.currentUser)

  return useQuery<CounselorDashboardData>({
    queryKey: dashboardKeys.counselor(linkedId),
    queryFn: async () => {
      const [stageResults, inactive, followUps, commissions] = await Promise.all([
        Promise.all(ALL_STAGES.map((stage) => studentApi.list({ counselorId: linkedId, stage, limit: 1 }))),
        studentApi.list({ counselorId: linkedId, isActive: false, limit: 1 }),
        followUpApi.list({ authorId: linkedId, status: 'upcoming', limit: 6 }),
        commissionApi.list({ recipientId: linkedId }).catch(() => []),
      ])

      const stageCounts = new Map<string, number>()
      stageResults.forEach((resp, i) => {
        const count = resp.pagination.total
        if (count <= 0) return
        const mapped = STAGE_TO_LEAD_STAGE[ALL_STAGES[i]]
        if (mapped) stageCounts.set(mapped, (stageCounts.get(mapped) ?? 0) + count)
      })

      const activeTotal = stageResults.reduce((sum, resp) => sum + resp.pagination.total, 0)
      const inactiveTotal = inactive.pagination.total
      const totalStudents = activeTotal + inactiveTotal

      const converted =
        (stageCounts.get('completed') ?? 0)

      const followUpItems = followUps.followUps.map((f) => ({
        id: f.id,
        studentName: f.student ? `${f.student.firstName} ${f.student.lastName}`.trim() : 'Student',
        reminder: f.content || 'Follow-up reminder',
        date: f.nextFollowUpAt ?? f.createdAt,
        priority: 'medium' as Priority,
      }))

      const commissionList = Array.isArray(commissions) ? commissions : []
      const paid = commissionList
        .filter((c) => c.status === 'PAID')
        .reduce((sum, c) => sum + (c.amount ?? 0), 0)
      const pending = commissionList
        .filter((c) => c.status !== 'PAID')
        .reduce((sum, c) => sum + (c.amount ?? 0), 0)

      return {
        counselor: {
          name: currentUser.name,
          conversionRate: totalStudents > 0 ? Math.round((converted / totalStudents) * 100) : 0,
          studentsHandled: totalStudents,
        },
        totalStudents,
        activeStudents: activeTotal,
        totalLeads: PIPELINE_STAGES.reduce(
          (sum, stage) => sum + stageResults[ALL_STAGES.indexOf(stage)].pagination.total,
          0,
        ),
        stageBreakdown: Array.from(stageCounts.entries()).map(([stage, count]) => ({ stage, count })),
        upcomingFollowUps: followUpItems,
        commission: { earned: paid + pending, paid, pending, count: commissionList.length },
      }
    },
    enabled: !isMockMode() && !!linkedId,
    placeholderData: isMockMode()
      ? (getCounselorDashboard(linkedId) as unknown as CounselorDashboardData)
      : ZERO_COUNSELOR,
  })
}

// ─── Panels (Today's Appointments / Upcoming Follow-ups) ─────────────────────

export interface TodayAppointmentItem {
  id: string
  studentName: string
  counselorName: string
  type: string
  start: string
  status: AppointmentStatus
}

export interface UpcomingFollowUpItem {
  id: string
  studentName: string
  reminder: string
  date: string
  priority: Priority
}

export function useTodayAppointments(): { items: TodayAppointmentItem[]; isLoading: boolean } {
  const currentUser = useAuthStore((s) => s.currentUser)
  const mockAppts = useAppointmentsStore((s) => s.appointments)

  const query = useQuery({
    queryKey: dashboardKeys.todayAppointments(dayjs().format('YYYY-MM-DD')),
    queryFn: async () => {
      const today = dayjs()
      const resp = await appointmentApi.list({
        from: today.startOf('day').toISOString(),
        to: today.endOf('day').toISOString(),
        limit: 100,
      })
      return resp.appointments
        .map((a): TodayAppointmentItem => ({
          id: a.id,
          studentName: a.student ? `${a.student.firstName} ${a.student.lastName}`.trim() : 'Student',
          counselorName: a.counselor
            ? `${a.counselor.firstName} ${a.counselor.lastName}`.trim()
            : 'Unassigned',
          type: a.type,
          start: a.datetime,
          status: a.status.toLowerCase() as AppointmentStatus,
        }))
        .sort((a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf())
    },
    enabled: !isMockMode(),
  })

  if (isMockMode()) {
    const todayStr = dayjs().format('YYYY-MM-DD')
    const items: TodayAppointmentItem[] = visibleAppointments(currentUser, mockAppts)
      .filter((a) => dayjs(a.start).format('YYYY-MM-DD') === todayStr)
      .sort((a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf())
      .map((a) => ({
        id: a.id,
        studentName: a.studentName,
        counselorName: a.counselorName,
        type: a.type,
        start: a.start,
        status: a.status,
      }))
    return { items, isLoading: false }
  }

  return { items: query.data ?? [], isLoading: query.isLoading }
}

export function useUpcomingFollowUps(): { items: UpcomingFollowUpItem[]; isLoading: boolean } {
  const currentUser = useAuthStore((s) => s.currentUser)

  const query = useQuery({
    queryKey: dashboardKeys.upcomingFollowUps(),
    queryFn: async () => {
      const resp = await followUpApi.list({ status: 'upcoming', limit: 6 })
      return resp.followUps.map((f): UpcomingFollowUpItem => ({
        id: f.id,
        studentName: f.student ? `${f.student.firstName} ${f.student.lastName}`.trim() : 'Student',
        reminder: f.content || 'Follow-up reminder',
        date: f.nextFollowUpAt ?? f.createdAt,
        priority: 'medium',
      }))
    },
    enabled: !isMockMode(),
  })

  if (isMockMode()) {
    const items: UpcomingFollowUpItem[] = visibleFollowUps(currentUser, getUpcomingFollowUps(100))
      .slice(0, 6)
      .map((f) => ({
        id: f.id,
        studentName: f.studentName,
        reminder: f.reminder,
        date: f.date,
        priority: f.priority,
      }))
    return { items, isLoading: false }
  }

  return { items: query.data ?? [], isLoading: query.isLoading }
}
