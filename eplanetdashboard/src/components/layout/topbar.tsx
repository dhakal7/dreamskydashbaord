import { useEffect, useState } from 'react'
import { Menu, Moon, Search, Sun, LogOut, User, Settings, UserCog, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PersonAvatar } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUIStore } from '@/store/ui-store'
import { useAuthStore } from '@/store/auth-store'
import { roleLabels } from '@/mock/current-user'
import type { Role } from '@/types'
import { Breadcrumbs } from './breadcrumbs'
import { GlobalSearch } from './global-search'
import { NotificationCenter } from './notification-center'

const allRoles = Object.keys(roleLabels) as Role[]

export function Topbar() {
  const theme = useUIStore((s) => s.theme)
  const toggleTheme = useUIStore((s) => s.toggleTheme)
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen)
  const currentUser = useAuthStore((s) => s.currentUser)
  const setRole = useAuthStore((s) => s.setRole)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-5">
      <button
        className="rounded-md p-1.5 hover:bg-accent lg:hidden"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>

      <div className="hidden sm:block">
        <Breadcrumbs />
      </div>

      <button
        onClick={() => setSearchOpen(true)}
        className="ml-1 flex h-9 flex-1 max-w-md items-center gap-2 rounded-lg border border-input bg-secondary/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary sm:ml-4"
        aria-label="Open global search"
      >
        <Search className="size-3.5" />
        <span className="hidden sm:inline">Search students, leads, universities...</span>
        <span className="sm:hidden">Search...</span>
        <kbd className="ml-auto hidden items-center rounded border border-border bg-background px-1.5 py-0.5 text-[10px] sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle dark mode">
          {theme === 'dark' ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
        </Button>
        <NotificationCenter />

        {/* Demo-only role switcher — stands in for real login until Track A's auth is wired in. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="hidden gap-1.5 sm:flex">
              <UserCog className="size-3.5" /> {roleLabels[currentUser.role]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal text-[11px] uppercase tracking-wide text-muted-foreground">
              Preview dashboard as
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {allRoles.map((role) => (
              <DropdownMenuItem key={role} onClick={() => setRole(role)}>
                {roleLabels[role]}
                {role === currentUser.role && <Check className="ml-auto size-3.5 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-1 flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-accent">
              <PersonAvatar name={currentUser.name} color={currentUser.avatarColor} />
              <span className="hidden text-left leading-tight md:block">
                <span className="block text-[13px] font-medium">{currentUser.name.split(' ')[0]}</span>
                <span className="block text-[11px] text-muted-foreground">{roleLabels[currentUser.role]}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium text-foreground">{currentUser.name}</p>
              <p className="text-xs text-muted-foreground">{currentUser.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem><User /> My Profile</DropdownMenuItem>
            <DropdownMenuItem><Settings /> Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive><LogOut /> Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  )
}
