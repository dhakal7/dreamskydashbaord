/**
 * public-api.ts  — Phase F5
 *
 * Axios wrappers for the unauthenticated /public/* endpoints and the
 * authenticated /inquiries/* staff endpoints.
 *
 * Public routes need NO Authorization header — use rawAxios to skip
 * the token interceptor (or just rely on the fact that token injection
 * is a no-op when no token exists, which is the case on the public website).
 */

import { api } from '@/lib/api-client'
import type { ApiCountry, ApiUniversity, ApiCourse } from './university-api'

// ─── Public inquiry ───────────────────────────────────────────────────────────

export interface PublicInquiryBody {
  firstName: string
  lastName: string
  email: string
  phone?: string
  message: string
  interestedCountry?: string
  interestedCourse?: string
}

export interface ApiPublicInquiry {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  message: string
  interestedCountry: string | null
  interestedCourse: string | null
  isConverted: boolean
  convertedAt: string | null
  convertedById: string | null
  createdAt: string
}

export interface InquiryListParams {
  page?: number
  limit?: number
  isConverted?: boolean
}

export interface InquiryListResponse {
  inquiries: ApiPublicInquiry[]
  total: number
}

export const publicApi = {
  // ── Unauthenticated public catalog ────────────────────────────────────────

  /** GET /public/countries — public-facing country list (no auth required) */
  listCountries(): Promise<ApiCountry[]> {
    return api.get('/public/countries')
  },

  /** GET /public/universities — public-facing university list */
  listUniversities(params?: { countryId?: string; search?: string }): Promise<ApiUniversity[]> {
    return api.get('/public/universities', { params })
  },

  /** GET /public/universities/:id */
  getUniversity(id: string): Promise<ApiUniversity> {
    return api.get(`/public/universities/${id}`)
  },

  /** GET /public/courses — public-facing course list */
  listCourses(params?: { universityId?: string; level?: string }): Promise<ApiCourse[]> {
    return api.get('/public/courses', { params })
  },

  /**
   * POST /public/inquiry — unauthenticated website inquiry form submission.
   * No Authorization header needed.
   */
  submitInquiry(body: PublicInquiryBody): Promise<{ id: string; message: string }> {
    return api.post('/public/inquiry', body)
  },

  // ── Authenticated staff inquiry management (/inquiries/*) ─────────────────

  /** GET /inquiries — SUPER_ADMIN or COUNSELOR only */
  listInquiries(params?: InquiryListParams): Promise<InquiryListResponse> {
    return api.get('/inquiries', { params })
  },

  /** GET /inquiries/:id */
  getInquiry(id: string): Promise<ApiPublicInquiry> {
    return api.get(`/inquiries/${id}`)
  },

  /** PATCH /inquiries/:id/convert — mark inquiry as converted to a student */
  markConverted(id: string): Promise<ApiPublicInquiry> {
    return api.patch(`/inquiries/${id}/convert`, {})
  },
}
