import type { LucideIcon } from 'lucide-react'
import { PageHeader } from './page-header'
import { EmptyState } from './empty-state'

interface ComingSoonProps {
  title: string
  description: string
  icon: LucideIcon
  phaseNote?: string
}

export function ComingSoonPage({ title, description, icon, phaseNote }: ComingSoonProps) {
  return (
    <div className="space-y-5">
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={icon}
        title={`${title} module is scoped for the next build phase`}
        description={phaseNote ?? 'The app shell, navigation, and data layer are already wired up for this module — full functionality lands in the next phase.'}
        className="py-24"
      />
    </div>
  )
}
