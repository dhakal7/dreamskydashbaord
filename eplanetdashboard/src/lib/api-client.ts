/**
 * api-client.ts  — Phase 0 Foundation
 *
 * Central Axios instance for all dream-sky backend calls.
 *
 * Features:
 *  - Bearer token injection via request interceptor
 *  - Silent 401 → refresh → retry cycle via response interceptor
 *  - Unwraps dream-sky's `{ success, message, data }` envelope into just `T`
 *  - Mock-mode guard: when VITE_USE_MOCK=true the client is created but any
 *    accidental call will throw immediately so you don't silently get undefined
 *
 * Usage:
 *   import { api } from '@/lib/api-client'
 *   const students = await api.get<Student[]>('/students')
 */

import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'

// ─── Mock-mode check ──────────────────────────────────────────────────────────

/** Returns true when the app is running in mock-data mode (VITE_USE_MOCK=true). */
export function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK === 'true'
}

// ─── Dream-sky response envelope ─────────────────────────────────────────────

interface DreamSkyEnvelope<T> {
  success: boolean
  message: string
  data: T
}

// ─── Token storage keys ───────────────────────────────────────────────────────

const ACCESS_TOKEN_KEY = 'dreamsky-access-token'
const REFRESH_TOKEN_KEY = 'dreamsky-refresh-token'
const REMEMBER_KEY = 'dreamsky-remember-me'

/**
 * Token storage honouring the login "remember me" preference:
 *  - remember me → tokens survive in localStorage across browser restarts
 *  - no remember → tokens live only in sessionStorage, dropped when the tab closes
 * Getters fall back to the other store so refresh/restore always find the token.
 */
export const tokenStore = {
  getRemember(): boolean {
    return localStorage.getItem(REMEMBER_KEY) !== 'false'
  },
  setRemember(remember: boolean) {
    localStorage.setItem(REMEMBER_KEY, remember ? 'true' : 'false')
  },
  getAccess(): string | null {
    return (
      sessionStorage.getItem(ACCESS_TOKEN_KEY) ??
      localStorage.getItem(ACCESS_TOKEN_KEY) ??
      sessionStorage.getItem('dreamsky-access-token') ??
      localStorage.getItem('dreamsky-access-token')
    )
  },
  setAccess(token: string) {
    if (tokenStore.getRemember()) {
      localStorage.setItem(ACCESS_TOKEN_KEY, token)
      localStorage.setItem('dreamsky-access-token', token)
      sessionStorage.removeItem(ACCESS_TOKEN_KEY)
      sessionStorage.removeItem('dreamsky-access-token')
    } else {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, token)
      sessionStorage.setItem('dreamsky-access-token', token)
      localStorage.removeItem(ACCESS_TOKEN_KEY)
      localStorage.removeItem('dreamsky-access-token')
    }
  },
  getRefresh(): string | null {
    return (
      sessionStorage.getItem(REFRESH_TOKEN_KEY) ??
      localStorage.getItem(REFRESH_TOKEN_KEY) ??
      sessionStorage.getItem('dreamsky-refresh-token') ??
      localStorage.getItem('dreamsky-refresh-token')
    )
  },
  setRefresh(token: string) {
    if (tokenStore.getRemember()) {
      localStorage.setItem(REFRESH_TOKEN_KEY, token)
      localStorage.setItem('dreamsky-refresh-token', token)
      sessionStorage.removeItem(REFRESH_TOKEN_KEY)
      sessionStorage.removeItem('dreamsky-refresh-token')
    } else {
      sessionStorage.setItem(REFRESH_TOKEN_KEY, token)
      sessionStorage.setItem('dreamsky-refresh-token', token)
      localStorage.removeItem(REFRESH_TOKEN_KEY)
      localStorage.removeItem('dreamsky-refresh-token')
    }
  },
  clearAll() {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem('dreamsky-access-token')
    localStorage.removeItem('dreamsky-refresh-token')
    localStorage.removeItem('dreamsky-user')
    sessionStorage.removeItem(ACCESS_TOKEN_KEY)
    sessionStorage.removeItem(REFRESH_TOKEN_KEY)
    sessionStorage.removeItem('dreamsky-access-token')
    sessionStorage.removeItem('dreamsky-refresh-token')
    sessionStorage.removeItem('dreamsky-user')
  },
}

// ─── Axios instance ───────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5001/api'

const axiosInstance: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
})

// ─── Request interceptor — attach Bearer token ────────────────────────────────

axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenStore.getAccess()
    if (token) {
      config.headers = config.headers ?? {}
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// ─── Flag to prevent multiple simultaneous refresh attempts ──────────────────

let isRefreshing = false
let refreshSubscribers: Array<(token: string) => void> = []

function subscribeToRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback)
}

function notifyRefreshSubscribers(token: string) {
  refreshSubscribers.forEach((cb) => cb(token))
  refreshSubscribers = []
}

// ─── Response interceptor — unwrap envelope + handle 401 ─────────────────────

axiosInstance.interceptors.response.use(
  // Success: unwrap the dream-sky envelope and return just `data`
  (response: AxiosResponse<DreamSkyEnvelope<unknown>>) => {
    // Pass through non-envelope responses (e.g. file downloads) unchanged
    if (response.data && typeof response.data === 'object' && 'success' in response.data) {
      return response.data.data as unknown as AxiosResponse
    }
    return response.data as unknown as AxiosResponse
  },

  // Error: attempt silent token refresh on 401, redirect to /login on failure
  async (error) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // Only attempt refresh once per original request
    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = tokenStore.getRefresh()

      if (!refreshToken) {
        // No refresh token — force logout
        tokenStore.clearAll()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      if (isRefreshing) {
        // Another request already triggered a refresh — queue this one
        return new Promise<unknown>((resolve) => {
          subscribeToRefresh((newToken) => {
            originalRequest.headers = originalRequest.headers ?? {}
            originalRequest.headers['Authorization'] = `Bearer ${newToken}`
            resolve(axiosInstance(originalRequest))
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const refreshResponse = await axiosInstance.post<
          DreamSkyEnvelope<{ accessToken: string; refreshToken: string }>
        >('/auth/refresh', { refreshToken })

        const rawData = (refreshResponse as any)?.data ?? refreshResponse
        const newAccessToken = rawData?.accessToken
        const newRefreshToken = rawData?.refreshToken

        if (newAccessToken) {
          tokenStore.setAccess(newAccessToken)
          if (newRefreshToken) tokenStore.setRefresh(newRefreshToken)
          isRefreshing = false
          notifyRefreshSubscribers(newAccessToken)

          originalRequest.headers = originalRequest.headers ?? {}
          originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`
          return axiosInstance(originalRequest)
        } else {
          throw new Error('No access token in refresh response')
        }
      } catch {
        isRefreshing = false
        refreshSubscribers = []
        tokenStore.clearAll()
        window.location.href = '/login'
        return Promise.reject(error)
      }
    }

    // For all other errors, reject with a plain Error so callers get .message
    const message: string =
      (error.response?.data as DreamSkyEnvelope<unknown>)?.message ??
      error.message ??
      'An unexpected error occurred'

    return Promise.reject(new Error(message))
  },
)

// ─── Typed helpers ────────────────────────────────────────────────────────────

/**
 * Typed API client.  Each method returns `T` directly (envelope already stripped).
 *
 * Example:
 *   const students = await api.get<Student[]>('/students', { params: { stage: 'LEAD' } })
 */
export const api = {
  get<T>(url: string, config?: object): Promise<T> {
    return axiosInstance.get(url, config) as Promise<T>
  },
  post<T>(url: string, data?: unknown, config?: object): Promise<T> {
    return axiosInstance.post(url, data, config) as Promise<T>
  },
  put<T>(url: string, data?: unknown, config?: object): Promise<T> {
    return axiosInstance.put(url, data, config) as Promise<T>
  },
  patch<T>(url: string, data?: unknown, config?: object): Promise<T> {
    return axiosInstance.patch(url, data, config) as Promise<T>
  },
  delete<T>(url: string, config?: object): Promise<T> {
    return axiosInstance.delete(url, config) as Promise<T>
  },
}

export default axiosInstance
