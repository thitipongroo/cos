// Report screen — SITE_WORKER daily site report (offline-first) — G-M5a/G-M5b.
// Implements mockup/mobile/05_site_worker/03_reports/00_main ("บันทึกกิจกรรมประจำวัน" / New Entry).
//
// Saving (1) writes a local_site_reports row (sync_status PENDING) for instant/offline display, and
// (2) enqueues a 'site_report' sync item → SyncManager POSTs /sync/push → syncSiteReports. The
// client-generated UUID (expo-crypto, ADR-051) is the idempotency key: it is stored as report_id and
// sent as the sync client_id (the server maps client_id → report_id). Captures manpower + blockers
// (spec 11 §472/§474; §20.7.6; QM-1 E2E #6).
//
// EVERY MOCKUP FIELD IS PERSISTED — the three that had no backing store were given one rather than
// dropped (product-owner decision 2026-08-08):
//   - Shift (Day/Night)          → site_ops.site_reports.shift          (migration 20260808000001)
//   - Blocker category           → site_ops.site_reports.blocker_category (same migration)
//   - Per-trade manpower bars    → site_ops.manpower_logs, which existed since Phase 6 with no API;
//                                  POST /site/reports now accepts `manpower_lines`.
// DROPPED: the mockup's "AI แนะนำ: คาดว่างานติดตั้งจะเสร็จภายใน 18:00 น." banner. Predicting a
// completion time is DelayForecastModel's job (Phase 23, untrained, §22.6) — the figure would be
// invented, and an invented estimate on a daily record is worse than no estimate.
//
// SAVE AS DRAFT vs SUBMIT REPORT are the row's real `status` values (DRAFT | SUBMITTED), not two
// styles of the same action.

import { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { db, newLocalId } from '../../db/database';
import { localSiteReports } from '../../db/schema';
import { enqueue } from '../../db/sync-queue';
import { ProjectPicker } from '../../components/ProjectPicker';
import { PhotoCapture } from '../../components/PhotoCapture';
import { VoiceNoteButton } from '../../components/VoiceNoteButton';
import { useT } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette } from '../../theme/usePalette';
import { makeScreenStyles } from '../../theme/screenStyles';

/** site_ops.site_reports.shift — the CHECK-constrained values, nothing invented. */
const SHIFTS = ['DAY', 'NIGHT'] as const;
type Shift = (typeof SHIFTS)[number];

/** site_ops.site_reports.blocker_category — the CHECK-constrained values. */
const BLOCKER_CATEGORIES = ['WEATHER', 'MATERIAL', 'POWER', 'OTHER'] as const;
type BlockerCategory = (typeof BLOCKER_CATEGORIES)[number];

/**
 * The trades a daily report breaks its headcount down by → one site_ops.manpower_logs row each.
 *
 * Deliberately a fixed, translated list rather than free text: `manpower_logs.trade_type` is a
 * VARCHAR with no master table behind it, and letting each worker type their own spelling is exactly
 * the free-text-in-a-normalised-field problem `context/01` §Structured Data forbids. The set matches
 * the work types the seeded tasks use.
 */
const TRADES = ['STRUCTURAL', 'ELECTRICAL', 'PLUMBING', 'FINISHING', 'GENERAL'] as const;
type Trade = (typeof TRADES)[number];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportScreen() {
  const [projectId, setProjectId] = useState('');
  const [summary, setSummary] = useState('');
  const [manpower, setManpower] = useState(0);
  const [shift, setShift] = useState<Shift>('DAY');
  const [trades, setTrades] = useState<Partial<Record<Trade, number>>>({});
  const [blockers, setBlockers] = useState('');
  const [blockerCategory, setBlockerCategory] = useState<BlockerCategory | null>(null);
  const [saved, setSaved] = useState<'DRAFT' | 'SUBMITTED' | null>(null);
  const [draftId, setDraftId] = useState(() => Crypto.randomUUID()); // report id + photo scope
  const t = useT();
  const p = usePalette();
  const screen = useMemo(() => makeScreenStyles(p), [p]);

  const canSave = projectId.trim() !== '' && summary.trim() !== '';
  // The bars are proportions of the TOTAL BREAKDOWN, not of `manpower` — the two are entered
  // separately and a bar that could exceed its track would be a lie about the data.
  const tradeTotal = Object.values(trades).reduce<number>((sum, n) => sum + (n ?? 0), 0);

  const bumpTrade = (trade: Trade, delta: number): void =>
    setTrades((current) => ({ ...current, [trade]: Math.max(0, (current[trade] ?? 0) + delta) }));

  const onSave = async (status: 'DRAFT' | 'SUBMITTED'): Promise<void> => {
    const clientId = draftId; // server idempotency key / report_id (ADR-051)
    const reportDate = todayIso();
    const manpowerLines = TRADES.filter((trade) => (trades[trade] ?? 0) > 0).map((trade) => ({
      trade_type: trade,
      worker_count: trades[trade] as number,
    }));

    await db.insert(localSiteReports).values({
      id: newLocalId(),
      reportId: clientId,
      projectId: projectId.trim(),
      reportDate,
      summary: summary.trim(),
      blockers: blockers.trim() || null,
      manpowerCount: manpower > 0 ? manpower : null,
      status,
      offlineSyncStatus: 'PENDING',
    });

    // Enqueue for push (client_id = clientId; server maps client_id → report_id). Offline-safe: the
    // item stays in sync_queue until SyncManager flushes it on reconnect (§17.6).
    enqueue('site_report', clientId, 'CREATE', {
      project_id: projectId.trim(),
      report_date: reportDate,
      summary: summary.trim() || undefined,
      blockers: blockers.trim() || undefined,
      blocker_category: blockerCategory ?? undefined,
      manpower_count: manpower > 0 ? manpower : undefined,
      shift,
      manpower_lines: manpowerLines.length > 0 ? manpowerLines : undefined,
      client_submitted_at: new Date().toISOString(),
    });

    setSaved(status);
    setDraftId(Crypto.randomUUID()); // a further save is a NEW report, not an edit of the sent one
  };

  return (
    <ScrollView
      testID="report-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerBlock}>
        <View style={styles.eyebrowRow}>
          <MaterialIcons name="edit-note" size={18} color={p.accent} />
          <Text style={[styles.eyebrow, { color: p.accent }]}>{t('site.report.newEntry')}</Text>
        </View>
        <Text style={[styles.title, { color: p.text }]}>{t('site.report.title')}</Text>
      </View>

      <ProjectPicker selectedId={projectId} onSelect={setProjectId} />

      {/* ── Manpower ─────────────────────────────────────────────────────── */}
      <Text style={[styles.sectionTitle, { color: p.text }]}>{t('site.report.manpower')}</Text>
      <View style={styles.row}>
        <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>
          <Text style={[styles.cardLabel, { color: p.muted }]}>
            {t('site.report.manpowerTotal')}
          </Text>
          <View style={styles.stepperRow}>
            <Text testID="manpower-total" style={[styles.bigNumber, { color: p.accent }]}>
              {manpower}
            </Text>
            <View style={styles.stepperButtons}>
              <TouchableOpacity
                testID="manpower-increment"
                accessibilityLabel={t('site.report.manpowerIncrement')}
                onPress={() => setManpower((n) => n + 1)}
                style={styles.stepButton}
              >
                <MaterialIcons name="add-circle-outline" size={24} color={p.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                testID="manpower-decrement"
                accessibilityLabel={t('site.report.manpowerDecrement')}
                onPress={() => setManpower((n) => Math.max(0, n - 1))}
                style={styles.stepButton}
              >
                <MaterialIcons name="remove-circle-outline" size={24} color={p.muted} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>
          <Text style={[styles.cardLabel, { color: p.muted }]}>{t('site.report.shift')}</Text>
          <View style={styles.segmented}>
            {SHIFTS.map((s) => {
              const active = s === shift;
              return (
                <TouchableOpacity
                  key={s}
                  testID={`shift-${s}`}
                  onPress={() => setShift(s)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.segment,
                    { borderColor: p.border, backgroundColor: active ? p.primary : 'transparent' },
                  ]}
                >
                  <Text style={[styles.segmentText, { color: active ? p.onPrimary : p.muted }]}>
                    {t(`site.report.shifts.${s}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* Per-trade breakdown → manpower_logs. Bars are proportions of the entered breakdown. */}
      <View style={[styles.panel, { backgroundColor: p.surface, borderColor: p.border }]}>
        {TRADES.map((trade) => {
          const count = trades[trade] ?? 0;
          const pct = tradeTotal > 0 ? Math.round((count / tradeTotal) * 100) : 0;
          return (
            <View key={trade} style={styles.tradeRow}>
              <View style={styles.tradeHead}>
                <Text style={[styles.tradeName, { color: p.muted }]}>
                  {t(`site.report.trades.${trade}`)}
                </Text>
                <View style={styles.tradeControls}>
                  <Text
                    testID={`trade-${trade}-count`}
                    style={[styles.tradeCount, { color: p.text }]}
                  >
                    {t('site.report.workerCount', { count })}
                  </Text>
                  <TouchableOpacity
                    testID={`trade-${trade}-decrement`}
                    accessibilityLabel={t('site.report.manpowerDecrement')}
                    onPress={() => bumpTrade(trade, -1)}
                    style={styles.stepButton}
                  >
                    <MaterialIcons name="remove-circle-outline" size={22} color={p.muted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`trade-${trade}-increment`}
                    accessibilityLabel={t('site.report.manpowerIncrement')}
                    onPress={() => bumpTrade(trade, 1)}
                    style={styles.stepButton}
                  >
                    <MaterialIcons name="add-circle-outline" size={22} color={p.muted} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={[styles.track, { backgroundColor: p.elevated }]}>
                <View style={[styles.fill, { backgroundColor: p.primary, width: `${pct}%` }]} />
              </View>
            </View>
          );
        })}
      </View>

      {/* ── Summary ──────────────────────────────────────────────────────── */}
      <Text style={[styles.sectionTitle, { color: p.text }]}>{t('site.report.progress')}</Text>
      <TextInput
        testID="report-summary-input"
        style={[screen.input, styles.multiline]}
        placeholder={t('site.report.summaryPlaceholder')}
        placeholderTextColor={p.muted}
        multiline
        value={summary}
        onChangeText={setSummary}
      />
      <VoiceNoteButton
        testID="report-voice-note"
        onTranscript={(text) => setSummary((s) => (s.trim() ? `${s} ${text}` : text))}
      />

      {/* ── Blockers ─────────────────────────────────────────────────────── */}
      <Text style={[styles.sectionTitle, { color: p.text }]}>{t('site.report.blockers')}</Text>
      <View style={styles.chipRow}>
        {BLOCKER_CATEGORIES.map((c) => {
          const active = c === blockerCategory;
          return (
            <TouchableOpacity
              key={c}
              testID={`blocker-category-${c}`}
              // Tapping the selected category clears it — a report may have a description with no
              // category, and there is no "none" chip to tap instead.
              onPress={() => setBlockerCategory(active ? null : c)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[
                styles.chip,
                { borderColor: active ? p.primary : p.border, backgroundColor: p.surface },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? p.accent : p.muted }]}>
                {t(`site.report.blockerCategories.${c}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TextInput
        testID="report-blockers-input"
        style={[screen.input, styles.multiline]}
        placeholder={t('site.report.blockersPlaceholder')}
        placeholderTextColor={p.muted}
        multiline
        value={blockers}
        onChangeText={setBlockers}
      />

      {/* ── Photos ───────────────────────────────────────────────────────── */}
      <Text style={[styles.sectionTitle, { color: p.text }]}>{t('site.report.photos')}</Text>
      <PhotoCapture entityType="site_report" entityId={draftId} />

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <View style={styles.actions}>
        <TouchableOpacity
          testID="save-draft-button"
          style={[
            styles.secondaryButton,
            { borderColor: p.border },
            !canSave && screen.buttonDisabled,
          ]}
          onPress={() => void onSave('DRAFT')}
          disabled={!canSave}
        >
          <MaterialIcons name="save" size={20} color={p.text} />
          <Text style={[styles.secondaryText, { color: p.text }]}>
            {t('site.report.saveDraft')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="save-report-button"
          style={[screen.primaryButton, styles.submit, !canSave && screen.buttonDisabled]}
          onPress={() => void onSave('SUBMITTED')}
          disabled={!canSave}
        >
          <MaterialIcons name="send" size={20} color={p.onPrimary} />
          <Text style={screen.primaryButtonText}>{t('site.report.submit')}</Text>
        </TouchableOpacity>
      </View>

      {saved ? (
        <Text testID="report-saved" style={[styles.saved, { color: p.success }]}>
          {saved === 'DRAFT' ? t('site.report.savedDraft') : t('site.report.saved')}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  headerBlock: { gap: 2 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  eyebrow: {
    fontSize: 11,
    fontFamily: fontFamily.semibold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  title: { fontSize: typography.hero.fontSize, fontFamily: fontFamily.bold },
  sectionTitle: {
    fontSize: typography.title.fontSize,
    fontFamily: fontFamily.semibold,
    marginTop: spacing.xs,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  card: { flex: 1, padding: spacing.sm, borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs },
  cardLabel: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bigNumber: { fontSize: 32, fontFamily: fontFamily.bold },
  stepperButtons: { gap: 2 },
  // 44px tap target around a 22–24px glyph (§32.7 touchTarget.iconButton, WCAG AAA).
  stepButton: {
    minWidth: touchTarget.iconButton,
    minHeight: touchTarget.iconButton / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmented: { flexDirection: 'row', gap: spacing.xs },
  segment: {
    flex: 1,
    minHeight: touchTarget.secondaryButton,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
  },
  segmentText: { fontSize: typography.label.fontSize, fontFamily: fontFamily.semibold },
  panel: { padding: spacing.sm, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm },
  tradeRow: { gap: spacing.xs },
  tradeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tradeName: { fontSize: typography.label.fontSize, fontFamily: fontFamily.regular },
  tradeControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  tradeCount: { fontSize: typography.label.fontSize, fontFamily: fontFamily.semibold },
  track: { height: 4, borderRadius: radius.sm, overflow: 'hidden' },
  fill: { height: '100%' },
  multiline: { minHeight: 96, textAlignVertical: 'top', paddingVertical: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    minHeight: touchTarget.secondaryButton,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  chipText: { fontSize: typography.label.fontSize, fontFamily: fontFamily.medium },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  secondaryButton: {
    flex: 1,
    minHeight: touchTarget.primaryButton + 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  secondaryText: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
    textTransform: 'uppercase',
  },
  submit: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: touchTarget.primaryButton + 8,
  },
  saved: { fontFamily: fontFamily.medium, fontSize: typography.caption.fontSize },
});
