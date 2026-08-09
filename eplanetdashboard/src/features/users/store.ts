import { create } from 'zustand'
import type { Role, UserAccount, UserStatus } from '@/types'
import { userAccounts } from '@/mock'
import { toast } from 'sonner'

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
  inviteUser: (data: InviteUserData) => void
  suspendUser: (id: string) => void
  reactivateUser: (id: string) => void
  changeUserRole: (id: string, role: Role) => void
}

export const useUsersStore = create<UsersState>((set) => ({
  users: [...userAccounts],

  inviteUser: (data) =>
    set((state) => {
      const id = `user-${String(nextId).padStart(3, '0')}`
      nextId++
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
      toast.success(`Invitation sent to ${data.name}`)
      return { users: [...state.users, newUser] }
    }),

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
}))
