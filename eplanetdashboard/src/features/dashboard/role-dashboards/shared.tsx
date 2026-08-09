import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { formatNumber } from '@/lib/utils'

export interface RoleStat {
  label: string
  value: number | string
  icon: LucideIcon
  color: string
  sub?: string
}

export function RoleStatCards({ stats }: { stats: RoleStat[] }) {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.3 }}
        >
          <Card className="h-full p-3 transition-shadow hover:shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{stat.label}</p>
                <p className="mt-1 text-xl font-semibold tracking-tight font-tabular">
                  {typeof stat.value === 'number' ? formatNumber(stat.value) : stat.value}
                </p>
              </div>
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${stat.color}18`, color: stat.color }}
              >
                <stat.icon className="size-4" />
              </span>
            </div>
            {stat.sub && <p className="mt-2.5 text-xs text-muted-foreground">{stat.sub}</p>}
          </Card>
        </motion.div>
      ))}
    </div>
  )
}
