import { Progress } from '@/components/ui/progress'
import { formatCurrency } from '@/lib/utils'

interface BranchProgressBarProps {
  value: number
  target: number
  label?: string
  className?: string
}

export function BranchProgressBar({ value, target, label, className }: BranchProgressBarProps) {
  const pct = Math.min(Math.round((value / target) * 100), 100)

  return (
    <div className={className}>
      {label && <div className="mb-1.5 flex items-center justify-between text-[13px]">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground font-tabular">{formatCurrency(value)} / {formatCurrency(target)}</span>
      </div>}
      <div className="flex items-center gap-3">
        <Progress value={pct} className="flex-1" />
        <span className="w-10 shrink-0 text-right text-xs font-medium font-tabular text-muted-foreground">{pct}%</span>
      </div>
    </div>
  )
}
