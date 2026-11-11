import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { userApi, type CounselorOption } from '@/api/user-api'
import { useTransferLeadBranch } from '@/hooks/use-leads-live'
import type { Lead } from '@/types'

interface TransferBranchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: Lead | null
}

export function TransferBranchDialog({ open, onOpenChange, lead }: TransferBranchDialogProps) {
  const transferBranch = useTransferLeadBranch()
  const [branches, setBranches] = useState<Array<{ id: string; name: string; isActive: boolean }>>([])
  const [counselors, setCounselors] = useState<CounselorOption[]>([])
  const [destinationBranchId, setDestinationBranchId] = useState<string>('')
  const [newCounselorId, setNewCounselorId] = useState<string>('none')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setLoading(true)
      Promise.all([userApi.getBranches(), userApi.getCounselors()])
        .then(([bList, cList]) => {
          setBranches(bList.filter((b) => b.isActive))
          setCounselors(cList)
        })
        .finally(() => setLoading(false))

      setDestinationBranchId('')
      setNewCounselorId('none')
    }
  }, [open])

  // Counselors filtered by chosen destination branch
  const filteredCounselors = destinationBranchId
    ? counselors.filter((c) => c.branchId === destinationBranchId)
    : []

  const handleTransfer = async () => {
    if (!lead || !destinationBranchId) return
    await transferBranch.mutateAsync({
      id: lead.id,
      destinationBranchId,
      newAssignedCounselorId: newCounselorId === 'none' ? null : newCounselorId,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer Lead to Another Branch</DialogTitle>
          <DialogDescription>
            Transfer <span className="font-semibold text-foreground">{lead?.name}</span> to a different branch office.
            This action is strictly restricted to Super Administrators and will be logged in the activity audit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="space-y-2">
            <label htmlFor="branch-select" className="text-xs font-medium text-foreground">
              Destination Branch *
            </label>
            <Select
              value={destinationBranchId}
              onValueChange={(val) => {
                setDestinationBranchId(val)
                setNewCounselorId('none')
              }}
              disabled={loading}
            >
              <SelectTrigger id="branch-select">
                <SelectValue placeholder={loading ? 'Loading branches...' : 'Select destination branch'} />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {destinationBranchId && (
            <div className="space-y-2">
              <label htmlFor="counselor-select" className="text-xs font-medium text-foreground">
                Assigned Counselor in Destination Branch (Optional)
              </label>
              <Select
                value={newCounselorId}
                onValueChange={setNewCounselorId}
              >
                <SelectTrigger id="counselor-select">
                  <SelectValue placeholder="Unassigned / select counselor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- Leave Unassigned --</SelectItem>
                  {filteredCounselors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.email ? `(${c.email})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={transferBranch.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={!destinationBranchId || transferBranch.isPending}
            className="bg-brand-600 hover:bg-brand-700 text-white"
          >
            {transferBranch.isPending ? 'Transferring...' : 'Transfer Lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
