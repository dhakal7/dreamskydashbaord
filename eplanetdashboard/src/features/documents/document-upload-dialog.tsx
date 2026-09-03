import { useState, useId, useMemo } from 'react'
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
import { useStudents } from '@/hooks/use-students'
import { useStudentsStore } from '@/features/students/store'
import { useAuthStore } from '@/store/auth-store'
import { isMockMode } from '@/lib/api-client'
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
    { value: 'BANK_BALANCE_CERTIFICATE', label: 'Bank Balance Certificate' },
    { value: 'BANK_STATEMENT', label: 'Bank Statement' },
    { value: 'INCOME_SOURCE', label: 'Income Source' },
    { value: 'TAX_CLEARANCE', label: 'Tax Clearance' },
    { value: 'RELATIONSHIP_CERTIFICATE', label: 'Relationship Certificate' },
    { value: 'SPONSORSHIP_LETTER', label: 'Sponsorship Letter' },
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
  const currentUser = useAuthStore((s) => s.currentUser)

  const { data: liveStudentsData } = useStudents({ limit: 500 })
  const mockStudents = useStudentsStore((s) => s.students)
  const isCounselor = String(currentUser?.role).toLowerCase() === 'counselor'

  const students = useMemo(() => {
    let rawList: Array<{ id: string; name: string; studentId?: string; email?: string; phone?: string; counselorName?: string; counselorId?: string }> = []

    if (!isMockMode() && liveStudentsData) {
      const list = liveStudentsData.students || (Array.isArray(liveStudentsData) ? liveStudentsData : [])
      rawList = list.map((s: any) => ({
        id: s.id,
        name: `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.email || 'Student',
        studentId: s.email || s.phone || s.id,
        email: s.email || '',
        phone: s.phone || '',
        counselorName: s.assignedCounselor ? `${s.assignedCounselor.firstName} ${s.assignedCounselor.lastName}`.trim() : undefined,
        counselorId: s.assignedCounselorId,
      }))
    }

    if (rawList.length === 0) {
      rawList = mockStudents.map((s) => ({
        id: s.id,
        name: s.name,
        studentId: s.studentId || s.id,
        email: s.email,
        phone: s.phone || '',
        counselorName: s.counselorName,
        counselorId: (s as any).counselorId,
      }))
    }

    return rawList.filter((s) => {
      if (!isCounselor) return true
      const matchName = Boolean(currentUser?.name && s.counselorName?.toLowerCase().includes(currentUser.name.toLowerCase()))
      const matchId = s.counselorId === currentUser?.id || s.counselorId === currentUser?.linkedId
      return matchName || matchId
    })
  }, [liveStudentsData, mockStudents, currentUser, isCounselor])

  const uploadMutation = useUploadDocument()

  const [studentId, setStudentId] = useState(preselectedStudentId ?? '')
  const [category, setCategory] = useState<DocumentCategory>('identity')
  const [docType, setDocType] = useState('PASSPORT')
  const [customName, setCustomName] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [multiFileWarning, setMultiFileWarning] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

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
      setUploadError(null)
      setMultiFileWarning(false)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragActive(false)
    const files = e.dataTransfer.files
    if (files && files.length > 1) {
      setMultiFileWarning(true)
    } else {
      setMultiFileWarning(false)
    }
    const file = files?.[0]
    if (file) {
      setSelectedFile(file)
      setUploadError(null)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeStudentId || !selectedFile) return
    setUploadError(null)

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
          setUploadError(null)
          setMultiFileWarning(false)
          onOpenChange(false)
        },
        onError: (err: Error) => {
          setUploadError(err.message || 'Upload failed. Please try again.')
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

          {/* Upload error display */}
          {uploadError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive font-medium">
              ⚠️ {uploadError}
            </div>
          )}

          {/* Multi-file warning */}
          {multiFileWarning && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 font-medium">
              ⚠️ Only one file can be uploaded at a time. The first file has been selected — please upload the others separately.
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={uploadMutation.isPending}>
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
