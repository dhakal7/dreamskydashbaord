import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Command, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useUIStore } from '@/store/ui-store'
import { cn } from '@/lib/utils'

const quickActions = [
  { id: 'students', label: 'Open students', path: '/students', shortcut: 'G S' },
  { id: 'leads', label: 'Open leads', path: '/leads', shortcut: 'G L' },
  { id: 'reports', label: 'Open reports', path: '/reports', shortcut: 'G R' },
  { id: 'settings', label: 'Open settings', path: '/settings', shortcut: 'G , ' },
  { id: 'website', label: 'Open public website', path: '/website', shortcut: 'G W' },
]

export function CommandPalette() {
  const navigate = useNavigate()
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen)
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!commandPaletteOpen) setQuery('')
  }, [commandPaletteOpen])

  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setCommandPaletteOpen(true)
      }
      if (event.key === 'Escape') setCommandPaletteOpen(false)
    }

    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [setCommandPaletteOpen])

  const filteredActions = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return quickActions
    return quickActions.filter((action) => action.label.toLowerCase().includes(value))
  }, [query])

  function runAction(path: string) {
    setCommandPaletteOpen(false)
    navigate(path)
  }

  return (
    <Dialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <DialogContent className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">Search key workflows and jump to any module quickly.</DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Jump to a module..."
            className="h-auto border-0 px-0 shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center gap-1 rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <Command className="size-3" />
            <span>⇧P</span>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          <div className="space-y-1">
            {filteredActions.map((action) => (
              <button
                key={action.id}
                onClick={() => runAction(action.path)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
              >
                <span className="font-medium">{action.label}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{action.shortcut}</span>
                  <ArrowRight className="size-3.5" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
