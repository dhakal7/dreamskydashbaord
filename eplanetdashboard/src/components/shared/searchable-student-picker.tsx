import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'

interface StudentOption {
  id: string
  name: string
  studentId: string
  email?: string
}

interface SearchableStudentPickerProps {
  students: StudentOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  emptyMessage?: string
  showDropdown?: boolean
  autoSelectOnSearch?: boolean
}

export function SearchableStudentPicker({
  students,
  value,
  onChange,
  placeholder = 'Search by name or student ID',
  label,
  emptyMessage = 'No students found',
  showDropdown = true,
  autoSelectOnSearch = false,
}: SearchableStudentPickerProps) {
  const [search, setSearch] = useState('')

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return students

    return students.filter((student) => {
      const haystack = `${student.name} ${student.studentId} ${student.email ?? ''}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [students, search])

  const selectedStudent = students.find((student) => student.id === value)

  useEffect(() => {
    if (!autoSelectOnSearch || showDropdown) return

    const query = search.trim()
    if (!query) return

    const match = filteredStudents[0]
    if (match && match.id !== value) {
      onChange(match.id)
    }
  }, [autoSelectOnSearch, showDropdown, search, filteredStudents, value, onChange])

  return (
    <div className="space-y-2">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <Input
        placeholder={placeholder}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {showDropdown && (
        <div className="max-h-44 space-y-1 overflow-auto rounded-md border border-border/70 bg-background p-2">
          {filteredStudents.length > 0 ? (
            filteredStudents.map((student) => (
              <button
                key={student.id}
                type="button"
                onClick={() => {
                  onChange(student.id)
                  setSearch('')
                }}
                className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition ${value === student.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
              >
                <span>
                  <span className="block font-medium">{student.name}</span>
                  <span className="text-xs text-muted-foreground">{student.studentId}</span>
                </span>
                {value === student.id && <span className="text-xs font-semibold">Selected</span>}
              </button>
            ))
          ) : (
            <p className="px-2 py-3 text-sm text-muted-foreground">{emptyMessage}</p>
          )}
        </div>
      )}
      {showDropdown && selectedStudent && !search && (
        <p className="text-xs text-muted-foreground">
          Selected: <span className="font-medium text-foreground">{selectedStudent.name}</span> ({selectedStudent.studentId})
        </p>
      )}
    </div>
  )
}

interface SearchableStudentMultiPickerProps {
  students: StudentOption[]
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  label?: string
  emptyMessage?: string
}

export function SearchableStudentMultiPicker({
  students,
  values,
  onChange,
  placeholder = 'Search by name or student ID',
  label,
  emptyMessage = 'No students found',
}: SearchableStudentMultiPickerProps) {
  const [search, setSearch] = useState('')

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return students

    return students.filter((student) => {
      const haystack = `${student.name} ${student.studentId} ${student.email ?? ''}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [students, search])

  const toggleStudent = (studentId: string) => {
    if (values.includes(studentId)) {
      onChange(values.filter((id) => id !== studentId))
    } else {
      onChange([...values, studentId])
    }
  }

  return (
    <div className="space-y-2">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <Input
        placeholder={placeholder}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="max-h-44 space-y-1 overflow-auto rounded-md border border-border/70 bg-background p-2">
        {filteredStudents.length > 0 ? (
          filteredStudents.map((student) => {
            const isSelected = values.includes(student.id)
            return (
              <button
                key={student.id}
                type="button"
                onClick={() => toggleStudent(student.id)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition ${isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
              >
                <span>
                  <span className="block font-medium">{student.name}</span>
                  <span className="text-xs text-muted-foreground">{student.studentId}</span>
                </span>
                <span className="text-xs font-semibold">{isSelected ? 'Added' : 'Add'}</span>
              </button>
            )
          })
        ) : (
          <p className="px-2 py-3 text-sm text-muted-foreground">{emptyMessage}</p>
        )}
      </div>
    </div>
  )
}
