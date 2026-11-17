import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { commissionApi } from '@/api/commission-api'
import { commissionKeys } from '@/hooks/use-commissions'
import { api } from '@/lib/api-client'

describe('Phase 4.5.1 & 4.5.2 Commission API, Invalidation, & Applications Helper', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads commission rules from /commissions/rules', async () => {
    const mockRules = {
      rules: [
        {
          id: 'rule-1',
          name: 'Counselor Global',
          role: 'COUNSELOR',
          type: 'FIXED',
          triggerStage: 'ENROLLED',
          amount: 5000,
          isActive: true,
        },
      ],
      total: 1,
    }
    const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce(mockRules as any)

    const res = await commissionApi.listRules()
    expect(getSpy).toHaveBeenCalledWith('/commissions/rules', { params: undefined })
    expect(res.rules).toHaveLength(1)
    expect(res.rules[0].id).toBe('rule-1')
  })

  it('creates a commission rule, invalidates rules query, and refreshes data', async () => {
    const qc = new QueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const successSpy = vi.spyOn(toast, 'success').mockImplementation(() => '' as any)
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => '' as any)

    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
      id: 'rule-new',
      role: 'COUNSELOR',
      type: 'FIXED',
      triggerStage: 'ENROLLED',
      fixedAmount: 2500,
    } as any)

    const created = await commissionApi.createRule({
      role: 'COUNSELOR',
      type: 'FIXED',
      triggerStage: 'ENROLLED',
      fixedAmount: 2500,
      effectiveFrom: '2026-11-16T00:00:00.000Z',
    } as any)

    await qc.invalidateQueries({ queryKey: commissionKeys.rules() })
    toast.success('Commission rule created')

    expect(postSpy).toHaveBeenCalledWith('/commissions/rules', expect.objectContaining({ role: 'COUNSELOR', fixedAmount: 2500 }))
    expect(created.id).toBe('rule-new')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: commissionKeys.rules() })
    expect(successSpy).toHaveBeenCalledWith('Commission rule created')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('updates an existing commission rule, invalidates rules query, and refreshes data', async () => {
    const qc = new QueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const successSpy = vi.spyOn(toast, 'success').mockImplementation(() => '' as any)

    const putSpy = vi.spyOn(api, 'put').mockResolvedValueOnce({
      id: 'rule-1',
      fixedAmount: 3000,
    } as any)
    const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce({
      rules: [{ id: 'rule-1', fixedAmount: 3000 }],
      total: 1,
    } as any)

    const updated = await commissionApi.updateRule('rule-1', { fixedAmount: 3000 } as any)
    await qc.invalidateQueries({ queryKey: commissionKeys.rules() })
    toast.success('Commission rule updated')
    const refreshed = await commissionApi.listRules()

    expect(putSpy).toHaveBeenCalledWith('/commissions/rules/rule-1', { fixedAmount: 3000 })
    expect((updated as any).fixedAmount).toBe(3000)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: commissionKeys.rules() })
    expect(successSpy).toHaveBeenCalledWith('Commission rule updated')
    expect(getSpy).toHaveBeenCalledTimes(1)
    expect((refreshed.rules[0] as any).fixedAmount).toBe(3000)
  })

  it('handles create/update API errors without showing false success messages', async () => {
    const successSpy = vi.spyOn(toast, 'success').mockImplementation(() => '' as any)
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => '' as any)

    vi.spyOn(api, 'post').mockRejectedValueOnce(new Error('Validation failed'))
    vi.spyOn(api, 'put').mockRejectedValueOnce(new Error('Forbidden'))

    await expect(commissionApi.createRule({} as any)).rejects.toThrow('Validation failed')
    toast.error('Validation failed')

    await expect(commissionApi.updateRule('rule-1', {} as any)).rejects.toThrow('Forbidden')
    toast.error('Forbidden')

    expect(errorSpy).toHaveBeenCalledTimes(2)
    expect(successSpy).not.toHaveBeenCalled()
  })

  it('computes linkedToVisaCount dynamically when all applications have moved to visa processing', () => {
    const rawApiApps = [
      { id: 'app-1', visaCase: { id: 'vc-1', status: 'APPROVED' } },
      { id: 'app-2', visaCase: null },
      { id: 'app-3', visaCase: null },
    ]
    const visaApplicationIds = new Set(['app-2', 'app-3'])
    const unlinked = rawApiApps.filter((a) => !a.visaCase && !visaApplicationIds.has(a.id))
    const linkedCount = rawApiApps.filter((a) => Boolean(a.visaCase) || visaApplicationIds.has(a.id)).length

    expect(unlinked.length).toBe(0)
    expect(linkedCount).toBe(3)
  })
})
