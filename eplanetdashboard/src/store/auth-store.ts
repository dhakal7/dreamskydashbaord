/**
 * auth-store.ts  — Phase F1
 *
 * Dual-mode Zustand auth store:
 *  - MOCK mode (VITE_USE_MOCK=true, default): existing demo-user behaviour,
 *    zero backend calls.  All existing dashboards keep working unchanged.
 *  - REAL mode (VITE_USE_MOCK=false): calls dream-sky /auth/* endpoints,
 *    persists JWT tokens via tokenStore, maps backend role enum → frontend Role.
 *
 * The CurrentUser shape is unchanged so every consumer (dashboards, nav, etc.)
 * works in both modes without any modification.
 */

import { create } from 'zustand'
import type { CurrentUser, Role } from '@/types'
import { demoUsers } from '@/mock/current-user'
import { useStudentsStore } from '@/features/students/store'
import { api, isMockMode, tokenStore } from '@/lib/api-client'
import { toFrontendRole, type BackendRole } from '@/lib/role-map'

// Synchronously parse and store query params for cross-origin SSO on app boot before React renders
if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('accessToken')
  const refresh = params.get('refreshToken')
  const userStr = params.get('user')

  if (token) {
    localStorage.setItem('dreamsky-remember-me', 'true')
    localStorage.setItem('dreamsky-access-token', token)

    if (refresh) {
      localStorage.setItem('dreamsky-refresh-token', refresh)
    }

    if (userStr) {
      localStorage.setItem('dreamsky-user', userStr)
    }

    localStorage.setItem('dreamsky-authenticated', 'true')

    // Normalize role as fallback
    try {
      const parsedUser = JSON.parse(userStr || '{}')
      const rawRole = (parsedUser.role || '').toUpperCase()
      let feRole = 'student'
      if (rawRole.includes('ADMIN')) feRole = 'super_admin'
      else if (rawRole.includes('COUNSELOR')) feRole = 'counselor'
      else if (rawRole.includes('TEACHER')) feRole = 'teacher'
      else if (rawRole.includes('FRONT_DESK')) feRole = 'front_desk'
      else if (rawRole.includes('REFERRAL')) feRole = 'referral_agent'
      else feRole = rawRole.toLowerCase()

      localStorage.setItem('dreamsky-demo-role', feRole)
    } catch {
      // Safe to ignore
    }

    // Clean URL query parameters synchronously
    const cleanUrl = window.location.pathname + window.location.hash
    window.history.replaceState({}, document.title, cleanUrl)
  }
}

// ─── Backend response shape (from sanitizeUser) ───────────────────────────────

interface BackendUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: BackendRole
  status: string
  branchId: string | null
  branchName: string | null
  mustChangePassword: boolean
  studentId: string | null
  referralAgentProfileId: string | null
}

interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: BackendUser
}

// ─── Helper: map backend user → frontend CurrentUser ─────────────────────────

function toCurrentUser(backendUser: BackendUser): CurrentUser {
  const frontendRole: Role = toFrontendRole(backendUser.role)

  /**
   * linkedId is what downstream components use to scope data to "this user":
   *   - counselor    → User.id  (Student.assignedCounselorId references User.id)
   *   - teacher      → User.id  (Class.teacherId references User.id)
   *   - front_desk   → User.id
   *   - super_admin  → User.id
   *   - student      → User.id  (the User has studentId FK, but queries go via user.id)
   *   - referral_agent → ReferralAgentProfile.id (Student.referredByAgentId references it)
   */
  const linkedId =
    frontendRole === 'referral_agent' && backendUser.referralAgentProfileId
      ? backendUser.referralAgentProfileId
      : frontendRole === 'student' && backendUser.studentId
      ? backendUser.studentId
      : backendUser.id

  return {
    id: backendUser.id,
    name: `${backendUser.firstName} ${backendUser.lastName}`.trim(),
    email: backendUser.email,
    role: frontendRole,
    avatarColor: '#0F172A', // will be overridden by Tailwind generated color in UI
    branchId: backendUser.branchId ?? '',
    branchName: backendUser.branchName ?? '',
    linkedId,
    mustChangePassword: backendUser.mustChangePassword,
  }
}

// ─── State interface ──────────────────────────────────────────────────────────

interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  currentUser: CurrentUser
  /** login() returns true on success, false on bad credentials (mock) or throws on network error (real). */
  login: (email: string, password: string, remember?: boolean) => Promise<boolean>
  logout: () => Promise<void>
  /** setRole() is mock-only — used by the role-switcher dropdown in the topbar. */
  setRole: (role: Role) => void
  /** restoreSession() re-hydrates real-mode auth from stored tokens on app boot. */
  restoreSession: () => Promise<void>
  /** clearMustChangePassword() marks password change complete for current session and storage. */
  clearMustChangePassword: (newPassword?: string) => void
}

// ─── Mock-mode helpers (unchanged from original) ──────────────────────────────

const demoPassword = 'dreamsky-demo'

// Mock mode keeps its "authenticated" flag + demo role in the storage that
// matches the login remember-me preference (localStorage = remember, sessionStorage = no).
function mockStorage(): Storage {
  return tokenStore.getRemember() ? window.localStorage : window.sessionStorage
}

function getStudentLoginUser(email: string, password: string): CurrentUser | null {
  const student = useStudentsStore
    .getState()
    .students.find((s) => s.email.toLowerCase() === email.trim().toLowerCase())
  if (!student) return null
  const expected = student.portalPassword ?? `DreamSky@${(student.studentId.replace(/\D/g, '').slice(-4) || '0000')}`
  if (password !== expected) return null
  const studentWithAuth = student as typeof student & { portalPassword?: string; mustChangePassword?: boolean }
  const hasChangedPassword = Boolean(studentWithAuth.portalPassword) || studentWithAuth.mustChangePassword === false
  return {
    id: `student-auth-${student.id}`,
    name: student.name,
    email: student.email,
    role: 'student',
    avatarColor: student.photoColor,
    branchId: demoUsers.super_admin.branchId,
    branchName: demoUsers.super_admin.branchName,
    linkedId: student.id,
    mustChangePassword: !hasChangedPassword,
  }
}

function getInitialRole(): Role {
  if (typeof window === 'undefined') return 'super_admin'
  const stored =
    (window.sessionStorage.getItem('dreamsky-demo-role') as Role | null) ??
    (window.localStorage.getItem('dreamsky-demo-role') as Role | null)
  return stored && demoUsers[stored] ? stored : 'super_admin'
}

function getInitialUser(): CurrentUser {
  if (typeof window === 'undefined') return demoUsers.super_admin
  const role = getInitialRole()

  const storedUserStr =
    window.sessionStorage.getItem('dreamsky-user') ||
    window.localStorage.getItem('dreamsky-user') ||
    window.sessionStorage.getItem('dreamsky-user') ||
    window.localStorage.getItem('dreamsky-user')

  if (storedUserStr) {
    try {
      const parsed = JSON.parse(storedUserStr)
      if (parsed) {
        if (parsed.email && parsed.firstName) {
          return toCurrentUser({
            id: parsed.id || 'user-1',
            email: parsed.email,
            firstName: parsed.firstName,
            lastName: parsed.lastName || '',
            role: parsed.role || 'SUPER_ADMIN',
            status: parsed.status || 'ACTIVE',
            branchId: parsed.branchId || null,
            branchName: parsed.branchName || null,
            mustChangePassword: parsed.mustChangePassword ?? false,
            studentId: parsed.studentId || null,
            referralAgentProfileId: parsed.referralAgentProfileId || null,
          })
        } else if (parsed.role && parsed.email) {
          return {
            id: parsed.id || 'user-1',
            name: parsed.name || parsed.email.split('@')[0],
            email: parsed.email,
            role: toFrontendRole(parsed.role),
            avatarColor: parsed.avatarColor || '#0F172A',
            branchId: parsed.branchId || '',
            branchName: parsed.branchName || '',
            linkedId: parsed.linkedId || parsed.id || 'user-1',
            mustChangePassword: parsed.mustChangePassword ?? false,
          }
        }
      }
    } catch {
      // Fall through to demo user
    }
  }

  return demoUsers[role] ?? demoUsers.super_admin
}

function getInitialAuthenticated(): boolean {
  if (typeof window === 'undefined') return false
  const isLoggedOut =
    window.localStorage.getItem('dreamsky-logged-out') === 'true' ||
    window.sessionStorage.getItem('dreamsky-logged-out') === 'true'

  if (isLoggedOut) return false

  if (isMockMode()) {
    const hasMockAuth =
      window.sessionStorage.getItem('dreamsky-authenticated') === 'true' ||
      (tokenStore.getRemember() && window.localStorage.getItem('dreamsky-authenticated') === 'true')
    return hasMockAuth
  }

  const hasToken = !!tokenStore.getAccess()
  const hasAuthFlag =
    window.sessionStorage.getItem('dreamsky-authenticated') === 'true' ||
    window.localStorage.getItem('dreamsky-authenticated') === 'true'

  return hasToken && hasAuthFlag
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: getInitialAuthenticated(),
  isLoading: false,
  currentUser: getInitialUser(),

  // ── login ──────────────────────────────────────────────────────────────────
  login: async (email, password, remember = true) => {
    tokenStore.clearAll()
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('dreamsky-logged-out')
      window.sessionStorage.removeItem('dreamsky-logged-out')
    }
    tokenStore.setRemember(remember)

    // ── MOCK MODE ──────────────────────────────────────────────────────────────
    if (isMockMode()) {
      const isTeacherEmail = email.trim().toLowerCase() === 'teacher@dreamsky.internal' || email.trim().toLowerCase() === 'anup.rijal@dreamsky.com'
      const demoUser = Object.values(demoUsers).find(
        (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
      ) || (isTeacherEmail ? demoUsers.teacher : undefined)

      const isTeacherPasswordMatch = isTeacherEmail && (password === 'dreamskyteacher@2025' || password === 'Password123!' || password === demoPassword)

      if (demoUser && (password === demoPassword || isTeacherPasswordMatch)) {
        mockStorage().removeItem('dreamsky-logged-out')
        mockStorage().setItem('dreamsky-authenticated', 'true')
        mockStorage().setItem('dreamsky-demo-role', demoUser.role)
        mockStorage().setItem('dreamsky-user', JSON.stringify(demoUser))
        set({ currentUser: demoUser, isAuthenticated: true })
        return true
      }
      const studentUser = getStudentLoginUser(email, password)
      if (studentUser) {
        mockStorage().removeItem('dreamsky-logged-out')
        mockStorage().setItem('dreamsky-authenticated', 'true')
        mockStorage().setItem('dreamsky-demo-role', 'student')
        mockStorage().setItem('dreamsky-user', JSON.stringify(studentUser))
        set({ currentUser: studentUser, isAuthenticated: true })
        return true
      }
      return false
    }

    // ── REAL MODE ──────────────────────────────────────────────────────────────
    set({ isLoading: true })
    try {
      const { accessToken, refreshToken, user } = await api.post<LoginResponse>('/auth/login', {
        email,
        password,
      })
      tokenStore.setAccess(accessToken)
      tokenStore.setRefresh(refreshToken)
      localStorage.setItem('dreamsky-authenticated', 'true')
      localStorage.setItem('dreamsky-user', JSON.stringify(user))
      const currentUser = toCurrentUser(user)
      set({ currentUser, isAuthenticated: true, isLoading: false })
      return true
    } catch (err) {
      set({ isLoading: false })
      throw err // let login-page.tsx catch and display the toast
    }
  },

  // ── logout ─────────────────────────────────────────────────────────────────
  logout: async () => {
    if (!isMockMode()) {
      const refreshToken = tokenStore.getRefresh()
      if (refreshToken) {
        try {
          await api.post('/auth/logout', { refreshToken })
        } catch {
          // Swallow — tokens will be cleared locally regardless
        }
      }
      tokenStore.clearAll()
    } else {
      // Clear all mock-mode auth flags so landing page login is required again
      window.localStorage.setItem('dreamsky-logged-out', 'true')
      window.sessionStorage.setItem('dreamsky-logged-out', 'true')
      window.localStorage.removeItem('dreamsky-authenticated')
      window.sessionStorage.removeItem('dreamsky-authenticated')
      window.localStorage.removeItem('dreamsky-demo-role')
      window.sessionStorage.removeItem('dreamsky-demo-role')
      window.localStorage.removeItem('dreamsky-user')
      window.sessionStorage.removeItem('dreamsky-user')
      // Also clear real-mode token keys so landing page doesn't auto-restore
      window.localStorage.removeItem('dreamsky-access-token')
      window.localStorage.removeItem('dreamsky-refresh-token')
      window.sessionStorage.removeItem('dreamsky-access-token')
      window.sessionStorage.removeItem('dreamsky-refresh-token')
    }
    set({ isAuthenticated: false })
    // Redirect to dashboard login page
    window.location.href = '/login'
  },

  clearMustChangePassword: (newPassword?: string) => {
    const currentUser = useAuthStore.getState().currentUser
    if (!currentUser) return
    const updatedUser = { ...currentUser, mustChangePassword: false }

    if (typeof window !== 'undefined') {
      const storage = mockStorage()
      storage.setItem('dreamsky-user', JSON.stringify(updatedUser))

      if (currentUser.role === 'student' && currentUser.linkedId) {
        useStudentsStore.setState((prev) => ({
          students: prev.students.map((s) =>
            s.id === currentUser.linkedId
              ? {
                  ...s,
                  mustChangePassword: false,
                  ...(newPassword ? { portalPassword: newPassword } : {}),
                }
              : s,
          ),
        }))
      }
    }

    set({ currentUser: updatedUser })
  },

  // ── setRole (mock only) ────────────────────────────────────────────────────
  setRole: (role) => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('dreamsky-logged-out')
      window.sessionStorage.removeItem('dreamsky-logged-out')
      window.localStorage.setItem('dreamsky-demo-role', role)
      window.sessionStorage.setItem('dreamsky-demo-role', role)
      window.localStorage.setItem('dreamsky-user', JSON.stringify(demoUsers[role]))
    }
    set({ currentUser: demoUsers[role], isAuthenticated: true })
  },

  // ── restoreSession (real mode: called once in App.tsx on mount) ────────────
  restoreSession: async () => {
    const token = tokenStore.getAccess()

    if (isMockMode()) {
      const isAuth = getInitialAuthenticated()
      if (isAuth) {
        set({ currentUser: getInitialUser(), isAuthenticated: true })
      } else {
        set({ isAuthenticated: false })
      }
      return
    }

    if (!token) {
      set({ isAuthenticated: false })
      return
    }

    set({ isLoading: true })
    try {
      const user = await api.get<BackendUser>('/auth/me')
      const currentUser = toCurrentUser(user)
      localStorage.setItem('dreamsky-user', JSON.stringify(user))
      set({ currentUser, isAuthenticated: true, isLoading: false })
    } catch {
      tokenStore.clearAll()
      set({ isAuthenticated: false, isLoading: false })
    }
  },
}))

export { demoPassword }
