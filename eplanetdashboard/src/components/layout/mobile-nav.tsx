import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useUIStore } from '@/store/ui-store'
import { Sidebar } from './sidebar'

export function MobileNav() {
  const open = useUIStore((s) => s.mobileNavOpen)
  const setOpen = useUIStore((s) => s.setMobileNavOpen)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[2px] animate-fade-in lg:hidden" />
        <DialogPrimitive.Content className="fixed left-0 top-0 z-50 h-full w-[260px] animate-slide-up bg-sidebar shadow-elevated lg:hidden">
          <DialogPrimitive.Title className="sr-only">Navigation menu</DialogPrimitive.Title>
          <DialogPrimitive.Close className="absolute right-3 top-3 z-10 rounded-md p-1.5 hover:bg-accent">
            <X className="size-4" />
          </DialogPrimitive.Close>
          <Sidebar mobile onNavigate={() => setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
