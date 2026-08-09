import type { UserAccount } from '@/types'
import { counselors } from './reference'
import { teachers, frontDeskStaff, referralAgents } from './staff'
import { students } from './entities'
import { branches } from './branches'

const hq = branches[0]

function buildUsers(): UserAccount[] {
  const now = new Date()
  const accounts: UserAccount[] = []

  // Super admin
  accounts.push({
    id: 'user-sa-1',
    name: 'Ashish Shrestha',
    email: 'dreamskyadmission@gmail.com',
    role: 'super_admin',
    status: 'active',
    branchId: hq.id,
    branchName: 'All Branches',
    avatarColor: '#0F172A',
    lastLoginAt: new Date(now.getTime() - 1 * 3600_000).toISOString(),
    createdAt: new Date(now.getTime() - 365 * 86400_000).toISOString(),
    linkedId: 'user-sa-1',
  })

  // Counselors
  counselors.forEach((c, i) => {
    accounts.push({
      id: `user-c-${i + 1}`,
      name: c.name,
      email: c.email,
      role: 'counselor',
      status: i === 4 ? 'suspended' : i === 5 ? 'invited' : 'active',
      branchId: c.branchId,
      branchName: branches.find((b) => b.id === c.branchId)?.name,
      avatarColor: c.avatarColor,
      lastLoginAt: new Date(now.getTime() - (i + 1) * 2 * 3600_000).toISOString(),
      createdAt: new Date(now.getTime() - (200 + i * 14) * 86400_000).toISOString(),
      linkedId: c.id,
    })
  })

  // Teachers
  teachers.forEach((t, i) => {
    accounts.push({
      id: `user-t-${i + 1}`,
      name: t.name,
      email: t.email,
      role: 'teacher',
      status: 'active',
      branchId: t.branchId,
      branchName: branches.find((b) => b.id === t.branchId)?.name,
      avatarColor: t.avatarColor,
      lastLoginAt: new Date(now.getTime() - (i + 2) * 3600_000).toISOString(),
      createdAt: new Date(now.getTime() - (150 + i * 30) * 86400_000).toISOString(),
      linkedId: t.id,
    })
  })

  // Front desk
  frontDeskStaff.forEach((fd, i) => {
    accounts.push({
      id: `user-fd-${i + 1}`,
      name: fd.name,
      email: fd.email,
      role: 'front_desk',
      status: 'active',
      branchId: fd.branchId,
      branchName: branches.find((b) => b.id === fd.branchId)?.name,
      avatarColor: i === 0 ? '#DB2777' : '#7C3AED',
      lastLoginAt: new Date(now.getTime() - (i + 3) * 3600_000).toISOString(),
      createdAt: new Date(now.getTime() - (100 + i * 20) * 86400_000).toISOString(),
      linkedId: fd.id,
    })
  })

  // Referral agents
  referralAgents.forEach((ra, i) => {
    accounts.push({
      id: `user-ra-${i + 1}`,
      name: ra.name,
      email: ra.email,
      role: 'referral_agent',
      status: i === 3 ? 'suspended' : 'active',
      avatarColor: ra.avatarColor,
      lastLoginAt: new Date(now.getTime() - (i + 1) * 5 * 3600_000).toISOString(),
      createdAt: new Date(now.getTime() - (300 + i * 10) * 86400_000).toISOString(),
      linkedId: ra.id,
    })
  })

  // A handful of student accounts (first 5)
  students.slice(0, 5).forEach((s, i) => {
    accounts.push({
      id: `user-s-${i + 1}`,
      name: s.name,
      email: s.email,
      role: 'student',
      status: 'active',
      branchId: hq.id,
      branchName: hq.name,
      avatarColor: s.photoColor,
      lastLoginAt: new Date(now.getTime() - (i + 1) * 12 * 3600_000).toISOString(),
      createdAt: new Date(now.getTime() - (50 + i * 5) * 86400_000).toISOString(),
      linkedId: s.id,
    })
  })

  return accounts
}

export const userAccounts: UserAccount[] = buildUsers()
