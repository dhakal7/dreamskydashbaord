import { create } from 'zustand'
import type { Role, UserAccount, UserStatus } from '@/types'
import { userAccounts } from '@/mock'
import { toast } from 'sonner'
import { api, isMockMode } from '@/lib/api-client'

export interface InviteUserData {
  name: string
  email: string
  role: Role
  branchId?: string
  branchName?: string
}

let nextId = userAccounts.length + 1

interface UsersState {
  users: UserAccount[]
  fetchUsers: () => Promise<void>
  inviteUser: (data: InviteUserData) => Promise<void>
  suspendUser: (id: string) => void
  reactivateUser: (id: string) => void
  changeUserRole: (id: string, role: Role) => void
  updateUserEmail: (id: string, email: string) => void
  updateUserProfile: (id: string, updates: Partial<UserAccount>) => void
}

export const useUsersStore = create<UsersState>((set) => ({
  users: isMockMode() ? [...userAccounts] : [],

  fetchUsers: async () => {
    if (isMockMode()) {
      set({ users: [...userAccounts] })
      return
    }

    try {
      const rawUsers: any = await api.get('/users')
      const userList = Array.isArray(rawUsers) ? rawUsers : rawUsers?.data || []
      const mapped: UserAccount[] = userList.map((u: any) => ({
        id: u.id,
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
        email: u.email,
        phone: u.phone || '',
        role: (u.role?.toLowerCase() as Role) || 'staff',
        status: (u.status?.toLowerCase() as UserStatus) || 'active',
        branchId: u.branchId,
        branchName: u.branch?.name || 'Headquarters',
        avatarColor: '#0891B2',
        lastLoginAt: u.lastLoginAt || u.createdAt,
        createdAt: u.createdAt,
        linkedId: u.id,
      }))
      set({ users: mapped })
    } catch (err: any) {
      // Fallback to mock data if API call fails
      set({ users: [...userAccounts] })
    }
  },

  inviteUser: async (data) => {
    const nameParts = data.name.trim().split(/\s+/)
    const firstName = nameParts[0] || 'Staff'
    const lastName = nameParts.slice(1).join(' ') || 'Member'

    let createdId: string | null = null

    if (!isMockMode()) {
      try {
        const res: any = await api.post('/users/invite', {
          email: data.email,
          firstName,
          lastName,
          role: data.role.toUpperCase(),
          branchId: data.branchId,
        })
        createdId = res?.id || res?.data?.id
      } catch (err: any) {
        toast.error(err.message || 'Failed to send invitation email')
        throw err
      }
    }

    const id = createdId || `user-${String(nextId).padStart(3, '0')}`
    if (!createdId) nextId++
    const now = new Date().toISOString()
    const newUser: UserAccount = {
      id,
      name: data.name,
      email: data.email,
      role: data.role,
      status: 'invited',
      branchId: data.branchId,
      branchName: data.branchName,
      avatarColor: '#6B7280',
      lastLoginAt: now,
      createdAt: now,
      linkedId: id,
    }
    toast.success(`Invitation emailed to ${data.email}`)
    set((state) => ({ users: [...state.users, newUser] }))
  },

  suspendUser: (id) =>
    set((state) => {
      const user = state.users.find((u) => u.id === id)
      toast.success(`${user?.name ?? 'User'} has been suspended`)
      return {
        users: state.users.map((u) =>
          u.id === id ? { ...u, status: 'suspended' as UserStatus } : u
        ),
      }
    }),

  reactivateUser: (id) =>
    set((state) => {
      const user = state.users.find((u) => u.id === id)
      toast.success(`${user?.name ?? 'User'} has been reactivated`)
      return {
        users: state.users.map((u) =>
          u.id === id ? { ...u, status: 'active' as UserStatus } : u
        ),
      }
    }),

  changeUserRole: (id, role) =>
    set((state) => {
      const user = state.users.find((u) => u.id === id)
      toast.success(`Role changed to ${role} for ${user?.name ?? 'User'}`)
      return {
        users: state.users.map((u) =>
          u.id === id ? { ...u, role } : u
        ),
      }
    }),

  updateUserEmail: (id, email) =>
    set((state) => {
      const user = state.users.find((u) => u.id === id)
      toast.success(`Email updated to ${email} for ${user?.name ?? 'User'}`)
      return {
        users: state.users.map((u) =>
          u.id === id ? { ...u, email } : u
        ),
      }
    }),

  updateUserProfile: (id, updates) =>
    set((state) => {
      const user = state.users.find((u) => u.id === id)
      toast.success(`Profile updated for ${updates.name ?? user?.name ?? 'User'}`)
      return {
        users: state.users.map((u) =>
          u.id === id ? { ...u, ...updates } : u
        ),
      }
    }),
}))
