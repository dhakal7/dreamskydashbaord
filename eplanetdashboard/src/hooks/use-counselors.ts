import { useQuery } from '@tanstack/react-query'
import { isMockMode } from '@/lib/api-client'
import { userApi, type CounselorOption } from '@/api/user-api'
import { useAuthStore } from '@/store/auth-store'
import { canBranchAdminViewRecord, isBranchAdmin } from '@/lib/data-visibility'

export const counselorKeys = {
  all: ['counselors'] as const,
  list: () => [...counselorKeys.all, 'list'] as const,
}

export function useCounselors(enabled = true) {
  const currentUser = useAuthStore((s) => s.currentUser)

  return useQuery<CounselorOption[]>({
    queryKey: [...counselorKeys.list(), currentUser.role, currentUser.branchId ?? null],
    queryFn: async () => {
      if (isMockMode()) {
        const { counselors: mockCounselors } = await import('@/mock')
        const scoped = isBranchAdmin(currentUser)
          ? mockCounselors.filter((c) => canBranchAdminViewRecord(currentUser, c as { branchId?: unknown }))
          : mockCounselors
        return scoped.map((c) => ({
          id: c.id,
          name: c.name,
          email: `${c.id}@example.com`,
          role: 'COUNSELOR',
        }))
      }
      const list = await userApi.getCounselors()
      if (isBranchAdmin(currentUser)) {
        return list.filter((c) => canBranchAdminViewRecord(currentUser, c))
      }
      return list
    },
    enabled,
    staleTime: 60 * 1000,
  })
}

export type { CounselorOption }
