import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

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
  disabled?: boolean
}

export function SearchableStudentPicker({
  students,
  value,
  onChange,
  placeholder = 'Select student...',
  label,
  emptyMessage = 'No students found',
  disabled = false,
}: SearchableStudentPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const selectedStudent = students.find((student) => student.id === value)

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return students

    return students.filter((student) => {
      const haystack = `${student.name} ${student.studentId} ${student.email ?? ''}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [students, search])

  return (
    <div className="space-y-1">
      {label && <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-10 w-full justify-between px-3 font-normal shadow-soft bg-background hover:bg-accent/40"
            disabled={disabled}
          >
            {selectedStudent ? (
              <span className="truncate">
                <span className="font-medium text-foreground">{selectedStudent.name}</span>{' '}
                <span className="text-xs text-muted-foreground">({selectedStudent.studentId})</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[300px] p-2 shadow-elevated">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 text-xs"
              autoFocus
            />
          </div>
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {filteredStudents.length > 0 ? (
              filteredStudents.map((student) => {
                const isSelected = value === student.id
                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => {
                      onChange(student.id)
                      setOpen(false)
                      setSearch('')
                    }}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition ${
                      isSelected ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-accent'
                    }`}
                  >
                    <div>
                      <div className="font-medium text-foreground">{student.name}</div>
                      <div className="text-[11px] text-muted-foreground">{student.studentId}</div>
                    </div>
                    {isSelected && <Check className="size-4 text-primary" />}
                  </button>
                )
              })
            ) : (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">{emptyMessage}</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
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
