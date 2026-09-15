'use client';

/**
 * SYSTEM_ADMIN — System Settings (`/admin/settings`), the Stitch "System Settings - SYSTEM_ADMIN" screen
 * (630ea9023263…, HTML fetched 2026-09-15; revision R17, re-synced R18). The workspace only; the shell is <AdminShell /> (R10). The
 * drawing's own palette is Tailwind v3 slate / blue / green / amber / red / cyan, carried as `cos-v3-*`, plus two
 * one-off bands (`cos-op-set-head`, `cos-op-set-thead`).
 *
 * ── PRODUCT-OWNER DECISION D10 (2026-09-15): backend + screen, stored only, justification, audit ─────────────────────
 *   REAL — every editable value is GET / PUT /admin/settings (ADR-108): gateway names, URLs, protocol, max retries,
 *     cadence, failover TTL, auto-fallback, the safety non-suspension flag, the shared-tier window, the enterprise mode,
 *     broadcast lead time and channels, the shared-tenant cap, default max pool conns, and each tier's DB strategy,
 *     storage, API and token quotas. ACTIVE SHARED TENANTS and DEDICATED FLEET NODES are the live counts the same GET
 *     returns. LAST COMMIT is the stored time and who saved it. Save sends the whole
 *     document with the §6.7 justification and the version it was read at — a 409 means someone saved in between.
 *     Reset to defaults puts the "nothing set" document in the form; nothing is saved until Save.
 *   A VALUE IS NEVER INVENTED — every field starts blank ("not set") until an operator saves one; the drawing's
 *     figures (72 h, 5 retries, 250 cap, 50 GB …) are not defaults. The drawn select options are choices, not values.
 *   `—` — ACTIVE: n/n FEEDS (nothing connects to a gateway), the shared-tier "Active Window" chip, CLUSTER region,
 *     "All Isolated & Healthy", "PgBouncer Transaction Mode", SECURITY AUDIT STATE and its W3C line.
 *   CHANGED — the footer says every save is audited, which is true, in place of "Security Protocol Tier-4 Isolation
 *     Enforced", which nothing here establishes. The drawing's justification banner cites DESIGN.md §16.4; the
 *     justification mandate is §6.7, and no citation is drawn on the banner.
 *   STORED ONLY — nothing reads these values to change behaviour (ADR-108). R18 (the drawing as listed 2026-09-15):
 *     its CONFIG chip is gone and the header is only the two buttons, so the page no longer shows the stored version
 *     or a stored-only line under the header (product-owner decision D15); ADR-108 and the footer's audit line say it.
 */

import { adminJustificationSchema } from '@cos/schemas';
import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import {
  TIER_ORDER,
  applyCounts,
  capShare,
  countTexts,
  emptySettings,
  textOrNull,
  withStored,
} from '../../lib/adminSettings';
import {
  BROADCAST_CHANNELS,
  type BroadcastChannel,
  type PlanTier,
  type PlatformSettings,
  usePlatformSettings,
  useUpdatePlatformSettings,
} from '../../lib/api/adminSettings';
import { ApiError } from '../../lib/api/client';
import { formatDateTime, localeTag } from '../../lib/format';
import { LoadingState } from '../ui/LoadingState';
import { AdminIcon } from './AdminIcon';
import { NO_DATA } from './AdminShell';

const PANEL = 'overflow-hidden rounded-md border border-cos-v3-slate-700 bg-cos-v3-slate-800';
const PANEL_HEAD =
  'flex items-center justify-between border-b border-cos-v3-slate-700 bg-cos-op-set-head px-5 py-3.5';
const FIELD =
  'w-full rounded border border-cos-v3-slate-700 bg-cos-v3-slate-900 px-3 py-1.5 text-[13px] text-cos-white placeholder:text-cos-v3-slate-400/60 focus:border-cos-v3-blue-600 focus:outline-none';
const INVALID = '!border-cos-v3-red-600';
const BARE =
  'min-w-0 bg-transparent placeholder:text-cos-v3-slate-400/60 focus:outline-none focus:ring-1 focus:ring-cos-v3-blue-600 rounded-sm';

/** The drawn select choices — the value stored is the value shown; labels are i18n. */
const CADENCES = [
  'Daily 04:00 Asia/Bangkok',
  'Twice daily 04:00, 16:00 Asia/Bangkok',
  'Hourly',
] as const;
const CADENCE_KEY: Record<string, string> = {
  'Daily 04:00 Asia/Bangkok': 'daily',
  'Twice daily 04:00, 16:00 Asia/Bangkok': 'twice',
  Hourly: 'hourly',
};
const TTL_HOURS = [72, 48, 24] as const;
const ENTERPRISE_MODES = ['ZERO_DOWNTIME'] as const;

export function SystemSettings() {
  const { t, locale } = useI18n();
  const loaded = usePlatformSettings();
  const save = useUpdatePlatformSettings();
  const [draft, setDraft] = useState<PlatformSettings>(emptySettings);
  const [texts, setTexts] = useState<Record<string, string>>(() => countTexts(emptySettings()));
  const [justification, setJustification] = useState('');
  const [touched, setTouched] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [editing, setEditing] = useState<PlanTier | null>(null);
  const version = loaded.data?.version;
  const number = new Intl.NumberFormat(localeTag(locale));

  // Take the stored document into the form when it first arrives and after each save — keyed on the version, so a
  // background refetch of the same version never overwrites edits in progress. The version is the identity of the
  // stored document, so it is the only dependency.
  useEffect(() => {
    if (!loaded.data) return;
    setDraft(loaded.data.settings);
    setTexts(countTexts(loaded.data.settings));
    setInvalid([]);
  }, [version]);

  const reason = adminJustificationSchema.safeParse({ justification });
  const patch = (fn: (s: PlatformSettings) => void) =>
    setDraft((current) => {
      const next = structuredClone(current);
      fn(next);
      return next;
    });
  const setText = (path: string, value: string) => {
    setTexts((current) => ({ ...current, [path]: value }));
    setInvalid((current) => current.filter((p) => p !== path));
  };
  const bad = (path: string) => (invalid.includes(path) ? INVALID : '');

  const onSave = () => {
    setTouched(true);
    const applied = applyCounts(draft, texts);
    setInvalid(applied.invalid);
    if (!reason.success || applied.invalid.length > 0 || version === undefined) return;
    save.mutate(
      { version, justification: reason.data.justification, settings: applied.settings },
      {
        onSuccess: () => {
          setJustification('');
          setTouched(false);
          setEditing(null);
        },
      },
    );
  };
  const onReset = () => {
    const empty = emptySettings();
    setDraft(empty);
    setTexts(countTexts(empty));
    setInvalid([]);
  };
  const reload = () => {
    save.reset();
    void loaded.refetch().then((r) => {
      if (!r.data) return;
      setDraft(r.data.settings);
      setTexts(countTexts(r.data.settings));
      setInvalid([]);
    });
  };

  if (loaded.isLoading) {
    return (
      <div className="-m-6 flex-1 bg-cos-v3-slate-900 p-8">
        <LoadingState variant="widget" label={t('admin.settings.loading')} />
      </div>
    );
  }
  if (loaded.isError || !loaded.data) {
    const status = loaded.error instanceof ApiError ? loaded.error.status : undefined;
    return (
      <div className="-m-6 flex-1 bg-cos-v3-slate-900 p-8">
        <p role="alert" className="text-[13px] text-cos-v3-red-400">
          {t(settingsErrorKey(status))}
        </p>
      </div>
    );
  }

  const { counts, updated_at, updated_by } = loaded.data;
  const saveStatus = save.error instanceof ApiError ? save.error.status : undefined;
  const saveError = save.isError
    ? saveStatus === 409
      ? t('admin.settings.error.versionConflict')
      : t(settingsErrorKey(saveStatus))
    : undefined;
  const cap = applyCounts(draft, {
    'limits.shared_tenant_cap': texts['limits.shared_tenant_cap'] ?? '',
  }).settings.limits.shared_tenant_cap;
  const share = capShare(counts.shared_tenants, cap);
  const showReasonError = touched && !reason.success;

  return (
    <div className="-m-6 flex-1 bg-cos-v3-slate-900 p-8 text-cos-white">
      <div className="mx-auto max-w-[1140px] space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="sr-only">{t('admin.nav.settings')}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-2 rounded border border-cos-v3-slate-700 bg-cos-v3-slate-800 px-3.5 py-1.5 text-[13px] transition-colors hover:bg-cos-v3-slate-700"
            >
              <AdminIcon name="restart_alt" size={16} />
              <span>{t('admin.settings.reset')}</span>
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={save.isPending}
              className="flex items-center gap-2 rounded bg-cos-v3-blue-600 px-4 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-cos-v3-blue-600/90 disabled:opacity-60"
            >
              {save.isPending ? (
                <LoadingState variant="micro" />
              ) : (
                <AdminIcon name="save" size={16} />
              )}
              <span>{t('admin.settings.save')}</span>
            </button>
          </div>
        </div>

        {saveError ? (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded border border-cos-v3-red-600/30 bg-cos-v3-red-600/10 px-4 py-2 text-[13px] text-cos-v3-red-400"
          >
            <span>{saveError}</span>
            {saveStatus === 409 ? (
              <button
                type="button"
                onClick={reload}
                className="font-semibold text-cos-white underline"
              >
                {t('admin.settings.reload')}
              </button>
            ) : null}
          </div>
        ) : null}
        {save.isSuccess ? (
          <p role="status" className="text-[12px] text-cos-v3-green-600">
            {t('admin.settings.saved')}
          </p>
        ) : null}

        <div className="flex items-start gap-4 rounded-md border border-l-4 border-cos-v3-slate-700 border-l-cos-v3-blue-600 bg-cos-v3-slate-800 p-4">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-cos-v3-blue-600/10 text-cos-v3-blue-600">
            <AdminIcon name="shield" size={20} />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-semibold">
                {t('admin.settings.justification.title')}
              </h2>
              <span className="rounded border border-cos-v3-amber-500/30 bg-cos-v3-amber-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase text-cos-v3-amber-500">
                {t('admin.settings.justification.required')}
              </span>
            </div>
            <p className="mt-0.5 text-[13px] text-cos-v3-slate-400">
              {t('admin.settings.justification.body')}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <label className="flex-1">
                <span className="sr-only">{t('admin.settings.justification.title')}</span>
                <input
                  type="text"
                  value={justification}
                  maxLength={500}
                  onChange={(e) => setJustification(e.target.value)}
                  onBlur={() => setTouched(true)}
                  aria-invalid={showReasonError}
                  placeholder={t('admin.settings.justification.placeholder')}
                  className={`${FIELD} ${showReasonError ? INVALID : ''}`}
                />
              </label>
              {reason.success ? (
                <span className="flex shrink-0 items-center gap-1 font-mono text-[12px] text-cos-v3-green-600">
                  <AdminIcon name="check_circle" size={16} />
                  <span>{t('admin.settings.justification.valid')}</span>
                </span>
              ) : (
                <span className="shrink-0 font-mono text-[12px] text-cos-v3-slate-400">
                  {t('admin.settings.justification.rule')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className={PANEL} aria-labelledby="set-gateways">
            <div className={PANEL_HEAD}>
              <div className="flex items-center gap-2.5">
                <AdminIcon name="hub" size={18} className="text-cos-v3-cyan-500" />
                <h2 id="set-gateways" className="text-[16px] font-semibold">
                  {t('admin.settings.gateways.title')}
                </h2>
              </div>
              <span className="rounded border border-cos-v3-green-600/30 bg-cos-v3-green-600/10 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase text-cos-v3-green-600">
                {t('admin.settings.gateways.active')} {NO_DATA}
              </span>
            </div>
            <div className="space-y-4 p-5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-[13px] font-medium">
                  <label className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="shrink-0">{t('admin.settings.gateways.primary')}</span>
                    <input
                      type="text"
                      value={draft.gateways.primary.name ?? ''}
                      maxLength={200}
                      placeholder={t('admin.settings.gateways.namePlaceholder')}
                      onChange={(e) =>
                        patch((s) => void (s.gateways.primary.name = textOrNull(e.target.value)))
                      }
                      className={`${BARE} flex-1`}
                    />
                  </label>
                  <label className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-cos-v3-cyan-500">
                    <span>{t('admin.settings.gateways.protocol')}</span>
                    <input
                      type="text"
                      value={draft.gateways.primary.protocol ?? ''}
                      maxLength={200}
                      placeholder={NO_DATA}
                      onChange={(e) =>
                        patch(
                          (s) => void (s.gateways.primary.protocol = textOrNull(e.target.value)),
                        )
                      }
                      className={`${BARE} w-32`}
                    />
                  </label>
                </div>
                <input
                  type="url"
                  aria-label={t('admin.settings.gateways.primaryUrl')}
                  value={draft.gateways.primary.url ?? ''}
                  maxLength={2048}
                  placeholder="https://"
                  onChange={(e) =>
                    patch((s) => void (s.gateways.primary.url = textOrNull(e.target.value)))
                  }
                  className={`${FIELD} font-mono`}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-[13px] font-medium">
                  <label className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="shrink-0">{t('admin.settings.gateways.secondary')}</span>
                    <input
                      type="text"
                      value={draft.gateways.secondary.name ?? ''}
                      maxLength={200}
                      placeholder={t('admin.settings.gateways.namePlaceholder')}
                      onChange={(e) =>
                        patch((s) => void (s.gateways.secondary.name = textOrNull(e.target.value)))
                      }
                      className={`${BARE} flex-1`}
                    />
                  </label>
                  <label className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-cos-v3-amber-500">
                    <span>{t('admin.settings.gateways.maxRetries')}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={texts['gateways.secondary.max_retries']}
                      placeholder={NO_DATA}
                      onChange={(e) => setText('gateways.secondary.max_retries', e.target.value)}
                      aria-invalid={invalid.includes('gateways.secondary.max_retries')}
                      className={`${BARE} w-10 ${invalid.includes('gateways.secondary.max_retries') ? 'ring-1 ring-cos-v3-red-600' : ''}`}
                    />
                  </label>
                </div>
                <input
                  type="url"
                  aria-label={t('admin.settings.gateways.secondaryUrl')}
                  value={draft.gateways.secondary.url ?? ''}
                  maxLength={2048}
                  placeholder="https://"
                  onChange={(e) =>
                    patch((s) => void (s.gateways.secondary.url = textOrNull(e.target.value)))
                  }
                  className={`${FIELD} font-mono`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-1">
                <label className="space-y-1">
                  <span className="block text-[12px] text-cos-v3-slate-400">
                    {t('admin.settings.gateways.cadence')}
                  </span>
                  <select
                    value={draft.gateways.auto_sync_cadence ?? ''}
                    onChange={(e) =>
                      patch((s) => void (s.gateways.auto_sync_cadence = textOrNull(e.target.value)))
                    }
                    className={FIELD}
                  >
                    <option value="">{t('admin.settings.notSet')}</option>
                    {withStored<string>(CADENCES, draft.gateways.auto_sync_cadence).map((c) => (
                      <option key={c} value={c}>
                        {CADENCE_KEY[c]
                          ? t(`admin.settings.gateways.cadences.${CADENCE_KEY[c]}`)
                          : c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block text-[12px] text-cos-v3-slate-400">
                    {t('admin.settings.gateways.ttl')}
                  </span>
                  <select
                    value={draft.gateways.failover_cache_ttl_hours ?? ''}
                    onChange={(e) =>
                      patch(
                        (s) =>
                          void (s.gateways.failover_cache_ttl_hours =
                            e.target.value === '' ? null : Number(e.target.value)),
                      )
                    }
                    className={FIELD}
                  >
                    <option value="">{t('admin.settings.notSet')}</option>
                    {withStored<number>(TTL_HOURS, draft.gateways.failover_cache_ttl_hours).map(
                      (h) => (
                        <option key={h} value={h}>
                          {number.format(h)} {t('admin.settings.hours')}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>

              <div className="flex items-center justify-between border-t border-cos-v3-slate-700/50 pt-2">
                <div>
                  <div className="text-[13px] font-medium">
                    {t('admin.settings.gateways.fallback')}
                  </div>
                  <div className="text-[12px] text-cos-v3-slate-400">
                    {t('admin.settings.gateways.fallbackBody')}
                  </div>
                </div>
                <Toggle
                  label={t('admin.settings.gateways.fallback')}
                  checked={draft.gateways.auto_fallback_on_timeout === true}
                  onChange={(on) => patch((s) => void (s.gateways.auto_fallback_on_timeout = on))}
                />
              </div>
            </div>
          </section>

          <section className={PANEL} aria-labelledby="set-maintenance">
            <div className={PANEL_HEAD}>
              <div className="flex items-center gap-2.5">
                <AdminIcon name="build_circle" size={18} className="text-cos-v3-amber-500" />
                <h2 id="set-maintenance" className="text-[16px] font-semibold">
                  {t('admin.settings.maintenance.title')}
                </h2>
              </div>
              <span className="rounded border border-cos-v3-slate-700 bg-cos-v3-slate-800 px-2 py-0.5 font-mono text-[11px] font-semibold text-cos-v3-slate-400">
                {t('admin.settings.maintenance.tiered')}
              </span>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex items-start gap-3 rounded border border-cos-v3-red-600/20 bg-cos-v3-red-600/10 p-3">
                <AdminIcon name="lock" size={18} className="mt-0.5 shrink-0 text-cos-v3-red-600" />
                <div className="flex-1">
                  <div className="text-[12px] font-bold uppercase tracking-wide text-cos-v3-red-600">
                    {t('admin.settings.maintenance.safety')}
                  </div>
                  <div className="mt-0.5 text-[12px] text-cos-v3-slate-400">
                    {t('admin.settings.maintenance.safetyBody')}
                  </div>
                </div>
                <Toggle
                  label={t('admin.settings.maintenance.safety')}
                  checked={draft.maintenance.safety_non_suspension === true}
                  onChange={(on) => patch((s) => void (s.maintenance.safety_non_suspension = on))}
                />
              </div>

              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between gap-3 rounded border border-cos-v3-slate-700/70 bg-cos-v3-slate-900 p-2.5">
                  <label className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">
                      {t('admin.settings.maintenance.shared')}
                    </span>
                    <input
                      type="text"
                      value={draft.maintenance.shared_tiers_window ?? ''}
                      maxLength={200}
                      placeholder={t('admin.settings.maintenance.windowPlaceholder')}
                      onChange={(e) =>
                        patch(
                          (s) =>
                            void (s.maintenance.shared_tiers_window = textOrNull(e.target.value)),
                        )
                      }
                      className={`${BARE} w-full text-[11px] text-cos-v3-slate-400`}
                    />
                  </label>
                  <span className="rounded border border-cos-v3-green-600/30 bg-cos-v3-green-600/10 px-2 py-0.5 font-mono text-[12px] font-semibold text-cos-v3-green-600">
                    {NO_DATA}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 rounded border border-cos-v3-slate-700/70 bg-cos-v3-slate-900 p-2.5">
                  <div>
                    <div className="text-[13px] font-semibold">
                      {t('admin.settings.maintenance.enterprise')}
                    </div>
                    <div className="text-[11px] text-cos-v3-slate-400">
                      {t('admin.settings.maintenance.enterpriseBody')}
                    </div>
                  </div>
                  <label>
                    <span className="sr-only">{t('admin.settings.maintenance.mode')}</span>
                    <select
                      value={draft.maintenance.enterprise_mode ?? ''}
                      onChange={(e) =>
                        patch(
                          (s) => void (s.maintenance.enterprise_mode = textOrNull(e.target.value)),
                        )
                      }
                      className="rounded border border-cos-v3-cyan-500/30 bg-cos-v3-cyan-500/10 px-2 py-0.5 font-mono text-[12px] font-semibold text-cos-v3-cyan-500 focus:outline-none"
                    >
                      <option value="">{NO_DATA}</option>
                      {withStored<string>(ENTERPRISE_MODES, draft.maintenance.enterprise_mode).map(
                        (m) => (
                          <option key={m} value={m}>
                            {m === 'ZERO_DOWNTIME'
                              ? t('admin.settings.maintenance.zeroDowntime')
                              : m}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="text-[13px] font-medium">{t('admin.settings.broadcast.title')}</div>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={`${FIELD} flex items-center gap-2 ${bad('broadcast.lead_time_hours')}`}
                  >
                    <span className="sr-only">{t('admin.settings.broadcast.lead')}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={texts['broadcast.lead_time_hours']}
                      placeholder={NO_DATA}
                      aria-invalid={invalid.includes('broadcast.lead_time_hours')}
                      onChange={(e) => setText('broadcast.lead_time_hours', e.target.value)}
                      style={{
                        width: `${Math.max(2, (texts['broadcast.lead_time_hours'] ?? '').length + 1)}ch`,
                      }}
                      className="w-14 min-w-0 bg-transparent focus:outline-none"
                    />
                    <span className="text-cos-v3-slate-400">
                      {t('admin.settings.broadcast.hoursPrior')}
                    </span>
                  </label>
                  <fieldset className={`${FIELD} flex items-center gap-3`}>
                    <legend className="sr-only">{t('admin.settings.broadcast.channels')}</legend>
                    {BROADCAST_CHANNELS.map((ch: BroadcastChannel) => (
                      <label key={ch} className="flex items-center gap-1.5 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={draft.broadcast.channels.includes(ch)}
                          onChange={(e) =>
                            patch((s) => {
                              const rest = s.broadcast.channels.filter((c) => c !== ch);
                              s.broadcast.channels = e.target.checked
                                ? BROADCAST_CHANNELS.filter((c) => c === ch || rest.includes(c))
                                : rest;
                            })
                          }
                          className="h-3.5 w-3.5 rounded border-cos-v3-slate-700 bg-cos-v3-slate-900 text-cos-v3-blue-600"
                        />
                        <span>{t(`admin.settings.broadcast.channel.${ch}`)}</span>
                      </label>
                    ))}
                  </fieldset>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className={PANEL} aria-labelledby="set-limits">
          <div className={PANEL_HEAD}>
            <div className="flex items-center gap-2.5">
              <AdminIcon name="storage" size={18} className="text-cos-v3-blue-600" />
              <h2 id="set-limits" className="text-[16px] font-semibold">
                {t('admin.settings.limits.title')}
              </h2>
            </div>
            <span className="font-mono text-[11px] text-cos-v3-slate-400">
              {t('admin.settings.limits.cluster')} {NO_DATA}
            </span>
          </div>
          <div className="p-5">
            <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded border border-cos-v3-slate-700 bg-cos-v3-slate-900 p-3.5">
                <div className="text-[11px] font-bold uppercase text-cos-v3-slate-400">
                  {t('admin.settings.limits.shared')}
                </div>
                <div className="mt-1 flex items-baseline gap-1 text-[20px] font-bold">
                  {number.format(counts.shared_tenants)}{' '}
                  <label className="flex items-baseline gap-1 text-[12px] font-normal text-cos-v3-slate-400">
                    <span>/</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={texts['limits.shared_tenant_cap']}
                      placeholder={NO_DATA}
                      aria-label={t('admin.settings.limits.capLabel')}
                      aria-invalid={invalid.includes('limits.shared_tenant_cap')}
                      onChange={(e) => setText('limits.shared_tenant_cap', e.target.value)}
                      style={{
                        width: `${Math.max(2, (texts['limits.shared_tenant_cap'] ?? '').length + 1)}ch`,
                      }}
                      className={`${BARE} ${invalid.includes('limits.shared_tenant_cap') ? 'ring-1 ring-cos-v3-red-600' : ''}`}
                    />
                    <span>{t('admin.settings.limits.cap')}</span>
                  </label>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cos-v3-slate-700">
                  <div
                    className="h-full rounded-full bg-cos-v3-blue-600"
                    style={{ width: `${share ?? 0}%` }}
                  />
                </div>
              </div>
              <div className="rounded border border-cos-v3-slate-700 bg-cos-v3-slate-900 p-3.5">
                <div className="text-[11px] font-bold uppercase text-cos-v3-slate-400">
                  {t('admin.settings.limits.dedicated')}
                </div>
                <div className="mt-1 text-[20px] font-bold text-cos-v3-cyan-500">
                  {number.format(counts.dedicated_tenants)}{' '}
                  <span className="text-[12px] font-normal text-cos-v3-slate-400">
                    {t('admin.settings.limits.instances')}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-[11px] text-cos-v3-green-600">
                  <AdminIcon name="check" size={14} />
                  <span>{NO_DATA}</span>
                </div>
              </div>
              <div className="rounded border border-cos-v3-slate-700 bg-cos-v3-slate-900 p-3.5">
                <div className="text-[11px] font-bold uppercase text-cos-v3-slate-400">
                  {t('admin.settings.limits.pool')}
                </div>
                <label className="mt-1 flex items-baseline gap-1 text-[20px] font-bold">
                  <span className="sr-only">{t('admin.settings.limits.pool')}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={texts['limits.default_max_pool_conns']}
                    placeholder={NO_DATA}
                    aria-invalid={invalid.includes('limits.default_max_pool_conns')}
                    onChange={(e) => setText('limits.default_max_pool_conns', e.target.value)}
                    style={{
                      width: `${Math.max(2, (texts['limits.default_max_pool_conns'] ?? '').length + 1)}ch`,
                    }}
                    className={`${BARE} ${invalid.includes('limits.default_max_pool_conns') ? 'ring-1 ring-cos-v3-red-600' : ''}`}
                  />
                  <span className="text-[12px] font-normal text-cos-v3-slate-400">
                    {t('admin.settings.limits.perTenant')}
                  </span>
                </label>
                <div className="mt-1 text-[11px] text-cos-v3-slate-400">{NO_DATA}</div>
              </div>
              <div className="rounded border border-cos-v3-slate-700 bg-cos-v3-slate-900 p-3.5">
                <div className="text-[11px] font-bold uppercase text-cos-v3-slate-400">
                  {t('admin.settings.limits.audit')}
                </div>
                <div className="mt-1 text-[20px] font-bold text-cos-v3-green-600">{NO_DATA}</div>
                <div className="mt-1 text-[11px] text-cos-v3-slate-400">{NO_DATA}</div>
              </div>
            </div>

            <div className="overflow-x-auto rounded border border-cos-v3-slate-700">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="border-b border-cos-v3-slate-700 bg-cos-op-set-thead text-[11px] uppercase tracking-wider text-cos-v3-slate-400">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      {t('admin.settings.tiers.tier')}
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      {t('admin.settings.tiers.strategy')}
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      {t('admin.settings.tiers.storage')}
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      {t('admin.settings.tiers.api')}
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      {t('admin.settings.tiers.tokens')}
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                      {t('admin.settings.tiers.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cos-v3-slate-700 bg-cos-v3-slate-800">
                  {TIER_ORDER.map((tier) => {
                    const row = draft.tiers[tier];
                    const open = editing === tier;
                    const path = (field: string) => `tiers.${tier}.${field}`;
                    const shown = (field: string, unit: string) => {
                      const text = texts[path(field)] ?? '';
                      return text === ''
                        ? NO_DATA
                        : `${/^\d+$/.test(text) ? number.format(Number(text)) : text} ${unit}`;
                    };
                    const countInput = (field: string, label: string) => (
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`${tier} ${label}`}
                        value={texts[path(field)]}
                        placeholder={NO_DATA}
                        aria-invalid={invalid.includes(path(field))}
                        onChange={(e) => setText(path(field), e.target.value)}
                        className={`${FIELD} w-32 py-1 font-mono ${bad(path(field))}`}
                      />
                    );
                    const rowInvalid = invalid.some((p) => p.startsWith(`tiers.${tier}.`));
                    return (
                      <tr key={tier} className="transition-colors hover:bg-cos-v3-slate-700/30">
                        <td className="px-4 py-3 font-semibold">{tier}</td>
                        <td
                          className={`px-4 py-3 font-mono text-[12px] ${tier === 'ENTERPRISE' ? 'text-cos-v3-cyan-500' : 'text-cos-v3-slate-400'}`}
                        >
                          {open ? (
                            <input
                              type="text"
                              aria-label={`${tier} ${t('admin.settings.tiers.strategy')}`}
                              value={row.db_strategy ?? ''}
                              maxLength={200}
                              placeholder={NO_DATA}
                              onChange={(e) =>
                                patch(
                                  (s) =>
                                    void (s.tiers[tier].db_strategy = textOrNull(e.target.value)),
                                )
                              }
                              className={`${FIELD} py-1 font-mono`}
                            />
                          ) : (
                            (row.db_strategy ?? NO_DATA)
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {open
                            ? countInput('storage_quota_gb', t('admin.settings.tiers.storage'))
                            : shown('storage_quota_gb', 'GB')}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {open
                            ? countInput('api_monthly_quota', t('admin.settings.tiers.api'))
                            : shown('api_monthly_quota', t('admin.settings.tiers.reqPerMonth'))}
                        </td>
                        <td className="px-4 py-3 font-mono text-cos-v3-cyan-500">
                          {open
                            ? countInput('token_limit_monthly', t('admin.settings.tiers.tokens'))
                            : shown('token_limit_monthly', t('admin.settings.tiers.tokenUnit'))}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            aria-expanded={open}
                            onClick={() => setEditing(open ? null : tier)}
                            className={`text-[12px] font-semibold hover:underline ${rowInvalid ? 'text-cos-v3-red-400' : 'text-cos-v3-blue-600'}`}
                          >
                            {open ? t('admin.settings.tiers.done') : t('admin.settings.tiers.edit')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {invalid.length > 0 ? (
              <p role="alert" className="mt-3 text-[12px] text-cos-v3-red-400">
                {t('admin.settings.error.counts')}
              </p>
            ) : null}
          </div>
        </section>

        <div className="flex items-center justify-between border-t border-cos-v3-slate-700 pb-6 pt-2 text-[12px] text-cos-v3-slate-400">
          <div className="flex items-center gap-2">
            <AdminIcon name="lock" size={16} className="text-cos-v3-green-600" />
            <span>{t('admin.settings.footer')}</span>
          </div>
          <div className="font-mono text-[11px]">
            {t('admin.settings.lastCommit')}{' '}
            {updated_at ? formatDateTime(locale, updated_at) : NO_DATA}
            {updated_by ? ` · ${updated_by.name || updated_by.email}` : ''}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Settings errors say nothing about tenants: 400 / 403 have their shared copy, anything else is generic. */
function settingsErrorKey(status: number | undefined): string {
  if (status === 400) return 'admin.errors.invalid';
  if (status === 403) return 'admin.errors.forbidden';
  return 'admin.errors.generic';
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="h-5 w-9 rounded-full bg-cos-v3-slate-700 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-cos-v3-blue-600 peer-checked:after:translate-x-full peer-focus-visible:ring-2 peer-focus-visible:ring-cos-v3-blue-600" />
    </label>
  );
}
