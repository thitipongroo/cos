'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { useState } from 'react';
import { I18nProvider as AriaI18nProvider } from 'react-aria-components';
import { I18nProvider, useI18n } from '../i18n';
import { toBcp47 } from '../lib/locale';
import { isTrialReadOnlyError, TRIAL_READ_ONLY_EVENT } from '../lib/trial';

/**
 * Feeds the app's locale to React Aria as a BCP-47 tag.
 *
 * React Aria formats dates, numbers and collator-based type-ahead from this, and picks the writing
 * direction from it. It must sit *inside* the app's own I18nProvider, since that is what owns the
 * current locale; and the widening matters — React Aria given a bare `th` would not resolve the
 * `buddhist` calendar that `th-TH` does, so Thai users would see Gregorian years (QM-3).
 */
function AriaLocaleBridge({ children }: { children: React.ReactNode }) {
  const { locale } = useI18n();
  return <AriaI18nProvider locale={toBcp47(locale)}>{children}</AriaI18nProvider>;
}

/**
 * Client-side providers shared by all pages:
 *  - SessionProvider: next-auth session (role/tenant claims) for RBAC in the shell
 *  - QueryClientProvider: React Query for data fetching/caching (master Phase 10 stack)
 *  - I18nProvider: th/en localization (QM-3)
 *  - AriaLocaleBridge: the same locale, in the form React Aria needs (spec §20.8)
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    // §7.10: a save refused because the trial ended (403 COS-PLAN-003) is handled once, here, for every mutation
    // in the app: the tenant is re-read so every page hides its write actions (useReadOnly) and the banner turns
    // read-only, and the banner is told a save just failed so it can say so in place of a generic error.
    const client: QueryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      mutationCache: new MutationCache({
        onError: (error) => {
          if (!isTrialReadOnlyError(error)) return;
          void client.invalidateQueries({ queryKey: ['tenant', 'me'] });
          window.dispatchEvent(new CustomEvent(TRIAL_READ_ONLY_EVENT));
        },
      }),
    });
    return client;
  });

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <AriaLocaleBridge>{children}</AriaLocaleBridge>
        </I18nProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
