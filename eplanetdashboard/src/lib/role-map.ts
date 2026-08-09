/**
 * role-map.ts
 *
 * Translates the backend's enum role strings (UPPER_SNAKE_CASE) into the
 * frontend's kebab-snake_case Role type, and vice-versa.
 *
 * Canonical mapping (see prisma schema Role enum and frontend types/index.ts):
 *   SUPER_ADMIN   → super_admin
 *   BRANCH_ADMIN  → super_admin  (stopgap — branch admins see full admin UI
 *                                  until a dedicated branch-admin dashboard exists)
 *   COUNSELOR     → counselor
 *   FRONT_DESK    → front_desk
 *   TEACHER       → teacher
 *   STUDENT       → student
 *   REFERRAL_AGENT→ referral_agent
 */

import type { Role } from '@/types'

export type BackendRole =
  | 'SUPER_ADMIN'
  | 'BRANCH_ADMIN'
  | 'COUNSELOR'
  | 'FRONT_DESK'
  | 'TEACHER'
  | 'STUDENT'
  | 'REFERRAL_AGENT'

const backendToFrontend: Record<BackendRole, Role> = {
  SUPER_ADMIN: 'super_admin',
  BRANCH_ADMIN: 'super_admin', // Open Decision #1 — map to dedicated role once dashboard exists
  COUNSELOR: 'counselor',
  FRONT_DESK: 'front_desk',
  TEACHER: 'teacher',
  STUDENT: 'student',
  REFERRAL_AGENT: 'referral_agent',
}

const frontendToBackend: Record<Role, BackendRole> = {
  super_admin: 'SUPER_ADMIN',
  counselor: 'COUNSELOR',
  front_desk: 'FRONT_DESK',
  teacher: 'TEACHER',
  student: 'STUDENT',
  referral_agent: 'REFERRAL_AGENT',
}

/** Map a backend Role enum string to the frontend Role type. */
export function toFrontendRole(backendRole: BackendRole): Role {
  return backendToFrontend[backendRole] ?? 'student'
}

/** Map a frontend Role type to the backend Role enum string. */
export function toBackendRole(frontendRole: Role): BackendRole {
  return frontendToBackend[frontendRole]
}
