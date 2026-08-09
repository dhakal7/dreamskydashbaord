import { motion } from 'framer-motion'
import { ArrowUpRight, Minus } from 'lucide-react'
import { Card } from '@/components/ui/card'
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
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat, i) => {
        const Icon = icons[i % icons.length]
        const color = iconColors[i % iconColors.length]
        return (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
          >
            <Card className="p-4 transition-shadow hover:shadow-elevated">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                  <p className="mt-1.5 text-2xl font-semibold tracking-tight font-tabular">{formatNumber(stat.value)}</p>
                </div>
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${color}18`, color }}
                >
                  <Icon className="size-4.5" />
                </span>
              </div>
              <div className="mt-2.5 flex items-center gap-1 text-xs">
                {stat.trend === 'up' ? (
                  <ArrowUpRight className="size-3.5 text-success-600" />
                ) : (
                  <Minus className="size-3.5 text-muted-foreground" />
                )}
                <span className={cn(stat.trend === 'up' ? 'text-success-600 font-medium' : 'text-muted-foreground')}>
                  {stat.delta}
                </span>
              </div>
            </Card>
          </motion.div>
        )
      })}
    </div>
  )
}
