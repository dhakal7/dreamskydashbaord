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

function parseAddressFromNotes(notes: string | null): string {
  if (!notes) return ''
  const match = notes.match(/Address:\s*([^|]+)/i)
  if (match) {
    const val = match[1].trim()
    return val === 'N/A' ? '' : val
  }
  return ''
}

export function adaptApiStudentToStudent(apiStudent: ApiStudent): Student {
  const counselorName = apiStudent.assignedCounselor
    ? `${apiStudent.assignedCounselor.firstName} ${apiStudent.assignedCounselor.lastName}`.trim()
    : 'Unassigned'

  const acad = (apiStudent.academicBackground as any) || {}
  const family = ((apiStudent as any).familyBackground as any) || {}
  const parsedLevel = acad.preferredLevel
    ? parseLevelFromNotes(acad.preferredLevel)
    : parseLevelFromNotes(apiStudent.notes)

  const parsedCountries = Array.isArray(acad.preferredCountries) && acad.preferredCountries.length > 0
    ? acad.preferredCountries
    : parseCountriesFromNotes(apiStudent.notes)

  const dobStr = apiStudent.dateOfBirth
    ? (typeof apiStudent.dateOfBirth === 'string' ? apiStudent.dateOfBirth.split('T')[0] : '')
    : (acad.dob || '')

  return {
    id: apiStudent.id,
    studentId: apiStudent.id.length > 12 ? `STU-${apiStudent.id.slice(-6).toUpperCase()}` : apiStudent.id,
    name: `${apiStudent.firstName} ${apiStudent.lastName}`.trim(),
    photoColor: '#0F172A',
    email: apiStudent.email,
    phone: apiStudent.phone ?? '',
    dob: dobStr,
    gender: (acad.gender as any) || 'other',
    nationality: apiStudent.nationality ?? '',
    passportNumber: acad.passportNumber || '',
    address: acad.address || parseAddressFromNotes(apiStudent.notes),
    status: (apiStudent.isActive ? 'active' : 'inactive') as Student['status'],
    counselorId: apiStudent.assignedCounselorId || apiStudent.assignedCounselor?.id || '',
    counselorName,
    processingType: apiStudent.processingType === 'PARTNER_CONSULTANCY' ? 'partner_consultancy' : 'self',
    partnerConsultancyId: apiStudent.partnerConsultancyId ?? undefined,
    partnerConsultancyName: apiStudent.partnerConsultancy?.name ?? undefined,
    preferredCountries: parsedCountries,
    preferredLevel: parsedLevel,
    budgetUsd: acad.budgetUsd || 0,
    englishTest: acad.englishTest || { type: 'None', overallScore: 0, testDate: '' },
    academics: Array.isArray(acad.records) ? acad.records : Array.isArray(acad.academics) ? acad.academics : [],
    parents: Array.isArray(family.parents) ? family.parents : Array.isArray(acad.parents) ? acad.parents : [],
    documentsUploaded: 0,
    documentsRequired: 7,
    createdAt: apiStudent.createdAt,
    tags: [apiStudent.currentStage],
  }
}
