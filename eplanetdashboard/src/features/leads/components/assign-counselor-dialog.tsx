import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { userApi, type CounselorOption } from '@/api/user-api'
import { useAssignLiveLead } from '@/hooks/use-leads-live'
import { useAuthStore } from '@/store/auth-store'
import type { Lead } from '@/types'

interface AssignCounselorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: Lead | null
}

export function AssignCounselorDialog({ open, onOpenChange, lead }: AssignCounselorDialogProps) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const assignLead = useAssignLiveLead()
  const [counselors, setCounselors] = useState<CounselorOption[]>([])
  const [selectedCounselorId, setSelectedCounselorId] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setLoading(true)
      userApi
        .getCounselors()
        .then((data) => {
          // If currentUser is not super_admin, filter counselors by currentUser.branchId
          if (currentUser.role !== 'super_admin' && currentUser.branchId) {
            setCounselors(data.filter((c) => !c.branchId || c.branchId === currentUser.branchId))
          } else {
            setCounselors(data)
          }
        })
        .finally(() => setLoading(false))

      if (lead?.counselorId) {
        setSelectedCounselorId(lead.counselorId)
      } else {
        setSelectedCounselorId('')
      }
    }
  }, [open, lead, currentUser])

  const handleAssign = async () => {
    if (!lead || !selectedCounselorId) return
    await assignLead.mutateAsync({
      id: lead.id,
      counselorId: selectedCounselorId,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Lead to Counselor</DialogTitle>
          <DialogDescription>
            Assign <span className="font-semibold text-foreground">{lead?.name}</span> to a counselor.
            This will advance the lead stage to Assigned and notify the counselor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="space-y-2">
            <label htmlFor="counselor-select" className="text-xs font-medium text-foreground">
              Select Counselor
            </label>
            <Select
              value={selectedCounselorId}
              onValueChange={setSelectedCounselorId}
              disabled={loading}
            >
              <SelectTrigger id="counselor-select">
                <SelectValue placeholder={loading ? 'Loading counselors...' : 'Select a counselor'} />
              </SelectTrigger>
              <SelectContent>
                {counselors.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.email ? `(${c.email})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={assignLead.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedCounselorId || assignLead.isPending}
            className="bg-brand-600 hover:bg-brand-700 text-white"
          >
            {assignLead.isPending ? 'Assigning...' : 'Assign Lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
