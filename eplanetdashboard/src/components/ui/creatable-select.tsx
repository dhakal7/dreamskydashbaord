import * as React from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface Option {
  label: string
  value: string
}

interface CreatableSelectProps {
  options: Option[]
  value?: string
  onChange: (value: string, isNew?: boolean) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function CreatableSelect({
  options,
  value = '',
  onChange,
  placeholder = 'Select or type to create...',
  className,
  disabled = false,
}: CreatableSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  const selectedOption = options.find(
    (opt) => opt.value.toLowerCase() === value.toLowerCase() || opt.label.toLowerCase() === value.toLowerCase()
  )

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  )

  const exactMatch = options.some(
    (opt) => opt.label.toLowerCase() === search.trim().toLowerCase()
  )

  const handleSelectOption = (opt: Option) => {
    onChange(opt.label, false)
    setOpen(false)
    setSearch('')
  }

  const handleCreateNew = () => {
    if (!search.trim()) return
    const newLabel = search.trim()
    onChange(newLabel, true)
    setOpen(false)
    setSearch('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal text-left h-10 px-3',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-2" align="start">
        <div className="space-y-2">
          <Input
            placeholder="Search or enter consultancy name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 text-xs"
            autoFocus
          />

          <div className="max-h-48 overflow-y-auto space-y-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected =
                  value.toLowerCase() === opt.label.toLowerCase() ||
                  value.toLowerCase() === opt.value.toLowerCase()
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelectOption(opt)}
                    className={cn(
                      'w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md hover:bg-accent hover:text-accent-foreground transition-colors text-left',
                      isSelected && 'bg-accent/60 font-semibold'
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0 ml-2" />}
                  </button>
                )
              })
            ) : (
              !search.trim() && (
                <p className="p-2 text-xs text-muted-foreground text-center">
                  No existing partner consultancies found.
                </p>
              )
            )}

            {search.trim() && !exactMatch && (
              <button
                type="button"
                onClick={handleCreateNew}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-xs rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-left font-medium mt-1 border border-primary/20"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Create "{search.trim()}"</span>
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
