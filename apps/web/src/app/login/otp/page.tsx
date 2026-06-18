'use client';

import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { useState } from 'react';
import { useT } from '../../../i18n';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

type Step = 'phone' | 'otp';

/**
 * Path A login (§20.6.1) — phone + SMS OTP for field roles. Step 1 requests an
 * OTP via the backend (`POST /auth/otp/request`); step 2 submits {phoneNumber,
 * otp} to the next-auth `otp` credentials provider, which verifies against the
 * backend and issues the Keycloak-signed session.
 */
export default function OtpLoginPage() {
  const t = useT();
  const [step, setStep] = useState<Step>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
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
      setStep('otp');
    } catch {
      setError(t('auth.otp.requestError'));
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await signIn('otp', {
      phoneNumber,
      otp,
      redirect: false,
    });
    setSubmitting(false);
    if (!result || result.error) {
      setError(t('auth.otp.verifyError'));
      return;
    }
    window.location.assign('/post-login');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-center text-xl font-bold text-gray-800">{t('auth.otp.title')}</h1>

        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {step === 'phone' ? (
          <form onSubmit={requestOtp} className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              {t('auth.otp.phoneLabel')}
              <input
                type="tel"
                required
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder={t('auth.otp.phonePlaceholder')}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {t('auth.otp.requestButton')}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="space-y-4">
            <p className="text-sm text-green-600">{t('auth.otp.sent')}</p>
            <label className="block text-sm font-medium text-gray-700">
              {t('auth.otp.otpLabel')}
              <input
                type="text"
                inputMode="numeric"
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={6}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 tracking-widest focus:border-blue-500 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {t('auth.otp.verifyButton')}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link href="/login" className="text-sm text-blue-600 hover:underline">
            {t('auth.otp.backToOffice')}
          </Link>
        </div>
      </div>
    </main>
  );
}
