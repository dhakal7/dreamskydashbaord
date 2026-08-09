import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { MobileNav } from './mobile-nav'
import { CommandPalette } from './command-palette'
import { PageLoader } from '@/components/shared/page-loader'

export function AppShell() {
  return (
    <div className="flex h-svh w-full overflow-hidden bg-background text-foreground">
      <div className="hidden lg:flex">
        <Sidebar />
      </div>
      <MobileNav />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6">
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      <Toaster
        position="top-right"
        toastOptions={{
          className: 'rounded-lg border border-border bg-card text-card-foreground shadow-elevated text-sm',
        }}
      />
      <CommandPalette />
    </div>
  )
}
