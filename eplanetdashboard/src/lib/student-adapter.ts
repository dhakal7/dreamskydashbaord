import type { ApiStudent } from '@/api/student-api'
import type { Student } from '@/types'

export function adaptApiStudentToStudent(apiStudent: ApiStudent): Student {
  const counselorName = apiStudent.assignedCounselor
    ? `${apiStudent.assignedCounselor.firstName} ${apiStudent.assignedCounselor.lastName}`.trim()
    : 'Unassigned'

  return {
    id: apiStudent.id,
    studentId: apiStudent.id,
    name: `${apiStudent.firstName} ${apiStudent.lastName}`.trim(),
    photoColor: '#0F172A',
    email: apiStudent.email,
    phone: apiStudent.phone ?? '',
    dob: apiStudent.dateOfBirth ?? '',
    gender: 'other',
    nationality: apiStudent.nationality ?? '',
    passportNumber: '',
    address: '',
    status: (apiStudent.isActive ? 'active' : 'inactive') as Student['status'],
    counselorId: apiStudent.assignedCounselorId ?? '',
    counselorName,
    preferredCountries: [],
    preferredLevel: 'bachelor',
    budgetUsd: 0,
    englishTest: { type: 'None', overallScore: 0, testDate: '' },
    academics: [],
    parents: [],
    documentsUploaded: 0,
    documentsRequired: 7,
    createdAt: apiStudent.createdAt,
    tags: [apiStudent.currentStage],
  }
}
