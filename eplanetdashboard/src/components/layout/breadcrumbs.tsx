import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'
import { navItems } from './nav-items'

const labelOverrides: Record<string, string> = {
  'follow-ups': 'Follow-ups',
  visa: 'Visa Processing',
}

export function Breadcrumbs() {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)

  if (segments.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Home className="size-3.5" />
        <span className="font-medium text-foreground">Dashboard</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Link to="/" className="flex items-center hover:text-foreground">
        <Home className="size-3.5" />
      </Link>
      {segments.map((seg, i) => {
        const path = '/' + segments.slice(0, i + 1).join('/')
        const isLast = i === segments.length - 1
        const matched = navItems.find((n) => n.to === path)
        const label = matched?.label ?? labelOverrides[seg] ?? decodeURIComponent(seg).replace(/-/g, ' ')
        return (
          <span key={path} className="flex items-center gap-1.5">
            <ChevronRight className="size-3.5" />
            {isLast ? (
              <span className="font-medium text-foreground capitalize">{label}</span>
            ) : (
              <Link to={path} className="capitalize hover:text-foreground">{label}</Link>
            )}
          </span>
        )
      })}
    </div>
  )
}
