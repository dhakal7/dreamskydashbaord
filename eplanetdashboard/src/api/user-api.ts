/**
 * user-api.ts
 *
 * API client for user and referral agent retrieval.
 */

import { api } from '@/lib/api-client'

export interface ApiReferralAgent {
  id: string // ReferralAgentProfile.id (or user.id fallback)
  userId: string
  profileId: string | null
  name: string
  email: string
  phone: string | null
  referralCode: string
}

export type ReferralAgentOption = ApiReferralAgent

export interface CounselorOption {
  id: string // User.id
  name: string
  email: string
  role?: string
  status?: string
  branchId?: string | null
}

export const userApi = {
  /**
   * Retrieves active referral agents with their unique referralCode and profile IDs.
   */
  getReferralAgents(search?: string): Promise<ApiReferralAgent[]> {
    return api.get('/users/referral-agents', { params: { search } })
  },

  /**
   * Retrieves active counselors for lead assignment.
   */
  async getCounselors(): Promise<CounselorOption[]> {
    try {
      const users = await api.get<Array<{ id: string; firstName: string; lastName: string; email: string; role: string; status: string; branchId?: string | null }>>('/users', {
        params: { role: 'COUNSELOR' },
      })
      if (Array.isArray(users)) {
        return users.map((u) => ({
          id: u.id,
          name: `${u.firstName} ${u.lastName}`.trim(),
          email: u.email,
          role: u.role,
          status: u.status,
          branchId: u.branchId ?? null,
        }))
      }
    } catch {
      // Fallback
    }
    return []
  },

  /**
   * Retrieves staff users filtered by role.
   */
  getUsersByRole(role: string): Promise<Array<{ id: string; firstName: string; lastName: string; email: string }>> {
    return api.get('/users', { params: { role } })
  },

  /**
   * Updates a staff user account status (ACTIVE or SUSPENDED).
   */
  updateUserStatus(id: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<any> {
    return api.patch(`/users/${id}/status`, { status })
  },

  /**
   * Updates a staff user role.
   */
  updateUserRole(id: string, role: string): Promise<any> {
    return api.patch(`/users/${id}/role`, { role: role.toUpperCase() })
  },

  /**
   * Updates a staff user branch assignment.
   */
  updateUserBranch(id: string, branchId: string | null): Promise<any> {
    return api.patch(`/users/${id}/branch`, { branchId })
  },

  /**
   * Updates a staff user profile (name, email, phone).
   */
  updateUserProfile(
    id: string,
    payload: { name?: string; firstName?: string; lastName?: string; email?: string; phone?: string | null }
  ): Promise<any> {
    return api.patch(`/users/${id}`, payload)
  },

  /**
   * Retrieves active branches.
   */
  getBranches(): Promise<Array<{ id: string; name: string; isActive: boolean }>> {
    return api.get('/users/branches')
  },
}
