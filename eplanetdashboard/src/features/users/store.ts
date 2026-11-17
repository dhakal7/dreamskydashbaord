import { create } from 'zustand'
import type { Role, UserAccount, UserStatus } from '@/types'
import { userAccounts } from '@/mock'
import { toast } from 'sonner'
import { api, isMockMode } from '@/lib/api-client'
import { userApi } from '@/api/user-api'
import { useAuthStore } from '@/store/auth-store'

const BRANCH_ADMIN_OPERATIONAL_ROLES = new Set([
  'counselor',
  'front_desk',
  'teacher',
  'referral_agent',
])

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
  suspendUser: (id: string) => Promise<void>
  reactivateUser: (id: string) => Promise<void>
  changeUserRole: (id: string, role: Role) => Promise<void>
  changeUserBranch: (id: string, branchId: string | null, branchName?: string) => Promise<void>
  updateUserEmail: (id: string, email: string) => void
  updateUserProfile: (id: string, updates: Partial<UserAccount>) => Promise<void>
}

export const useUsersStore = create<UsersState>((set, get) => ({
  users: isMockMode() ? [...userAccounts] : [],

  fetchUsers: async () => {
    const activeUser = useAuthStore.getState().currentUser
    if (isMockMode()) {
      const mockFiltered = userAccounts.filter((u) => {
        const roleLower = (u.role as string)?.toLowerCase()
        if (roleLower === 'student') return false
        if (activeUser?.role === 'branch_admin') {
          if (!BRANCH_ADMIN_OPERATIONAL_ROLES.has(roleLower)) return false
          return Boolean(activeUser.branchId && u.branchId && u.branchId === activeUser.branchId)
        }
        return true
      })
      set({ users: mockFiltered })
      return
    }

    try {
      const rawUsers: any = await api.get('/users')
      const userList = (Array.isArray(rawUsers) ? rawUsers : rawUsers?.data || [])
        .filter((u: any) => {
          const roleUpper = u.role?.toUpperCase()
          if (roleUpper === 'STUDENT') return false
          if (activeUser?.role === 'branch_admin') {
            const roleLower = u.role?.toLowerCase()
            if (!BRANCH_ADMIN_OPERATIONAL_ROLES.has(roleLower)) return false
            return Boolean(activeUser.branchId && u.branchId && u.branchId === activeUser.branchId)
          }
          return true
        })
      const mapped: UserAccount[] = userList.map((u: any) => ({
        id: u.id,
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
        email: u.email,
        phone: u.phone || '',
        role: (u.role?.toLowerCase() as Role) || 'staff',
        status: (u.status?.toLowerCase() as UserStatus) || 'active',
        branchId: u.branchId,
        branchName: u.branch?.name || (u.branchId ? 'Unknown Branch' : 'Unassigned'),
        avatarColor: '#0891B2',
        lastLoginAt: u.lastLoginAt || u.createdAt,
        createdAt: u.createdAt,
        linkedId: u.id,
      }))
      set({ users: mapped })
    } catch (err: any) {
      toast.error(err?.message || 'Failed to fetch staff accounts. Please check your connection.')
      set({ users: [] })
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

  suspendUser: async (id: string) => {
    const user = get().users.find((u) => u.id === id)
    if (isMockMode()) {
      set((state) => ({
        users: state.users.map((u) =>
          u.id === id ? { ...u, status: 'suspended' as UserStatus } : u
        ),
      }))
      toast.success(`[Mock] ${user?.name ?? 'User'} has been suspended`)
      return
    }

    try {
      await userApi.updateUserStatus(id, 'SUSPENDED')
      set((state) => ({
        users: state.users.map((u) =>
          u.id === id ? { ...u, status: 'suspended' as UserStatus } : u
        ),
      }))
      toast.success(`${user?.name ?? 'User'} has been suspended`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to suspend user')
      throw err
    }
  },

  reactivateUser: async (id: string) => {
    const user = get().users.find((u) => u.id === id)
    if (isMockMode()) {
      set((state) => ({
        users: state.users.map((u) =>
          u.id === id ? { ...u, status: 'active' as UserStatus } : u
        ),
      }))
      toast.success(`[Mock] ${user?.name ?? 'User'} has been reactivated`)
      return
    }

    try {
      await userApi.updateUserStatus(id, 'ACTIVE')
      set((state) => ({
        users: state.users.map((u) =>
          u.id === id ? { ...u, status: 'active' as UserStatus } : u
        ),
      }))
      toast.success(`${user?.name ?? 'User'} has been reactivated`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reactivate user')
      throw err
    }
  },

  changeUserRole: async (id, role) => {
    const user = get().users.find((u) => u.id === id)
    if (isMockMode()) {
      set((state) => ({
        users: state.users.map((u) => (u.id === id ? { ...u, role } : u)),
      }))
      toast.success(`[Mock] Role changed to ${role} for ${user?.name ?? 'User'}`)
      return
    }

    try {
      await userApi.updateUserRole(id, role)
      set((state) => ({
        users: state.users.map((u) => (u.id === id ? { ...u, role } : u)),
      }))
      toast.success(`Role changed to ${role} for ${user?.name ?? 'User'}`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to change user role')
      throw err
    }
  },

  changeUserBranch: async (id, branchId, branchName) => {
    const user = get().users.find((u) => u.id === id)
    if (isMockMode()) {
      const resolvedName = branchName || (branchId ? 'Assigned Branch' : 'Unassigned')
      set((state) => ({
        users: state.users.map((u) =>
          u.id === id ? { ...u, branchId: branchId || undefined, branchName: resolvedName } : u
        ),
      }))
      toast.success(`[Mock] Branch updated for ${user?.name ?? 'User'}`)
      return
    }

    try {
      const res: any = await userApi.updateUserBranch(id, branchId)
      const resolvedName = res?.data?.branch?.name || branchName || (branchId ? 'Assigned Branch' : 'Unassigned')
      set((state) => ({
        users: state.users.map((u) =>
          u.id === id ? { ...u, branchId: branchId || undefined, branchName: resolvedName } : u
        ),
      }))
      toast.success(`Branch updated for ${user?.name ?? 'User'}`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update user branch')
      throw err
    }
  },

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

  updateUserProfile: async (id, updates) => {
    const user = get().users.find((u) => u.id === id)
    if (isMockMode()) {
      set((state) => ({
        users: state.users.map((u) =>
          u.id === id ? { ...u, ...updates } : u
        ),
      }))
      toast.success(`[Mock] Profile updated for ${updates.name ?? user?.name ?? 'User'}`)
      return
    }

    try {
      const payload: { name?: string; email?: string; phone?: string | null } = {}
      if (updates.name !== undefined) payload.name = updates.name
      if (updates.email !== undefined) payload.email = updates.email
      if (updates.phone !== undefined) payload.phone = updates.phone || null

      const res: any = await userApi.updateUserProfile(id, payload)
      const updatedUser = res?.data ?? res
      const fullName = updatedUser?.firstName
        ? `${updatedUser.firstName} ${updatedUser.lastName || ''}`.trim()
        : updates.name

      set((state) => ({
        users: state.users.map((u) =>
          u.id === id
            ? {
                ...u,
                ...updates,
                ...(fullName ? { name: fullName } : {}),
                ...(updatedUser?.email ? { email: updatedUser.email } : {}),
                phone: updatedUser?.phone !== undefined ? (updatedUser.phone ?? undefined) : updates.phone,
              }
            : u
        ),
      }))
      toast.success(`Profile updated for ${fullName ?? user?.name ?? 'User'}`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update user profile')
      throw err
    }
  },
}))
