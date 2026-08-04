'use client';

import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { landingFor } from '../../lib/auth/roles';

const NODE_ID = 'OS_VAULT_04';
const ENCRYPTION = 'AES-256-GCM';
const VERSION = 'v2.4.102-STABLE';

/**
 * Post-login role router (§20.6.1 "post-login routing"). Both auth paths return here; we resolve the
 * role's landing page from the session claim and replace the history entry.
 *
 * While the session resolves this renders the "securing session" loader from
 * mockup/desktop/imp_001_authen/04_verification_loading_web — top bar + hex-shield card with a progress readout + technical
 * metadata + terminal footer. The metadata (node id, encryption, version) are static labels.
 */
export default function PostLoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const t = useT();
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    // Cosmetic progress climb (caps below 100 — the redirect fires when the session resolves).
    const id = setInterval(() => {
      setProgress((p) => (p >= 92 ? 92 : p + Math.floor(Math.random() * 6) + 1));
    }, 450);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (status === 'loading') {
      return;
    }
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    router.replace(landingFor(session?.user?.role));
  }, [status, session, router]);

  return (
    <div className="flex min-h-screen flex-col bg-cos-navy text-white">
      {/* Top bar */}
      <header className="flex h-16 items-center justify-between px-6 md:px-12">
        <Image
          src="/icons/logo-light.png"
          alt={t('common.appName')}
          width={160}
          height={27}
          priority
          className="h-auto w-[150px] opacity-90"
        />
        <span className="flex items-center gap-1.5 text-tiny font-bold uppercase tracking-widest text-slate-400">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" strokeLinecap="round" />
            <path d="M12 17h.01" strokeLinecap="round" />
          </svg>
          {t('auth.loading.helpCenter')}
        </span>
      </header>

      {/* Card */}
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-lg rounded-xl border border-white/10 bg-slate-900/70 p-10 shadow-2xl">
          <div className="mb-8 flex flex-col items-center">
            {/* Project logo mark — white box (matches the email/password screen). The mockup uses a
                shield here; this app brands it with the COS logomark per product-owner request. */}
            <div className="h-[72px] w-[72px] overflow-hidden rounded-2xl bg-white">
              <Image
                src="/icons/icon-512.png"
                alt={t('common.appName')}
                width={72}
                height={72}
                priority
                className="h-full w-full object-contain"
              />
            </div>
          </div>

          <div className="mb-8 space-y-2 text-center">
            <h1 className="text-h1 font-bold text-white">{t('auth.loading.title')}</h1>
            <div className="flex items-center justify-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cos-cyan" />
              <p className="text-tiny uppercase tracking-[0.2em] text-slate-400">
                {t('auth.loading.inProgress')}
              </p>
            </div>
          </div>

          <div className="space-y-4 border-t border-white/10 pt-6">
            <div className="flex items-end justify-between">
              <span className="text-tiny font-bold uppercase tracking-widest text-cos-cyan">
                {t('auth.loading.status')}
              </span>
              <span className="font-mono text-tiny tabular-nums text-slate-400">{progress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-cos-cyan transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <p className="text-[9px] uppercase tracking-tighter text-slate-400">
                  {t('auth.loading.encryption')}
                </p>
                <p className="font-mono text-tiny text-slate-300">{ENCRYPTION}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] uppercase tracking-tighter text-slate-400">
                  {t('auth.loading.nodeId')}
                </p>
                <p className="font-mono text-tiny text-slate-300">{NODE_ID}</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Terminal footer */}
      <footer className="px-6 py-6 md:px-12">
        <div className="mx-auto flex max-w-5xl items-center justify-between opacity-50">
          <span className="flex items-center gap-2 font-mono text-tiny text-slate-400">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="m7 9 3 3-3 3M13 15h4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t('auth.loading.rootCert')}
          </span>
          <span className="font-mono text-tiny text-slate-400">{VERSION}</span>
        </div>
      </footer>
    </div>
  );
}
