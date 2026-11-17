/**
 * portal-api.ts
 *
 * Axios wrappers for the student-isolated /portal/:studentId/* endpoints.
 * All endpoints enforce requireOwnStudentPortal on the backend.
 */

import { api } from '@/lib/api-client'

export interface PortalDashboardResponse {
  student: {
    id: string
    firstName: string
    lastName: string
    currentStage: string
  }
  counts: {
    applications: number
    activeVisaCases: number
    documents: number
    verifiedDocuments: number
    upcomingAppointments: number
    followUps: number
  }
  timeline: Array<{
    stage: string
    completed: boolean
    current: boolean
  }>
}

export interface PortalApplication {
  id: string
  studentId: string
  universityId?: string | null
  courseId?: string | null
  status: string
  intake?: string | null
  submittedAt?: string | null
  createdAt: string
  updatedAt: string
  university?: { id: string; name: string } | null
  course?: { id: string; name: string; level?: string | null } | null
  offers?: Array<{ id: string; type: string; details?: string | null; receivedAt?: string | null }>
}

export interface PortalVisaCase {
  id: string
  applicationId: string
  status: string
  createdAt: string
  updatedAt: string
  application?: {
    id: string
    university?: { id: string; name: string } | null
    course?: { id: string; name: string } | null
  } | null
}

export interface PortalDocument {
  id: string
  type: string
  status: string
  originalName?: string | null
  mimeType?: string | null
  expiryDate?: string | null
  notes?: string | null
  createdAt: string
}

export interface PortalAppointment {
  id: string
  type: string
  notes?: string | null
  datetime: string
  durationMin?: number | null
  meetingMode?: string | null
  meetingLink?: string | null
  status: string
  outcome?: string | null
  createdAt: string
  counselor?: { id: string; firstName: string; lastName: string } | null
}

export const portalApi = {
  getDashboard(studentId: string): Promise<PortalDashboardResponse> {
    return api.get(`/portal/${studentId}/dashboard`)
  },

  getApplications(studentId: string): Promise<PortalApplication[]> {
    return api.get(`/portal/${studentId}/applications`)
  },

  getVisaCases(studentId: string): Promise<PortalVisaCase[]> {
    return api.get(`/portal/${studentId}/visa-cases`)
  },

  getDocuments(studentId: string): Promise<PortalDocument[]> {
    return api.get(`/portal/${studentId}/documents`)
  },

  getAppointments(studentId: string): Promise<PortalAppointment[]> {
    return api.get(`/portal/${studentId}/appointments`)
  },
}

