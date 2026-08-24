import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { UserPlus, AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { counselors, createReferralAgent, referralAgents, countries as seedCountries } from '@/mock'
import { useCountriesStore } from '@/features/countries/store'
import { useLeadsStore } from '../store'
import { isMockMode } from '@/lib/api-client'
import { useCreateLiveLead, useUpdateLiveLead } from '@/hooks/use-leads-live'
import type { Lead, LeadSource, StudyLevel, Priority } from '@/types'

// ── Zod Schema ───────────────────────────────────────────────────────────────

const formSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email format').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  source: z.enum(['website', 'facebook', 'referral_agent', 'walk_in', 'education_fair', 'google_ads', 'instagram']),
  interestedCountries: z.array(z.string()).min(1, 'At least one country is required'),
  interestedLevel: z.enum(['foundation', 'diploma', 'bachelor', 'master', 'phd']),
  address: z.string().optional().or(z.literal('')),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  counselorIds: z.array(z.string()).min(1, 'At least one counselor is required'),
})

type FormData = z.infer<typeof formSchema>

const sourceLabels: Record<LeadSource, string> = {
  website: 'Website', facebook: 'Facebook', referral_agent: 'Referral Agent', walk_in: 'Walk-in',
  education_fair: 'Education Fair', google_ads: 'Google Ads', instagram: 'Instagram',
}

const levelLabels: Record<StudyLevel, string> = {
  foundation: 'Foundation', diploma: 'Diploma', bachelor: 'Bachelor', master: 'Master', phd: 'PhD',
}

const priorityLabels: Record<Priority, string> = {
  low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent',
}

const DEFAULT_TARGET_COUNTRIES = [
  { id: 'c-au', name: 'Australia', flag: '🇦🇺' },
  { id: 'c-uk', name: 'United Kingdom', flag: '🇬🇧' },
  { id: 'c-ca', name: 'Canada', flag: '🇨🇦' },
  { id: 'c-us', name: 'United States', flag: '🇺🇸' },
  { id: 'c-nz', name: 'New Zealand', flag: '🇳🇿' },
  { id: 'c-jp', name: 'Japan', flag: '🇯🇵' },
  { id: 'c-de', name: 'Germany', flag: '🇩🇪' },
  { id: 'c-ma', name: 'Malta', flag: '🇲🇹' },
]

// ── Props ─────────────────────────────────────────────────────────────────────

interface LeadFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadToEdit?: Lead | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LeadFormDialog({ open, onOpenChange, leadToEdit }: LeadFormDialogProps) {
  const storeCountries = useCountriesStore((s) => s.countries)
  const countries = (storeCountries && storeCountries.length > 0)
    ? storeCountries
    : (seedCountries && seedCountries.length > 0 ? seedCountries : DEFAULT_TARGET_COUNTRIES)
  const addLead = useLeadsStore((s) => s.addLead)
  const updateLead = useLeadsStore((s) => s.updateLead)
  const createLiveLead = useCreateLiveLead()
  const updateLiveLead = useUpdateLiveLead()
  const [agentQuery, setAgentQuery] = useState('')

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      source: 'website',
      interestedCountries: [],
      interestedLevel: 'bachelor',
      address: '',
      priority: 'medium',
      counselorIds: [],
    },
  })

  useEffect(() => {
    if (open && leadToEdit) {
      const existingCountries = leadToEdit.interestedCountries && leadToEdit.interestedCountries.length > 0
        ? leadToEdit.interestedCountries
        : (leadToEdit.interestedCountry ? leadToEdit.interestedCountry.split(',').map((c) => c.trim()) : [])
      reset({
        name: leadToEdit.name,
        email: leadToEdit.email,
        phone: leadToEdit.phone,
        source: leadToEdit.source || 'website',
        interestedCountries: existingCountries,
        interestedLevel: leadToEdit.interestedLevel || 'bachelor',
        address: leadToEdit.address || '',
        priority: leadToEdit.priority || 'medium',
        counselorIds: leadToEdit.counselorId ? [leadToEdit.counselorId] : [],
      })
      if (leadToEdit.referralAgentName) setAgentQuery(leadToEdit.referralAgentName)
    } else if (open) {
      reset({
        name: '',
        email: '',
        phone: '',
        source: 'website',
        interestedCountries: [],
        interestedLevel: 'bachelor',
        address: '',
        priority: 'medium',
        counselorIds: [],
      })
      setAgentQuery('')
    }
  }, [open, leadToEdit, reset])

  const selectedSource = watch('source')
  const rawWatchedCountries = watch('interestedCountries')
  const selectedCountries = useMemo(() => {
    if (Array.isArray(rawWatchedCountries)) return rawWatchedCountries
    if (typeof rawWatchedCountries === 'string' && rawWatchedCountries) {
      return (rawWatchedCountries as string).split(',').map((s) => s.trim())
    }
    return []
  }, [rawWatchedCountries])
  const showAgentField = selectedSource === 'referral_agent'

  const suggestedAgents = useMemo(() => {
    const query = agentQuery.trim().toLowerCase()
    if (!query) return referralAgents.slice(0, 6)
    return referralAgents.filter((agent) => agent.name.toLowerCase().includes(query) || agent.email.toLowerCase().includes(query)).slice(0, 6)
  }, [agentQuery])

  function onSubmit(data: FormData) {
    const targetCountries = Array.isArray(data.interestedCountries)
      ? data.interestedCountries
      : (typeof data.interestedCountries === 'string' && data.interestedCountries
          ? (data.interestedCountries as string).split(',').map((s) => s.trim())
          : [])
    const selectedCounselors = counselors.filter((c) => (data.counselorIds || []).includes(c.id))
    const primaryCounselor = selectedCounselors[0]
    const resolvedAgent = showAgentField ? createReferralAgent(agentQuery) : null

    const primaryCountry = targetCountries.join(', ')

    const assignments = selectedCounselors.map((counselor) => ({
      country: primaryCountry,
      counselorId: counselor.id,
      counselorName: counselor.name,
    }))

    if (leadToEdit) {
      if (!isMockMode()) {
        const nameParts = data.name.trim().split(/\s+/)
        updateLiveLead.mutate(
          {
            id: leadToEdit.id,
            data: {
              firstName: nameParts[0] || 'Unknown',
              lastName: nameParts.slice(1).join(' ') || '',
              email: data.email || '',
              phone: data.phone || '',
              source: data.source,
              assignedCounselorId: primaryCounselor?.id,
              notes: `Interested Countries: ${data.interestedCountries.join(', ')} | Address: ${data.address || 'N/A'}`,
            },
          },
          {
            onSuccess: () => {
              setAgentQuery('')
              onOpenChange(false)
              reset()
            },
          }
        )
      } else {
        updateLead(leadToEdit.id, {
          name: data.name,
          email: data.email,
          phone: data.phone,
          source: data.source,
          interestedCountry: primaryCountry,
          interestedCountries: data.interestedCountries,
          interestedLevel: data.interestedLevel,
          address: data.address,
          priority: data.priority,
          counselorId: primaryCounselor?.id ?? leadToEdit.counselorId,
          counselorName: primaryCounselor?.name ?? leadToEdit.counselorName,
          referralAgentId: resolvedAgent?.id ?? leadToEdit.referralAgentId,
          referralAgentName: resolvedAgent?.name ?? agentQuery.trim() ?? leadToEdit.referralAgentName,
        })
        setAgentQuery('')
        onOpenChange(false)
        reset()
      }
    } else if (!isMockMode()) {
      // Live mode: create a student record with stage=LEAD in the backend
      const nameParts = data.name.trim().split(/\s+/)
      createLiveLead.mutate(
        {
          firstName: nameParts[0] || 'Unknown',
          lastName: nameParts.slice(1).join(' ') || '',
          email: data.email || '',
          phone: data.phone || '',
          source: data.source,
          assignedCounselorId: primaryCounselor?.id,
          notes: `Interested Countries: ${data.interestedCountries.join(', ')} | Address: ${data.address || 'N/A'}`,
        },
        {
          onSuccess: () => {
            setAgentQuery('')
            onOpenChange(false)
            reset()
          },
        }
      )
    } else {
      // Mock mode: add to local Zustand store only
      addLead({
        name: data.name,
        email: data.email || '',
        phone: data.phone || '',
        photoColor: '#2563EB',
        source: data.source,
        stage: 'new',
        counselorId: primaryCounselor?.id ?? '',
        counselorName: primaryCounselor?.name ?? 'Unassigned',
        selectedCountry: primaryCountry,
        selectedCounselorId: primaryCounselor?.id ?? '',
        selectedCounselorName: primaryCounselor?.name ?? 'Unassigned',
        countryCounselorAssignments: assignments,
        interestedCountry: primaryCountry,
        interestedCountries: data.interestedCountries,
        interestedLevel: data.interestedLevel,
        address: data.address,
        priority: data.priority,
        referralAgentId: resolvedAgent?.id,
        referralAgentName: resolvedAgent?.name ?? (agentQuery.trim() || undefined),
        notes: '',
      })
      setAgentQuery('')
      onOpenChange(false)
      reset()
    }
  }

  function handleClose() {
    setAgentQuery('')
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <UserPlus className="size-3.5" />
            {leadToEdit ? 'Edit Lead' : 'New Lead'}
          </div>
          <DialogTitle className="mt-1 text-lg font-bold">
            {leadToEdit ? `Edit Lead Details: ${leadToEdit.name}` : 'Capture a New Lead'}
          </DialogTitle>
          <DialogDescription>
            {leadToEdit ? 'Update contact info, email, phone, and target countries.' : "Enter the prospect's details and select interested countries."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="overflow-y-auto max-h-[60vh]">
          <div className="space-y-4 px-6 py-5">
            {/* Name + Email */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Full Name</label>
                <Input
                  placeholder="e.g. Anisha Khadka"
                  className={`h-9 text-sm ${errors.name ? 'border-danger-500' : ''}`}
                  {...register('name')}
                />
                {errors.name && (
                  <p className="text-[11px] text-danger-600 flex items-center gap-1">
                    <AlertTriangle className="size-3" />{errors.name.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Email</label>
                <Input
                  type="email"
                  placeholder="lead@email.com"
                  className={`h-9 text-sm ${errors.email ? 'border-danger-500' : ''}`}
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-[11px] text-danger-600 flex items-center gap-1">
                    <AlertTriangle className="size-3" />{errors.email.message}
                  </p>
                )}
              </div>
            </div>

            {/* Phone + Source */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Phone</label>
                <Input
                  placeholder="98XXXXXXXX"
                  className={`h-9 text-sm ${errors.phone ? 'border-danger-500' : ''}`}
                  {...register('phone')}
                />
                {errors.phone && (
                  <p className="text-[11px] text-danger-600 flex items-center gap-1">
                    <AlertTriangle className="size-3" />{errors.phone.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Source</label>
                <Controller
                  name="source"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(value) => {
                      field.onChange(value)
                      if (value !== 'referral_agent') {
                        setAgentQuery('')
                      }
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(sourceLabels) as LeadSource[]).map((s) => (
                          <SelectItem key={s} value={s}>{sourceLabels[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            {showAgentField && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Referral Agent</label>
                <Input
                  placeholder="Start typing an agent name"
                  value={agentQuery}
                  onChange={(event) => setAgentQuery(event.target.value)}
                  className="h-9 text-sm"
                />
                {agentQuery.trim().length > 0 && suggestedAgents.length > 0 && (
                  <div className="rounded-md border border-border/70 bg-muted/40 p-2 text-sm">
                    {suggestedAgents.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-background"
                        onClick={() => setAgentQuery(agent.name)}
                      >
                        <span className="font-medium">{agent.name}</span>
                        <span className="text-xs text-muted-foreground">{agent.referralCode}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Select an existing agent or type a new name to create one automatically.
                </p>
              </div>
            )}

            {/* Address */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Address</label>
              <Input
                placeholder="e.g. Baneshwor, Kathmandu"
                className={`h-9 text-sm ${errors.address ? 'border-danger-500' : ''}`}
                {...register('address')}
              />
              {errors.address && (
                <p className="text-[11px] text-danger-600 flex items-center gap-1">
                  <AlertTriangle className="size-3" />{errors.address.message}
                </p>
              )}
            </div>

            {/* Interested Countries (Multi-select) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">
                  Interested Countries <span className="text-muted-foreground font-normal">(Select multiple)</span>
                </label>
                {selectedCountries.length > 0 && (
                  <span className="text-[11px] text-primary font-medium">
                    {selectedCountries.length} selected
                  </span>
                )}
              </div>

              <Controller
                name="interestedCountries"
                control={control}
                render={({ field }) => {
                  const currentValues = Array.isArray(field.value)
                    ? field.value
                    : (typeof field.value === 'string' && field.value ? (field.value as string).split(',').map((s) => s.trim()) : [])

                  return (
                    <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-muted/20 p-2.5 sm:grid-cols-3">
                      {countries.map((c) => {
                        const isChecked = currentValues.includes(c.name)
                        const toggleCountry = (e: React.MouseEvent) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const next = isChecked
                            ? currentValues.filter((name: string) => name !== c.name)
                            : [...currentValues, c.name]
                          field.onChange(next)
                        }
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={toggleCountry}
                            className={`flex items-center gap-2 rounded-md border p-2 text-xs font-medium cursor-pointer transition-colors select-none text-left ${
                              isChecked
                                ? 'border-primary bg-primary/10 text-primary font-semibold'
                                : 'border-border/60 bg-background hover:bg-muted/50'
                            }`}
                          >
                            <Checkbox
                              checked={isChecked}
                              className="pointer-events-none"
                            />
                            <span className="truncate">{c.flag || '🌐'} {c.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  )
                }}
              />
              {errors.interestedCountries && (
                <p className="text-[11px] text-danger-600 flex items-center gap-1">
                  <AlertTriangle className="size-3" />{errors.interestedCountries.message}
                </p>
              )}
            </div>

            {/* Interested Level + Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Interested Level</label>
                <Controller
                  name="interestedLevel"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(levelLabels) as StudyLevel[]).map((l) => (
                          <SelectItem key={l} value={l}>{levelLabels[l]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Priority</label>
                <Controller
                  name="priority"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(priorityLabels) as Priority[]).map((p) => (
                          <SelectItem key={p} value={p}>{priorityLabels[p]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            {/* Counselor Assignment */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Assign Counselors</label>
              <Controller
                name="counselorIds"
                control={control}
                render={({ field }) => {
                  const currentCounselors = Array.isArray(field.value) ? field.value : []
                  return (
                    <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                      <p className="mb-2 text-[11px] text-muted-foreground">
                        Select one or more counselors for {selectedCountries.length > 0 ? selectedCountries.join(', ') : 'the selected countries'}.
                      </p>
                      <div className="space-y-2">
                        {counselors.map((c) => {
                          const checked = currentCounselors.includes(c.id)
                          const toggleCounselor = (e: React.MouseEvent) => {
                            e.preventDefault()
                            e.stopPropagation()
                            const next = checked
                              ? currentCounselors.filter((id: string) => id !== c.id)
                              : [...currentCounselors, c.id]
                            field.onChange(next)
                          }
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={toggleCounselor}
                              className="flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-2 py-1.5 hover:border-border/70 hover:bg-background/80 text-left cursor-pointer"
                            >
                              <span className="text-sm font-medium">{c.name}</span>
                              <Checkbox
                                checked={checked}
                                className="pointer-events-none"
                              />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                }}
              />
              {errors.counselorIds && (
                <p className="text-[11px] text-danger-600 flex items-center gap-1">
                  <AlertTriangle className="size-3" />{errors.counselorIds.message}
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="border-t border-border/60 bg-muted/30 px-6 py-4">
            <Button type="button" variant="outline" size="sm" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              <UserPlus className="size-3.5 mr-1" />
              Add Lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

