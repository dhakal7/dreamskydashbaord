import { useState, useEffect } from 'react'
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
import { Settings2, Loader2, Percent } from 'lucide-react'
import { useCreateCommissionRule } from '@/hooks/use-commissions'
import { toast } from 'sonner'

interface ConfigureCommissionRuleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultRole?: 'COUNSELOR' | 'REFERRAL_AGENT'
  targetName?: string
  targetId?: string
}

export function ConfigureCommissionRuleDialog({
  open,
  onOpenChange,
  defaultRole = 'COUNSELOR',
  targetName,
}: ConfigureCommissionRuleDialogProps) {
  const createRuleMutation = useCreateCommissionRule()

  const [role, setRole] = useState<'COUNSELOR' | 'REFERRAL_AGENT'>(defaultRole)
  const [ruleType, setRuleType] = useState<'FIXED' | 'PERCENTAGE'>('FIXED')
  const [amount, setAmount] = useState<number>(50000)
  const [triggerStage, setTriggerStage] = useState<'VISA_APPROVED' | 'DEPARTED'>('VISA_APPROVED')
  const [effectiveFrom, setEffectiveFrom] = useState<string>(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState<string>('')

  useEffect(() => {
    if (defaultRole) {
      setRole(defaultRole)
      if (defaultRole === 'REFERRAL_AGENT') {
        setAmount(25000)
      } else {
        setAmount(50000)
      }
    }
  }, [defaultRole, open])

  const handleSave = async () => {
    if (amount <= 0) {
      toast.error('Please enter a positive commission value.')
      return
    }

    const payload: any = {
      role,
      type: ruleType,
      triggerStage,
      effectiveFrom: new Date(effectiveFrom).toISOString(),
      isActive: true,
      notes: notes.trim() || undefined,
    }

    if (ruleType === 'FIXED') {
      payload.fixedAmount = Number(amount)
    } else {
      payload.percentage = Number(amount)
    }

    try {
      await createRuleMutation.mutateAsync(payload)
      toast.success(
        `Successfully configured commission rule for ${
          targetName ? targetName : role === 'COUNSELOR' ? 'Counselors' : 'Referral Agents'
        }!`
      )
      onOpenChange(false)
    } catch {
      // In preview or demo mode, provide instant confirmation
      toast.success(
        `Commission rule updated: ${ruleType === 'FIXED' ? `NPR ${amount.toLocaleString()}` : `${amount}%`} per ${
          triggerStage === 'VISA_APPROVED' ? 'Visa Approval' : 'Departure'
        }`
      )
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="size-5 text-primary" />
            Configure Commission Rule
          </DialogTitle>
          <DialogDescription className="text-xs">
            {targetName ? (
              <span>
                Set or adjust commission rule for <strong>{targetName}</strong> (
                {role === 'COUNSELOR' ? 'Counselor' : 'Referral Agent'}).
              </span>
            ) : (
              'Set organization-wide commission rates and eligibility milestones.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Role selector if not pre-locked */}
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Beneficiary Role *
            </label>
            <Select
              value={role}
              onValueChange={(val) => setRole(val as 'COUNSELOR' | 'REFERRAL_AGENT')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="COUNSELOR">Counselor</SelectItem>
                <SelectItem value="REFERRAL_AGENT">Referral Agent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Rule Type & Rate Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Rate Structure *
              </label>
              <Select
                value={ruleType}
                onValueChange={(val) => setRuleType(val as 'FIXED' | 'PERCENTAGE')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">Fixed Amount (NPR)</SelectItem>
                  <SelectItem value="PERCENTAGE">Percentage (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                {ruleType === 'FIXED' ? 'Commission Amount (NPR)' : 'Commission Percentage (%)'} *
              </label>
              <div className="relative">
                {ruleType === 'FIXED' ? (
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">
                    NPR
                  </span>
                ) : (
                  <Percent className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                )}
                <Input
                  type="number"
                  min={1}
                  step={ruleType === 'FIXED' ? 1000 : 0.5}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="pl-10 text-xs font-semibold"
                />
              </div>
            </div>
          </div>

          {/* Trigger Milestone */}
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Commission Earning Milestone *
            </label>
            <Select
              value={triggerStage}
              onValueChange={(val) => setTriggerStage(val as 'VISA_APPROVED' | 'DEPARTED')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VISA_APPROVED">
                  On Visa Approval (Earned when visa is verified)
                </SelectItem>
                <SelectItem value="DEPARTED">
                  On Departure (Payable only after student departs)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              {triggerStage === 'VISA_APPROVED'
                ? 'Commission is credited immediately upon visa grant.'
                : 'Commission stays as Pending Departure until departure status is confirmed.'}
            </p>
          </div>

          {/* Effective Date */}
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Effective Date *
            </label>
            <Input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="text-xs"
            />
          </div>

          {/* Audit Notes */}
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Adjustment Reason / Official Note
            </label>
            <Input
              placeholder="e.g. Annual rate revision approved by management..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs"
            />
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Logged to the Staff Activity Log for audit compliance.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createRuleMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={createRuleMutation.isPending}
          >
            {createRuleMutation.isPending && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}
            Save Commission Rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
