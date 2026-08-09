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
}

// ─── Mock-mode helpers (unchanged from original) ──────────────────────────────

const demoPassword = 'eplanet-demo'

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
  const expected = student.portalPassword ?? `Eplanet@${(student.studentId.replace(/\D/g, '').slice(-4) || '0000')}`
  if (password !== expected) return null
  return {
    id: `student-auth-${student.id}`,
    name: student.name,
    email: student.email,
    role: 'student',
    avatarColor: student.photoColor,
    branchId: demoUsers.super_admin.branchId,
    branchName: demoUsers.super_admin.branchName,
    linkedId: student.id,
  }
}

function getInitialRole(): Role {
  if (typeof window === 'undefined') return 'super_admin'
  const stored =
    (window.sessionStorage.getItem('eplanet-demo-role') as Role | null) ??
    (window.localStorage.getItem('eplanet-demo-role') as Role | null)
  return stored && demoUsers[stored] ? stored : 'super_admin'
}

function getInitialUser(): CurrentUser {
  if (typeof window === 'undefined') return demoUsers.super_admin
  const role = getInitialRole()

  const storedUserStr =
    window.sessionStorage.getItem('eplanet-user') ||
    window.localStorage.getItem('eplanet-user') ||
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
            mustChangePassword: false,
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
  const hasToken = !!tokenStore.getAccess()
  const hasAuthFlag =
    window.sessionStorage.getItem('eplanet-authenticated') === 'true' ||
    window.localStorage.getItem('eplanet-authenticated') === 'true'
  return hasToken || hasAuthFlag
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: getInitialAuthenticated(),
  isLoading: false,
  currentUser: getInitialUser(),

  // ── login ──────────────────────────────────────────────────────────────────
  login: async (email, password, remember = true) => {
    tokenStore.setRemember(remember)

    // ── MOCK MODE ──────────────────────────────────────────────────────────────
    if (isMockMode()) {
      const demoUser = Object.values(demoUsers).find(
        (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
      )
      if (demoUser && password === demoPassword) {
        mockStorage().setItem('eplanet-authenticated', 'true')
        mockStorage().setItem('eplanet-demo-role', demoUser.role)
        mockStorage().setItem('eplanet-user', JSON.stringify(demoUser))
        set({ currentUser: demoUser, isAuthenticated: true })
        return true
      }
      const studentUser = getStudentLoginUser(email, password)
      if (studentUser) {
        mockStorage().setItem('eplanet-authenticated', 'true')
        mockStorage().setItem('eplanet-demo-role', 'student')
        mockStorage().setItem('eplanet-user', JSON.stringify(studentUser))
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
      localStorage.setItem('eplanet-authenticated', 'true')
      localStorage.setItem('eplanet-user', JSON.stringify(user))
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
      window.localStorage.removeItem('eplanet-authenticated')
      window.sessionStorage.removeItem('eplanet-authenticated')
      window.localStorage.removeItem('eplanet-demo-role')
      window.sessionStorage.removeItem('eplanet-demo-role')
      window.localStorage.removeItem('eplanet-user')
      window.sessionStorage.removeItem('eplanet-user')
      window.localStorage.removeItem('dreamsky-user')
      window.sessionStorage.removeItem('dreamsky-user')
    }
    set({ isAuthenticated: false })
  },

  // ── setRole (mock only) ────────────────────────────────────────────────────
  setRole: (role) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('eplanet-demo-role', role)
      window.sessionStorage.setItem('eplanet-demo-role', role)
    }
    set({ currentUser: demoUsers[role], isAuthenticated: true })
  },

  // ── restoreSession (real mode: called once in App.tsx on mount) ────────────
  restoreSession: async () => {
    const token = tokenStore.getAccess()

    if (isMockMode()) {
      const isAuth =
        window.sessionStorage.getItem('eplanet-authenticated') === 'true' ||
        window.localStorage.getItem('eplanet-authenticated') === 'true' ||
        !!token
      if (isAuth) {
        set({ currentUser: getInitialUser(), isAuthenticated: true })
      }
      return
    }

    if (!token) return
    set({ isLoading: true })
    try {
      const user = await api.get<BackendUser>('/auth/me')
      const currentUser = toCurrentUser(user)
      localStorage.setItem('eplanet-user', JSON.stringify(user))
      set({ currentUser, isAuthenticated: true, isLoading: false })
    } catch {
      // Check if token exists along with stored user details before clearing session
      const storedUserStr =
        localStorage.getItem('eplanet-user') || sessionStorage.getItem('eplanet-user')
      if (token && storedUserStr) {
        set({ currentUser: getInitialUser(), isAuthenticated: true, isLoading: false })
      } else {
        set({ isAuthenticated: false, isLoading: false })
      }
    }
  },
}))

export { demoPassword }
