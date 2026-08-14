import type { UserAccount } from '@/types'
import { counselors } from './reference'
import { frontDeskStaff } from './staff'
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

  return accounts
}

export const userAccounts: UserAccount[] = buildUsers()
