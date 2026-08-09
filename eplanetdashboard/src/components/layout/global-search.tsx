import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, User, UserPlus, Landmark, CornerDownLeft } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { students, leads, universities } from '@/mock'
import { useAuthStore } from '@/store/auth-store'
import { searchScopesByRole, visibleLeads, visibleStudents } from '@/lib/data-visibility'
import { PersonAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface GlobalSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const currentUser = useAuthStore((state) => state.currentUser)
  const searchScopes = searchScopesByRole[currentUser.role]

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null

    const studentMatches = visibleStudents(currentUser, students)
      .filter((s) => [s.name, s.studentId, s.passportNumber, s.phone, s.email].some((f) => f.toLowerCase().includes(q)))
      .slice(0, 4)
    const leadMatches = visibleLeads(currentUser, leads)
      .filter((l) => [l.name, l.email, l.phone].some((f) => f.toLowerCase().includes(q)))
      .slice(0, 4)
    const uniMatches = searchScopes.includes('universities')
      ? universities.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 4)
      : []
    return { studentMatches, leadMatches, uniMatches }
  }, [currentUser, query, searchScopes])

  function go(path: string) {
    onOpenChange(false)
    setQuery('')
    navigate(path)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[18%] translate-y-0 max-w-xl p-0 gap-0 overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchScopes.length ? 'Search authorized records...' : 'Global search is unavailable for your role'}
            disabled={!searchScopes.length}
            className="h-auto border-0 shadow-none px-0 focus-visible:ring-0"
          />
          <kbd className="hidden sm:inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!searchScopes.length && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Global search is not available for your role.
            </p>
          )}

          {searchScopes.length > 0 && !results && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Start typing to search across the CRM.
            </p>
          )}

          {results && (
            <div className="space-y-3">
              {searchScopes.includes('students') && <ResultGroup
                icon={User}
                label="Students"
                empty={results.studentMatches.length === 0}
              >
                {results.studentMatches.map((s) => (
                  <ResultRow
                    key={s.id}
                    onClick={() => go(`/students/${s.id}`)}
                    leading={<PersonAvatar name={s.name} color={s.photoColor} className="size-7" />}
                    title={s.name}
                    subtitle={`${s.studentId} · ${s.preferredCountries[0] ?? ''}`}
                  />
                ))}
              </ResultGroup>}

              {searchScopes.includes('leads') && <ResultGroup icon={UserPlus} label="Leads" empty={results.leadMatches.length === 0}>
                {results.leadMatches.map((l) => (
                  <ResultRow
                    key={l.id}
                    onClick={() => go('/leads')}
                    leading={<PersonAvatar name={l.name} color={l.photoColor} className="size-7" />}
                    title={l.name}
                    subtitle={`${l.interestedCountry} · ${l.stage.replace('_', ' ')}`}
                  />
                ))}
              </ResultGroup>}

              {searchScopes.includes('universities') && <ResultGroup icon={Landmark} label="Universities" empty={results.uniMatches.length === 0}>
                {results.uniMatches.map((u) => (
                  <ResultRow
                    key={u.id}
                    onClick={() => go('/universities')}
                    leading={<span className="text-lg">{u.flag}</span>}
                    title={u.name}
                    subtitle={`${u.city}, ${u.countryName}`}
                  />
                ))}
              </ResultGroup>}

            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ResultGroup({
  icon: Icon, label, empty, children,
}: {
  icon: typeof User
  label: string
  empty: boolean
  children: React.ReactNode
}) {
  if (empty) return null
  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" /> {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function ResultRow({
  onClick, leading, title, subtitle,
}: {
  onClick: () => void
  leading: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent group'
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center">{leading}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
    </button>
  )
}
