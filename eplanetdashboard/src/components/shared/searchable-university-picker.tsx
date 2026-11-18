import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export interface UniversityOption {
  id: string
  name: string
  countryName?: string
  city?: string
}

interface SearchableUniversityPickerProps {
  universities: UniversityOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  emptyMessage?: string
  disabled?: boolean
  isLoading?: boolean
}

export function SearchableUniversityPicker({
  universities,
  value,
  onChange,
  placeholder = 'Search university by name, country, or city...',
  label,
  emptyMessage = 'No universities found',
  disabled = false,
  isLoading = false,
}: SearchableUniversityPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedUni = universities.find((u) => u.id === value)

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

  const filteredUniversities = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return universities.slice(0, 50)

    return universities.filter((u) => {
      const haystack = `${u.name} ${u.countryName || ''} ${u.city || ''}`.toLowerCase()
      return haystack.includes(query)
    }).slice(0, 50)
  }, [universities, search])

  const handleSelect = (uniId: string) => {
    onChange(uniId)
    setIsOpen(false)
    setSearch('')
  }

  const handleClear = () => {
    onChange('')
    setSearch('')
    setIsOpen(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div className="space-y-1" ref={containerRef}>
      {label && <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>}

      {selectedUni ? (
        /* Selected State: Clean pill with University name and Clear button */
        <div className="flex h-10 w-full items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm shadow-soft transition-all">
          <div className="flex items-center gap-2 truncate">
            <Check className="size-4 shrink-0 text-primary" />
            <span className="font-semibold text-foreground truncate">{selectedUni.name}</span>
            {selectedUni.countryName && (
              <span className="text-xs text-muted-foreground truncate">({selectedUni.countryName})</span>
            )}
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground hover:bg-background/80 rounded-full shrink-0"
              onClick={handleClear}
              title="Change university"
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
            placeholder={isLoading ? 'Loading universities...' : placeholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            disabled={disabled || isLoading}
            className="h-10 pl-9 pr-8 text-sm bg-background shadow-soft"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
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
              {isLoading ? (
                <p className="px-3 py-3 text-center text-xs text-muted-foreground">Loading universities...</p>
              ) : filteredUniversities.length > 0 ? (
                filteredUniversities.map((uni) => {
                  const isSelected = value === uni.id
                  return (
                    <button
                      key={uni.id}
                      type="button"
                      onClick={() => handleSelect(uni.id)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition ${
                        isSelected ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      <div className="truncate mr-2">
                        <div className="font-semibold text-foreground text-sm truncate">{uni.name}</div>
                        {uni.countryName && (
                          <div className="text-xs text-muted-foreground truncate">{uni.countryName}{uni.city ? ` • ${uni.city}` : ''}</div>
                        )}
                      </div>
                      <span className="text-[11px] font-medium text-primary shrink-0">Select</span>
                    </button>
                  )
                })
              ) : (
                <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                  {search ? `No university matching "${search}" found` : emptyMessage}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
