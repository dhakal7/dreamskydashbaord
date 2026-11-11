/**
 * use-payments.ts — Phase 3A Read-Only Payments Query Hook
 *
 * TanStack React Query hook for payment data.
 * Adheres strictly to Phase 3A read-only mode.
 */

import { useQuery } from '@tanstack/react-query'
import { isMockMode } from '@/lib/api-client'
import { paymentApi, type PaymentListParams, type ApiPaymentItem } from '@/api/payment-api'

export const paymentKeys = {
  all: ['payments'] as const,
  lists: () => [...paymentKeys.all, 'list'] as const,
  list: (params?: PaymentListParams) => [...paymentKeys.lists(), params] as const,
}

export function usePayments(params?: PaymentListParams) {
  return useQuery<ApiPaymentItem[], Error>({
    queryKey: paymentKeys.list(params),
    queryFn: () => paymentApi.list(params),
    enabled: !isMockMode(),
  })
}
