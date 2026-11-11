/**
 * university-api.ts  — Phase F5
 *
 * Axios wrappers for dream-sky /universities and /courses endpoints.
 * Reads: any authenticated role.  Writes: SUPER_ADMIN only.
 *
 * Note: /universities also owns /universities/countries/* routes (mounted
 * on the same university.routes.js file).
 */

import { api } from '@/lib/api-client'

// ─── Country ─────────────────────────────────────────────────────────────────

export interface ApiCountry {
  id: string
  name: string
  code: string
  flagUrl: string | null
  isActive: boolean
  createdAt: string
}

export interface CountryListParams {
  page?: number
  limit?: number
  search?: string
  isActive?: boolean
}

export interface CountryListResponse {
  countries: ApiCountry[]
  total: number
}

// ─── University ───────────────────────────────────────────────────────────────

export interface ApiUniversity {
  id: string
  name: string
  countryId: string
  city: string | null
  logoUrl: string | null
  websiteUrl: string | null
  ranking: number | null
  isActive: boolean
  createdAt: string
  country?: ApiCountry
  courses?: ApiCourse[]
}

export interface UniversityListParams {
  page?: number
  limit?: number
  search?: string
  countryId?: string
  isActive?: boolean
}

export interface UniversityListResponse {
  universities: ApiUniversity[]
  total: number
}

// ─── Course ───────────────────────────────────────────────────────────────────

export interface ApiCourse {
  id: string
  universityId: string
  name: string
  level: string
  fieldOfStudy: string
  durationMonths: number | null
  tuitionFee: number | null
  currency: string | null
  seatsAvailable: number | null
  requirementsGpa: number | null
  requirementsIelts: number | null
  requirementsPte: number | null
  isActive: boolean
  createdAt: string
  university?: { id: string; name: string }
}

export interface CourseListParams {
  page?: number
  limit?: number
  search?: string
  universityId?: string
  level?: string
  fieldOfStudy?: string
  countryId?: string
  isActive?: boolean
}

export interface CourseListResponse {
  courses: ApiCourse[]
  total: number
}

// ─── API functions ────────────────────────────────────────────────────────────

export const universityApi = {
  // Countries (mounted at /countries and /universities/countries/*)
  async listCountries(params?: CountryListParams): Promise<CountryListResponse> {
    const res = await api.get<any>('/countries', { params })
    if (Array.isArray(res)) {
      return { countries: res, total: res.length }
    }
    return res ?? { countries: [], total: 0 }
  },
  getCountry(id: string): Promise<ApiCountry> {
    return api.get(`/countries/${id}`)
  },
  createCountry(body: any): Promise<ApiCountry> {
    return api.post('/countries', body)
  },
  updateCountry(id: string, body: any): Promise<ApiCountry> {
    return api.put(`/countries/${id}`, body)
  },
  deleteCountry(id: string): Promise<void> {
    return api.delete(`/countries/${id}`)
  },

  // Universities
  list(params?: UniversityListParams): Promise<UniversityListResponse> {
    return api.get('/universities', { params })
  },
  getOne(id: string): Promise<ApiUniversity> {
    return api.get(`/universities/${id}`)
  },
  getCourses(id: string): Promise<ApiCourse[]> {
    return api.get(`/universities/${id}/courses`)
  },
  create(body: Omit<ApiUniversity, 'id' | 'createdAt' | 'country' | 'courses'>): Promise<ApiUniversity> {
    return api.post('/universities', body)
  },
  update(id: string, body: Partial<ApiUniversity>): Promise<ApiUniversity> {
    return api.put(`/universities/${id}`, body)
  },
  remove(id: string): Promise<void> {
    return api.delete(`/universities/${id}`)
  },
}

export const courseApi = {
  async list(params?: CourseListParams): Promise<CourseListResponse> {
    const res = await api.get<any>('/courses', { params })
    if (Array.isArray(res)) {
      return { courses: res, total: res.length }
    }
    return res ?? { courses: [], total: 0 }
  },
  getOne(id: string): Promise<ApiCourse> {
    return api.get(`/courses/${id}`)
  },
  create(body: Omit<ApiCourse, 'id' | 'createdAt' | 'university'>): Promise<ApiCourse> {
    return api.post('/courses', body)
  },
  update(id: string, body: Partial<ApiCourse>): Promise<ApiCourse> {
    return api.put(`/courses/${id}`, body)
  },
  remove(id: string): Promise<void> {
    return api.delete(`/courses/${id}`)
  },
  decrementSeats(id: string): Promise<ApiCourse> {
    return api.patch(`/courses/${id}/decrement-seats`, {})
  },
}
