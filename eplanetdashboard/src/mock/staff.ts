import type { ReferralAgent, Teacher } from '@/types'
import { pad, pick, randInt, randomEmail, randomPhone } from './generators'

const teacherNames = ['EPT Instructor', 'Suprina Maskey', 'Deepika Sunuwar', 'Rojan Bajracharya']
const subjectPool: Teacher['subjects'] = ['IELTS', 'PTE', 'TOEFL', 'Spoken English', 'Duolingo']

export const teachers: Teacher[] = teacherNames.map((name, i) => ({
  id: `tchr-${i + 1}`,
  name,
  email: i === 0 ? 'teacher@dreamsky.internal' : `${name.toLowerCase().replace(' ', '.')}@dreamsky.com`,
  avatarColor: ['#0891B2', '#7C3AED', '#D97706', '#16A34A'][i],
  subjects: [subjectPool[i % subjectPool.length], subjectPool[(i + 2) % subjectPool.length]],
  classesHandled: randInt(2, 5),
  studentsHandled: randInt(20, 60),
  branchId: i < 2 ? 'br-1' : 'br-2',
}))

export const frontDeskStaff = [
  { id: 'fd-1', name: 'Santona Khatri', email: 'santona.khatri@dreamsky.com', role: 'Front Desk', branchId: 'br-1' },
  { id: 'fd-2', name: 'Amisha Thapa', email: 'amisha.thapa@dreamsky.com', role: 'Front Desk', branchId: 'br-1' },
] as const

const agentNames = [
  'Kishor Adhikari', 'Sabitri Lama', 'Milan Rana', 'Puskar Neupane', 'Anita Bhattarai', 'Roshan Dahal',
]

export const referralAgents: ReferralAgent[] = agentNames.map((name, i) => {
  const totalReferrals = randInt(6, 40)
  return {
    id: `agent-${i + 1}`,
    name,
    email: randomEmail(name),
    phone: randomPhone(),
    avatarColor: pick(['#2563EB', '#7C3AED', '#0EA5E9', '#16A34A', '#D97706', '#DB2777']),
    agencyName: i % 2 === 0 ? `${name.split(' ')[0]} Consult Point` : undefined,
    referralCode: `REF-${pad(i + 1, 3)}`,
    totalReferrals,
    convertedReferrals: Math.round(totalReferrals * (randInt(30, 65) / 100)),
    createdAt: `${randInt(2023, 2025)}-0${randInt(1, 9)}-1${randInt(0, 9)}`,
  }
})

export function createReferralAgent(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return null

  const existing = referralAgents.find((agent) => agent.name.toLowerCase() === trimmed.toLowerCase())
  if (existing) return existing

  const nextIndex = referralAgents.length + 1
  const newAgent: ReferralAgent = {
    id: `agent-${nextIndex}`,
    name: trimmed,
    email: randomEmail(trimmed),
    phone: randomPhone(),
    avatarColor: pick(['#2563EB', '#7C3AED', '#0EA5E9', '#16A34A', '#D97706', '#DB2777']),
    referralCode: `REF-${pad(nextIndex, 3)}`,
    totalReferrals: 0,
    convertedReferrals: 0,
    createdAt: new Date().toISOString().slice(0, 10),
  }

  referralAgents.push(newAgent)
  return newAgent
}
