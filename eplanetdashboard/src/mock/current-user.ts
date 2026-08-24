import type { CurrentUser } from '@/types'
import { branches } from './branches'
import { counselors } from './reference'
import { referralAgents } from './staff'
import { students } from './entities'

const hq = branches[0]

// One demo identity per role so the dashboard/nav can be previewed end-to-end
// without real auth wired in yet (Track A owns real auth — this is a mock only).
export const demoUsers: Record<CurrentUser['role'], CurrentUser> = {
  super_admin: {
    id: 'user-sa-1',     name: 'Ashish Shrestha', email: 'dreamskyadmission@gmail.com',
    role: 'super_admin', avatarColor: '#0F172A', branchId: hq.id, branchName: 'All Branches', linkedId: 'user-sa-1',
  },
  front_desk: {
    id: 'user-fd-1', name: 'Puja Shrestha', email: 'puja.shrestha@dreamsky.com',
    role: 'front_desk', avatarColor: '#DB2777', branchId: hq.id, branchName: hq.name, linkedId: 'user-fd-1',
  },
  counselor: {
    id: 'user-c-1', name: counselors[0].name, email: counselors[0].email,
    role: 'counselor', avatarColor: counselors[0].avatarColor, branchId: hq.id, branchName: hq.name, linkedId: counselors[0].id,
  },
  teacher: {
    id: 'user-t-1', name: 'EPT Instructor', email: 'teacher@dreamsky.internal',
    role: 'teacher', avatarColor: '#0891B2', branchId: hq.id, branchName: hq.name, linkedId: 'tchr-1',
  },
  student: {
    id: 'user-s-1', name: students[0].name, email: students[0].email,
    role: 'student', avatarColor: students[0].photoColor, branchId: hq.id, branchName: hq.name, linkedId: students[0].id,
  },
  referral_agent: {
    id: 'user-ra-1', name: referralAgents[0].name, email: referralAgents[0].email,
    role: 'referral_agent', avatarColor: referralAgents[0].avatarColor, branchId: hq.id, branchName: hq.name, linkedId: referralAgents[0].id,
  },
}

export const roleLabels: Record<CurrentUser['role'], string> = {
  super_admin: 'Super Admin',
  front_desk: 'Front Desk',
  counselor: 'Counselor',
  teacher: 'Teacher',
  student: 'Student',
  referral_agent: 'Referral Agent',
}
