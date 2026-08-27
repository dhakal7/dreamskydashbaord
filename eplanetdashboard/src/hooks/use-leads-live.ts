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
import { studentKeys, useStudents } from '@/hooks/use-students'
import { useAuthStore } from '@/store/auth-store'
import type { Lead, LeadStage, LeadSource } from '@/types'

// ── Stage mapping: backend stage → frontend lead stage ──────────────────────

const LEAD_STAGE_MAP: Record<string, LeadStage> = {
  LEAD: 'new',
  PROSPECT: 'counseling',
}

const BACKEND_STAGE_MAP: Partial<Record<LeadStage, string>> = {
  new: 'LEAD',
  contacted: 'LEAD',
  counseling: 'PROSPECT',
  interested: 'PROSPECT',
  completed: 'ENROLLED',
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
  source: string | null
  createdAt: string
  notes: string | null
  assignedCounselor?: { id: string; firstName: string; lastName: string } | null
}): Lead {
  const counselorName = student.assignedCounselor
    ? `${student.assignedCounselor.firstName} ${student.assignedCounselor.lastName}`.trim()
    : 'Unassigned'

  const feStage: LeadStage = LEAD_STAGE_MAP[student.currentStage] ?? 'new'
  const parsedLevel = parseLevelFromNotes(student.notes)
  const parsedCountry = parseCountryFromNotes(student.notes)

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
    interestedCountry: parsedCountry,
    interestedCountries: parsedCountry ? [parsedCountry] : [],
    interestedLevel: parsedLevel,
    priority: 'medium',
    lastContact: student.createdAt,
    nextFollowUp: new Date(Date.now() + 7 * 86400000).toISOString(),
    createdAt: student.createdAt,
    value: 0,
    notes: student.notes ?? '',
  }
}

// ── Hook: fetch live leads ───────────────────────────────────────────────────

/** Returns live leads (LEAD + PROSPECT students) in live mode, or an empty array in mock mode. */
export function useLiveLeads() {
  const currentUser = useAuthStore((s) => s.currentUser)

  // Scope by counselor in live mode: counselors only see their own students
  const counselorId =
    currentUser.role === 'counselor' ? (currentUser.linkedId || undefined) : undefined

  const { data, isLoading } = useStudents({
    stageIn: 'LEAD,PROSPECT',
    limit: 1000,
    counselorId,
  })

  const leads: Lead[] = useMemo(() => {
    if (isMockMode() || !data?.students) return []
    return data.students.map(adaptStudentToLead)
  }, [data])

  const totalCount = data?.pagination?.total ?? leads.length

  return { leads, totalCount, isLoading }
}

// ── Mutation: move a lead stage in the backend ───────────────────────────────

export function useMoveLiveLead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: LeadStage }) => {
      if (isMockMode()) return Promise.resolve(null as never)
      const backendStage = BACKEND_STAGE_MAP[stage]
      if (!backendStage) return Promise.resolve(null as never)
      return studentApi.changePipeline(id, { stage: backendStage })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: studentKeys.lists() })
    },
    onError: (err: Error) => {
      if (err.message && err.message.includes('already at this stage')) {
        qc.invalidateQueries({ queryKey: studentKeys.lists() })
        return
      }
      toast.error(err.message)
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
  notes?: string
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
        notes: body.notes,
      }
      // Student is created at LEAD stage by default (backend sets currentStage='LEAD')
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
  assignedCounselorId?: string
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
