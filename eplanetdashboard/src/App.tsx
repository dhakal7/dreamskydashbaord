import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/app/router'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { queryClient } from '@/lib/query-client'

function App() {
  const restoreSession = useAuthStore((state) => state.restoreSession)

  useEffect(() => {
    document.documentElement.lang = 'en'
    document.documentElement.setAttribute('data-theme', 'default')
    // Rehydrate real-mode JWT session on page reload.
    // In mock mode this is a no-op (returns immediately).
    restoreSession()
  }, [restoreSession])

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

export default App
