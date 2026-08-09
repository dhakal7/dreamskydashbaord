import { Fragment } from 'react'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Step {
  key: string
  label: string
  description?: string
}

export interface TerminalStep {
  key: string
  label: string
  description?: string
  variant: 'danger' | 'warning' | 'info'
}

interface StepperProps {
  steps: Step[]
  currentStepKey: string
  terminalSteps?: TerminalStep[]
  activeTerminalKey?: string // e.g. 'rejected'
  stepDates?: Record<string, string>
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

export function Stepper({
  steps,
  currentStepKey,
  terminalSteps = [],
  activeTerminalKey,
  stepDates = {},
  orientation = 'horizontal',
  className,
}: StepperProps) {
  const isTerminalActive = !!activeTerminalKey
  
  // Find index of the current linear step (if not terminal)
  // If terminal, we determine the last active linear step based on dates or assume the stage prior to terminal
  const currentLinearIndex = steps.findIndex((s) => s.key === currentStepKey)
  
  // Determine if a step is completed
  const isStepCompleted = (index: number) => {
    if (isTerminalActive) {
      // In terminal state, steps are completed if we have a recorded date for them
      const step = steps[index]
      return !!stepDates[step.key]
    }
    return index < currentLinearIndex
  }

  const isStepActive = (index: number) => {
    if (isTerminalActive) return false
    return index === currentLinearIndex
  }

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'flex gap-6',
          orientation === 'horizontal' 
            ? 'flex-col md:flex-row md:items-start md:justify-between' 
            : 'flex-col'
        )}
      >
        {/* Main Linear Steps */}
        <div
          className={cn(
            'flex flex-1',
            orientation === 'horizontal' 
              ? 'flex-col md:flex-row md:items-center' 
              : 'flex-col gap-8'
          )}
        >
          {steps.map((step, idx) => {
            const completed = isStepCompleted(idx)
            const active = isStepActive(idx)
            const date = stepDates[step.key]
            const isLast = idx === steps.length - 1

            return (
              <Fragment key={step.key}>
                <div
                  className={cn(
                    'flex items-center gap-3 md:flex-col md:items-center md:text-center md:gap-2 flex-1 relative'
                  )}
                >
                  {/* Step Connector line for vertical or horizontal (if md) */}
                  {!isLast && orientation === 'horizontal' && (
                    <div 
                      className={cn(
                        'hidden md:block absolute top-5 left-[calc(50%+20px)] right-[calc(-50%+20px)] h-0.5 transition-colors duration-300',
                        completed ? 'bg-emerald-500' : 'bg-muted'
                      )}
                    />
                  )}
                  
                  {/* Node Circle */}
                  <div
                    className={cn(
                      'size-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 z-10',
                      completed 
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-600 dark:bg-emerald-950/20 dark:border-emerald-500' 
                        : active 
                        ? 'bg-brand-50 border-brand-600 text-brand-600 dark:bg-brand-950/20 dark:border-brand-500 shadow-[0_0_12px_rgba(37,99,235,0.2)] animate-pulse' 
                        : 'bg-background border-muted text-muted-foreground'
                    )}
                  >
                    {completed ? (
                      <Check className="size-5" />
                    ) : (
                      <span className="text-sm font-semibold">{idx + 1}</span>
                    )}
                  </div>

                  {/* Label / Description */}
                  <div className="flex flex-col md:items-center">
                    <span 
                      className={cn(
                        'text-sm font-semibold transition-colors',
                        completed ? 'text-foreground font-medium' : active ? 'text-brand-600 font-bold' : 'text-muted-foreground'
                      )}
                    >
                      {step.label}
                    </span>
                    {date && (
                      <span className="text-[10px] text-muted-foreground font-medium mt-0.5 bg-muted/50 px-1.5 py-0.5 rounded font-tabular">
                        {date}
                      </span>
                    )}
                    {step.description && (
                      <span className="text-xs text-muted-foreground mt-0.5 hidden md:block max-w-[120px]">
                        {step.description}
                      </span>
                    )}
                  </div>
                </div>

                {/* Mobile Connector line */}
                {!isLast && orientation === 'vertical' && (
                  <div className="w-0.5 h-8 bg-muted ml-5 -my-2" />
                )}
              </Fragment>
            )
          })}
        </div>

        {/* Terminal/Rejected branch off the main line */}
        {isTerminalActive && (
          <div
            className={cn(
              'flex items-center gap-3 p-4 rounded-xl border border-red-200 bg-red-50/50 dark:bg-red-950/10 dark:border-red-900/30 md:self-center',
              orientation === 'horizontal' ? 'mt-4 md:mt-0 md:ml-4' : 'mt-2'
            )}
          >
            <div className="size-10 rounded-full flex items-center justify-center bg-red-100 dark:bg-red-950 text-red-600 border border-red-300 dark:border-red-800 shrink-0">
              <X className="size-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-red-600">
                {terminalSteps.find((ts) => ts.key === activeTerminalKey)?.label || 'Rejected'}
              </div>
              <div className="text-xs text-red-500">
                Application terminated
              </div>
              {stepDates[activeTerminalKey] && (
                <div className="text-[10px] text-red-500 font-medium font-tabular mt-0.5">
                  {stepDates[activeTerminalKey]}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
