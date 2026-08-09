/**
 * class-api.ts  — Phase F4
 *
 * Axios wrappers for dream-sky /classes endpoints.
 */

import { api } from '@/lib/api-client'

export interface ApiClass {
  id: string
  name: string
  subject: string
  teacherId: string
  branchId: string | null
  schedule: string | null
  startDate: string | null
  endDate: string | null
  capacity: number
  status: string
  createdAt: string
  teacher?: { id: string; firstName: string; lastName: string }
  enrollments?: ApiEnrollment[]
}

export interface ApiEnrollment {
  id: string
  classId: string
  studentId: string
  enrolledAt: string
  student?: { id: string; firstName: string; lastName: string }
}

export interface ApiAttendanceRecord {
  id: string
  classId: string
  studentId: string
  date: string
  status: string
  markedById: string | null
  notes: string | null
}

export interface ApiClassContent {
  id: string
  classId: string
  title: string
  type: string
  url: string | null
  description: string | null
  createdAt: string
}

export interface ClassListParams {
  page?: number
  limit?: number
  teacherId?: string
  subject?: string
  status?: string
  branchId?: string
}

export interface ClassListResponse {
  classes: ApiClass[]
  total: number
  page: number
  limit: number
}

export interface AttendanceBody {
  records: Array<{ studentId: string; status: string; notes?: string }>
  date: string
}

export const classApi = {
  list(params?: ClassListParams): Promise<ClassListResponse> {
    return api.get('/classes', { params })
  },
  getOne(id: string): Promise<ApiClass> {
    return api.get(`/classes/${id}`)
  },
  /** GET /classes/teacher/me — teacher sees only their own classes */
  getMyClasses(): Promise<ApiClass[]> {
    return api.get('/classes/teacher/me')
  },
  getStudentEnrollments(studentId: string): Promise<ApiEnrollment[]> {
    return api.get(`/classes/student/${studentId}/enrollments`)
  },
  create(body: Omit<ApiClass, 'id' | 'createdAt' | 'teacher' | 'enrollments'>): Promise<ApiClass> {
    return api.post('/classes', body)
  },
  update(id: string, body: Partial<ApiClass>): Promise<ApiClass> {
    return api.put(`/classes/${id}`, body)
  },
  remove(id: string): Promise<void> {
    return api.delete(`/classes/${id}`)
  },
  enrollStudent(classId: string, studentId: string): Promise<ApiEnrollment> {
    return api.post(`/classes/${classId}/enroll`, { studentId })
  },
  unenrollStudent(classId: string, studentId: string): Promise<void> {
    return api.post(`/classes/${classId}/unenroll`, { studentId })
  },
  markAttendance(classId: string, body: AttendanceBody): Promise<ApiAttendanceRecord[]> {
    return api.post(`/classes/${classId}/attendance`, body)
  },
  listContent(classId: string): Promise<ApiClassContent[]> {
    return api.get(`/classes/${classId}/content`)
  },
  createContent(classId: string, body: { title: string; type: string; url?: string; description?: string }): Promise<ApiClassContent> {
    return api.post(`/classes/${classId}/content`, body)
  },
  updateContent(classId: string, contentId: string, body: Partial<ApiClassContent>): Promise<ApiClassContent> {
    return api.put(`/classes/${classId}/content/${contentId}`, body)
  },
  deleteContent(classId: string, contentId: string): Promise<void> {
    return api.delete(`/classes/${classId}/content/${contentId}`)
  },
}
