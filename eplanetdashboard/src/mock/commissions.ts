import type { Commission, CommissionRule, CommissionStatus, Referral } from '@/types'
import { referralAgents } from './staff'
import { students } from './entities'
import { counselors } from './reference'
import { daysAgo, pad, pick, pickMany, randInt } from './generators'

// ── Commission Rules (Track B — configurable per role, immutable once snapshotted) ──

export const commissionRules: CommissionRule[] = [
  {
    id: 'crule-1', name: 'Counselor — Standard Enrollment', appliesToRole: 'counselor',
    type: 'fixed', value: 150, triggerStage: 'enrolled', effectiveFrom: '2025-01-01', active: true,
  },
  {
    id: 'crule-2', name: 'Counselor — Visa Granted Bonus', appliesToRole: 'counselor',
    type: 'percentage', value: 5, triggerStage: 'visa_granted', effectiveFrom: '2025-01-01', active: true,
  },
  {
    id: 'crule-3', name: 'Referral Agent — Standard Referral', appliesToRole: 'referral_agent',
    type: 'fixed', value: 100, triggerStage: 'fee_paid', effectiveFrom: '2025-01-01', active: true,
  },
  {
    id: 'crule-4', name: 'Referral Agent — Premium Tiered', appliesToRole: 'referral_agent',
    type: 'tiered', value: 8, triggerStage: 'offer_received', effectiveFrom: '2025-06-01', active: true,
  },
  {
    id: 'crule-4-legacy', name: 'Referral Agent — Premium Tiered (v1)', appliesToRole: 'referral_agent',
    type: 'tiered', value: 6, triggerStage: 'offer_received', effectiveFrom: '2024-01-01', effectiveTo: '2025-05-31', active: false,
  },
]

const statuses: CommissionStatus[] = ['pending', 'approved', 'paid', 'disputed']

// ── Counselor commissions ──────────────────────────────────────────────

const counselorRules = commissionRules.filter((r) => r.appliesToRole === 'counselor')

export const counselorCommissions: Commission[] = students.slice(0, 60).map((s, i) => {
  const rule = pick(counselorRules)
  const counselor = counselors.find((c) => c.id === s.counselorId) ?? pick(counselors)
  const amount = rule.type === 'fixed' ? rule.value : Math.round((s.budgetUsd * rule.value) / 100)
  return {
    id: `comm-c-${pad(i + 1, 3)}`,
    earnerType: 'counselor' as const,
    earnerId: counselor.id,
    earnerName: counselor.name,
    studentId: s.id,
    studentName: s.name,
    ruleId: rule.id,
    ruleSnapshot: { name: rule.name, type: rule.type, value: rule.value, triggerStage: rule.triggerStage },
    amountUsd: amount,
    status: pick(statuses),
    generatedAt: daysAgo(randInt(1, 180)),
    paidAt: undefined,
  }
}).map((c) => (c.status === 'paid' ? { ...c, paidAt: daysAgo(randInt(0, 30)) } : c))

// ── Referrals + Agent commissions ──────────────────────────────────────

export const referrals: Referral[] = referralAgents.flatMap((agent) => {
  const roster = pickMany(students, Math.min(agent.totalReferrals, 8))
  return roster.map((s, i) => ({
    id: `ref-${agent.id}-${pad(i + 1, 2)}`,
    agentId: agent.id,
    studentId: s.id,
    studentName: s.name,
    stage: pick(['new', 'contacted', 'counseling', 'interested', 'application', 'offer_letter', 'visa', 'completed'] as const),
    referredAt: daysAgo(randInt(5, 300)),
    potentialCommissionUsd: randInt(80, 250),
  }))
})

const agentRules = commissionRules.filter((r) => r.appliesToRole === 'referral_agent' && r.active)

export const agentCommissions: Commission[] = referrals.slice(0, 40).map((ref, i) => {
  const rule = pick(agentRules)
  const agent = referralAgents.find((a) => a.id === ref.agentId)!
  const amount = rule.type === 'fixed' ? rule.value : Math.round(ref.potentialCommissionUsd * (rule.value / 10))
  return {
    id: `comm-a-${pad(i + 1, 3)}`,
    earnerType: 'referral_agent' as const,
    earnerId: agent.id,
    earnerName: agent.name,
    studentId: ref.studentId,
    studentName: ref.studentName,
    ruleId: rule.id,
    ruleSnapshot: { name: rule.name, type: rule.type, value: rule.value, triggerStage: rule.triggerStage },
    amountUsd: amount,
    status: pick(statuses),
    generatedAt: ref.referredAt,
    paidAt: undefined,
  }
}).map((c) => (c.status === 'paid' ? { ...c, paidAt: daysAgo(randInt(0, 30)) } : c))

export const allCommissions: Commission[] = [...counselorCommissions, ...agentCommissions]
