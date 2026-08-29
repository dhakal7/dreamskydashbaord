import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,          // 30s — refresh more often for live data
      refetchOnWindowFocus: false,
      retry: 1,                   // auto-retry once on failure (network hiccup / slow DB)
      retryDelay: 2_000,          // wait 2s before retry
    },
  },
})
