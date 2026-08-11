// Tenant Admin — Alerts / Sync Review Queue (mockup 04_tenant_admin/03_alerts/01_sync_queue; §32.7 dark).
// Reached from the "Alerts" bottom-nav tab. REAL data from GET /site/conflict-records (spec §17.5 —
// TENANT_ADMIN can view/resolve): field-sync conflicts awaiting manual review, resolved via
// PATCH /site/conflict-records/:id/resolve. Everything is real, never mockup placeholders:
//   - The badge + filter chips are the actual conflict_type enum (FIELD_CONFLICT / STATUS_CONFLICT /
//     REJECTED); the mockup's Critical/Medium/Low "severity" does not exist on the record.
//   - "Review data" expands the client-vs-server field diff (the two payloads); "Mark resolved" is the
//     single real action (the mockup's retry/merge/edit are one resolve on the backend).

import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  getConflictRecords,
  resolveConflict,
  type ConflictRecord,
  type ConflictType,
} from '../../api/conflicts';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { useI18n } from '../../i18n';
import type { Locale } from '../../i18n';
import { shortId } from '../../lib/shortId';
import {
  darkColors,
  fontFamily,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';

const TYPE_COLOR: Record<ConflictType, string> = {
  REJECTED: darkColors.danger,
  STATUS_CONFLICT: darkColors.warning,
  FIELD_CONFLICT: darkColors.cyan,
};
const TYPE_LABEL_KEY: Record<ConflictType, string> = {
  REJECTED: 'syncQueue.typeRejected',
  STATUS_CONFLICT: 'syncQueue.typeStatus',
  FIELD_CONFLICT: 'syncQueue.typeField',
};
const TYPE_REASON_KEY: Record<ConflictType, string> = {
  REJECTED: 'syncQueue.reasonRejected',
  STATUS_CONFLICT: 'syncQueue.reasonStatus',
  FIELD_CONFLICT: 'syncQueue.reasonField',
};
const FILTERS: Array<'ALL' | ConflictType> = [
  'ALL',
  'REJECTED',
  'STATUS_CONFLICT',
  'FIELD_CONFLICT',
];

function formatEntity(t: string): string {
  return t
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * FAILED AT — `HH:mm · DD/MM/YYYY`.
 *
 * THE YEAR IS PART OF IT (product-owner decision 2026-08-11, "e.g. 08/07/2026"). Without it a queue
 * that has been left alone over a new year reads as if the failure happened days ago: `01/44 · 28/07`
 * is the same nine characters whether it failed last week or last July.
 *
 * THE DATE GOES THROUGH `Intl`, THE WAY QM-3 REQUIRES — this used to be `getDate()/getMonth()+1`
 * with no year, and simply appending `getFullYear()` would have printed a GREGORIAN year to a Thai
 * reader, which QM-3 names explicitly ("never hardcode Gregorian year arithmetic for Thai display").
 * `th-TH-u-ca-buddhist` renders 2569 where English renders 2026.
 *
 * `en-GB`, not the app's `en-US` tag, for one reason: this screen has always printed day-first and
 * the requested example is day-first. `en-US` with 2-digit day/month would silently reorder it to
 * `07/08/2026` — the same characters meaning a different day.
 *
 * The TIME is left hand-rolled at 24h on purpose: `formatTime()` uses the app's `en-US` tag and
 * would turn `01:44` into `01:44 AM`, a change to the frame nobody asked for. (It is a time, not a
 * date, so no calendar question arises.)
 */
function failureTime(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number): string => String(n).padStart(2, '0');
  const date = new Intl.DateTimeFormat(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
  return `${p(d.getHours())}:${p(d.getMinutes())} · ${date}`;
}

function toText(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

interface DiffRow {
  field: string;
  client: string;
  server: string;
}
function buildDiff(
  c: Record<string, unknown> | null,
  s: Record<string, unknown> | null,
): DiffRow[] {
  const keys = Array.from(new Set([...Object.keys(c ?? {}), ...Object.keys(s ?? {})]));
  return keys.map((field) => ({
    field,
    client: toText((c ?? {})[field]),
    server: toText((s ?? {})[field]),
  }));
}

export default function SyncQueueScreen(): React.JSX.Element {
  // `locale` as well as `t`: FAILED AT renders its date through Intl, so the Thai reader gets the
  // Buddhist year rather than a hand-rolled Gregorian one (QM-3). See failureTime().
  const { t, locale } = useI18n();
  const [records, setRecords] = useState<ConflictRecord[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<'ALL' | ConflictType>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getConflictRecords()
      .then((r) => {
        if (active) setRecords(r);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(
    () => (records ?? []).filter((r) => filter === 'ALL' || r.conflict_type === filter),
    [records, filter],
  );

  const onResolve = (id: string): void => {
    // Optimistic — the review queue drops the record; a failed PATCH just leaves it for the next load.
    setRecords((prev) => (prev ? prev.filter((r) => r.conflict_id !== id) : prev));
    void resolveConflict(id).catch(() => {
      /* offline / transient — it reappears on the next fetch */
    });
  };

  return (
    <View style={styles.root} testID="tenant-admin-sync-queue">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>
          {t('syncQueue.subtitle', { count: records ? records.length : 0 })}
        </Text>

        {/* Filter chips (real conflict_type) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {FILTERS.map((f) => (
            <Pressable
              key={f}
              style={[styles.chip, filter === f && styles.chipActive]}
              onPress={() => setFilter(f)}
              testID={`sync-filter-${f}`}
            >
              {f !== 'ALL' ? (
                <View style={[styles.chipDot, { backgroundColor: TYPE_COLOR[f] }]} />
              ) : null}
              <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
                {f === 'ALL' ? t('syncQueue.filterAll') : t(TYPE_LABEL_KEY[f])}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <LoadingBoundary
          loading={records == null && !error}
          variant="list"
          theme="dark"
          style={styles.listBoundary}
        >
          {error ? (
            <Text style={styles.empty} testID="sync-queue-error">
              {t('syncQueue.error')}
            </Text>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyState} testID="sync-queue-empty">
              <MaterialIcons name="cloud-done" size={48} color={darkColors.muted} />
              <Text style={styles.empty}>{t('syncQueue.empty')}</Text>
            </View>
          ) : (
            filtered.map((r) => {
              const open = openId === r.conflict_id;
              const color = TYPE_COLOR[r.conflict_type];
              const diff = open ? buildDiff(r.client_payload, r.server_payload) : [];
              return (
                <View key={r.conflict_id} style={styles.card} testID={`conflict-${r.conflict_id}`}>
                  <View style={[styles.strip, { backgroundColor: color }]} />
                  <View style={styles.cardInner}>
                    <View style={styles.cardTop}>
                      <Text style={styles.entityType}>{formatEntity(r.entity_type)}</Text>
                      <View style={[styles.typeBadge, { backgroundColor: `${color}22` }]}>
                        <Text style={[styles.typeBadgeText, { color }]}>
                          {t(TYPE_LABEL_KEY[r.conflict_type])}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.metaRow}>
                      <View style={styles.metaCol}>
                        <Text style={styles.metaLabel}>{t('syncQueue.ref')}</Text>
                        <Text style={styles.metaValue}>#{shortId(r.entity_id)}</Text>
                      </View>
                      <View style={styles.metaCol}>
                        <Text style={styles.metaLabel}>{t('syncQueue.failedAt')}</Text>
                        <Text style={styles.metaValue}>{failureTime(r.created_at, locale)}</Text>
                      </View>
                    </View>

                    <View style={styles.reasonBox}>
                      <Text style={styles.reasonLabel}>{t('syncQueue.reasonLabel')}</Text>
                      <Text style={styles.reasonText}>{t(TYPE_REASON_KEY[r.conflict_type])}</Text>
                    </View>

                    {open ? (
                      <View style={styles.diff} testID={`diff-${r.conflict_id}`}>
                        <View style={styles.diffRow}>
                          <Text style={[styles.diffCell, styles.diffHead]}>
                            {t('syncQueue.field')}
                          </Text>
                          <Text style={[styles.diffCell, styles.diffHead]}>
                            {t('syncQueue.client')}
                          </Text>
                          <Text style={[styles.diffCell, styles.diffHead]}>
                            {t('syncQueue.server')}
                          </Text>
                        </View>
                        {diff.map((d) => {
                          const differs = d.client !== d.server;
                          return (
                            <View key={d.field} style={styles.diffRow}>
                              <Text style={styles.diffCell}>{d.field}</Text>
                              <Text style={[styles.diffCell, differs && styles.diffChanged]}>
                                {d.client}
                              </Text>
                              <Text style={[styles.diffCell, differs && styles.diffChanged]}>
                                {d.server}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}

                    <View style={styles.actions}>
                      <Pressable
                        style={styles.reviewBtn}
                        onPress={() => setOpenId(open ? null : r.conflict_id)}
                        testID={`review-${r.conflict_id}`}
                      >
                        <MaterialIcons name="difference" size={18} color={darkColors.onPrimary} />
                        <Text style={styles.reviewText}>{t('syncQueue.review')}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.resolveBtn}
                        onPress={() => onResolve(r.conflict_id)}
                        testID={`resolve-${r.conflict_id}`}
                      >
                        <MaterialIcons name="check" size={18} color={darkColors.success} />
                        <Text style={styles.resolveText}>{t('syncQueue.resolve')}</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </LoadingBoundary>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    color: darkColors.muted,
    marginBottom: spacing.sm,
  },
  chips: { gap: spacing.xs, paddingVertical: spacing.xs, paddingRight: spacing.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: darkColors.surface,
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  chipActive: { backgroundColor: darkColors.primary, borderColor: darkColors.primary },
  chipDot: { width: 8, height: 8, borderRadius: radius.md },
  chipText: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    color: darkColors.muted,
  },
  chipTextActive: { color: darkColors.onPrimary },
  listBoundary: { gap: spacing.sm },
  emptyState: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  empty: {
    textAlign: 'center',
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: darkColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: darkColors.border,
    overflow: 'hidden',
  },
  strip: { width: 4 },
  cardInner: { flex: 1, padding: spacing.md, gap: spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  entityType: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: typography.title.fontSize,
    color: darkColors.text,
  },
  typeBadge: { borderRadius: radius.xl, paddingHorizontal: spacing.xs, paddingVertical: 2 },
  typeBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  metaRow: { flexDirection: 'row', gap: spacing.md },
  metaCol: { flex: 1, gap: 2 },
  metaLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: darkColors.muted,
  },
  metaValue: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
  },
  // ERROR REASON — the mockup's panel, piece for piece (ADR-085: mockups are authoritative for
  // STYLE, and this zone had drifted from it in three ways).
  //   mockup: `bg-dark-bg/50 p-3 rounded-lg border border-outline-variant/20`
  //   label:  `text-tiny-web text-mobile-danger font-bold uppercase mb-1`
  //   body:   `font-body-web text-on-surface italic` + the message inside "quotes"
  // What was wrong: the panel sat on `elevated` (#111827), which is LIGHTER than the card it sits
  // on, so it read as a raised chip where the drawing recesses it; it had no border at all; and the
  // message was `muted` at label size, which made the one sentence explaining the failure the
  // faintest text on the card. `bg` at 50% over `surface` is the recess the mockup draws.
  reasonBox: {
    backgroundColor: `${darkColors.bg}80`,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${darkColors.border}33`,
    padding: spacing.sm,
    gap: 4,
  },
  reasonLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: darkColors.danger,
  },
  reasonText: {
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    color: darkColors.text,
    fontStyle: 'italic',
  },
  diff: { gap: 2 },
  diffRow: { flexDirection: 'row', gap: spacing.xs },
  diffCell: {
    flex: 1,
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.regular,
    color: darkColors.text,
  },
  diffHead: { fontFamily: fontFamily.semibold, color: darkColors.muted },
  diffChanged: { color: darkColors.warning, fontFamily: fontFamily.medium },
  actions: { flexDirection: 'row', gap: spacing.sm },
  reviewBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: touchTarget.primaryButton,
    borderRadius: radius.md,
    backgroundColor: darkColors.primary,
  },
  reviewText: {
    color: darkColors.onPrimary,
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    textTransform: 'uppercase',
  },
  resolveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: touchTarget.primaryButton,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${darkColors.success}55`,
    backgroundColor: `${darkColors.success}1A`,
  },
  resolveText: {
    color: darkColors.success,
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    textTransform: 'uppercase',
  },
});
