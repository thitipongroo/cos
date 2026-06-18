'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { useState } from 'react';
import { I18nProvider } from '../i18n';

/**
 * Client-side providers shared by all pages:
 *  - SessionProvider: next-auth session (role/tenant claims) for RBAC in the shell
 *  - QueryClientProvider: React Query for data fetching/caching (master Phase 10 stack)
 *  - I18nProvider: th/en localization (QM-3)
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      }),
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>{children}</I18nProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
