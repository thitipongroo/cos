'use client';

// Trust Center (public, unauthenticated) — PO decision 2026-08-03.
//
// Why this page exists. A privacy notice that names specific security controls is a representation:
// the FTC has treated unimplemented security claims as deceptive (D-Link), and its guidance is to
// describe controls in "general but useful terms" in the notice itself. The industry answer — the
// pattern behind Vanta/Drata trust centres — is to split the two: the notice stays general, and the
// evidence (certificate numbers, validation dates, sub-processors, what is NOT yet in place) lives
// on a page like this one. That is exactly what the mobile Privacy Policy now does; the HSM detail
// the mockup wanted to assert is here, with its certificate, rather than as a bare claim there.
//
// Every row below is sourced from the control registers in docs/registers/. When a control is not
// implemented it says so — the value of this page is that a reader can check it. Do not add a row
// here that cannot be pointed at a file, a certificate, or a published third-party fact.
//
// Route is public: `trust` is in the middleware matcher's exclusion list alongside login/health.

import { useT } from '../../i18n';
import { LanguageSwitcher } from '../../components/shell/LanguageSwitcher';

const SWITCHER_DARK =
  'rounded border border-white/10 bg-white/5 px-2.5 py-1 text-tiny font-bold uppercase text-slate-300 hover:bg-white/10';

/** NIST CMVP certificate for the AWS KMS HSM that holds our data-encryption keys.
 *  Verified against the CMVP register 2026-08-03: FIPS 140-3, Overall Level 3, validated
 *  2024-11-18, Active with a sunset of 2026-11-17. The sunset is shown deliberately — a
 *  certificate-backed claim that outlives its certificate is the failure mode this page prevents. */
const KMS_CMVP_URL =
  'https://csrc.nist.gov/projects/cryptographic-module-validation-program/certificate/4884';

/** Date the control rows below were last checked against the implementation. Rendered as an ISO
 *  date rather than a localised one on purpose: this is an audit fact, and the web `useT` has no
 *  interpolation, so a locale-formatted date cannot be composed inside the sentence anyway. */
const VERIFIED_ON = '2026-08-03';

type Status = 'live' | 'partial' | 'planned';

const STATUS_STYLE: Record<Status, string> = {
  live: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
  partial: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  planned: 'bg-slate-500/10 text-slate-300 ring-slate-500/30',
};

interface Control {
  key: string;
  status: Status;
  /** Rendered verbatim (certificate ids, protocol versions) — not translated. */
  detail?: string;
  href?: string;
}

const CONTROLS: readonly Control[] = [
  {
    key: 'keys',
    status: 'live',
    detail: 'FIPS 140-3 Level 3 · NIST CMVP #4884',
    href: KMS_CMVP_URL,
  },
  { key: 'atRest', status: 'live', detail: 'AES-256 · SSE-KMS, customer-managed key' },
  { key: 'fieldLevel', status: 'live', detail: 'AES-256-GCM' },
  { key: 'inTransit', status: 'live', detail: 'TLS 1.3' },
  { key: 'isolation', status: 'live', detail: 'PostgreSQL row-level security' },
  { key: 'mesh', status: 'planned' },
  { key: 'logRedaction', status: 'planned' },
  { key: 'subjectRights', status: 'planned' },
  { key: 'breach', status: 'planned' },
];

const CERTIFICATIONS = ['soc2', 'iso27001', 'pdpa'] as const;

const SUBPROCESSORS = [
  { key: 'aws', region: 'Tenant home region' },
  { key: 'awsSns', region: 'ap-southeast-1' },
  { key: 'openai', region: 'USA' },
  { key: 'cloudflare', region: 'Global edge' },
] as const;

function StatusPill({ status, label }: { status: Status; label: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-tiny font-bold uppercase ring-1 ${STATUS_STYLE[status]}`}
    >
      {label}
    </span>
  );
}

export default function TrustCenterPage() {
  const t = useT();

  return (
    <div className="flex min-h-screen flex-col bg-cos-navy text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <span className="text-h3 font-bold tracking-tight">{t('trust.brand')}</span>
        <LanguageSwitcher className={SWITCHER_DARK} />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-h1 font-bold tracking-tight">{t('trust.title')}</h1>
        <p className="mt-3 text-body leading-relaxed text-slate-300">{t('trust.intro')}</p>
        <p className="mt-2 text-small text-slate-400">
          {t('trust.verifiedOn')} <time dateTime={VERIFIED_ON}>{VERIFIED_ON}</time>
        </p>

        {/* Controls */}
        <section className="mt-10">
          <h2 className="text-h2 font-semibold">{t('trust.controls.heading')}</h2>
          <p className="mt-2 text-small text-slate-400">{t('trust.controls.note')}</p>
          <ul className="mt-4 divide-y divide-white/10 rounded-lg border border-white/10">
            {CONTROLS.map((c) => (
              <li key={c.key} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start">
                <div className="flex-1">
                  <p className="text-body font-medium">{t(`trust.controls.${c.key}.label`)}</p>
                  <p className="mt-1 text-small leading-relaxed text-slate-400">
                    {t(`trust.controls.${c.key}.detail`)}
                  </p>
                  {c.detail ? (
                    c.href ? (
                      <a
                        href={c.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-1 inline-block text-small font-medium text-cos-cyan underline underline-offset-2"
                      >
                        {c.detail}
                      </a>
                    ) : (
                      <p className="mt-1 font-mono text-tiny text-slate-500">{c.detail}</p>
                    )
                  ) : null}
                </div>
                <StatusPill status={c.status} label={t(`trust.status.${c.status}`)} />
              </li>
            ))}
          </ul>
        </section>

        {/* Certifications */}
        <section className="mt-10">
          <h2 className="text-h2 font-semibold">{t('trust.certs.heading')}</h2>
          <p className="mt-2 text-small text-slate-400">{t('trust.certs.note')}</p>
          <ul className="mt-4 space-y-2">
            {CERTIFICATIONS.map((c) => (
              <li
                key={c}
                className="flex items-start justify-between gap-3 rounded-lg border border-white/10 p-4"
              >
                <div>
                  <p className="text-body font-medium">{t(`trust.certs.${c}.label`)}</p>
                  <p className="mt-1 text-small text-slate-400">{t(`trust.certs.${c}.detail`)}</p>
                </div>
                <StatusPill status="planned" label={t('trust.status.planned')} />
              </li>
            ))}
          </ul>
        </section>

        {/* Sub-processors */}
        <section className="mt-10">
          <h2 className="text-h2 font-semibold">{t('trust.subprocessors.heading')}</h2>
          <p className="mt-2 text-small text-slate-400">{t('trust.subprocessors.note')}</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-left text-small">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t('trust.subprocessors.colName')}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t('trust.subprocessors.colPurpose')}
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    {t('trust.subprocessors.colRegion')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {SUBPROCESSORS.map((s) => (
                  <tr key={s.key} className="border-b border-white/5">
                    <td className="py-3 pr-4 font-medium">
                      {t(`trust.subprocessors.${s.key}.name`)}
                    </td>
                    <td className="py-3 pr-4 text-slate-400">
                      {t(`trust.subprocessors.${s.key}.purpose`)}
                    </td>
                    <td className="py-3 font-mono text-tiny text-slate-500">{s.region}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Residency */}
        <section className="mt-10">
          <h2 className="text-h2 font-semibold">{t('trust.residency.heading')}</h2>
          <p className="mt-2 text-body leading-relaxed text-slate-300">
            {t('trust.residency.body')}
          </p>
        </section>

        <p className="mt-12 border-t border-white/10 pt-6 text-small leading-relaxed text-slate-400">
          {t('trust.footer')}
        </p>
      </main>
    </div>
  );
}
