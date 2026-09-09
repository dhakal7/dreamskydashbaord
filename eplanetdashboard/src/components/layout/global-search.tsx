import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, User, UserPlus, Landmark, Navigation, CornerDownLeft } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { universities } from '@/mock'
import { useAuthStore } from '@/store/auth-store'
import { useStudentsStore } from '@/features/students/store'
import { useLeadsStore } from '@/features/leads/store'
import { useStudents } from '@/hooks/use-students'
import { useLiveLeads } from '@/hooks/use-leads-live'
import { isMockMode } from '@/lib/api-client'
import { searchScopesByRole, visibleLeads, visibleStudents } from '@/lib/data-visibility'
import { PersonAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface GlobalSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const navPages = [
  { name: 'Dashboard', path: '/dashboard/super-admin', keywords: ['home', 'analytics', 'stats', 'overview'] },
  { name: 'Students', path: '/students', keywords: ['pupil', 'enrolled', 'active'] },
  { name: 'Leads', path: '/leads', keywords: ['prospect', 'new lead', 'inquiry'] },
  { name: 'Follow-ups', path: '/followups', keywords: ['call', 'remind', 'task'] },
  { name: 'Appointments', path: '/appointments', keywords: ['meeting', 'counseling', 'schedule'] },
  { name: 'Applications', path: '/applications', keywords: ['offer letter', 'admission', 'university'] },
  { name: 'Visa Processing', path: '/visa', keywords: ['embassy', 'cas', 'coe', 'permit'] },
  { name: 'Classes & Batches', path: '/classes', keywords: ['ielts', 'pte', 'toefl', 'batch', 'tuition'] },
  { name: 'Fees & Payments', path: '/fees', keywords: ['finance', 'receipt', 'invoice', 'due'] },
  { name: 'Reports', path: '/reports', keywords: ['analytics', 'export', 'conversion'] },
  { name: 'Settings', path: '/settings', keywords: ['profile', 'account', 'password'] },
]

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const currentUser = useAuthStore((state) => state.currentUser)
  const searchScopes = searchScopesByRole[currentUser.role]

  const mockStudents = useStudentsStore((s) => s.students)
  const mockLeads = useLeadsStore((s) => s.leads)

  // Fetch live records from backend API when query is typed
  const { data: apiStudentsData } = useStudents({
    search: query.trim() || undefined,
    limit: 20,
  })
  const liveLeads = useLiveLeads()

  const activeStudents = useMemo(() => {
    if (!isMockMode() && apiStudentsData?.students) {
      return apiStudentsData.students.map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        studentId: (s as any).studentId ?? s.id,
        email: s.email,
        phone: s.phone ?? '',
        passportNumber: (s.academicBackground as any)?.passportNumber ?? '',
        preferredCountries: s.nationality ? [s.nationality] : [],
        photoColor: '#64748B',
        status: s.currentStage as any,
      }))
    }
    return isMockMode() ? mockStudents : []
  }, [apiStudentsData, mockStudents])

  const activeLeads = useMemo(() => {
    if (!isMockMode()) {
      return liveLeads
    }
    return mockLeads
  }, [liveLeads, mockLeads])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null

    const studentMatches = visibleStudents(currentUser, activeStudents as any)
      .filter((s) => [s.name, s.studentId, s.passportNumber ?? '', s.phone ?? '', s.email].some((f) => f.toLowerCase().includes(q)))
      .slice(0, 4)

    const leadMatches = visibleLeads(currentUser, activeLeads as any)
      .filter((l) => [l.name, l.email, l.phone ?? '', l.interestedCountry ?? ''].some((f) => f.toLowerCase().includes(q)))
      .slice(0, 4)

    const uniMatches = searchScopes.includes('universities')
      ? universities.filter((u) => u.name.toLowerCase().includes(q) || u.countryName.toLowerCase().includes(q)).slice(0, 4)
      : []

    const pageMatches = navPages.filter(
      (p) => p.name.toLowerCase().includes(q) || p.keywords.some((k) => k.includes(q))
    ).slice(0, 3)

    return { studentMatches, leadMatches, uniMatches, pageMatches }
  }, [currentUser, query, searchScopes, activeStudents, activeLeads])

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
            placeholder={searchScopes.length ? 'Search students, leads, universities, pages...' : 'Global search is unavailable for your role'}
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
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Quick Search CRM</p>
              <p className="text-xs text-muted-foreground mt-1">Search by student name, lead phone number, passport, university, or page name.</p>
            </div>
          )}

          {results && (
            <div className="space-y-3">
              {results.pageMatches.length > 0 && (
                <ResultGroup icon={Navigation} label="Pages & Tools" empty={false}>
                  {results.pageMatches.map((p) => (
                    <ResultRow
                      key={p.path}
                      onClick={() => go(p.path)}
                      leading={<Navigation className="size-4 text-primary" />}
                      title={p.name}
                      subtitle={`Jump to ${p.name}`}
                    />
                  ))}
                </ResultGroup>
              )}

              {searchScopes.includes('students') && (
                <ResultGroup
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
                      subtitle={`${s.studentId} · ${s.email} · ${s.preferredCountries[0] ?? ''}`}
                    />
                  ))}
                </ResultGroup>
              )}

              {searchScopes.includes('leads') && (
                <ResultGroup icon={UserPlus} label="Leads" empty={results.leadMatches.length === 0}>
                  {results.leadMatches.map((l) => (
                    <ResultRow
                      key={l.id}
                      onClick={() => go('/leads')}
                      leading={<PersonAvatar name={l.name} color={l.photoColor} className="size-7" />}
                      title={l.name}
                      subtitle={`${l.phone ?? l.email} · ${l.interestedCountry} · ${l.stage.replace('_', ' ')}`}
                    />
                  ))}
                </ResultGroup>
              )}

              {searchScopes.includes('universities') && (
                <ResultGroup icon={Landmark} label="Universities" empty={results.uniMatches.length === 0}>
                  {results.uniMatches.map((u) => (
                    <ResultRow
                      key={u.id}
                      onClick={() => go('/universities')}
                      leading={<span className="text-lg">{u.flag}</span>}
                      title={u.name}
                      subtitle={`${u.city}, ${u.countryName}`}
                    />
                  ))}
                </ResultGroup>
              )}

              {results.pageMatches.length === 0 &&
                results.studentMatches.length === 0 &&
                results.leadMatches.length === 0 &&
                results.uniMatches.length === 0 && (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No results found for "{query}".
                  </p>
                )}
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
