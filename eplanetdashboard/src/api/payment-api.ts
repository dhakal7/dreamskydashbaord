/**
 * payment-api.ts — Phase 3A Read-Only Payments API
 *
 * Axios wrappers for dream-sky /payments endpoints.
 * All functions return unwrapped data (envelope stripped by api-client interceptor).
 */

import { api } from '@/lib/api-client'
import type { FeePaymentStatus } from '@/types'

export interface ApiPaymentTransaction {
  id: string
  paymentId: string
  amount: number
  method: 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'ONLINE' | 'CHEQUE' | string
  receiptNumber?: string | null
  paidAt: string
  notes?: string | null
}

export interface ApiPaymentItem {
  id: string
  studentId: string
  studentName: string
  studentEmail: string
  studentPhone: string
  feeCategory: string
  totalAmount: number
  paidAmount: number
  dueAmount: number
  currency: string
  status: FeePaymentStatus
  createdAt?: string
  updatedAt?: string
  dueDate?: string
  lastPaymentDate?: string
  lastReminderSentAt?: string
  notes?: string
  transactions?: ApiPaymentTransaction[]
}

export interface CurrencyOutstandingSummary {
  currency: string | null
  records: number
  amount: number
  students: number
}

export interface OutstandingFeeSummary {
  totalOutstandingRecords: number
  totalOutstandingAmount: number | null
  uniqueStudentsWithDues: number
  currency?: string | null
  isMultiCurrency?: boolean
  byCurrency?: CurrencyOutstandingSummary[]
}

export interface PaymentListParams {
  status?: string
  search?: string
  limit?: number
  offset?: number
}

export const paymentApi = {
  /**
   * GET /payments/outstanding-summary
   * Fetches high-performance unpaginated aggregate summary directly from SQL.
   */
  async getOutstandingSummary(): Promise<OutstandingFeeSummary> {
    const res = await api.get<any>('/payments/outstanding-summary')
    if (res && res.data) return res.data
    if (res && typeof res.totalOutstandingRecords === 'number') return res
    return {
      totalOutstandingRecords: 0,
      totalOutstandingAmount: 0,
      uniqueStudentsWithDues: 0,
    }
  },

  /**
   * GET /payments (Phase 3A Read-Only)
   * Handles both direct arrays and wrapped responses defensively.
   */
  async list(params?: PaymentListParams): Promise<ApiPaymentItem[]> {
    const res = await api.get<any>('/payments', { params })
    if (Array.isArray(res)) return res
    if (res && Array.isArray(res.data)) return res.data
    if (res && Array.isArray(res.items)) return res.items
    return []
  },
}
