import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-brand-700 dark:text-brand-300',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        success: 'border-transparent bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-500',
        warning: 'border-transparent bg-warning-100 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500',
        danger: 'border-transparent bg-danger-100 text-danger-700 dark:bg-danger-500/15 dark:text-danger-500',
        info: 'border-transparent bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
        slate: 'border-transparent bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
