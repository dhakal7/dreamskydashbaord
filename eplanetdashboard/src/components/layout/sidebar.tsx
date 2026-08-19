import { NavLink } from 'react-router-dom'
import { ChevronsLeft, LogOut } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/ui-store'
import { useAuthStore } from '@/store/auth-store'
import { getNavItems, type NavItem } from './nav-items'
import { QuickNotificationComposer } from './quick-notification-composer'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'

export function Sidebar({ mobile, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const currentUser = useAuthStore((s) => s.currentUser)
  const role = currentUser.role
  const logout = useAuthStore((s) => s.logout)
  const navItems = getNavItems(role)
  const isCollapsed = collapsed && !mobile

  async function handleLogout() {
    await logout()
    // logout() redirects to landing page via window.location.href
  }

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          'flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200',
          isCollapsed ? 'w-[68px]' : 'w-[240px]'
        )}
      >
        <div className={cn('flex h-14 shrink-0 items-center gap-2.5 px-4', isCollapsed && 'justify-center px-0')}>
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-soft ring-1 ring-border/70">
            <img
              src="/dreamsky-logo.jpeg"
              alt="Dream Sky logo"
              className="h-full w-full object-cover"
            />
          </div>
          {!isCollapsed && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-semibold text-foreground">DREAM SKY EDUCATION CONSULTANCY</p>
              <p className="truncate text-[11px] text-muted-foreground">Consultancy CRM</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-2">
          {navItems.map((item) => (
            <NavItemLink key={item.to} item={item} collapsed={isCollapsed} onNavigate={onNavigate} />
          ))}
        </nav>



        <div className="border-t border-sidebar-border p-2.5 space-y-2">
          {(!isCollapsed && (role === 'super_admin' || role === 'front_desk')) && (
            <QuickNotificationComposer />
          )}
          <button
            onClick={handleLogout}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-500/10',
              isCollapsed && 'justify-center'
            )}
          >
            <LogOut className="size-4 shrink-0" />
            {!isCollapsed && <span>Logout</span>}
          </button>
          {!mobile && (
            <button
              onClick={toggleSidebar}
              className={cn(
                'mt-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent',
                isCollapsed && 'justify-center'
              )}
            >
              <motion.span animate={{ rotate: isCollapsed ? 180 : 0 }} className="flex">
                <ChevronsLeft className="size-4 shrink-0" />
              </motion.span>
              {!isCollapsed && <span>Collapse</span>}
            </button>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}

function NavItemLink({
  item, collapsed, onNavigate,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate?: () => void
}) {
  const link = (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
          collapsed && 'justify-center',
          isActive
            ? 'bg-sidebar-accent text-primary'
            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-foreground'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <motion.span
              layoutId="sidebar-active-pill"
              className="absolute left-0 h-5 w-[3px] rounded-full bg-primary"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            />
          )}
          <item.icon className="size-4 shrink-0" />
          {!collapsed && <span className="truncate">{item.label}</span>}
          {!collapsed && item.badge && (
            <span className="ml-auto rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground font-tabular">
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  )
}
