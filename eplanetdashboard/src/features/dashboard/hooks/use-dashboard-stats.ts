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
import { useStudentsStore } from '@/features/students/store'
import { useApplicationsStore } from '@/features/applications/store'
import { useVisaStore } from '@/features/visa/store'
import { useLeadsStore } from '@/features/leads/store'
import { useFollowUpsStore } from '@/features/followups/store'
import { visibleAppointments, visibleFollowUps } from '@/lib/data-visibility'
import { studentApi } from '@/api/student-api'
import { followUpApi } from '@/api/followup-api'
import { appointmentApi } from '@/api/appointment-api'
import { dashboardApi } from '@/api/dashboard-api'
import { applicationApi } from '@/api/application-api'
import { visaApi } from '@/api/visa-api'
import { getFrontDeskStats, getCounselorDashboard } from '../role-selectors'
import { getUpcomingFollowUps } from '../selectors'
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
  // Subscribe to all relevant stores so cards update instantly in mock mode
  const students     = useStudentsStore((s) => s.students)
  const applications = useApplicationsStore((s) => s.applications)
  const visaCases    = useVisaStore((s) => s.visaCases)
  const leads        = useLeadsStore((s) => s.leads)
  const followUps    = useFollowUpsStore((s) => s.followUps)

  // Compute reactive mock stats directly from store data
  const mockStats: SuperAdminStatItem[] | null = isMockMode() ? (() => {
    const totalStudents     = students.length
    const newLeads          = leads.filter((l) => dayjs(l.createdAt).isAfter(dayjs().subtract(30, 'day'))).length
    const todayFollowUps    = followUps.filter((f) => dayjs(f.date).isSame(dayjs(), 'day') && f.status === 'pending').length
    const totalApplications = applications.length
    const offerLetters      = applications.filter((a) => a.stage === 'conditional_offer' || a.stage === 'unconditional_offer').length
    const visaInProgress    = visaCases.filter((v) => v.overallStatus === 'in_progress' || v.overallStatus === 'submitted').length
    const enrolledStudents  = students.filter((s) => s.status === 'enrolled').length

    return [
      { label: 'Total Students',     value: totalStudents,     delta: `${totalStudents} total`,           trend: 'up'   as const },
      { label: 'New Leads',          value: newLeads,          delta: 'Last 30 days',                     trend: 'up'   as const },
      { label: "Today's Follow-ups", value: todayFollowUps,    delta: 'Upcoming',                         trend: 'flat' as const },
      { label: 'Applications',       value: totalApplications, delta: `${totalApplications} active`,      trend: 'up'   as const },
      { label: 'Offer Letters',      value: offerLetters,      delta: `${offerLetters} received`,         trend: 'up'   as const },
      { label: 'Visa Processing',    value: visaInProgress,    delta: `${visaCases.length} total cases`,  trend: 'flat' as const },
      { label: 'Enrolled Students',  value: enrolledStudents,  delta: `${enrolledStudents} enrolled`,     trend: 'up'   as const },
    ]
  })() : null

  const query = useQuery<SuperAdminStatItem[]>({
    queryKey: dashboardKeys.superAdmin(),
    queryFn: async () => {
      // Fetch summary + raw applications + visa cases in parallel so we can apply
      // the exact same filter the Applications page uses:
      // an application is only counted if it has NO linked visa case.
      const [summary, appsResp, visaResp] = await Promise.all([
        dashboardApi.getSummary(),
        applicationApi.list({ limit: 1000 }),
        visaApi.list({ limit: 1000 }),
      ])

      // Build a set of application IDs that have been moved to Visa Processing
      const visaLinkedAppIds = new Set<string>()
      for (const vc of visaResp.visaCases ?? []) {
        if (vc.applicationId) visaLinkedAppIds.add(vc.applicationId)
        if ((vc as any).application?.id) visaLinkedAppIds.add((vc as any).application.id)
      }

      // Mirror the Applications page filter: exclude apps that have a visaCase or
      // whose ID appears in a visa case's applicationId
      const pureApps = (appsResp.applications ?? []).filter(
        (app) => !(app as any).visaCase && !visaLinkedAppIds.has(app.id)
      )

      // Offer letters: conditional or unconditional offers within pure apps
      const offerCount = pureApps.filter((app) => {
        if (!app.offers || app.offers.length === 0) return false
        return app.offers.some(
          (o) => o.type === 'CONDITIONAL' || o.type === 'UNCONDITIONAL'
        )
      }).length

      const appCount = pureApps.length
      const visaCount = visaResp.visaCases?.length ?? summary.visaCases

      return [
        { label: 'Total Students',      value: summary.totalStudents,   delta: `${summary.totalStudents} total`,     trend: 'up'   as const },
        { label: 'New Leads',           value: summary.newLeads,         delta: 'Last 30 days',                       trend: 'up'   as const },
        { label: "Today's Follow-ups",  value: summary.pendingFollowUps, delta: 'Upcoming',                           trend: 'flat' as const },
        { label: 'Applications',        value: appCount,                 delta: `${appCount} active`,                 trend: 'up'   as const },
        { label: 'Offer Letters',       value: offerCount,               delta: `${offerCount} received`,             trend: 'up'   as const },
        { label: 'Visa Processing',     value: visaCount,                delta: `${visaCount} total cases`,           trend: 'flat' as const },
        { label: 'Enrolled Students',   value: summary.enrolledOnly,     delta: `${summary.enrolledOnly} enrolled`,   trend: 'up'   as const },
      ]
    },
    staleTime: 0,              // always considered stale — refetch on every mount/focus
    refetchOnMount: 'always',  // force a fresh fetch every time dashboard mounts
    refetchOnWindowFocus: true, // refetch when user switches back to this browser tab
    refetchInterval: 30_000,   // background poll every 30 s so numbers stay live
    enabled: !isMockMode(),
    // In real mode show loading skeleton until first fetch; in mock mode supply reactive store data
    placeholderData: (previousData) =>
      previousData ?? (isMockMode() ? (mockStats ?? undefined) : undefined),
  })

  // In mock mode return the reactive store-derived stats directly (bypasses React Query)
  if (isMockMode()) {
    return { ...query, data: mockStats ?? [] }
  }

  return query
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
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
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
      const summary = await dashboardApi.getCounselorSummary(linkedId)

      const stageCounts = new Map<string, number>()
      summary.stageBreakdown.forEach(({ stage, count }) => {
        if (count <= 0) return
        const mapped = STAGE_TO_LEAD_STAGE[stage]
        if (mapped) stageCounts.set(mapped, (stageCounts.get(mapped) ?? 0) + count)
      })

      const totalStudents = summary.totalStudents
      const activeTotal = summary.activeStudents
      const converted = stageCounts.get('completed') ?? 0

      const followUpItems = (summary.upcomingFollowUps ?? []).map((f) => ({
        id: f.id,
        studentName: f.studentName || 'Student',
        reminder: f.reminder || 'Follow-up reminder',
        date: f.date,
        priority: 'medium' as Priority,
      }))

      const totalLeads = (stageCounts.get('new') ?? 0) + (stageCounts.get('contacted') ?? 0)

      return {
        counselor: {
          name: currentUser.name,
          conversionRate: totalStudents > 0 ? Math.round((converted / totalStudents) * 100) : 0,
          studentsHandled: totalStudents,
        },
        totalStudents,
        activeStudents: activeTotal,
        totalLeads,
        stageBreakdown: Array.from(stageCounts.entries()).map(([stage, count]) => ({ stage, count })),
        upcomingFollowUps: followUpItems,
        commission: summary.commission ?? { earned: 0, paid: 0, pending: 0, count: 0 },
      }
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
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
