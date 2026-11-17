import { describe, expect, it } from 'vitest'
import { resolveFollowUpStatus } from './followups-page'

describe('resolveFollowUpStatus', () => {
  const now = new Date('2026-11-16T12:00:00.000Z')

  it('marks null/undefined nextFollowUpAt as completed', () => {
    expect(resolveFollowUpStatus(null, now)).toBe('completed')
    expect(resolveFollowUpStatus(undefined, now)).toBe('completed')
  })

  it('marks future nextFollowUpAt as pending', () => {
    expect(resolveFollowUpStatus('2026-11-17T09:00:00.000Z', now)).toBe('pending')
  })

  it('marks past-due nextFollowUpAt as missed', () => {
    expect(resolveFollowUpStatus('2026-11-15T09:00:00.000Z', now)).toBe('missed')
    expect(resolveFollowUpStatus('2026-11-16T12:00:00.000Z', now)).toBe('missed')
  })

  it('recalculates status when follow-up date changes', () => {
    // Overdue -> rescheduled to future => pending
    expect(resolveFollowUpStatus('2026-11-15T09:00:00.000Z', now)).toBe('missed')
    expect(resolveFollowUpStatus('2026-11-18T09:00:00.000Z', now)).toBe('pending')
    // Future -> marked completed (nextFollowUpAt cleared) => completed
    expect(resolveFollowUpStatus(null, now)).toBe('completed')
  })
})
