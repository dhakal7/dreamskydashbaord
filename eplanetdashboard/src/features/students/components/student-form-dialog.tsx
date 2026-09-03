import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Check, ChevronLeft, ChevronRight, Plus, Trash2, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { countries } from '@/mock'
import { isMockMode } from '@/lib/api-client'
import { useStudentsStore } from '../store'
import { useCreateStudent } from '@/hooks/use-students'

// ── Zod schema ──────────────────────────────────────────────────────────────

const academicSchema = z.object({
  level: z.string().optional().or(z.literal('')),
  institution: z.string().optional().or(z.literal('')),
  board: z.string().optional().or(z.literal('')),
  gpaOrPercentage: z.string().optional().or(z.literal('')),
  passedYear: z.string().optional().or(z.literal('')),
})

const parentSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional().or(z.literal('')),
  relation: z.enum(['father', 'mother', 'guardian']).optional(),
  phone: z.string().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  occupation: z.string().optional().or(z.literal('')),
})

const formSchema = z.object({
  // Step 1: Personal Info
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Valid email is required').optional().or(z.literal('')),
  phone: z.string().min(10, 'Phone must be at least 10 digits'),
  dob: z.string().optional().or(z.literal('')),
  gender: z.enum(['male', 'female', 'other']).optional(),
  nationality: z.string().optional().or(z.literal('')),
  passportNumber: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  // Step 2: Academic Background
  academics: z.array(academicSchema).optional(),
  // Step 3: English Test
  englishTestType: z.enum(['IELTS', 'PTE', 'TOEFL', 'Duolingo', 'None']).optional(),
  overallScore: z.coerce.number().min(0).max(120).optional(),
  listening: z.coerce.number().min(0).max(120).optional(),
  reading: z.coerce.number().min(0).max(120).optional(),
  writing: z.coerce.number().min(0).max(120).optional(),
  speaking: z.coerce.number().min(0).max(120).optional(),
  testDate: z.string().optional(),
  // Step 4: Study Preferences
  preferredCountries: z.array(z.string()).optional(),
  preferredLevel: z.enum(['foundation', 'diploma', 'bachelor', 'master', 'phd']).optional(),
  budgetUsd: z.coerce.number().optional(),
  // Step 5: Parents
  parents: z.array(parentSchema).optional(),
})

type FormData = z.infer<typeof formSchema>

const steps = [
  { title: 'Personal Info', description: 'Basic personal details' },
  { title: 'Academics', description: 'Academic background' },
  { title: 'English Test', description: 'Test scores' },
  { title: 'Preferences', description: 'Study preferences' },
  { title: 'Parents', description: 'Guardians info' },
]

// Fields to validate per step — only name and phone are compulsory
const stepFields: (keyof FormData)[][] = [
  ['name', 'phone'],
  [],
  [],
  [],
  [],
]

interface StudentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StudentFormDialog({ open, onOpenChange }: StudentFormDialogProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const navigate = useNavigate()

  const { addStudent } = useStudentsStore()
  const createStudent = useCreateStudent()

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      name: '', email: '', phone: '', dob: '', gender: 'male', nationality: 'Nepali',
      passportNumber: '', address: '',
      academics: [],
      englishTestType: 'None', overallScore: undefined, listening: undefined,
      reading: undefined, writing: undefined, speaking: undefined, testDate: '',
      preferredCountries: [], preferredLevel: 'bachelor', budgetUsd: 15000,
      parents: [],
    },
    mode: 'onTouched',
  })

  const { fields: academicFields, append: addAcademic, remove: removeAcademic } = useFieldArray({
    control: form.control, name: 'academics',
  })

  const { fields: parentFields, append: addParent, remove: removeParent } = useFieldArray({
    control: form.control, name: 'parents',
  })

  const { formState: { errors } } = form

  async function handleNext() {
    const fields = stepFields[currentStep]
    const valid = await form.trigger(fields as any)
    if (valid) setCurrentStep((s) => Math.min(s + 1, steps.length - 1))
  }

  function handleBack() {
    setCurrentStep((s) => Math.max(s - 1, 0))
  }

  async function onSubmit(data: FormData) {
    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]
    const validAcademics = (data.academics || []).filter((a) => a.level || a.institution)
    const validParents = (data.parents || []).filter((p) => p.name || p.phone)

    if (isMockMode()) {
      // ── Mock path: write directly to Zustand store ──
      const newStudent = addStudent({
        name: data.name,
        email: data.email || '',
        phone: data.phone,
        photoColor: pick(['#2563EB', '#7C3AED', '#0EA5E9', '#16A34A', '#D97706', '#DB2777']),
        dob: data.dob || '2000-01-01',
        gender: data.gender || 'other',
        nationality: data.nationality || 'Nepali',
        passportNumber: data.passportNumber || 'PENDING',
        address: data.address || 'N/A',
        // Always SELF on creation — can be changed from the student profile
        processingType: 'self',
        status: 'active',
        counselorId: 'cnslr-1',
        counselorName: 'Sristi Baral',
        preferredCountries: data.preferredCountries || [],
        preferredLevel: data.preferredLevel || 'bachelor',
        budgetUsd: data.budgetUsd || 0,
        englishTest: {
          type: data.englishTestType || 'None',
          overallScore: data.overallScore,
          listening: data.listening,
          reading: data.reading,
          writing: data.writing,
          speaking: data.speaking,
          testDate: data.testDate,
        },
        academics: validAcademics as any,
        parents: validParents as any,
        tags: [],
      })
      onOpenChange(false)
      setCurrentStep(0)
      form.reset()
      navigate(`/students/${newStudent.id}`)
      return
    }

    // ── Live path: call backend API ──
    const nameParts = data.name.trim().split(' ')
    const firstName = nameParts[0]
    const lastName = nameParts.slice(1).join(' ') || firstName || 'Student'
    const countriesStr = (data.preferredCountries || []).join(', ')
    const notesPayload = `Interested Countries: ${countriesStr || 'N/A'} | Level: ${data.preferredLevel || 'N/A'} | Address: ${data.address || 'N/A'}`

    await createStudent.mutateAsync({
      firstName,
      lastName,
      email: data.email?.trim() || undefined,
      phone: data.phone?.trim() || undefined,
      nationality: data.nationality || undefined,
      // Always SELF on creation — counselor sets B2B from the student profile later
      processingType: 'SELF',
      academicBackground: {
        records: validAcademics,
        preferredLevel: data.preferredLevel,
        preferredCountries: data.preferredCountries,
        budgetUsd: data.budgetUsd,
      },
      notes: notesPayload,
    })

    onOpenChange(false)
    setCurrentStep(0)
    form.reset()
    navigate('/students')
  }

  const watchTestType = form.watch('englishTestType')
  const watchCountries = form.watch('preferredCountries')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Student</DialogTitle>
          <DialogDescription>Fill in all the required information to register a new student.</DialogDescription>
        </DialogHeader>

        {/* Step Progress Indicator */}
        <div className="flex items-center gap-1 px-1">
          {steps.map((step, i) => (
            <div key={step.title} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                onClick={() => i < currentStep && setCurrentStep(i)}
                className={cn(
                  'flex items-center gap-1.5 shrink-0',
                  i <= currentStep ? 'cursor-pointer' : 'cursor-default',
                )}
              >
                <span
                  className={cn(
                    'flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                    i < currentStep && 'bg-success-500 text-white',
                    i === currentStep && 'bg-primary text-primary-foreground',
                    i > currentStep && 'bg-secondary text-muted-foreground',
                  )}
                >
                  {i < currentStep ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className={cn(
                  'hidden sm:block text-xs font-medium',
                  i === currentStep ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  {step.title}
                </span>
              </button>
              {i < steps.length - 1 && (
                <div className={cn(
                  'mx-2 h-px flex-1',
                  i < currentStep ? 'bg-success-500' : 'bg-border',
                )} />
              )}
            </div>
          ))}
        </div>

        <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-4 mt-2">

          {/* ── Step 1: Personal Info ── */}
          {currentStep === 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><User className="size-4" /> Personal Information</h3>
              <p className="text-xs text-muted-foreground">Only Name and Phone are required for quick admission. Other fields can be filled later.</p>
              <div className="grid grid-cols-2 gap-3">
                <FieldWrap label="Full Name *" error={errors.name?.message}>
                  <Input {...form.register('name')} placeholder="e.g. Aarav Shrestha" />
                </FieldWrap>
                <FieldWrap label="Phone *" error={errors.phone?.message}>
                  <Input {...form.register('phone')} placeholder="98XXXXXXXX" />
                </FieldWrap>
                <FieldWrap label="Email (optional)" error={errors.email?.message}>
                  <Input {...form.register('email')} type="email" placeholder="student@email.com" />
                </FieldWrap>
                <FieldWrap label="Date of Birth (optional)" error={errors.dob?.message}>
                  <Input {...form.register('dob')} type="date" />
                </FieldWrap>
                <FieldWrap label="Gender (optional)" error={errors.gender?.message}>
                  <Controller control={form.control} name="gender" render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </FieldWrap>
                <FieldWrap label="Nationality (optional)" error={errors.nationality?.message}>
                  <Input {...form.register('nationality')} placeholder="Nepali" />
                </FieldWrap>
                <FieldWrap label="Passport Number (optional)" error={errors.passportNumber?.message}>
                  <Input {...form.register('passportNumber')} placeholder="PA1234567" />
                </FieldWrap>
                <FieldWrap label="Address (optional)" error={errors.address?.message}>
                  <Input {...form.register('address')} placeholder="Baneshwor, Kathmandu" />
                </FieldWrap>
              </div>
            </div>
          )}

          {/* ── Step 2: Academic Background ── */}
          {currentStep === 1 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Academic Background (optional)</h3>
                  <p className="text-xs text-muted-foreground">Add prior education records if available, or skip to the next step.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => addAcademic({ level: '', institution: '', board: '', gpaOrPercentage: '', passedYear: '' })}>
                  <Plus /> Add Record
                </Button>
              </div>
              {errors.academics?.root && <p className="text-xs text-danger-500">{errors.academics.root.message}</p>}
              {academicFields.length === 0 && (
                <div className="rounded-lg border border-dashed border-border/80 p-6 text-center text-xs text-muted-foreground">
                  No academic background entered yet. Click &quot;+ Add Record&quot; if available, or click Next to skip.
                </div>
              )}
              {academicFields.map((field, idx) => (
                <Card key={field.id} className="p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Record {idx + 1}</p>
                    {academicFields.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="size-6" onClick={() => removeAcademic(idx)}>
                        <Trash2 className="size-3.5 text-danger-500" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <FieldWrap label="Level" error={errors.academics?.[idx]?.level?.message}>
                      <Input {...form.register(`academics.${idx}.level`)} placeholder="+2 / High School" />
                    </FieldWrap>
                    <FieldWrap label="Institution" error={errors.academics?.[idx]?.institution?.message}>
                      <Input {...form.register(`academics.${idx}.institution`)} placeholder="Trinity International College" />
                    </FieldWrap>
                    <FieldWrap label="Board" error={errors.academics?.[idx]?.board?.message}>
                      <Input {...form.register(`academics.${idx}.board`)} placeholder="NEB" />
                    </FieldWrap>
                    <FieldWrap label="GPA / Percentage" error={errors.academics?.[idx]?.gpaOrPercentage?.message}>
                      <Input {...form.register(`academics.${idx}.gpaOrPercentage`)} placeholder="3.6 GPA" />
                    </FieldWrap>
                    <FieldWrap label="Passed Year" error={errors.academics?.[idx]?.passedYear?.message}>
                      <Input {...form.register(`academics.${idx}.passedYear`)} placeholder="2024" />
                    </FieldWrap>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* ── Step 3: English Test ── */}
          {currentStep === 2 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">English Test Scores</h3>
              <div className="grid grid-cols-2 gap-3">
                <FieldWrap label="Test Type" error={errors.englishTestType?.message}>
                  <Controller control={form.control} name="englishTestType" render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IELTS">IELTS</SelectItem>
                        <SelectItem value="PTE">PTE</SelectItem>
                        <SelectItem value="TOEFL">TOEFL</SelectItem>
                        <SelectItem value="Duolingo">Duolingo</SelectItem>
                        <SelectItem value="None">None</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </FieldWrap>
                {watchTestType !== 'None' && (
                  <>
                    <FieldWrap label="Overall Score" error={errors.overallScore?.message}>
                      <Input {...form.register('overallScore')} type="number" step="0.5" placeholder="7.0" />
                    </FieldWrap>
                    <FieldWrap label="Listening" error={errors.listening?.message}>
                      <Input {...form.register('listening')} type="number" step="0.5" placeholder="7.5" />
                    </FieldWrap>
                    <FieldWrap label="Reading" error={errors.reading?.message}>
                      <Input {...form.register('reading')} type="number" step="0.5" placeholder="7.0" />
                    </FieldWrap>
                    <FieldWrap label="Writing" error={errors.writing?.message}>
                      <Input {...form.register('writing')} type="number" step="0.5" placeholder="6.5" />
                    </FieldWrap>
                    <FieldWrap label="Speaking" error={errors.speaking?.message}>
                      <Input {...form.register('speaking')} type="number" step="0.5" placeholder="7.0" />
                    </FieldWrap>
                    <FieldWrap label="Test Date" error={errors.testDate?.message}>
                      <Input {...form.register('testDate')} type="date" />
                    </FieldWrap>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Step 4: Study Preferences ── */}
          {currentStep === 3 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Study Preferences</h3>
              <FieldWrap label="Preferred Countries" error={errors.preferredCountries?.message}>
                <div className="grid grid-cols-2 gap-2">
                  {countries.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 rounded-lg border border-border p-2 cursor-pointer hover:bg-accent/50 transition-colors">
                      <Checkbox
                        checked={watchCountries.includes(c.name)}
                        onCheckedChange={(checked) => {
                          const current = form.getValues('preferredCountries')
                          form.setValue(
                            'preferredCountries',
                            checked ? [...current, c.name] : current.filter((n) => n !== c.name),
                            { shouldValidate: true },
                          )
                        }}
                      />
                      <span className="text-sm">{c.flag} {c.name}</span>
                    </label>
                  ))}
                </div>
              </FieldWrap>
              <div className="grid grid-cols-2 gap-3">
                <FieldWrap label="Preferred Level" error={errors.preferredLevel?.message}>
                  <Controller control={form.control} name="preferredLevel" render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="foundation">Foundation</SelectItem>
                        <SelectItem value="diploma">Diploma</SelectItem>
                        <SelectItem value="bachelor">Bachelor</SelectItem>
                        <SelectItem value="master">Master</SelectItem>
                        <SelectItem value="phd">PhD</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </FieldWrap>
                <FieldWrap label="Budget (USD)" error={errors.budgetUsd?.message}>
                  <Input {...form.register('budgetUsd')} type="number" placeholder="15000" />
                </FieldWrap>
              </div>
            </div>
          )}

          {/* ── Step 5: Parents / Guardians ── */}
          {currentStep === 4 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Parents / Guardians (optional)</h3>
                  <p className="text-xs text-muted-foreground">Add parent or guardian details if available, or skip to finish.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => addParent({ id: `p-new-${Date.now()}`, name: '', relation: 'father', phone: '', email: '', occupation: '' })}>
                  <Plus /> Add Guardian
                </Button>
              </div>
              {errors.parents?.root && <p className="text-xs text-danger-500">{errors.parents.root.message}</p>}
              {parentFields.length === 0 && (
                <div className="rounded-lg border border-dashed border-border/80 p-6 text-center text-xs text-muted-foreground">
                  No guardians added yet. Click &quot;+ Add Guardian&quot; if available, or click Create Student to complete.
                </div>
              )}
              {parentFields.map((field, idx) => (
                <Card key={field.id} className="p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Guardian {idx + 1}</p>
                    {parentFields.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="size-6" onClick={() => removeParent(idx)}>
                        <Trash2 className="size-3.5 text-danger-500" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <FieldWrap label="Full Name" error={errors.parents?.[idx]?.name?.message}>
                      <Input {...form.register(`parents.${idx}.name`)} placeholder="Ram Shrestha" />
                    </FieldWrap>
                    <FieldWrap label="Relation" error={errors.parents?.[idx]?.relation?.message}>
                      <Controller control={form.control} name={`parents.${idx}.relation`} render={({ field: f }) => (
                        <Select value={f.value} onValueChange={f.onChange}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="father">Father</SelectItem>
                            <SelectItem value="mother">Mother</SelectItem>
                            <SelectItem value="guardian">Guardian</SelectItem>
                          </SelectContent>
                        </Select>
                      )} />
                    </FieldWrap>
                    <FieldWrap label="Phone" error={errors.parents?.[idx]?.phone?.message}>
                      <Input {...form.register(`parents.${idx}.phone`)} placeholder="98XXXXXXXX" />
                    </FieldWrap>
                    <FieldWrap label="Email (optional)">
                      <Input {...form.register(`parents.${idx}.email`)} type="email" placeholder="parent@email.com" />
                    </FieldWrap>
                    <FieldWrap label="Occupation (optional)">
                      <Input {...form.register(`parents.${idx}.occupation`)} placeholder="Business" />
                    </FieldWrap>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* ── Navigation ── */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={handleBack} disabled={currentStep === 0}>
              <ChevronLeft /> Back
            </Button>
            {currentStep < steps.length - 1 ? (
              <Button type="button" size="sm" onClick={handleNext}>
                Next <ChevronRight />
              </Button>
            ) : (
              <Button type="submit" size="sm">
                Create Student
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Field wrapper ───────────────────────────────────────────────────────────

function FieldWrap({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {error && <p className="text-[11px] text-danger-500">{error}</p>}
    </div>
  )
}
