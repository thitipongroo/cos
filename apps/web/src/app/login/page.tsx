'use client';

import { otpPhoneSchema } from '@cos/schemas';
import { signIn } from 'next-auth/react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Controller } from 'react-hook-form';
import { useT } from '../../i18n';
import { LanguageSwitcher } from '../../components/shell/LanguageSwitcher';
import {
  COUNTRIES,
  DEFAULT_COUNTRY_ISO2,
  countryFromLocale,
  findCountry,
  toE164,
} from '../../lib/countries';
import { useValidatedForm } from '../../lib/forms';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

const SWITCHER_DARK =
  'rounded border border-white/10 bg-white/5 px-2.5 py-1 text-tiny font-bold uppercase text-slate-300 hover:bg-white/10';

/**
 * Login landing (§20.6.1). Visual layout mirrors mockup/00_login_flow/web/01: the auth card leads
 * with Path A (field worker phone → SMS OTP) as the primary action and Path B (office/management via
 * Keycloak OIDC) as the secondary. Sending a passcode requests the OTP and hands off to /login/otp's
 * verify step (phone carried in the query). Path B still delegates to Keycloak's hosted page (QM-4).
 *
 * `useSearchParams()` forces CSR and must sit inside a <Suspense> boundary or `next build` fails the
 * static export ("missing-suspense-with-csr-bailout"). The reader lives in LoginContent.
 */
function MailIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 text-cos-blue"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 text-cos-blue"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3 4 6v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function HubIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 text-cos-blue"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="6" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="m7 7 3 3m4 0 3-3M7 17l3-3m4 0 3 3" />
    </svg>
  );
}

function LoginContent() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasError = searchParams.get('error') !== null;

  // The country stays outside the form: it is never submitted on its own, it only decides which
  // dial code the typed digits compose with.
  const [countryIso2, setCountryIso2] = useState(DEFAULT_COUNTRY_ISO2);
  const [nationalNumber, setNationalNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCountryIso2(countryFromLocale(navigator.language));
  }, []);

  const country = findCountry(countryIso2);

  // What is validated is the composed E.164 number, not the raw digits — that is what the API
  // receives, and "is this a usable phone number" is a question about the whole thing.
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useValidatedForm({ schema: otpPhoneSchema, defaultValues: { phoneNumber: '' } });

  const onNationalNumberChange = (digits: string) => {
    setNationalNumber(digits);
    setValue('phoneNumber', toE164(country.dialCode, digits), { shouldValidate: true });
  };

  const onCountryChange = (iso2: string) => {
    setCountryIso2(iso2);
    setValue('phoneNumber', toE164(findCountry(iso2).dialCode, nationalNumber), {
      shouldValidate: true,
    });
  };

  const sendPasscode = handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/otp/request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phoneNumber: values.phoneNumber }),
      });
      if (!res.ok) {
        setError(t('auth.otp.requestError'));
        return;
      }
      // Hand off to the verify step; /login/otp reads these and starts at the OTP entry.
      router.push(`/login/otp?cc=${countryIso2}&n=${encodeURIComponent(nationalNumber)}`);
    } catch {
      setError(t('auth.otp.requestError'));
    }
  });

  return (
    <div className="flex min-h-screen flex-col bg-cos-navy text-white">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-cos-navy/80 px-6 backdrop-blur-md md:px-12">
        <Image
          src="/icons/logo-light.png"
          alt={t('common.appName')}
          width={180}
          height={30}
          priority
          className="h-auto w-[150px] sm:w-[180px]"
        />
        <div className="flex items-center gap-3">
          <LanguageSwitcher className={SWITCHER_DARK} />
          {/* Cloud-sync pill (mockup) — hidden on narrow so it never crowds the wordmark. */}
          <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="text-tiny font-bold uppercase tracking-widest text-emerald-400">
              {t('auth.login.cloudSyncActive')}
            </span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center gap-16 px-6 py-16 lg:flex-row lg:gap-24 lg:px-12">
        {/* Hero */}
        <section className="hidden flex-1 flex-col gap-6 lg:flex">
          {/* Wordmark lockup box */}
          <div className="mb-2 w-full max-w-xl rounded-xl border border-white/10 bg-slate-900/60 p-8">
            <Image
              src="/icons/logo-light.png"
              alt={t('common.appName')}
              width={520}
              height={92}
              priority
              className="h-auto w-full"
            />
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white xl:text-5xl">
            {t('auth.login.headline')}
          </h1>
          <p className="max-w-lg text-lg text-slate-400">{t('auth.login.subtitle')}</p>
          <div className="mt-2 flex gap-4">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2">
              <ShieldIcon />
              <span className="text-tiny font-bold uppercase tracking-widest text-slate-400">
                {t('auth.login.badgeEnterprise')}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2">
              <HubIcon />
              <span className="text-tiny font-bold uppercase tracking-widest text-slate-400">
                {t('auth.login.badgeNetwork')}
              </span>
            </div>
          </div>
        </section>

        {/* Auth card */}
        <section className="w-full max-w-md rounded-xl border border-white/10 bg-slate-900 p-8 shadow-2xl sm:p-10">
          <div className="mb-8">
            <h2 className="text-h1 font-bold text-white">{t('auth.login.cardTitle')}</h2>
            <p className="mt-2 text-body text-slate-400">{t('auth.login.credentialsSubtitle')}</p>
          </div>

          {(hasError || error) && (
            <div
              role="alert"
              className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-body text-red-300"
            >
              {error ?? t('auth.login.error')}
            </div>
          )}

          {/* Path A — field worker (phone → SMS OTP), primary */}
          {/* Keeps the §32.7 Exception 1 pre-auth styling rather than adopting the generic field
              components — this surface is deliberately branded. What changes is the wiring: the
              label now points at the input, and the schema's message is announced. */}
          <form onSubmit={sendPasscode} noValidate className="space-y-4">
            <label
              htmlFor="login-phone"
              className="block text-tiny font-bold uppercase tracking-widest text-slate-400"
            >
              {t('auth.login.fieldAccess')}
            </label>
            <div className="flex gap-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-cos-navy pl-2 focus-within:border-cos-blue">
                <img
                  src={`/flags/${country.iso2}.svg`}
                  alt=""
                  aria-hidden="true"
                  className="h-4 w-6 shrink-0 rounded-sm object-cover"
                />
                <select
                  aria-label={t('auth.otp.countryLabel')}
                  value={countryIso2}
                  onChange={(e) => onCountryChange(e.target.value)}
                  className="bg-transparent py-3 pr-1 text-body text-white focus:outline-none"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.iso2} value={c.iso2} className="text-slate-900">
                      {c.dialCode}
                    </option>
                  ))}
                </select>
              </div>
              <Controller
                name="phoneNumber"
                control={control}
                render={({ field }) => (
                  <input
                    id="login-phone"
                    data-testid="landing-phone-input"
                    type="tel"
                    inputMode="tel"
                    value={nationalNumber}
                    onChange={(e) => onNationalNumberChange(e.target.value)}
                    onBlur={field.onBlur}
                    aria-invalid={errors.phoneNumber ? true : undefined}
                    aria-describedby={errors.phoneNumber ? 'login-phone-error' : undefined}
                    placeholder={t('auth.otp.phonePlaceholder')}
                    // placeholder:text-slate-400, not slate-500: slate-500 on --cos-navy measures
                    // 3.97:1, below the 4.5:1 floor (docs/a11y/contrast-report.md).
                    className="h-12 w-full rounded-lg border border-white/10 bg-cos-navy px-4 text-white placeholder:text-slate-400 focus:border-cos-blue focus:outline-none"
                  />
                )}
              />
            </div>
            {errors.phoneNumber ? (
              <p id="login-phone-error" role="alert" className="text-sm text-red-400">
                {t(errors.phoneNumber.message ?? '')}
              </p>
            ) : null}
            <button
              data-testid="send-passcode-button"
              type="submit"
              disabled={isSubmitting}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-cos-blue font-semibold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              <span>{t('auth.login.sendPasscode')}</span>
              <ArrowRightIcon />
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-4">
            <span className="h-px flex-grow bg-white/10" />
            <span className="text-tiny font-bold uppercase tracking-widest text-slate-400">
              {t('auth.login.or')}
            </span>
            <span className="h-px flex-grow bg-white/10" />
          </div>

          {/* Path B — office/management (email/password via Keycloak hosted page), secondary */}
          <button
            type="button"
            data-testid="office-login-button"
            onClick={() => signIn('keycloak', { callbackUrl: '/post-login' })}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/5 font-semibold text-white transition-colors hover:bg-white/10"
          >
            <MailIcon />
            <span>{t('auth.login.emailButton')}</span>
          </button>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-6 md:px-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex flex-col gap-1 text-center sm:text-left">
            <p className="text-tiny font-bold uppercase tracking-widest text-slate-400">
              {t('auth.login.copyright')}
            </p>
            <p className="text-tiny uppercase tracking-tight text-slate-400">
              {t('auth.login.footerUnit')}
            </p>
          </div>
          <div className="flex gap-6">
            <span className="text-tiny font-bold uppercase tracking-widest text-slate-400">
              {t('auth.login.securityPolicy')}
            </span>
            <span className="text-tiny font-bold uppercase tracking-widest text-slate-400">
              {t('auth.login.terms')}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-tiny font-bold uppercase tracking-widest text-slate-400">
                {t('auth.login.statusOperational')}
              </span>
            </div>
            <span className="rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-tiny text-slate-400">
              {t('auth.login.globalRegion')}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cos-navy" />}>
      <LoginContent />
    </Suspense>
  );
}
