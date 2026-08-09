import { useState } from 'react'
import dayjs from 'dayjs'
import { Building2, Edit2, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { CreatableSelect } from '@/components/ui/creatable-select'
import { useStudentsStore } from '../../store'
import type { Student } from '@/types'

export function PersonalTab({ student }: { student: Student }) {
  const { updateStudent, partnerConsultancies, addPartnerConsultancy } = useStudentsStore()

  const [isEditingProcessing, setIsEditingProcessing] = useState(false)
  const [processingType, setProcessingType] = useState<'self' | 'partner_consultancy'>(
    student.processingType || 'self'
  )
  const [partnerName, setPartnerName] = useState(student.partnerConsultancyName || '')

  const fields = [
    { label: 'Full Name', value: student.name },
    { label: 'Email', value: student.email },
    { label: 'Phone', value: student.phone },
    { label: 'Date of Birth', value: dayjs(student.dob).format('MMM D, YYYY') },
    { label: 'Gender', value: student.gender, capitalize: true },
    { label: 'Nationality', value: student.nationality },
    { label: 'Passport', value: student.passportNumber },
    { label: 'Address', value: student.address },
  ]

  const handleSaveProcessing = () => {
    let finalPartnerName = partnerName
    if (processingType === 'partner_consultancy' && partnerName.trim()) {
      addPartnerConsultancy(partnerName.trim())
      finalPartnerName = partnerName.trim()
    } else {
      finalPartnerName = ''
    }

    updateStudent(student.id, {
      processingType,
      partnerConsultancyName: processingType === 'partner_consultancy' ? finalPartnerName : undefined,
    })
    setIsEditingProcessing(false)
  }

  return (
    <div className="space-y-4">
      {/* Processing Path / B2B Section */}
      <Card className="p-5 border-l-4 border-l-primary shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-primary" />
            <h4 className="text-sm font-semibold">Application Processing & Referral Path</h4>
          </div>
          {!isEditingProcessing ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => setIsEditingProcessing(true)}
            >
              <Edit2 className="size-3.5" /> Edit Path
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={handleSaveProcessing}
            >
              <Check className="size-3.5" /> Save
            </Button>
          )}
        </div>

        {!isEditingProcessing ? (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Type:</span>
            {student.processingType === 'partner_consultancy' ? (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 font-medium px-2.5 py-1">
                B2B Partner Consultancy: {student.partnerConsultancyName || 'External Partner'}
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 font-medium px-2.5 py-1">
                Self (Dream Sky Internal)
              </Badge>
            )}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-muted/30 p-3 rounded-md">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Processing Path</label>
              <Select
                value={processingType}
                onValueChange={(val: 'self' | 'partner_consultancy') => {
                  setProcessingType(val)
                  if (val === 'self') setPartnerName('')
                }}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">Self (Dream Sky Internal)</SelectItem>
                  <SelectItem value="partner_consultancy">Other Partner Consultancy (B2B)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {processingType === 'partner_consultancy' && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Partner Consultancy Name</label>
                <CreatableSelect
                  options={partnerConsultancies.map((p) => ({ label: p.name, value: p.name }))}
                  value={partnerName}
                  onChange={(val, isNew) => {
                    setPartnerName(val)
                    if (isNew) {
                      addPartnerConsultancy(val)
                    }
                  }}
                  placeholder="Select or type new consultancy name..."
                  className="h-9 text-xs"
                />
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((f) => (
            <div key={f.label}>
              <p className="text-xs text-muted-foreground">{f.label}</p>
              <p className={`mt-0.5 text-[13px] font-medium ${f.capitalize ? 'capitalize' : ''}`}>{f.value}</p>
            </div>
          ))}
        </div>
      </Card>

      {student.tags.length > 0 && (
        <Card className="p-5">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {student.tags.map((tag) => (
              <Badge key={tag} variant="secondary">{tag}</Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
