import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

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
  placeholder = 'Select university...',
  label,
  emptyMessage = 'No universities found',
  disabled = false,
  isLoading = false,
}: SearchableUniversityPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const selectedUni = universities.find((u) => u.id === value)

  const filteredUniversities = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return universities

    return universities.filter((u) => {
      const haystack = `${u.name} ${u.countryName || ''} ${u.city || ''}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [universities, search])

  const handleSelect = (uniId: string) => {
    onChange(uniId)
    setOpen(false)
    setSearch('')
  }

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
            disabled={disabled || isLoading}
          >
            {selectedUni ? (
              <span className="truncate">
                <span className="font-medium text-foreground">{selectedUni.name}</span>
                {selectedUni.countryName && (
                  <span className="ml-1 text-xs text-muted-foreground">({selectedUni.countryName})</span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {isLoading ? 'Loading universities...' : placeholder}
              </span>
            )}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[--radix-popover-trigger-width] min-w-[320px] max-w-[460px] p-2 shadow-elevated">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search university by name or country..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 text-xs"
              autoFocus
            />
          </div>
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {filteredUniversities.length > 0 ? (
              filteredUniversities.map((uni) => {
                const isSelected = value === uni.id
                return (
                  <button
                    key={uni.id}
                    type="button"
                    onClick={() => handleSelect(uni.id)}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs transition ${
                      isSelected ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-accent'
                    }`}
                  >
                    <div className="truncate mr-2">
                      <div className="font-medium text-foreground truncate">{uni.name}</div>
                      {uni.countryName && (
                        <div className="text-[11px] text-muted-foreground truncate">{uni.countryName}</div>
                      )}
                    </div>
                    {isSelected && <Check className="size-4 text-primary shrink-0" />}
                  </button>
                )
              })
            ) : (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {isLoading ? 'Loading universities...' : emptyMessage}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
