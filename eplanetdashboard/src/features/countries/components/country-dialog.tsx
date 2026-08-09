import { useState, useEffect } from 'react'
import { Plus, AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCountriesStore } from '../store'
import type { Country } from '@/types'

interface CountryDialogProps {
  country: Country | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CountryDialog({ country, open, onOpenChange }: CountryDialogProps) {
  const addCountry = useCountriesStore((s) => s.addCountry)
  const updateCountry = useCountriesStore((s) => s.updateCountry)

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [flag, setFlag] = useState('')
  const [visaDifficulty, setVisaDifficulty] = useState<Country['visaDifficulty']>('easy')
  const [avgTuitionUsd, setAvgTuitionUsd] = useState('')
  const [error, setError] = useState('')

  const isEditing = country !== null

  useEffect(() => {
    if (open) {
      if (country) {
        setName(country.name)
        setCode(country.code)
        setFlag(country.flag)
        setVisaDifficulty(country.visaDifficulty)
        setAvgTuitionUsd(String(country.avgTuitionUsd))
      } else {
        setName('')
        setCode('')
        setFlag('')
        setVisaDifficulty('easy')
        setAvgTuitionUsd('')
      }
      setError('')
    }
  }, [open, country])

  function handleSubmit() {
    if (!name.trim() || !code.trim() || !flag.trim()) {
      setError('Name, code, and flag are required')
      return
    }
    const tuition = parseInt(avgTuitionUsd, 10)
    if (isNaN(tuition) || tuition < 0) {
      setError('Average tuition must be a valid positive number')
      return
    }

    if (isEditing && country) {
      updateCountry(country.id, {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        flag: flag.trim(),
        visaDifficulty,
        avgTuitionUsd: tuition,
      })
    } else {
      addCountry({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        flag: flag.trim(),
        visaDifficulty,
        avgTuitionUsd: tuition,
        universityCount: 0,
        studentCount: 0,
        popularCourses: [],
      })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Country' : 'Add Country'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Australia" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Code</label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. AU" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Flag (emoji)</label>
              <Input value={flag} onChange={(e) => setFlag(e.target.value)} placeholder="e.g. 🇦🇺" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Visa Difficulty</label>
            <Select value={visaDifficulty} onValueChange={(v) => setVisaDifficulty(v as Country['visaDifficulty'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="strict">Strict</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Avg Tuition (USD/yr)</label>
            <Input type="number" min={0} value={avgTuitionUsd} onChange={(e) => setAvgTuitionUsd(e.target.value)} placeholder="e.g. 24000" />
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-xs text-danger-600">
              <AlertTriangle className="size-3" /> {error}
            </p>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit}>
            <Plus className="size-3.5 mr-1" />
            {isEditing ? 'Save Changes' : 'Add Country'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
