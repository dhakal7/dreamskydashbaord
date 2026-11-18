import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface StudentOption {
  id: string
  name: string
  studentId?: string
  email?: string
  phone?: string
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
  /** When provided, the picker delegates search to the parent (server-side). */
  onSearchChange?: (query: string) => void
  /** Show a loading indicator while server-side search is in progress. */
  searching?: boolean
  /** Show an error message inside the dropdown when loading fails. */
  error?: string | null
}

export function SearchableStudentPicker({
  students,
  value,
  onChange,
  placeholder = 'Search student by name, email, or phone...',
  label,
  emptyMessage = 'No students found',
  disabled = false,
  onSearchChange,
  searching = false,
  error = null,
}: SearchableStudentPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [cachedSelected, setCachedSelected] = useState<StudentOption | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const matchedInList = students.find((student) => student.id === value)
  const selectedStudent = matchedInList ?? (cachedSelected?.id === value ? cachedSelected : undefined)

  // Cache selected student when found in list
  useEffect(() => {
    if (matchedInList) {
      setCachedSelected(matchedInList)
    }
  }, [matchedInList])

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return students.slice(0, 50)

    return students.filter((student) => {
      const haystack = `${student.name} ${student.studentId || ''} ${student.email || ''} ${student.phone || ''}`.toLowerCase()
      return haystack.includes(query)
    }).slice(0, 50)
  }, [students, search])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setSearch(val)
    setIsOpen(true)
    if (onSearchChange) onSearchChange(val)
  }

  const handleSelect = (student: StudentOption) => {
    setCachedSelected(student)
    onChange(student.id)
    setIsOpen(false)
    setSearch('')
    if (onSearchChange) onSearchChange('')
  }

  const handleClear = () => {
    onChange('')
    setSearch('')
    setCachedSelected(null)
    setIsOpen(false)
    if (onSearchChange) onSearchChange('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div className="space-y-1" ref={containerRef}>
      {label && <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>}

      {selectedStudent ? (
        /* Selected State: Clean pill with Student info and Clear button */
        <div className="flex h-10 w-full items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm shadow-soft transition-all">
          <div className="flex items-center gap-2 truncate">
            <Check className="size-4 shrink-0 text-primary" />
            <span className="font-semibold text-foreground truncate">{selectedStudent.name}</span>
            <span className="text-xs text-muted-foreground truncate">
              ({[selectedStudent.studentId, selectedStudent.email, selectedStudent.phone].filter(Boolean)[0] || selectedStudent.id})
            </span>
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground hover:bg-background/80 rounded-full shrink-0"
              onClick={handleClear}
              title="Change student"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      ) : (
        /* Unselected State: Direct search box with live suggestions */
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={search}
            onChange={handleInputChange}
            onFocus={() => setIsOpen(true)}
            disabled={disabled}
            className="h-10 pl-9 pr-8 text-sm bg-background shadow-soft"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                if (onSearchChange) onSearchChange('')
                inputRef.current?.focus()
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}

          {/* Autocomplete Suggestions Dropdown */}
          {isOpen && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-50 max-h-56 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-elevated">
              {error ? (
                <p className="px-3 py-3 text-center text-xs text-destructive">{error}</p>
              ) : searching ? (
                <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  <span>Searching students...</span>
                </div>
              ) : filteredStudents.length > 0 ? (
                filteredStudents.map((student) => {
                  const isSelected = value === student.id
                  return (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => handleSelect(student)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition ${
                        isSelected ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-foreground text-sm">{student.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[student.studentId, student.email, student.phone].filter(Boolean).join(' • ')}
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-primary shrink-0 ml-2">Select</span>
                    </button>
                  )
                })
              ) : (
                <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                  {search ? `No student matching "${search}" found` : emptyMessage}
                </p>
              )}
            </div>
          )}
        </div>
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
