import type { ApiStudent } from '@/api/student-api'
import type { Student, StudyLevel } from '@/types'

function parseLevelFromNotes(notes: string | null): StudyLevel {
  if (!notes) return 'bachelor'
  const match = notes.match(/Level:\s*([a-zA-Z]+)/i)
  if (match) {
    const raw = match[1].toLowerCase()
    if (raw.includes('master')) return 'master'
    if (raw.includes('diploma')) return 'diploma'
    if (raw.includes('foundation')) return 'foundation'
    if (raw.includes('phd') || raw.includes('doctorate')) return 'phd'
    if (raw.includes('bachelor')) return 'bachelor'
  }
  const lower = notes.toLowerCase()
  if (lower.includes('master')) return 'master'
  if (lower.includes('diploma')) return 'diploma'
  if (lower.includes('phd')) return 'phd'
  if (lower.includes('foundation')) return 'foundation'
  return 'bachelor'
}

function parseCountriesFromNotes(notes: string | null): string[] {
  if (!notes) return []
  const match = notes.match(/Interested Countries:\s*([^|]+)/i)
  if (match) {
    return match[1].split(',').map((c) => c.trim()).filter(Boolean)
  }
  return []
}

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
    counselorId: apiStudent.assignedCounselorId || apiStudent.assignedCounselor?.id || '',
    counselorName,
    preferredCountries: parseCountriesFromNotes(apiStudent.notes),
    preferredLevel: parseLevelFromNotes(apiStudent.notes),
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
