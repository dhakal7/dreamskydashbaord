import { useState, useId } from 'react'
import { Upload, X, FileText } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchableStudentPicker } from '@/components/shared/searchable-student-picker'
import { useUploadDocument } from '@/hooks/use-documents'
import { useStudentsStore } from '@/features/students/store'
import type { DocumentCategory } from '@/types'

interface DocumentUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preselectedStudentId?: string
}

export const CATEGORY_OPTIONS: { value: DocumentCategory; label: string }[] = [
  { value: 'identity', label: 'Identity' },
  { value: 'academic', label: 'Academic' },
  { value: 'english_test', label: 'English / Test' },
  { value: 'finance', label: 'Finance' },
  { value: 'visa', label: 'Visa' },
  { value: 'other', label: 'Other' },
]

export const TYPE_OPTIONS_BY_CATEGORY: Record<DocumentCategory, { value: string; label: string }[]> = {
  identity: [
    { value: 'PASSPORT', label: 'Passport' },
    { value: 'CITIZENSHIP', label: 'Citizenship' },
    { value: 'BIRTH_CERTIFICATE', label: 'Birth Certificate' },
    { value: 'NATIONAL_ID', label: 'National ID' },
    { value: 'OTHER', label: 'Other Identity Doc' },
  ],
  academic: [
    { value: 'SEE_CERTIFICATE', label: 'SEE Certificate' },
    { value: 'PLUS_TWO_CERTIFICATE', label: '+2 Certificate' },
    { value: 'BACHELORS_CERTIFICATE', label: "Bachelor's Certificate" },
    { value: 'TRANSCRIPT', label: 'Transcript' },
    { value: 'CHARACTER_CERTIFICATE', label: 'Character Certificate' },
    { value: 'OTHER', label: 'Other Academic Doc' },
  ],
  english_test: [
    { value: 'IELTS', label: 'IELTS' },
    { value: 'PTE', label: 'PTE' },
    { value: 'TOEFL', label: 'TOEFL' },
    { value: 'DUOLINGO', label: 'Duolingo' },
    { value: 'OTHER', label: 'Other Test Score' },
  ],
  finance: [
    { value: 'BANK_STATEMENT', label: 'Bank Statement' },
    { value: 'BANK_CERTIFICATE', label: 'Bank Certificate' },
    { value: 'INCOME_CERTIFICATE', label: 'Income Certificate' },
    { value: 'TAX_CLEARANCE', label: 'Tax Clearance' },
    { value: 'SPONSORSHIP_LETTER', label: 'Sponsorship Letter' },
    { value: 'AFFIDAVIT', label: 'Affidavit' },
    { value: 'LOAN_LETTER', label: 'Loan Letter' },
    { value: 'PROPERTY_VALUATION', label: 'Property Valuation' },
    { value: 'OTHER', label: 'Other Financial Doc' },
  ],
  visa: [
    { value: 'VISA_APPLICATION', label: 'Visa Application' },
    { value: 'VISA_DOCUMENTS', label: 'Visa Documents' },
    { value: 'OFFER_LETTER', label: 'Offer Letter' },
    { value: 'COE', label: 'COE' },
    { value: 'OTHER', label: 'Other Visa Doc' },
  ],
  other: [
    { value: 'OTHER', label: 'Custom Document' },
  ],
}

export function DocumentUploadDialog({ open, onOpenChange, preselectedStudentId }: DocumentUploadDialogProps) {
  const fileInputId = useId()
  const students = useStudentsStore((s) => s.students)
  const uploadMutation = useUploadDocument()

  const [studentId, setStudentId] = useState(preselectedStudentId ?? '')
  const [category, setCategory] = useState<DocumentCategory>('identity')
  const [docType, setDocType] = useState('PASSPORT')
  const [customName, setCustomName] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const activeStudentId = preselectedStudentId || studentId
  const selectedStudent = students.find((s) => s.id === activeStudentId)

  const handleCategoryChange = (cat: DocumentCategory) => {
    setCategory(cat)
    const availableTypes = TYPE_OPTIONS_BY_CATEGORY[cat]
    if (availableTypes && availableTypes.length > 0) {
      setDocType(availableTypes[0].value)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeStudentId || !selectedFile) return

    uploadMutation.mutate(
      {
        file: selectedFile,
        studentId: activeStudentId,
        category: category.toUpperCase(),
        type: docType,
        customName: customName.trim() || undefined,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          setSelectedFile(null)
          setCustomName('')
          setNotes('')
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            {selectedStudent
              ? `Uploading document for ${selectedStudent.name} (${selectedStudent.studentId || selectedStudent.id})`
              : 'Select student, category, and document file to upload.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Student Picker if not pre-selected */}
          {!preselectedStudentId && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Select Student *</label>
              <SearchableStudentPicker
                label="Student"
                students={students}
                value={studentId}
                onChange={setStudentId}
                placeholder="Search student by name, ID, or passport..."
                showDropdown
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Category */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Category *</label>
              <Select value={category} onValueChange={(v) => handleCategoryChange(v as DocumentCategory)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Document Type */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Document Type *</label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  {(TYPE_OPTIONS_BY_CATEGORY[category] || []).map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Custom Document Name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Custom Display Name <span className="text-muted-foreground/60">(Optional)</span>
            </label>
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Education Loan Approval Letter"
            />
          </div>

          {/* File Picker Drag & Drop */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">File Upload *</label>
            <label
              htmlFor={fileInputId}
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition ${
                dragActive ? 'border-primary bg-primary/10' : 'border-border/80 bg-accent/20 hover:bg-accent/40'
              }`}
            >
              <Upload className="size-6 text-muted-foreground" />
              {selectedFile ? (
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <FileText className="size-4" />
                  <span className="truncate max-w-[280px]">{selectedFile.name}</span>
                  <span className="text-xs text-muted-foreground">({Math.round(selectedFile.size / 1024)} KB)</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedFile(null)
                    }}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-xs font-medium">Click to select or drag & drop document</p>
                  <p className="text-[11px] text-muted-foreground">PDF, JPEG, PNG supported (up to 15MB)</p>
                </>
              )}
              <input id={fileInputId} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} />
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes (Optional)</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any internal notes..."
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!activeStudentId || !selectedFile || uploadMutation.isPending}>
              {uploadMutation.isPending ? 'Uploading...' : 'Upload Document'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
