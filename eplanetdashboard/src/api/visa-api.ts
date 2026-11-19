/**
 * visa-api.ts  — Phase F3
 *
 * Axios wrappers for dream-sky /visa-cases endpoints.
 */

import { api } from '@/lib/api-client'

export interface ApiVisaCase {
  id: string
  studentId?: string
  applicationId: string | null
  status: string
  country: string | null
  visaType: string | null
  submittedAt: string | null
  appointmentDate: string | null
  decisionDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  student?: { id: string; firstName: string; lastName: string }
  application?: {
    id: string
    status: string
    intake: string | null
    student?: { id: string; firstName: string; lastName: string; email: string }
    university?: { id: string; name: string } | null
    course?: { id: string; name: string; level: string } | null
  }
}

export interface VisaCaseListParams {
  page?: number
  limit?: number
  studentId?: string
  status?: string
}

export interface VisaCaseListResponse {
  visaCases: ApiVisaCase[]
  total: number
  page: number
  limit: number
}

export interface CreateVisaCaseBody {
  studentId: string
  applicationId?: string
  country?: string
  visaType?: string
  notes?: string
}

export interface DepartureDetails {
  status: 'VISA_GRANTED' | 'PREPARING_DEPARTURE' | 'TICKET_BOOKED' | 'DEPARTURE_DELAYED' | 'DEPARTED' | 'VISA_APPROVED' | 'PREPARING' | string
  expectedDepartureDate: string | null
  actualDepartureDate: string | null
  destinationAirport: string | null
  flightNumber: string | null
  notes: string | null
  updatedAt?: string | null
  updatedByName?: string | null
}

export interface VisaGrantedStudent {
  id: string
  studentId: string
  studentCode: string
  studentRefId?: string
  passportNumber?: string | null
  firstName: string
  lastName: string
  studentName: string
  email: string | null
  phone: string | null
  photoUrl: string | null
  assignedCounselorId: string | null
  assignedCounselorName: string
  referredByAgentId: string | null
  referralAgentName: string | null
  referralCode: string | null
  countryName: string
  countryFlag: string
  universityName: string
  courseName: string
  intake: string
  visaGrantDate: string | null
  visaApplicationDate: string | null
  visaCaseId: string | null
  departureStatus: string
  departureDetails: DepartureDetails
  counselorCommission?: {
    id: string
    amount: number
    currency: string
    status: string
    paidAt: string | null
  } | null
  agentCommission?: {
    id: string
    amount: number
    currency: string
    status: string
    paidAt: string | null
  } | null
}

export interface VisaGrantedAnalytics {
  summary: {
    totalApproved: number
    visaGrantedOnly: number
    preparingDeparture: number
    ticketBooked: number
    departed: number
    departureRate: number
  }
  counselors: Array<{
    id: string
    name: string
    approvedCount: number
    departedCount: number
  }>
  referralAgents: Array<{
    id: string
    name: string
    approvedCount: number
    departedCount: number
  }>
  countries: Array<{
    country: string
    count: number
  }>
}

export interface UpdateDepartureBody {
  status?: string
  expectedDepartureDate?: string | null
  actualDepartureDate?: string | null
  destinationAirport?: string | null
  flightNumber?: string | null
  notes?: string | null
}

export interface VisaGrantedListParams {
  counselorId?: string
  referralAgentId?: string
  country?: string
  university?: string
  departureStatus?: string
  search?: string
}

export const visaApi = {
  list(params?: VisaCaseListParams): Promise<VisaCaseListResponse> {
    return api.get('/visa-cases', { params })
  },
  getOne(id: string): Promise<ApiVisaCase> {
    return api.get(`/visa-cases/${id}`)
  },
  create(body: CreateVisaCaseBody): Promise<ApiVisaCase> {
    return api.post('/visa-cases', body)
  },
  update(id: string, body: Partial<CreateVisaCaseBody>): Promise<ApiVisaCase> {
    return api.put(`/visa-cases/${id}`, body)
  },
  changeStatus(id: string, status: string, meta?: { refusalReason?: string; notes?: string }): Promise<ApiVisaCase> {
    return api.patch(`/visa-cases/${id}/status`, { status, ...meta })
  },
  remove(id: string): Promise<void> {
    return api.delete(`/visa-cases/${id}`)
  },

  // ── Visa Granted / Success Students ──────────────────────────────────────
  listGranted(params?: VisaGrantedListParams): Promise<VisaGrantedStudent[]> {
    return api.get<VisaGrantedStudent[]>('/visa-cases/granted', { params })
  },

  grantedAnalytics(): Promise<VisaGrantedAnalytics> {
    return api.get<VisaGrantedAnalytics>('/visa-cases/granted/analytics')
  },

  updateDeparture(studentId: string, body: UpdateDepartureBody): Promise<DepartureDetails> {
    return api.patch<DepartureDetails>(`/visa-cases/granted/${studentId}/departure`, body)
  },
}
