import { motion } from 'framer-motion'
import { ArrowUpRight, Minus } from 'lucide-react'
import { cn, formatNumber } from '@/lib/utils'
import {
  Users, UserPlus, CalendarClock, FileStack, Mail, PlaneTakeoff, GraduationCap,
} from 'lucide-react'

const icons = [Users, UserPlus, CalendarClock, FileStack, Mail, PlaneTakeoff, GraduationCap]
const iconColors = ['#2563EB', '#7C3AED', '#D97706', '#0891B2', '#16A34A', '#DB2777', '#0EA5E9']

interface StatCardsProps {
  stats: { label: string; value: number; delta: string; trend: 'up' | 'down' | 'flat' }[]
}

export function StatCards({ stats }: StatCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => {
        const Icon = icons[i % icons.length]
        const color = iconColors[i % iconColors.length]
        return (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.35, ease: 'easeOut' }}
          >
            <div
              className={cn(
                'relative rounded-2xl border border-border/50 bg-card p-5',
                'transition-all duration-200 hover:border-border hover:shadow-lg hover:shadow-black/10',
                'group cursor-default',
              )}
            >
              {/* Label + Icon row */}
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-muted-foreground leading-tight">
                  {stat.label}
                </p>
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110"
                  style={{ backgroundColor: `${color}22`, color }}
                >
                  <Icon className="size-5" />
                </span>
              </div>

              {/* Value */}
              <p className="mt-3 text-4xl font-bold tracking-tight text-foreground font-tabular">
                {formatNumber(stat.value)}
              </p>

              {/* Delta */}
              <div className="mt-3 flex items-center gap-1 text-xs">
                {stat.trend === 'up' ? (
                  <ArrowUpRight className="size-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <Minus className="size-3.5 text-muted-foreground shrink-0" />
                )}
                <span
                  className={cn(
                    'font-medium',
                    stat.trend === 'up' ? 'text-emerald-500' : 'text-muted-foreground',
                  )}
                >
                  {stat.delta}
                </span>
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
