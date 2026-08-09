import { useState, useEffect } from 'react'
import { Plus, AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCountriesStore } from '@/features/countries/store'
import { useUniversitiesStore } from '../store'
import type { University } from '@/types'

interface UniversityDialogProps {
  university: University | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UniversityDialog({ university, open, onOpenChange }: UniversityDialogProps) {
  const countries = useCountriesStore((s) => s.countries)
  const addUniversity = useUniversitiesStore((s) => s.addUniversity)
  const updateUniversity = useUniversitiesStore((s) => s.updateUniversity)

  const [name, setName] = useState('')
  const [countryId, setCountryId] = useState('')
  const [city, setCity] = useState('')
  const [ranking, setRanking] = useState('')
  const [scholarshipAvailable, setScholarshipAvailable] = useState(false)
  const [scholarshipDetail, setScholarshipDetail] = useState('')
  const [applicationDeadline, setApplicationDeadline] = useState('')
  const [acceptanceRate, setAcceptanceRate] = useState('')
  const [tuitionFromUsd, setTuitionFromUsd] = useState('')
  const [intakes, setIntakes] = useState('')
  const [error, setError] = useState('')

  const isEditing = university !== null

  useEffect(() => {
    if (open) {
      if (university) {
        setName(university.name)
        setCountryId(university.countryId)
        setCity(university.city)
        setRanking(String(university.ranking))
        setScholarshipAvailable(university.scholarshipAvailable)
        setScholarshipDetail(university.scholarshipDetail || '')
        setApplicationDeadline(university.applicationDeadline)
        setAcceptanceRate(String(university.acceptanceRate))
        setTuitionFromUsd(String(university.tuitionFromUsd))
        setIntakes(university.intakes.join(', '))
      } else {
        setName('')
        setCountryId(countries[0]?.id || '')
        setCity('')
        setRanking('')
        setScholarshipAvailable(false)
        setScholarshipDetail('')
        setApplicationDeadline('')
        setAcceptanceRate('')
        setTuitionFromUsd('')
        setIntakes('')
      }
      setError('')
    }
  }, [open, university, countries])

  function handleSubmit() {
    if (!name.trim() || !city.trim()) {
      setError('Name and city are required')
      return
    }
    const rank = parseInt(ranking, 10)
    if (isNaN(rank) || rank < 1) {
      setError('Ranking must be a valid positive number')
      return
    }
    const acceptance = parseInt(acceptanceRate, 10)
    if (isNaN(acceptance) || acceptance < 0 || acceptance > 100) {
      setError('Acceptance rate must be between 0 and 100')
      return
    }
    const tuition = parseInt(tuitionFromUsd, 10)
    if (isNaN(tuition) || tuition < 0) {
      setError('Tuition must be a valid positive number')
      return
    }

    const intakesArr = intakes.split(',').map((s) => s.trim()).filter(Boolean)

    if (isEditing && university) {
      updateUniversity(university.id, {
        name: name.trim(),
        countryId,
        city: city.trim(),
        ranking: rank,
        scholarshipAvailable,
        scholarshipDetail: scholarshipAvailable ? scholarshipDetail.trim() || undefined : undefined,
        applicationDeadline,
        acceptanceRate: acceptance,
        tuitionFromUsd: tuition,
        intakes: intakesArr,
      })
    } else {
      addUniversity({
        name: name.trim(),
        countryId,
        city: city.trim(),
        ranking: rank,
        scholarshipAvailable,
        scholarshipDetail: scholarshipAvailable ? scholarshipDetail.trim() || undefined : undefined,
        applicationDeadline,
        acceptanceRate: acceptance,
        tuitionFromUsd: tuition,
        intakes: intakesArr,
        courseCount: 0,
      })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit University' : 'Add University'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. University of Melbourne" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Country</label>
              <Select value={countryId} onValueChange={setCountryId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.flag} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">City</label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Melbourne" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Ranking</label>
              <Input type="number" min={1} value={ranking} onChange={(e) => setRanking(e.target.value)} placeholder="e.g. 14" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Acceptance Rate (%)</label>
              <Input type="number" min={0} max={100} value={acceptanceRate} onChange={(e) => setAcceptanceRate(e.target.value)} placeholder="e.g. 65" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Tuition From (USD/yr)</label>
            <Input type="number" min={0} value={tuitionFromUsd} onChange={(e) => setTuitionFromUsd(e.target.value)} placeholder="e.g. 24000" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Application Deadline</label>
            <Input type="date" value={applicationDeadline} onChange={(e) => setApplicationDeadline(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Intakes (comma separated)</label>
            <Input value={intakes} onChange={(e) => setIntakes(e.target.value)} placeholder="e.g. Feb, Jul" />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={scholarshipAvailable} onCheckedChange={setScholarshipAvailable} />
              <span className="text-xs font-semibold text-foreground">Scholarship Available</span>
            </div>
          </div>

          {scholarshipAvailable && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Scholarship Detail</label>
              <Input value={scholarshipDetail} onChange={(e) => setScholarshipDetail(e.target.value)} placeholder="e.g. Up to 50% merit scholarship" />
            </div>
          )}

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
            {isEditing ? 'Save Changes' : 'Add University'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
