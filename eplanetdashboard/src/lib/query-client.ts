import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,          // 30s — mark data stale after 30s
      refetchOnWindowFocus: true, // re-fetch when user switches back to the tab
      refetchOnMount: true,       // re-fetch when component mounts (navigate back)
      retry: 1,                   // auto-retry once on failure (network hiccup / slow DB)
      retryDelay: 2_000,          // wait 2s before retry
    },
  },
})
