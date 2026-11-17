import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { hasPermission } from '@/lib/rbac'
import { defaultStudentFilters } from '@/features/students/components/student-filters'

const rootDir = path.resolve(__dirname, '..')

describe('Phase 4.10 Six-Defect Resolution', () => {
  it('Issue 1: FeeManagementPanel removes Phase 3A Read-Only lock on Add Student Fee and enforces role gate', () => {
    const file = fs.readFileSync(
      path.join(rootDir, 'features/reception/components/fee-management-panel.tsx'),
      'utf8'
    )
    expect(file).not.toContain('Fee creation is locked during read-only verification')
    expect(file).toContain("const canCreateFee = ['super_admin', 'branch_admin', 'front_desk'].includes(currentUser.role)")
    expect(file).toContain('Paid amount cannot exceed total amount')
  })

  it('Issue 3: TEACHER does not have classes.manage permission and Class Capture List is gated on canManageClasses', () => {
    expect(hasPermission('teacher', 'classes.manage')).toBe(false)
    expect(hasPermission('front_desk', 'classes.manage')).toBe(true)
    expect(hasPermission('branch_admin', 'classes.manage')).toBe(true)
    expect(hasPermission('super_admin', 'classes.manage')).toBe(true)

    const file = fs.readFileSync(
      path.join(rootDir, 'features/classes/classes-page.tsx'),
      'utf8'
    )
    expect(file).toContain("const canManageClasses = hasPermission(role, 'classes.manage')")
    expect(file).toContain('{canManageClasses && (')
    expect(file).toContain("{canManageClasses && activeSectionTab === 'capture' && (")
  })

  it('Issue 4: ClassesPage & ClassDetailPage warn on over-capacity batches and block new admissions', () => {
    const classesFile = fs.readFileSync(
      path.join(rootDir, 'features/classes/classes-page.tsx'),
      'utf8'
    )
    const detailFile = fs.readFileSync(
      path.join(rootDir, 'features/classes/class-detail-page.tsx'),
      'utf8'
    )
    expect(classesFile).toContain('Over Capacity (+')
    expect(classesFile).toContain('disabled={isAtCapacity}')
    expect(detailFile).toContain('Over Capacity Warning:')
  })

  it('Issue 5: CountriesPage uses live universityCount and studentCount instead of hardcoded 0', () => {
    const file = fs.readFileSync(
      path.join(rootDir, 'features/countries/countries-page.tsx'),
      'utf8'
    )
    expect(file).toContain('c.universityCount ?? c._count?.universities')
    expect(file).toContain("typeof c.studentCount === 'number' ? c.studentCount : 0")
    expect(file).not.toContain('studentCount: 0,')
  })

  it('Issue 6: StudentFilters includes studentType defaulting to all with Class Only option', () => {
    expect(defaultStudentFilters.studentType).toBe('all')
    const filtersFile = fs.readFileSync(
      path.join(rootDir, 'features/students/components/student-filters.tsx'),
      'utf8'
    )
    const studentsFile = fs.readFileSync(
      path.join(rootDir, 'features/students/students-page.tsx'),
      'utf8'
    )
    expect(filtersFile).toContain('value="class_only">Class Only')
    expect(filtersFile).toContain('value="consultancy">Consultancy')
    expect(studentsFile).toContain("if (filters.studentType === 'class_only' && !s.isClassOnly) return false")
    expect(studentsFile).toContain("if (filters.studentType === 'consultancy' && s.isClassOnly) return false")
  })

  it('Phase 4.10.4 Fix 1 & 2: Header Admit button initializes empty class selection and /users fetch is gated on canManageClasses', () => {
    const classesFile = fs.readFileSync(
      path.join(rootDir, 'features/classes/classes-page.tsx'),
      'utf8'
    )
    expect(classesFile).toContain("handleOpenAdmitModal('')")
    expect(classesFile).toContain('placeholder="Select an available class"')
    expect(classesFile).toContain('if (!isMockMode() && canManageClasses)')
    expect(classesFile).toContain('!targetClassId ||')
  })

  it('Phase 5.0: FRONT_DESK has no applications permissions and StudentProfilePage gates Applications tab & button', () => {
    expect(hasPermission('front_desk', 'applications.view')).toBe(false)
    expect(hasPermission('front_desk', 'applications.manage')).toBe(false)
    expect(hasPermission('counselor', 'applications.view')).toBe(true)
    expect(hasPermission('counselor', 'applications.manage')).toBe(true)
    expect(hasPermission('branch_admin', 'applications.view')).toBe(true)
    expect(hasPermission('super_admin', 'applications.view')).toBe(true)

    const profileFile = fs.readFileSync(
      path.join(rootDir, 'features/students/student-profile-page.tsx'),
      'utf8'
    )
    expect(profileFile).toContain("const canViewApplications = hasPermission(currentUser?.role ?? 'student', 'applications.view')")
    expect(profileFile).toContain("const visibleTabs = tabs.filter((tab) => tab.id !== 'applications' || canViewApplications)")
    expect(profileFile).toContain('{canViewApplications && (')
  })
})
