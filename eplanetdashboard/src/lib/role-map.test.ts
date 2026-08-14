import { describe, expect, it, vi } from 'vitest'
import { toFrontendRole } from './role-map'

describe('role-map', () => {
  it('maps admin aliases to the super admin dashboard role', () => {
    expect(toFrontendRole('SUPER_ADMIN')).toBe('super_admin')
    expect(toFrontendRole('BRANCH_ADMIN')).toBe('super_admin')
    expect(toFrontendRole('ADMIN')).toBe('super_admin')
  })

  it('keeps student roles as student', () => {
    expect(toFrontendRole('STUDENT')).toBe('student')
  })

  it('does not silently redirect unknown roles to student', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(toFrontendRole('SOMETHING_ELSE')).toBe('super_admin')
    expect(warnSpy).toHaveBeenCalled()
  })
})
