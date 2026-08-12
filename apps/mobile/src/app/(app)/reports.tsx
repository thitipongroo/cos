// Reports screen — role-aware (G-M2).
//   EXECUTIVE      : AI-generated executive summary per project (master 3099/3203; §20.7.1) —
//                    POST /ai/reports/executive-summary via the ai-gateway (503 when the LLM is the
//                    Phase 11 stub → surfaced as "unavailable"). Online-only (uses non-queuing post()).
//   SITE_ENGINEER  : review submitted site reports + record material consumption (master 3197-3198).
// The bottom-nav "reports" tab is shared by both roles (see (app)/_layout.tsx); this switch renders
// the correct screen per JWT role.
//
// THE SITE_ENGINEER HALF WAS REBUILT TO ITS DRAWING ON 2026-08-12 (PO decision: "ขาดแผง AI และ
// ต้องการให้รูปแบบเหมือนกับใน mockup เลย"), following 03_site_engineer/04_reports/04_se_reports:
//   - It was drawn in the STATIC LIGHT palette (`colors`, the static `screen` sheet) while every
//     other Site Engineer screen follows `usePalette()`. On the app's default dark theme this list
//     was the one page that stayed light. It now reads the palette like the rest.
//   - A SEARCH ROW, which needed a server change to be real — see the note beside it.
//   - THE AI CARD, backed by SITE_SUMMARY, whose declared inputs are these very reports plus the
//     project's open issues (Phase 12; api/ai.ts). Nothing new was invented for it.
//   - REPORT CARDS with a status-toned left strip, an outlined status chip and the date • time,
//     replacing the generic list row. What the drawing puts on a card that this cannot fill —
//     per-report TITLES and a per-row SYNC state — is accounted for at the card itself.
//   - THE COUNT beside the heading is the response's real `total`, which also now decides whether
//     "Load More History" appears. The previous full-page heuristic (and the note claiming no total
//     existed) was wrong.
// The EXECUTIVE half is untouched: it is a different role with a different drawing.

import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import axios from 'axios';
import { useRouter } from 'expo-router';
import { CosRole } from '@cos/types';
import { get, post } from '../../api/client';
import { enqueue } from '../../db/sync-queue';
import { decodeJwtPayload } from '../../lib/jwt';
import { useAuthStore } from '../../store/authStore';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { ConflictBadge } from '../../components/ConflictBadge';
import { ProjectPicker } from '../../components/ProjectPicker';
import { ProjectContextBar } from '../../components/ProjectContextBar';
import { SiteInsight } from '../../components/SiteInsight';
import { useProjectStore } from '../../store/projectStore';
import { useI18n } from '../../i18n';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { makeScreenStyles, screen } from '../../theme/screenStyles';
import { usePalette, type Palette } from '../../theme/usePalette';

/**
 * The tone of a site report's status chip.
 *
 * `site_ops.site_reports.status` is DRAFT · SUBMITTED · ACKNOWLEDGED and nothing else. A draft is
 * unfinished work the engineer still owes, so it takes the warning tone the drawing gives its DRAFT
 * card; a submitted or acknowledged report is done with, and takes success.
 */
function statusTone(p: Palette, status: string): string {
  if (status === 'DRAFT') return p.warning;
  if (status === 'SUBMITTED' || status === 'ACKNOWLEDGED') return p.success;
  return p.muted;
}

/**
 * The tone of the card's LEFT ACCENT STRIP (PO decision 2026-08-12), which is NOT the status tone —
 * it answers "does this need me", and the answer turns on the blocker as much as on the status:
 *
 *   yellow  the report is still a DRAFT — unfinished work the engineer owes, whatever else is true
 *   red     a real blocker is recorded: `blocker_category` is set and is not OTHER, i.e. WEATHER,
 *           MATERIAL or POWER — a named cause someone can act on
 *   green   everything else — submitted or acknowledged, with no blocker or only an OTHER one
 *
 * Checked in that order, so the three rules partition every row and no card is left uncoloured. A
 * report with no `blocker_category` at all takes the same path as an OTHER one: nothing names a
 * cause, so nothing is escalated.
 */
function accentTone(p: Palette, report: ReportRow): string {
  if (report.status === 'DRAFT') return p.warning;
  const category = report.blocker_category ?? null;
  if (category !== null && category !== 'OTHER') return p.danger;
  return p.success;
}

interface ReportRow {
  report_id: string;
  report_date: string;
  status: string;
  summary?: string | null;
  /** `site_ops.site_reports.blockers` — what stopped work. The card's headline (PO 2026-08-12). */
  blockers?: string | null;
  /** `blocker_category` — WEATHER · MATERIAL · POWER · OTHER, CHECK-constrained (20260808000001). */
  blocker_category?: 'WEATHER' | 'MATERIAL' | 'POWER' | 'OTHER' | null;
  /** When the DEVICE submitted it — null on a report that was never queued offline. */
  client_submitted_at?: string | null;
  /** When the SERVER accepted it. Always present; the fallback for the card's time. */
  server_received_at?: string | null;
}

// ── SITE_ENGINEER — review reports + record material consumption ──────────────
function SiteEngineerReports() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [matName, setMatName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  const [savedFor, setSavedFor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const { t, formatDate, formatTime, statusLabel } = useI18n();
  const p = usePalette();
  // `sc`, not `screen`: the EXECUTIVE half of this file still uses the static light-theme sheet of
  // the same name, and one identifier meaning two different palettes in one file is a trap.
  const sc = useMemo(() => makeScreenStyles(p), [p]);
  // The same site the bar above the list names — the AI panel is project-scoped, like every other
  // report endpoint, and must never summarise a different project than the screen says it is on.
  const insightProjectId = useProjectStore((s) => s.active?.projectId ?? '');
  // The project's NAME for the panel's "Source:" line — it printed the raw uuid (PO 2026-08-12).
  const insightProjectName = useProjectStore((s) => s.active?.projectName ?? '');

  /**
   * `GET /site/reports` is page/limit paginated server-side (site-ops.controller: page ≥ 1, limit
   * capped at 100, default 20). The screen asked for page 1 and stopped, so the list was silently
   * the newest 20 reports with no way to reach the rest — which is what the drawing's "Load More
   * History" button is for (mockup 03_site_engineer/04_reports/04_se_reports).
   *
   * THE RESPONSE DOES CARRY A TOTAL — `{ items, total, page, limit }` (site-ops.service
   * listSiteReports). An earlier note in this file said it did not and inferred "is there more"
   * from a full page coming back; that was wrong, and the guess cost one empty request whenever the
   * count divided exactly by the page size. The count is also what the drawing's "42 TOTAL" beside
   * the heading is, so it is now read rather than approximated.
   */
  const PAGE_SIZE = 20;

  const load = async (nextPage = 1, search = query): Promise<void> => {
    setLoading(true);
    try {
      const term = search.trim();
      // SCOPED TO THE SITE THE BAR ABOVE NAMES (2026-08-12). The endpoint takes `project_id` and
      // this screen never sent one, so the list was every project's reports under a header naming
      // one — and "103 TOTAL" counted the tenant, not the site. It showed up as ten DRAFT cards in
      // a row on a project that has two: the drafts from all five projects, stacked by date.
      // Unscoped only while no project is chosen, which is the honest thing to show then.
      const res = await get<{ items?: ReportRow[]; total?: number } | ReportRow[]>(
        `/site/reports?page=${String(nextPage)}&limit=${String(PAGE_SIZE)}` +
          (insightProjectId === '' ? '' : `&project_id=${insightProjectId}`) +
          (term === '' ? '' : `&q=${encodeURIComponent(term)}`),
      );
      const rows = Array.isArray(res) ? res : (res.items ?? []);
      // Page 1 REPLACES (it is also what pull-to-refresh calls); later pages append.
      setReports((prev) => (nextPage === 1 ? rows : [...prev, ...rows]));
      setTotal(Array.isArray(res) ? rows.length : (res.total ?? rows.length));
      setPage(nextPage);
    } catch {
      // offline / error — keep the last list
    } finally {
      setLoading(false);
    }
  };

  // Re-runs when the engineer switches site, so the list follows the bar rather than keeping the
  // previous project's reports under the new project's name.
  useEffect(() => {
    void load(1);
  }, [insightProjectId]);

  /**
   * More pages exist while fewer rows are on screen than the server says there are.
   *
   * NEVER WHILE A SEARCH IS ACTIVE: the service's `q` path is unpaged by contract — it returns the
   * OpenSearch hits (capped at 50) and reports `total` as that count — so a "load more" under a
   * query would re-request page 2 of a list that has no page 2 and append the same rows again.
   */
  const hasMore = query.trim() === '' && reports.length < total;

  // First load only: the list is still empty AND a fetch is in flight. Pull-refresh keeps the
  // RefreshControl (reports already populated → boundary stays settled), so a refresh never blanks
  // the list back to a skeleton.
  const firstLoad = loading && reports.length === 0;

  const canRecord = matName.trim() !== '' && qty.trim() !== '' && unit.trim() !== '';

  const recordMaterial = (reportId: string): void => {
    enqueue('material', reportId, 'CREATE', {
      report_id: reportId,
      material_name: matName.trim(),
      quantity: qty.trim(),
      unit: unit.trim(),
      consumed_at: new Date().toISOString(),
    });
    setSavedFor(reportId);
    setMatName('');
    setQty('');
    setUnit('');
  };

  return (
    <View testID="reports-screen" style={sc.container}>
      {/* The Active Project bar the mockups open every working screen with — added here 2026-08-12
          when it became the project standard (PO decision). `03_site_engineer/04_reports/
          04_se_reports` draws it above the search row, and this list was the one screen carrying
          the drawing that still had no way to see or change the project it was listing for. It
          renders nothing when no project is selected, so no role gains an empty strip. */}
      <ProjectContextBar />

      {/* The drawing's search row + filter button. The search is real: `q` is served by OpenSearch
          over the report summary and weather (site-ops.controller, exposed 2026-08-12). */}
      <View style={styles.searchLine}>
        <View style={[styles.searchRow, { borderColor: p.border, backgroundColor: p.surface }]}>
          <MaterialIcons name="search" size={20} color={p.muted} />
          <TextInput
            testID="reports-search"
            style={[styles.searchInput, { color: p.text }]}
            placeholder={t('site.reports.searchPlaceholder')}
            placeholderTextColor={p.muted}
            value={query}
            onChangeText={setQuery}
            // Searched on SUBMIT, not per keystroke: every character would otherwise be an OpenSearch
            // round trip from a phone on site data.
            returnKeyType="search"
            onSubmitEditing={() => void load(1, query)}
          />
          {query !== '' ? (
            <TouchableOpacity
              testID="reports-search-clear"
              accessibilityRole="button"
              accessibilityLabel={t('site.reports.searchClear')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => {
                setQuery('');
                void load(1, '');
              }}
            >
              <MaterialIcons name="close" size={20} color={p.muted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* THE `tune` FILTER BUTTON IS DRAWN BUT NOT WIRED (PO decision 2026-08-12: "วาดไว้ตาม
          mockup เดี๋ยวจะมาใส่ endpoint ภายหลัง"). `GET /site/reports` today filters only on
          from_date/to_date and the new `q`, which is not the filter set this button is meant to
          open, so it waits for one rather than opening a sheet of the wrong controls.
          It is DISABLED, not merely inert: `accessibilityState.disabled` tells a screen reader the
          same thing the dimming tells everyone else, so nobody — sighted or not — taps a control
          that will not answer. */}
        <View
          testID="reports-filter-button"
          accessible
          accessibilityRole="button"
          accessibilityLabel={t('site.reports.filter')}
          accessibilityState={{ disabled: true }}
          style={[styles.filterButton, { borderColor: p.border, backgroundColor: p.surface }]}
        >
          <MaterialIcons name="tune" size={20} color={p.muted} />
        </View>
      </View>

      {/* The drawing's AI card, and it is a real one: SITE_SUMMARY is the Phase 12 report whose
          declared inputs ARE the site reports this screen lists, plus the open issues on the same
          project. No new report type was invented for it — see api/ai.ts. It renders only once a
          project is chosen, because every report endpoint is project-scoped and the bar above is
          where that is answered. */}
      {insightProjectId !== '' ? (
        <SiteInsight
          projectId={insightProjectId}
          projectLabel={insightProjectName}
          // "INSIGHT", not "SITE INSIGHT" (PO decision 2026-08-12) — the drawing's own heading, and
          // on a screen already headed by the project bar the word "site" was saying it twice.
          titleKey="site.reports.insightTitle"
        />
      ) : null}

      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={[styles.heading, { color: p.text }]}>{t('site.reports.recent')}</Text>
          {/* The drawing's "42 TOTAL" — the response's own `total`, never a page length. */}
          <Text testID="reports-total" style={[styles.totalText, { color: p.muted }]}>
            {t('site.reports.total', { count: total })}
          </Text>
        </View>
        <ConflictBadge onPress={() => router.push('/conflict-review')} />
      </View>

      <LoadingBoundary loading={firstLoad} variant="list" theme="dark" style={styles.listRegion}>
        <FlatList
          testID="reports-list"
          data={reports}
          keyExtractor={(r) => r.report_id}
          // `flex: 1`, and it is load-bearing. Without it the list sizes to its CONTENT inside the
          // flex:1 boundary above, so it has no overflow of its own to scroll — it simply draws past
          // the bottom of the window and the surplus is clipped. The list then looks like a short
          // list rather than a stuck one, which is how it survived: the screenshot rig caught it by
          // reporting the page as a single unscrollable viewport (2026-08-12).
          style={styles.listFill}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load(1)} />}
          ListEmptyComponent={<Text style={sc.empty}>{t('site.reports.empty')}</Text>}
          // The drawing's dashed "Load More History". Rendered only while the server's own `total`
          // says rows remain, so the button never offers a page that does not exist.
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity
                testID="reports-load-more"
                accessibilityRole="button"
                accessibilityLabel={t('site.reports.loadMore')}
                disabled={loading}
                onPress={() => void load(page + 1)}
                style={[styles.loadMore, { borderColor: p.border }]}
              >
                <MaterialIcons name="history" size={18} color={p.accent} />
                <Text style={[styles.loadMoreText, { color: p.accent }]}>
                  {t('site.reports.loadMore')}
                </Text>
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item }) => {
            const open = selectedReportId === item.report_id;
            const tone = statusTone(p, item.status);
            const accent = accentTone(p, item);
            // The headline the drawing gives each card. `blockers` is what the report actually
            // says went wrong, and it is the field the product owner chose for this slot; a report
            // filed with nothing blocking falls back to its own summary, and only a report with
            // neither takes the generic name of the thing.
            const headline =
              item.blockers?.trim() ?? item.summary?.trim() ?? t('site.reports.untitled');
            // The drawing's "Oct 24 • 14:30". The DATE is the report's own `report_date`; the TIME
            // is when it was submitted — the device's own stamp where the report was queued
            // offline, else when the server received it. Neither is invented, and a row that
            // somehow carries neither simply shows the date.
            const stamp = item.client_submitted_at ?? item.server_received_at ?? null;
            return (
              <TouchableOpacity
                testID="report-item"
                style={[
                  styles.card,
                  { backgroundColor: p.surface, borderColor: p.border, borderLeftColor: accent },
                ]}
                onPress={() => setSelectedReportId(open ? null : item.report_id)}
              >
                <View style={styles.cardRow}>
                  <View style={styles.cardMain}>
                    <View style={styles.cardHead}>
                      <View style={[styles.statusChip, { borderColor: tone }]}>
                        <Text style={[styles.statusChipText, { color: tone }]}>
                          {statusLabel(item.status)}
                        </Text>
                      </View>
                      <Text style={[styles.stamp, { color: p.muted }]}>
                        {formatDate(item.report_date)}
                        {stamp === null ? '' : ` • ${formatTime(stamp)}`}
                      </Text>
                    </View>
                    {/* NO REPORT TITLE COLUMN EXISTS. The drawing names its cards "Daily Site
                        Report" / "Safety Incident Report" / "Material Delivery Log", which implies
                        report TYPES this product does not have — `site_ops.site_reports` is one
                        kind of thing, the daily report, and its only lifecycle is the DRAFT /
                        SUBMITTED pair the capture form's two buttons already set (mockup
                        05_site_worker/01_home/04_sw_daily_report), which is what the status chip
                        above shows. So the headline is the BLOCKERS DESCRIPTION (PO decision
                        2026-08-12): the one free-text field that says what is actually happening on
                        that report. ONE LINE with an ellipsis, as instructed — `numberOfLines={1}`
                        is what puts the "…" in. */}
                    <Text style={[styles.cardTitle, { color: p.text }]} numberOfLines={1}>
                      {headline}
                    </Text>
                    {/* The drawing's third row is a SYNCED / PENDING sync state, and this list
                        cannot honestly show one: it is the SERVER's own copy, fetched over HTTP, so
                        every row in it is already synced and the value would be a constant. The row
                        carries the BLOCKER CATEGORY instead (PO decision 2026-08-12) — the named
                        cause behind the headline above it, and what decides the card's left accent.
                        A report with no blocker recorded shows no row at all. */}
                    {item.blocker_category == null ? null : (
                      <View style={styles.blockerRow}>
                        <MaterialIcons name="report-problem" size={14} color={accent} />
                        <Text style={[styles.blockerText, { color: accent }]}>
                          {t(`site.report.blockerCategories.${item.blocker_category}`)}
                        </Text>
                      </View>
                    )}
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color={p.muted} />
                </View>

                {open ? (
                  <View testID="material-form" style={styles.matForm}>
                    <Text style={[styles.matHeading, { color: p.muted }]}>
                      {t('site.reports.materialTitle')}
                    </Text>
                    <TextInput
                      testID="material-name-input"
                      style={sc.input}
                      placeholder={t('site.reports.materialPlaceholder')}
                      placeholderTextColor={p.muted}
                      value={matName}
                      onChangeText={setMatName}
                    />
                    <View style={styles.qtyRow}>
                      <TextInput
                        testID="material-qty-input"
                        style={[sc.input, styles.qtyInput]}
                        placeholder={t('site.reports.qtyPlaceholder')}
                        placeholderTextColor={p.muted}
                        keyboardType="decimal-pad"
                        value={qty}
                        onChangeText={setQty}
                      />
                      <TextInput
                        testID="material-unit-input"
                        style={[sc.input, styles.qtyInput]}
                        placeholder={t('site.reports.unitPlaceholder')}
                        placeholderTextColor={p.muted}
                        value={unit}
                        onChangeText={setUnit}
                      />
                    </View>
                    <TouchableOpacity
                      testID="record-material-button"
                      style={[sc.primaryButton, !canRecord && sc.buttonDisabled]}
                      onPress={() => recordMaterial(item.report_id)}
                      disabled={!canRecord}
                    >
                      <Text style={sc.primaryButtonText}>{t('site.reports.record')}</Text>
                    </TouchableOpacity>
                    {savedFor === item.report_id ? (
                      <Text testID="material-saved" style={[styles.saved, { color: p.success }]}>
                        {t('site.reports.recorded')}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      </LoadingBoundary>

      {/* The drawing's floating "+" (mockup 04_se_reports). It pushes the daily-report FORM, which
          is the singular `/report` route — a different screen from this plural review list that
          shares the word. That form is a tab for no role since 2026-08-08 and is reached from
          quick-action menus, so this list previously had no way to start the thing it lists. */}
      <TouchableOpacity
        testID="reports-fab"
        accessibilityRole="button"
        accessibilityLabel={t('site.reports.newReport')}
        onPress={() => router.push('/report')}
        style={[styles.fab, { backgroundColor: p.primary }]}
      >
        <MaterialIcons name="add" size={28} color={p.onPrimary} />
      </TouchableOpacity>
    </View>
  );
}

// ── EXECUTIVE — AI executive summary ──────────────────────────────────────────
interface ExecReportResponse {
  content: { executive_summary?: unknown };
  low_confidence: boolean;
}

type ExecState = 'idle' | 'loading' | 'unavailable' | 'error';

function ExecReports() {
  const { t } = useI18n();
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = useAuthStore((s) => s.userId);
  const [projectId, setProjectId] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [lowConfidence, setLowConfidence] = useState(false);
  const [state, setState] = useState<ExecState>('idle');

  const generate = async (): Promise<void> => {
    setState('loading');
    setSummary(null);
    setLowConfidence(false);
    // tenant_id / generated_by come from the verified access-token claims (authStore has no tenantId).
    const claims = decodeJwtPayload(accessToken ?? '');
    const tenantId = typeof claims['tenant_id'] === 'string' ? (claims['tenant_id'] as string) : '';
    try {
      const res = await post<ExecReportResponse>('/ai/reports/executive-summary', {
        project_id: projectId,
        tenant_id: tenantId,
        generated_by: userId ?? 'system',
      });
      setSummary(
        typeof res.content?.executive_summary === 'string' ? res.content.executive_summary : null,
      );
      setLowConfidence(res.low_confidence);
      setState('idle');
    } catch (err) {
      // 503 = LLM provider is the Phase 11 stub → honest "unavailable" (not an error dump).
      setState(axios.isAxiosError(err) && err.response?.status === 503 ? 'unavailable' : 'error');
    }
  };

  return (
    <View testID="exec-reports-screen" style={screen.container}>
      <ProjectPicker selectedId={projectId} onSelect={setProjectId} />
      <TouchableOpacity
        testID="generate-report-button"
        style={[styles.button, (!projectId || state === 'loading') && screen.buttonDisabled]}
        onPress={generate}
        disabled={!projectId || state === 'loading'}
      >
        <Text style={screen.primaryButtonText}>
          {state === 'loading' ? t('exec.reports.generating') : t('exec.reports.generate')}
        </Text>
      </TouchableOpacity>

      {state === 'unavailable' ? (
        <Text testID="report-unavailable" style={styles.notice}>
          {t('exec.reports.unavailable')}
        </Text>
      ) : null}
      {state === 'error' ? <Text style={styles.error}>{t('exec.reports.error')}</Text> : null}

      {summary ? (
        <View testID="report-summary" style={styles.summaryCard}>
          {lowConfidence ? (
            <Text style={styles.lowConf}>{t('exec.reports.lowConfidence')}</Text>
          ) : null}
          <Text style={styles.summaryText}>{summary}</Text>
        </View>
      ) : state === 'idle' ? (
        <Text style={screen.empty}>{t('exec.reports.empty')}</Text>
      ) : null}
    </View>
  );
}

export default function ReportsScreen() {
  const role = useAuthStore((s) => s.role);
  return role === CosRole.EXECUTIVE ? <ExecReports /> : <SiteEngineerReports />;
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  heading: { fontFamily: fontFamily.semibold, fontSize: typography.title.fontSize },
  totalText: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // The drawing's search field + filter button on one line.
  searchLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touchTarget.formInput,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  // Square, matching the field's height — `w-touch-target h-touch-target` in the drawing.
  filterButton: {
    width: touchTarget.formInput,
    height: touchTarget.formInput,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    // Dimmed because it is not wired yet — see the note at the element.
    opacity: 0.5,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
    paddingVertical: spacing.xs,
  },

  listFill: { flex: 1 },
  // `space-y-space-3` between cards, and enough bottom padding that the FAB never covers the last.
  list: { gap: spacing.sm, paddingBottom: spacing.xl * 3, paddingTop: spacing.xs },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    // The drawing's `absolute left-0 top-0 bottom-0 w-1` status strip, drawn as the card's own
    // left border.
    borderLeftWidth: 4,
    padding: spacing.md,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  cardMain: { flex: 1, gap: spacing.xs },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  cardTitle: { fontFamily: fontFamily.semibold, fontSize: typography.body.fontSize },
  // Tinted outline, not a solid fill — `bg-…/10 text-… border-…/20` in the drawing.
  statusChip: {
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  statusChipText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  stamp: { fontFamily: fontFamily.regular, fontSize: typography.label.fontSize },
  blockerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  blockerText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // The boundary occupies the list's space so the FlatList still fills the screen once revealed.
  listRegion: { flex: 1 },
  // The drawing's dashed history button.
  loadMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: touchTarget.secondaryButton,
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  loadMoreText: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
  },
  fab: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    width: touchTarget.listItem,
    height: touchTarget.listItem,
    borderRadius: touchTarget.listItem / 2, // a circle: half the width, off the radius scale (§32.7)
    alignItems: 'center',
    justifyContent: 'center',
  },
  matForm: { marginTop: spacing.sm, gap: spacing.xs },
  matHeading: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.semibold,
  },
  qtyRow: { flexDirection: 'row', gap: spacing.xs },
  qtyInput: { flex: 1 },
  button: {
    minHeight: 44,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saved: {
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
  notice: {
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },
  error: {
    color: colors.danger,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },
  summaryCard: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  lowConf: {
    color: colors.danger,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
  summaryText: {
    color: colors.textPrimary,
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
  },
});
