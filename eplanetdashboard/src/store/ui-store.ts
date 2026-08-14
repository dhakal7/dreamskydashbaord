import { create } from 'zustand'

type Theme = 'light' | 'dark'

interface UIState {
  theme: Theme
  toggleTheme: () => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem('dreamsky-theme') as Theme | null
  if (stored) return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return

  // Temporarily disable all CSS transitions to eliminate switching latency and lag
  const disableTransitions = document.createElement('style')
  disableTransitions.appendChild(
    document.createTextNode(
      '*, *::before, *::after { -webkit-transition: none !important; -moz-transition: none !important; -o-transition: none !important; -ms-transition: none !important; transition: none !important; }'
    )
  )
  document.head.appendChild(disableTransitions)

  document.documentElement.classList.toggle('dark', theme === 'dark')
  window.localStorage.setItem('dreamsky-theme', theme)

  // Force synchronous reflow so theme colors apply instantly
  void document.body.offsetHeight

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (document.head.contains(disableTransitions)) {
        document.head.removeChild(disableTransitions)
      }
    })
  })
}

const initialTheme = getInitialTheme()
if (typeof document !== 'undefined') applyTheme(initialTheme)

export const useUIStore = create<UIState>((set, get) => ({
  theme: initialTheme,
  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light'
    applyTheme(next)
    set({ theme: next })
  },
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  mobileNavOpen: false,
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
}))
