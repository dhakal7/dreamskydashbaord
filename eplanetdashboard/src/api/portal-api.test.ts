import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  api: { get: mockGet },
  isMockMode: () => false,
}))

import { portalApi } from './portal-api'

describe('portalApi student isolation endpoints', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({})
  })

  it('calls student-scoped /portal/:studentId/* endpoints instead of staff-only routes', async () => {
    await portalApi.getDashboard('stu-123')
    await portalApi.getApplications('stu-123')
    await portalApi.getVisaCases('stu-123')
    await portalApi.getDocuments('stu-123')
    await portalApi.getAppointments('stu-123')

    expect(mockGet).toHaveBeenNthCalledWith(1, '/portal/stu-123/dashboard')
    expect(mockGet).toHaveBeenNthCalledWith(2, '/portal/stu-123/applications')
    expect(mockGet).toHaveBeenNthCalledWith(3, '/portal/stu-123/visa-cases')
    expect(mockGet).toHaveBeenNthCalledWith(4, '/portal/stu-123/documents')
    expect(mockGet).toHaveBeenNthCalledWith(5, '/portal/stu-123/appointments')
  })
})

