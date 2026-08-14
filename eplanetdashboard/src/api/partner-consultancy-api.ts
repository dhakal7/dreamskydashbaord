/**
 * partner-consultancy-api.ts
 *
 * Axios wrappers for /partner-consultancies endpoints.
 */

import { api } from '@/lib/api-client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiPartnerConsultancy {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

// ─── API functions ────────────────────────────────────────────────────────────

export const partnerConsultancyApi = {
  /** GET /partner-consultancies — all partners, sorted by name */
  list(): Promise<ApiPartnerConsultancy[]> {
    return api.get('/partner-consultancies')
  },

  /** POST /partner-consultancies — create or find by name (idempotent) */
  createOrFind(name: string): Promise<ApiPartnerConsultancy> {
    return api.post('/partner-consultancies', { name })
  },
}
