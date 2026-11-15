/**
 * use-leads-live.ts
 *
 * In Live Mode, "leads" are students at the LEAD or PROSPECT pipeline stage.
 * We reuse the existing /students endpoint with stageIn=LEAD,PROSPECT.
 * The result is adapted to the frontend Lead shape so leads-page.tsx stays unchanged.
 */

import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isMockMode } from '@/lib/api-client'
import { studentApi, type CreateStudentBody } from '@/api/student-api'
import { resolveStudentOwnershipBranchId } from '@/lib/student-adapter'
import { studentKeys, useStudents, useTrashStudents } from '@/hooks/use-students'
import { useAuthStore } from '@/store/auth-store'
import type { Lead, LeadStage, LeadSource } from '@/types'

// ── Stage mapping: backend stage → frontend lead stage ──────────────────────

function resolveFrontendLeadStage(student: any): LeadStage {
  if (student.isActive === false) return 'trash'
  const raw = student.academicBackground?.leadStage || student.leadStage
  if (raw) {
    const lower = String(raw).toLowerCase().replace(/-/g, '_')
    if (lower === 'new') return 'new'
    if (lower === 'follow_up' || lower === 'followup' || lower === 'contacted') return 'follow_up'
    if (lower === 'assigned' || lower === 'counseling' || lower === 'counselling') return 'assigned'
    if (lower === 'not_contracted') return 'not_contracted'
    if (lower === 'interested') return 'interested'
  }
  if (student.assignedCounselorId) return 'assigned'
  if (student.currentStage === 'PROSPECT') return 'assigned'
  return 'new'
}

const BACKEND_STAGE_MAP: Record<LeadStage, { stage: string; leadStage: string }> = {
  new: { stage: 'LEAD', leadStage: 'NEW' },
  follow_up: { stage: 'LEAD', leadStage: 'FOLLOW_UP' },
  assigned: { stage: 'PROSPECT', leadStage: 'ASSIGNED' },
  not_contracted: { stage: 'LEAD', leadStage: 'NOT_CONTRACTED' },
  counseling: { stage: 'PROSPECT', leadStage: 'COUNSELLING' },
  interested: { stage: 'PROSPECT', leadStage: 'INTERESTED' },
  application: { stage: 'APPLIED', leadStage: 'INTERESTED' },
  offer_letter: { stage: 'OFFER_RECEIVED', leadStage: 'INTERESTED' },
  visa: { stage: 'VISA_APPLIED', leadStage: 'INTERESTED' },
  travel: { stage: 'DEPARTED', leadStage: 'INTERESTED' },
  completed: { stage: 'ENROLLED', leadStage: 'INTERESTED' },
  trash: { stage: 'LEAD', leadStage: 'NEW' },
}

// ── Source mapping: backend source → frontend LeadSource ─────────────────────
// Backend may return values like 'OTHER', 'REFERRAL_AGENT', 'FACEBOOK', etc.

const VALID_SOURCES = new Set<LeadSource>([
  'website', 'facebook', 'referral_agent', 'walk_in', 'education_fair', 'google_ads', 'instagram',
])

function mapSource(raw: string | null): LeadSource {
  if (!raw) return 'walk_in'
  const normalized = raw.toLowerCase().replace(/-/g, '_') as LeadSource
  return VALID_SOURCES.has(normalized) ? normalized : 'walk_in'
}

// ── Frontend source → backend source string ───────────────────────────────────
export const SOURCE_TO_BACKEND: Record<LeadSource, string> = {
  website: 'WEBSITE',
  facebook: 'FACEBOOK',
  referral_agent: 'REFERRAL_AGENT',
  walk_in: 'WALK_IN',
  education_fair: 'EDUCATION_FAIR',
  google_ads: 'GOOGLE_ADS',
  instagram: 'INSTAGRAM',
}

// ── Adapter: ApiStudent → Lead ───────────────────────────────────────────────

function parseLevelFromNotes(notes: string | null): import('@/types').StudyLevel {
  if (!notes) return 'bachelor'
  const match = notes.match(/Level:\s*([a-zA-Z]+)/i)
  if (match) {
    const raw = match[1].toLowerCase()
    if (raw.includes('master')) return 'master'
    if (raw.includes('diploma')) return 'diploma'
    if (raw.includes('foundation')) return 'foundation'
    if (raw.includes('phd') || raw.includes('doctorate')) return 'phd'
    if (raw.includes('bachelor')) return 'bachelor'
  }
  const lower = notes.toLowerCase()
  if (lower.includes('master')) return 'master'
  if (lower.includes('diploma')) return 'diploma'
  if (lower.includes('phd')) return 'phd'
  if (lower.includes('foundation')) return 'foundation'
  return 'bachelor'
}

function parseCountryFromNotes(notes: string | null): string {
  if (!notes) return ''
  const match = notes.match(/Interested Countries:\s*([^|]+)/i)
  if (match) return match[1].trim()
  return ''
}

function adaptStudentToLead(student: {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  currentStage: string
  leadStage?: string
  academicBackground?: Record<string, unknown> | null
  source: string | null
  createdAt: string
  notes: string | null
  assignedCounselorId?: string | null
  assignedCounselor?: { id: string; firstName: string; lastName: string; branchId?: string | null } | null
  referredByAgentId?: string | null
  referredByAgent?: {
    id: string
    referralCode: string
    user?: { id: string; firstName: string; lastName: string; email: string } | null
  } | null
}): Lead {
  const counselorName = student.assignedCounselor
    ? `${student.assignedCounselor.firstName} ${student.assignedCounselor.lastName}`.trim()
    : 'Unassigned'

  const feStage: LeadStage = resolveFrontendLeadStage(student)
  const parsedLevel = parseLevelFromNotes(student.notes)
  const parsedCountry = parseCountryFromNotes(student.notes)

  const referralAgentName = student.referredByAgent?.user
    ? `${student.referredByAgent.user.firstName} ${student.referredByAgent.user.lastName}`.trim()
    : undefined

  const resolvedBranchId = resolveStudentOwnershipBranchId(student as any)

  return {
    id: student.id,
    name: `${student.firstName} ${student.lastName}`.trim(),
    email: student.email,
    phone: student.phone ?? '',
    photoColor: '#64748B',
    source: mapSource(student.source),
    stage: feStage,
    counselorId: (student as any).assignedCounselorId || student.assignedCounselor?.id || '',
    counselorName,
    referralAgentId: student.referredByAgentId ?? student.referredByAgent?.id,
    referralAgentName,
    interestedCountry: parsedCountry,
    interestedCountries: parsedCountry ? [parsedCountry] : [],
    interestedLevel: parsedLevel,
    priority: 'medium',
    lastContact: student.createdAt,
    nextFollowUp: new Date(Date.now() + 7 * 86400000).toISOString(),
    createdAt: student.createdAt,
    value: 0,
    notes: student.notes ?? '',
    ...(resolvedBranchId ? { branchId: resolvedBranchId } : {}),
  } as Lead
}


// ── Hook: fetch live leads ───────────────────────────────────────────────────

/** Returns live leads (LEAD + PROSPECT students) directly from canonical backend state. */
export function useLiveLeads(options?: { enabled?: boolean }) {
  const currentUser = useAuthStore((s) => s.currentUser)

  // Scope by counselor in live mode: counselors only see their own students
  const counselorId =
    currentUser.role === 'counselor' ? (currentUser.linkedId || undefined) : undefined

  const isPermitted = !['teacher', 'student'].includes(currentUser.role)
  const isEnabled = isPermitted && (options?.enabled ?? true)

  const { data, isLoading, isError, error, refetch } = useStudents(
    {
      stageIn: 'LEAD,PROSPECT',
      limit: 1000,
      counselorId,
    },
    { enabled: isEnabled }
  )

  const leads: Lead[] = useMemo(() => {
    if (isMockMode() || !data?.students) return []
    return data.students.map((s) => adaptStudentToLead(s))
  }, [data])

  const totalCount = data?.pagination?.total ?? leads.length

  return { leads, totalCount, isLoading, isError, error, refetch }
}

// ── Mutation: move a lead stage in the backend ───────────────────────────────

export interface MoveLiveLeadPayload {
  id: string
  stage: LeadStage
  followUpDate?: string
  followUpTime?: string
  durationMin?: number
  meetingMode?: string
  notes?: string
}

export function useMoveLiveLead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ id, stage, followUpDate, followUpTime, durationMin, meetingMode, notes }: MoveLiveLeadPayload) => {
      if (isMockMode()) return Promise.resolve(null as never)
      const mapping = BACKEND_STAGE_MAP[stage]
      if (!mapping) return Promise.resolve(null as never)
      return studentApi.changePipeline(id, {
        stage: mapping.stage,
        leadStage: mapping.leadStage,
        followUpDate,
        followUpTime,
        durationMin,
        meetingMode,
        notes,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: studentKeys.all })
      qc.invalidateQueries({ queryKey: ['appointments'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err: Error) => {
      qc.invalidateQueries({ queryKey: studentKeys.all })
      if (err.message && err.message.includes('already at this stage')) {
        return
      }
      toast.error(err.message || 'Failed to update lead stage')
    },
  })
}

// ── Mutation: create a new lead in the backend ────────────────────────────────

export interface CreateLeadBody {
  firstName: string
  lastName: string
  email: string
  phone?: string
  source?: LeadSource
  assignedCounselorId?: string
  referredByAgentId?: string
  notes?: string
  academicBackground?: Record<string, unknown>
}

export function useCreateLiveLead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (body: CreateLeadBody) => {
      const payload: CreateStudentBody = {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        source: body.source ? SOURCE_TO_BACKEND[body.source] : undefined,
        assignedCounselorId: body.assignedCounselorId,
        referredByAgentId: body.referredByAgentId,
        notes: body.notes,
        academicBackground: body.academicBackground,
        currentStage: 'LEAD', // Always start as LEAD — never skip the pipeline
      }
      return studentApi.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: studentKeys.lists() })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Lead added successfully')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add lead'),
  })
}

// ── Mutation: update an existing lead in the backend ─────────────────────────

export interface UpdateLeadBody {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  source?: LeadSource
  assignedCounselorId?: string | null
  referredByAgentId?: string | null
  notes?: string
}

export function useUpdateLiveLead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateLeadBody }) => {
      if (isMockMode()) return null
      return studentApi.update(id, {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        source: data.source ? SOURCE_TO_BACKEND[data.source] : undefined,
        assignedCounselorId: data.assignedCounselorId,
        referredByAgentId: data.referredByAgentId,
        notes: data.notes,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: studentKeys.all })

      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Lead updated successfully')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update lead'),
  })
}

// ── Mutation: delete a lead from the backend ──────────────────────────────────

export interface DeleteLeadPayload {
  id: string
  reason: string
}

export function useDeleteLiveLead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (payload: DeleteLeadPayload) => {
      const trimmedReason = typeof payload?.reason === 'string' ? payload.reason.trim() : ''
      if (!trimmedReason) {
        throw new Error('A non-empty reason is required to move a lead to Trash.')
      }
      if (isMockMode()) return null
      return studentApi.remove(payload.id, trimmedReason)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: studentKeys.all })
      qc.invalidateQueries({ queryKey: studentKeys.trashLists() })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to move lead to Trash'),
  })
}

// ── Hook: fetch trashed leads ─────────────────────────────────────────────────

export function useTrashLeads(params: { search?: string; page?: number; limit?: number } = {}) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const canAccessTrash =
    currentUser.role === 'super_admin' ||
    currentUser.role === 'branch_admin' ||
    currentUser.role === 'front_desk'

  const { data, isLoading, isError, error, refetch } = useTrashStudents(
    {
      stageIn: 'LEAD,PROSPECT',
      search: params.search,
      page: params.page,
      limit: params.limit || 50,
    },
    canAccessTrash && !isMockMode()
  )

  const trashedLeads = useMemo(() => {
    if (!data?.students) return []
    return data.students
  }, [data])

  return {
    students: trashedLeads,
    pagination: data?.pagination,
    isLoading,
    isError,
    error,
    refetch,
  }
}

// ── Mutation: restore lead from trash ─────────────────────────────────────────

export function useRestoreLiveLead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      if (isMockMode()) return null
      return studentApi.restore(id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: studentKeys.all })
      qc.invalidateQueries({ queryKey: studentKeys.trashLists() })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Lead restored to active pipeline successfully.')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to restore lead'),
  })
}

// ── Mutation: assign lead to counselor ────────────────────────────────────────

export interface AssignLiveLeadPayload {
  id: string
  counselorId: string
  appointmentDate: string
  appointmentTime: string
  durationMin?: number
  meetingMode?: string
  notes?: string
}

export function useAssignLiveLead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      counselorId,
      appointmentDate,
      appointmentTime,
      durationMin,
      meetingMode,
      notes,
    }: AssignLiveLeadPayload) => {
      if (isMockMode()) return null
      return studentApi.assignCounselor(id, {
        counselorId,
        appointmentDate,
        appointmentTime,
        durationMin,
        meetingMode,
        notes,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: studentKeys.all })
      qc.invalidateQueries({ queryKey: ['appointments'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Lead assigned and appointment scheduled successfully')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to assign lead'),
  })
}

// ── Mutation: transfer student branch ─────────────────────────────────────────

export function useTransferLeadBranch() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      destinationBranchId,
      newAssignedCounselorId,
    }: {
      id: string
      destinationBranchId: string
      newAssignedCounselorId?: string | null
    }) => {
      if (isMockMode()) return null
      return studentApi.transferBranch(id, { destinationBranchId, newAssignedCounselorId })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: studentKeys.all })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Lead transferred to destination branch successfully')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to transfer branch'),
  })
}
