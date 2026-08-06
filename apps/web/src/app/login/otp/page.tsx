'use client';

import { signIn } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { otpVerifySchema } from '@cos/schemas';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../../../i18n';
import { LanguageSwitcher } from '../../../components/shell/LanguageSwitcher';
import { COUNTRIES, DEFAULT_COUNTRY_ISO2, findCountry, toE164 } from '../../../lib/countries';
import { useValidatedForm } from '../../../lib/forms';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

const OTP_LENGTH = 6;
const OTP_EXPIRY_SECONDS = 300; // OTP TTL 5 minutes (master Phase 2)
const RESEND_COOLDOWN_SECONDS = 45;

const SWITCHER_DARK =
  'rounded border border-white/10 bg-white/5 px-2.5 py-1 text-tiny font-bold uppercase text-slate-300 hover:bg-white/10';

/**
 * Path A OTP verification (§20.6.1) — mockup/desktop/imp_001_authen/02_login_otp_verification_web. The phone-entry step now lives on
 * the landing (/login), which requests the passcode and hands off here with `?cc=<iso2>&n=<national>`.
 * A direct visit without those params has no phone in flight, so we bounce back to /login. Wiring is
 * unchanged: `POST /auth/otp/request` for resend + the next-auth `otp` credentials provider.
 */
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

function formatMMSS(total: number): string {
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function OtpVerifyPage() {
  const t = useT();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [countryIso2, setCountryIso2] = useState(DEFAULT_COUNTRY_ISO2);
  const [nationalNumber, setNationalNumber] = useState('');
  const [digits, setDigits] = useState<string[]>(() => Array<string>(OTP_LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expiry, setExpiry] = useState(OTP_EXPIRY_SECONDS);
  const [resendIn, setResendIn] = useState(RESEND_COOLDOWN_SECONDS);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  // The passcode is requested on the landing; arrive here with the phone in the query. Without it
  // there is nothing to verify, so send the user back to /login to enter their number.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cc = params.get('cc');
    const n = params.get('n');
    if (cc && n && COUNTRIES.some((c) => c.iso2 === cc)) {
      setCountryIso2(cc);
      setNationalNumber(n);
      setReady(true);
    } else {
      router.replace('/login');
    }
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      setExpiry((s) => (s > 0 ? s - 1 : 0));
      setResendIn((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [ready]);

  const country = findCountry(countryIso2);
  const phoneNumber = toE164(country.dialCode, nationalNumber);
  const otp = digits.join('');
  // Parenthesised dial code per §20.5, so the masked form matches the shape used everywhere a full
  // number is shown. The number itself stays masked and therefore ungrouped — hyphenating digits
  // that are hidden would imply a grouping the reader cannot check.
  const maskedPhone = `(${country.dialCode}) •••• ${nationalNumber.slice(-4)}`;

  // The six boxes stay as they are — one-character inputs with their own paste and arrow-key
  // handling. react-hook-form holds the joined result, so the "six digits" rule lives in the
  // schema with every other rule, behind the same kill switch, rather than only in the
  // button's disabled state where a screen-reader user never learns why it will not submit.
  const {
    handleSubmit,
    formState: { errors },
  } = useValidatedForm({
    schema: otpVerifySchema,
    values: { phoneNumber, otp },
  });

  async function resendOtp(): Promise<void> {
    if (resendIn > 0 || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/otp/request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });
      if (!res.ok) {
        setError(t('auth.otp.requestError'));
        return;
      }
      setDigits(Array<string>(OTP_LENGTH).fill(''));
      setExpiry(OTP_EXPIRY_SECONDS);
      setResendIn(RESEND_COOLDOWN_SECONDS);
      inputsRef.current[0]?.focus();
    } catch {
      setError(t('auth.otp.requestError'));
    } finally {
      setSubmitting(false);
    }
  }

  const verifyOtp = handleSubmit(async (values) => {
    setError(null);
    setSubmitting(true);
    const result = await signIn('otp', {
      phoneNumber: values.phoneNumber,
      otp: values.otp,
      redirect: false,
    });
    setSubmitting(false);
    if (!result || result.error) {
      setError(t('auth.otp.verifyError'));
      return;
    }
    window.location.assign('/post-login');
  });

  function setDigit(index: number, value: string): void {
    const clean = value.replace(/\D/g, '');
    setDigits((prev) => {
      const next = [...prev];
      next[index] = clean.slice(-1);
      return next;
    });
    if (clean && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function onDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>): void {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = Array<string>(OTP_LENGTH).fill('');
    for (let i = 0; i < pasted.length; i += 1) next[i] = pasted[i];
    setDigits(next);
    inputsRef.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  }

  // Hold render until the phone is resolved from the query (or the redirect kicks in).
  if (!ready) {
    return <div className="min-h-screen bg-cos-navy" />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-cos-navy text-white">
      {/* Top bar */}
      <header className="flex h-16 items-center justify-between border-b border-white/10 px-6 md:px-12">
        <Image
          src="/icons/logo-light.png"
          alt={t('common.appName')}
          width={180}
          height={30}
          priority
          className="h-auto w-[150px] sm:w-[180px]"
        />
        <div className="flex items-center gap-4">
          <LanguageSwitcher className={SWITCHER_DARK} />
          <span className="hidden text-tiny font-bold uppercase tracking-widest text-slate-400 sm:inline">
            {t('auth.login.support')}
          </span>
          <span className="hidden items-center gap-1.5 text-tiny font-bold uppercase tracking-widest text-slate-400 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {t('auth.login.systemStatus')}
          </span>
        </div>
      </header>

      {/* Card */}
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <form
          onSubmit={verifyOtp}
          noValidate
          className="w-full max-w-md rounded-xl border border-white/10 bg-slate-900 p-8 shadow-2xl"
        >
          {/* Project logo mark — white box (matches the email/password screen) */}
          <div className="mb-6 flex justify-center">
            <div className="h-[72px] w-[72px] overflow-hidden rounded-2xl bg-white">
              <Image
                src="/icons/icon-512.png"
                alt={t('common.appName')}
                width={72}
                height={72}
                className="h-full w-full object-contain"
              />
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-body text-red-300"
            >
              {error}
            </div>
          )}

          <div className="text-center">
            <h1 className="text-h1 font-bold text-white">{t('auth.otp.verifyTitle')}</h1>
            <p className="mx-auto mt-2 max-w-[300px] text-body text-slate-400">
              {t('auth.otp.verifySubtitle')}{' '}
              <span className="font-mono text-cos-cyan">{maskedPhone}</span>
            </p>
          </div>

          {/* role="group" with a name: without it a screen reader announces six unlabelled
              one-character text boxes and never says what they are collectively for. */}
          <div
            role="group"
            aria-label={t('auth.otp.verifyTitle')}
            aria-describedby={errors.otp ? 'otp-error' : undefined}
            className="mt-8 grid grid-cols-6 gap-2 sm:gap-3"
          >
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputsRef.current[i] = el;
                }}
                data-testid={`otp-input-${i}`}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={1}
                value={digit}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onDigitKeyDown(i, e)}
                onPaste={onPaste}
                className="h-14 w-full rounded-lg border border-white/10 bg-slate-800 text-center text-h1 font-bold text-white focus:border-cos-cyan focus:outline-none focus:ring-2 focus:ring-cos-blue/40"
              />
            ))}
          </div>

          {errors.otp ? (
            <p id="otp-error" role="alert" className="mt-3 text-small text-red-400">
              {t(errors.otp.message ?? '')}
            </p>
          ) : null}

          <div className="mt-8 space-y-3">
            <button
              data-testid="verify-otp-button"
              type="submit"
              disabled={submitting}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-cos-blue font-semibold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {t('auth.otp.verifyButton')}
              <ArrowRightIcon />
            </button>
            <button
              type="button"
              onClick={resendOtp}
              disabled={resendIn > 0 || submitting}
              className="w-full py-1 text-center text-tiny font-bold uppercase tracking-widest text-slate-400 transition-colors hover:text-white disabled:text-slate-600"
            >
              {t('auth.otp.resendCode')}
              {resendIn > 0 ? ` (${resendIn}s)` : ''}
            </button>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-5 text-small text-slate-400">
            <span>
              {t('auth.otp.expiresIn')}{' '}
              <span className="font-mono text-amber-400">{formatMMSS(expiry)}</span>
            </span>
            <span className="text-tiny font-bold uppercase tracking-widest text-emerald-400">
              {t('auth.otp.aesActive')}
            </span>
          </div>
          <p className="mt-4 text-small leading-snug text-slate-400">
            {t('auth.otp.securityNote')}
          </p>

          <div className="mt-8 text-center">
            <Link
              href="/login"
              className="text-small text-slate-400 transition-colors hover:text-white hover:underline"
            >
              {t('auth.otp.backToOffice')}
            </Link>
          </div>
        </form>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-5 md:px-12">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-tiny font-bold uppercase tracking-widest text-slate-400">
            {t('auth.login.copyright')} · {t('auth.login.footerUnit')}
          </p>
          <div className="flex gap-6">
            <span className="text-tiny font-bold uppercase tracking-widest text-slate-400">
              {t('auth.login.termsOfService')}
            </span>
            <span className="text-tiny font-bold uppercase tracking-widest text-slate-400">
              {t('auth.login.privacyPolicy')}
            </span>
            <span className="text-tiny font-bold uppercase tracking-widest text-slate-400">
              {t('auth.login.systemStatus')}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
