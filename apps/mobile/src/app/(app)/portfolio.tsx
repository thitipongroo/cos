// Portfolio screen — the project list at portfolio scale.
// Implements mockup/mobile/08_executive/03_portfolio/01_ex_portfolio.
//
// REBUILT 2026-09-07 for that drawing, which is NEW: the replacement executive mockup set added it,
// and the product owner made `/portfolio` an EXECUTIVE tab again in the same decision (ADR-098 as
// amended). What was here before was a plain list of names with one badge, drawn in the STATIC LIGHT
// palette while every other executive screen follows `usePalette()` — so on the app's default dark
// theme this was one of the last pages that stayed white.
//
// IT IS NOT AN EXECUTIVE-ONLY SCREEN, and that shaped what went on it. `/portfolio` is a drawer row
// for PROJECT_MANAGER, FINANCE and TENANT_ADMIN as well (drawerLinks.ts, DERIVED "Executive
// dashboard"), so nothing here branches on role — every one of those four asks the same question of
// the same rows.
//
// WHAT IS REAL.
//   Project list        `local_projects`, the §17.4 offline cache. It is the BASE list on purpose:
//                       this screen must render on a plane, and it did before.
//   Progress            `progress_percent` from `GET /projects/mine` (§32.12, BOQ-value-weighted),
//                       joined by id. Null when not computable — the bar is then not drawn at all
//                       rather than drawn empty, which would read as "no work done".
//   Health per project  `GET /analytics/executive` — budget, actual, utilisation, at-risk, overdue
//                       invoices. One call for every project, ids passed (see below).
//   Variance            actual − budget, in decimal.js. Positive is an overrun, which is the sign
//                       the drawing colours red.
//   The four chips      counts over those rows through `executiveSeverityOf`, the same mapping
//                       `alerts.tsx` and the Home risk tile read. The drawing's fourth chip is
//                       "เสร็จเร็วกว่ากำหนด" (ahead of schedule) and it is NOT drawn: nothing in
//                       this product measures schedule variance per project. The band it was
//                       replaced with — CRITICAL / AT RISK / ON TRACK — is the real partition of the
//                       same rows, so the strip keeps its shape and every count is countable.
//   Sort                by risk rank, or by name. Two orders, both computed here.
//   "showing N of M"    the two lengths.
//   Search              name and project CODE. The drawing's placeholder also offers contract and
//                       location; neither exists as data (see below), so neither is searched — a box
//                       that silently matches nothing on two of its three promises is worse than a
//                       box that promises two.
//   Budget pillar       `utilizationPct`, printed as the drawing prints it. The ONE pillar of the
//                       four-tile health matrix that has a source.
//
// WHAT IS DRAWN (lib/mockupFigures.ts, ADR-099, PO decision 2026-09-07 "ขยาย ADR-099 วาดทั้งหมด"):
// the portfolio health percentage, each card's contract number and location, and three of the four
// health pillars — schedule, safety and quality. Each is registered with the thing this platform
// would have to gain before it can be deleted.
//
// THE CONTRACT NUMBER IS THE ONE WORTH ARGUING ABOUT, and it is flagged in the register rather than
// waved through: it is the most quotable string on the screen, sitting beside a real project name.
// It is drawn under the product owner's decision, and it is the entry ADR-099 names as the first to
// remove.
//
// THE IDS ARE PASSED, and that is not a detail. `/analytics/executive` filters
// `project_id IN ({projectIds})` and the controller turns a missing parameter into an empty array,
// so the call this screen made until 2026-09-05 always came back `[]` — no badge on any row,
// indistinguishable from being offline.

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { Project } from '../../db/database';
import { useCollection } from '../../hooks/useCollection';
import { getMyProjects, refreshProjectsCache } from '../../api/projects';
import {
  EXECUTIVE_SEVERITY_RANK,
  executiveSeverityOf,
  getExecutiveDashboard,
  type ExecutiveDashboardRow,
} from '../../api/analytics';
import { StatusChip } from '../../components/StatusChip';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { useT } from '../../i18n';
import type { TranslateFn } from '../../i18n';
import { Decimal, sumDecimals, toDecimal } from '@cos/financial';
import { compactMoneyLabel } from '../../lib/compactMoney';
import { countSettled, loadProgress } from '../../lib/loadingState';
import {
  PORTFOLIO_HEALTH,
  PROJECT_CONTRACT_CODES,
  PROJECT_HEALTH_INDEX,
  PROJECT_LOCATIONS,
  PROJECT_QUALITY_PASS,
  PROJECT_SAFETY_INCIDENTS,
  PROJECT_SCHEDULE_PILLAR,
} from '../../lib/mockupFigures';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';

/**
 * The health band a project falls in — the drawing's four filter chips, minus the one that has no
 * source.
 *
 * `executiveSeverityOf` returns four values and this collapses HIGH and MEDIUM into one band, which
 * is what the drawing's middle chip is: a project the reader has to look at but that has not gone
 * over. CRITICAL stays alone because it is the one the reader must look at TODAY.
 */
type Band = 'critical' | 'atRisk' | 'onTrack';
/** `all` is the chip, not a band — it filters nothing. */
type Filter = Band | 'all';
const FILTERS: readonly Filter[] = ['all', 'critical', 'atRisk', 'onTrack'];

function bandOf(row: ExecutiveDashboardRow | undefined): Band | null {
  // No row = the analytics call has not answered, or answered without this project. Not a band: a
  // project with no health data is not "on track", it is unmeasured, and colouring it green would
  // say the opposite of what is known.
  if (row === undefined) return null;
  const severity = executiveSeverityOf(row);
  if (severity === 'CRITICAL') return 'critical';
  if (severity === 'HIGH' || severity === 'MEDIUM') return 'atRisk';
  return 'onTrack';
}

/**
 * Which of the three reasons put this project in its band.
 *
 * Read in the SAME order as `executiveSeverityOf`, because that is the order that decided the band:
 * over-utilisation first, then the at-risk flag, then overdue invoices. A note that named a
 * different cause from the one that set the colour would be worse than no note.
 *
 * `health` is never undefined at the call site — the strip only renders for a card that HAS a band,
 * and a card without a row has none — but the parameter is typed for it and the fallback names the
 * flag, which is the middle case and the one that survives when a row arrives without figures.
 */
function adviceKey(health: ExecutiveDashboardRow | undefined): 'overBudget' | 'atRisk' | 'overdue' {
  if (health !== undefined && Number(health.utilizationPct) > 100) return 'overBudget';
  if (health !== undefined && health.overdueInvoiceCount > 0 && health.atRisk !== 1)
    return 'overdue';
  return 'atRisk';
}

function bandTone(band: Band | null, p: Palette): string {
  if (band === 'critical') return p.danger;
  if (band === 'atRisk') return p.warning;
  if (band === 'onTrack') return p.success;
  return p.muted;
}

/** Sort orders the control offers. Risk first, because that is what the drawing's control says. */
type SortKey = 'risk' | 'name';

/** One project, with everything joined onto it — see `PortfolioCard` for why this shape. */
interface Row {
  project: Project;
  health: ExecutiveDashboardRow | undefined;
  /** §32.12 progress, or null when the server could not compute one. */
  progress: number | null;
  band: Band | null;
  /** Index into the drawn per-card figures. Stable per project, so the card does not change on sort. */
  drawn: number;
}

/**
 * One project card.
 *
 * Everything it draws is passed in already joined, which is what lets `memo` skip a card whose
 * project and health are both unchanged — this list re-renders on every keystroke in the search box.
 */
const PortfolioCard = memo(function PortfolioCard({
  row,
  onOpen,
  t,
  p,
  styles,
}: {
  row: Row;
  onOpen: (project: Project) => void;
  t: TranslateFn;
  p: Palette;
  styles: ReturnType<typeof makeStyles>;
}) {
  const { project, health, progress, band, drawn } = row;
  const tone = bandTone(band, p);
  // The advice strip's own tone — see the strip for why it is not always the band's. `p.accent` is
  // the palette's `cos-cyan`, which is the token the drawing's `bg-cos-cyan/10` names.
  const adviceTone = band === 'critical' ? p.danger : p.accent;

  // actual − budget. Positive is an overrun; the drawing colours that red and an underrun green.
  const variance =
    health === undefined
      ? null
      : toDecimal(health.totalActual).minus(toDecimal(health.totalBudget));
  const over = variance !== null && variance.gt(0);

  const schedule = PROJECT_SCHEDULE_PILLAR.value[drawn % PROJECT_SCHEDULE_PILLAR.value.length];
  const safety = PROJECT_SAFETY_INCIDENTS.value[drawn % PROJECT_SAFETY_INCIDENTS.value.length];
  const quality = PROJECT_QUALITY_PASS.value[drawn % PROJECT_QUALITY_PASS.value.length];
  const index = PROJECT_HEALTH_INDEX.value[drawn % PROJECT_HEALTH_INDEX.value.length];
  const contract = PROJECT_CONTRACT_CODES.value[drawn % PROJECT_CONTRACT_CODES.value.length];
  const location = PROJECT_LOCATIONS.value[drawn % PROJECT_LOCATIONS.value.length];

  return (
    <Pressable
      testID="portfolio-item"
      accessibilityRole="button"
      // The card announces the project it opens, not "button" — the name is what distinguishes it
      // from the twenty others in the list.
      accessibilityLabel={project.projectName}
      onPress={() => onOpen(project)}
      style={[styles.card, { borderLeftColor: tone }]}
    >
      {/* ONE ROW: name, status tag, chevron (PO 2026-09-07). The tag used to sit INSIDE the text
          block on a wrapping row, so a long project name pushed it onto a second line and the card
          grew a row that carried nothing. The name now truncates instead — it is the string a reader
          scans, and the first words of it identify the project — and the tag keeps its place hard
          against the chevron, where the drawing has it and where the eye can compare it down the
          list without hunting. */}
      <View style={styles.cardHead}>
        <View style={styles.cardHeadText}>
          <Text style={styles.cardTitle} numberOfLines={1} ellipsizeMode="tail">
            {project.projectName}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            <Text style={styles.cardMetaAccent}>
              {t('exec.portfolio.contract', { code: contract })}
            </Text>
            {`  •  ${location}`}
          </Text>
        </View>
        {band === null ? null : (
          <View style={[styles.bandPill, { borderColor: `${tone}66` }]}>
            <Text style={[styles.bandPillText, { color: tone }]}>
              {t(`exec.portfolio.band.${band}`)}
            </Text>
          </View>
        )}
        {/* The LIFECYCLE status, and only when it is not the ordinary one. The band beside it says
            how a running project is doing; it says nothing about a project that is on hold or still
            a draft, and that is a difference the reader must not have to infer. */}
        {project.status === 'ACTIVE' ? null : <StatusChip label={project.status} />}
        <MaterialIcons
          name="chevron-right"
          size={20}
          color={p.muted}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>

      <View style={styles.progressBlock}>
        <View style={styles.progressLabels}>
          <Text style={styles.progressText}>
            {progress === null
              ? t('exec.portfolio.progressUnknown')
              : t('exec.portfolio.progress', { value: Math.round(progress) })}
          </Text>
          {variance === null ? null : (
            <View
              style={[styles.variancePill, { borderColor: `${over ? p.danger : p.success}66` }]}
            >
              <MaterialIcons
                name={over ? 'trending-up' : 'trending-down'}
                size={13}
                color={over ? p.danger : p.success}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <Text style={[styles.varianceText, { color: over ? p.danger : p.success }]}>
                {`${over ? '+' : '-'}${compactMoneyLabel(variance.abs(), 'THB', t, { maxScale: 'million' })}`}
              </Text>
            </View>
          )}
        </View>
        {/* No bar at all when progress is null — an empty track reads as "nothing done", which is a
            different claim from "not computable" (§32.12). */}
        {progress === null ? null : (
          <View style={styles.track}>
            <View
              testID="portfolio-progress-bar"
              style={[
                styles.fill,
                { width: `${Math.max(0, Math.min(100, progress))}%`, backgroundColor: tone },
              ]}
            />
          </View>
        )}
      </View>

      {/* The four-pillar health matrix. Three of the four are drawn; BUDGET is real. */}
      <View style={styles.matrix}>
        <Pillar
          styles={styles}
          icon="schedule"
          color={
            schedule.state === 'late'
              ? p.danger
              : schedule.state === 'atRisk'
                ? p.warning
                : p.success
          }
          label={t('exec.portfolio.pillar.schedule')}
          value={t(`exec.portfolio.schedule.${schedule.state}`, { days: schedule.days })}
        />
        <Pillar
          styles={styles}
          icon="payments"
          color={p.accent}
          label={t('exec.portfolio.pillar.budget')}
          value={
            health === undefined
              ? t('exec.portfolio.utilizationUnknown')
              : t('exec.portfolio.utilizationValue', { value: Math.round(health.utilizationPct) })
          }
        />
        <Pillar
          styles={styles}
          icon="shield"
          color={safety.incidents === 0 ? p.success : p.warning}
          label={t('exec.portfolio.pillar.safety')}
          value={
            safety.days === null
              ? t('exec.portfolio.incidents', { count: safety.incidents })
              : t('exec.portfolio.incidentsWindow', {
                  count: safety.incidents,
                  days: safety.days,
                })
          }
        />
        <Pillar
          styles={styles}
          icon="verified"
          color={p.accent}
          label={t('exec.portfolio.pillar.quality')}
          value={t('exec.portfolio.qualityPass', { value: quality })}
        />
      </View>

      {/* THE DRAWING'S ADVICE STRIP, on the cards that are not on track (PO 2026-09-07; the drawing
          puts it on its CRITICAL card and the instruction extends it to the amber ones too).
          WHAT IT SAYS IS DERIVED, NOT INVENTED, and that is the one place this departs from the
          drawing. The drawing writes a sentence of specific advice — "ชะลอการเบิกงวดถัดไป และเจรจา
          เคลม VO เหล็กเสริม" — under a `smart_toy` robot glyph, i.e. advice attributed to a model.
          There is no model on this screen: it makes no AI call at all, and
          `lib/mockupFigures.ts` forbids presenting any drawn value as a model output, because a
          fabricated finding standing beside real figures is the case spec §22.3 is most explicit
          about. So the strip carries the REASON THE CARD IS IN ITS BAND — the same
          `executiveSeverityOf` rule the chips and the sort read — and takes a `warning` glyph
          rather than the robot.
          TWO TONES, READ OFF THE DRAWING (PO 2026-09-07): its CRITICAL card's strip is
          `bg-mobile-danger/10 border-mobile-danger/30`, and its at-risk card's is
          `bg-cos-cyan/10 border-cos-cyan/30` with a `bolt` glyph — measured, not inferred from the
          card's own colour. So an over-budget project's note is red like its band, and an at-risk
          project's is the accent cyan, which is why `adviceTone` is not simply `tone`.
          THE GLYPH IS NOT THE DRAWING'S `smart_toy` on the red card. That robot marks the line as a
          model's advice, and there is no model here; `warning` says the same urgency without the
          claim. `bolt` on the cyan card carries no such claim and is kept.
          IT SITS BELOW THE FOUR-CELL MATRIX, where the drawing puts it: the matrix is what the
          reader checks, the note is what to do about it, and the note read first was an instruction
          before its evidence.
          COMING SOON is the honest label for the drawing's own version: an advice engine per
          project. Nothing in this platform produces one. */}
      {band === 'onTrack' || band === null ? null : (
        <View
          testID="portfolio-advice"
          style={[
            styles.advice,
            { borderColor: `${adviceTone}4D`, backgroundColor: `${adviceTone}14` },
          ]}
        >
          <MaterialIcons
            name={band === 'critical' ? 'warning' : 'bolt'}
            size={16}
            color={adviceTone}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={styles.adviceText}>
            <Text style={[styles.adviceLead, { color: adviceTone }]}>
              {t('exec.portfolio.adviceLead')}
            </Text>
            {t(`exec.portfolio.advice.${adviceKey(health)}`)}
          </Text>
        </View>
      )}

      <View style={styles.cardFoot}>
        <Text style={styles.footText}>{t('exec.portfolio.index', { value: index })}</Text>
        <Text style={styles.footLink}>{t('exec.portfolio.openHealth')}</Text>
      </View>
    </Pressable>
  );
});

/** One tile of the health matrix. Extracted only so the four calls read as four of the same thing. */
function Pillar({
  styles,
  icon,
  color,
  label,
  value,
}: {
  styles: ReturnType<typeof makeStyles>;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.matrixTile}>
      <View style={styles.matrixHead}>
        <MaterialIcons
          name={icon}
          size={14}
          color={color}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text style={styles.matrixLabel}>{label}</Text>
      </View>
      <Text style={styles.matrixValue}>{value}</Text>
    </View>
  );
}

export default function PortfolioScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(p), [p]);
  const projects = useCollection<Project>('local_projects');

  const [execById, setExecById] = useState<Record<string, ExecutiveDashboardRow>>({});
  const [progressById, setProgressById] = useState<Record<string, number | null>>({});
  const [selected, setSelected] = useState<Project | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortKey>('risk');
  const [loading, setLoading] = useState(true);
  // Rule 40 — TWO independent steps: the progress list and the analytics rows. Neither waits on the
  // other (the ids come from the local cache), so there are genuinely two things to count and
  // `loadProgress` can report a real percentage instead of a bar that sits at 0 and jumps to 100.
  const [settled, setSettled] = useState(0);
  const LOAD_STEPS = 2;

  useEffect(() => {
    refreshProjectsCache().catch(() => {
      /* offline — the cached list is what the screen shows */
    });
  }, []);

  const projectIds = useMemo(() => projects.map((project) => project.projectId), [projects]);

  useEffect(() => {
    // Re-runs when the cached list arrives or changes — on first paint it is often still empty, and
    // `getExecutiveDashboard` answers [] for an empty id list without calling the API.
    let cancelled = false;
    const step = <T,>(promise: Promise<T>): Promise<T> =>
      countSettled(promise, () => {
        if (!cancelled) setSettled((n) => n + 1);
      });

    const health = step(
      getExecutiveDashboard(projectIds).then((rows) => {
        if (!cancelled) setExecById(Object.fromEntries(rows.map((r) => [r.projectId, r])));
      }),
    ).catch(() => {
      /* offline — the list renders without health */
    });

    const progress = step(
      getMyProjects().then((rows) => {
        if (!cancelled) {
          setProgressById(
            Object.fromEntries(rows.map((r) => [r.project_id, r.progress_percent ?? null])),
          );
        }
      }),
    ).catch(() => {
      /* offline — no progress bars */
    });

    void Promise.all([health, progress]).then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectIds]);

  /** Every project, joined — before the search box and the chips have had their say. */
  const all = useMemo<Row[]>(
    () =>
      projects.map((project, drawn) => {
        const health = execById[project.projectId];
        return {
          project,
          health,
          progress: progressById[project.projectId] ?? null,
          band: bandOf(health),
          drawn,
        };
      }),
    [projects, execById, progressById],
  );

  /** The chip counts. Over ALL rows, never over the filtered ones — a count that changed when you
      pressed it would be telling you about your own filter rather than about the portfolio. */
  const counts = useMemo(() => {
    const tally: Record<Filter, number> = { all: all.length, critical: 0, atRisk: 0, onTrack: 0 };
    for (const row of all) if (row.band !== null) tally[row.band] += 1;
    return tally;
  }, [all]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = all.filter((row) => {
      if (filter !== 'all' && row.band !== filter) return false;
      if (needle === '') return true;
      // Name and code — see the header for why not contract and location.
      return (
        row.project.projectName.toLowerCase().includes(needle) ||
        (row.project.projectCode ?? '').toLowerCase().includes(needle)
      );
    });
    // A COPY, then sort: `all` is a memo and sorting it in place would mutate the value another
    // memo is holding.
    return [...matched].sort((a, b) => {
      if (sort === 'name') return a.project.projectName.localeCompare(b.project.projectName);
      // Worst first. A project with no health row ranks below every measured one rather than above:
      // it is not known to be bad, and putting the unmeasured at the top would bury the critical.
      const rank = (row: Row): number =>
        row.health === undefined ? -1 : EXECUTIVE_SEVERITY_RANK[executiveSeverityOf(row.health)];
      return rank(b) - rank(a);
    });
  }, [all, filter, query, sort]);

  const totalValue = useMemo(() => {
    const rows = Object.values(execById);
    return rows.length === 0 ? null : sumDecimals(rows.map((r) => toDecimal(r.totalBudget)));
  }, [execById]);

  const compact = (value: Decimal | null): string =>
    value === null ? '—' : compactMoneyLabel(value, 'THB', t, { maxScale: 'million' });

  const renderCard = useCallback(
    ({ item }: { item: Row }) => (
      <PortfolioCard row={item} onOpen={setSelected} t={t} p={p} styles={styles} />
    ),
    [t, p, styles],
  );

  if (selected) {
    const h = execById[selected.projectId];
    const rowsOut: Array<[string, string]> = h
      ? [
          [t('exec.portfolio.budget'), h.totalBudget],
          [t('exec.portfolio.committed'), h.totalCommitted],
          [t('exec.portfolio.actual'), h.totalActual],
          [t('exec.portfolio.utilization'), `${h.utilizationPct}%`],
          [t('exec.portfolio.overdue'), String(h.overdueInvoiceCount)],
        ]
      : [];
    return (
      <View testID="portfolio-health" style={styles.page}>
        <Text style={styles.heading}>{selected.projectName}</Text>
        {/* Health metrics are remote; the loader shows only while that fetch is still pending. */}
        <LoadingBoundary
          loading={loading}
          variant="widget"
          theme={isDark ? 'dark' : 'light'}
          progress={loadProgress(settled, LOAD_STEPS) ?? undefined}
        >
          {h ? (
            <View style={[styles.card, { borderLeftColor: bandTone(bandOf(h), p) }]}>
              {h.atRisk === 1 ? (
                <Text testID="health-at-risk" style={styles.atRisk}>
                  {t('exec.portfolio.atRisk')}
                </Text>
              ) : null}
              {rowsOut.map(([label, value]) => (
                <View key={label} style={styles.kvRow}>
                  <Text style={styles.kvKey}>{label}</Text>
                  <Text style={styles.kvValue}>{value}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>{t('exec.portfolio.noHealth')}</Text>
          )}
        </LoadingBoundary>
        <Pressable
          testID="portfolio-back"
          onPress={() => setSelected(null)}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={styles.backButton}
        >
          <MaterialIcons name="arrow-back" size={18} color={p.accent} />
          <Text style={styles.back}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View testID="portfolio-screen" style={styles.page}>
      <FlatList
        testID="portfolio-list"
        data={shown}
        keyExtractor={(row) => row.project.id}
        contentContainerStyle={styles.listContent}
        renderItem={renderCard}
        ListEmptyComponent={
          <Text testID="portfolio-empty" style={styles.empty}>
            {query.trim() === '' && filter === 'all'
              ? t('exec.portfolio.empty')
              : t('exec.portfolio.noMatch')}
          </Text>
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.search}>
              <MaterialIcons
                name="search"
                size={20}
                color={p.muted}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <TextInput
                testID="portfolio-search"
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder={t('exec.portfolio.searchPlaceholder')}
                placeholderTextColor={p.muted}
                accessibilityLabel={t('exec.portfolio.searchPlaceholder')}
                autoCorrect={false}
              />
            </View>

            {/* ONE ROW THAT SCROLLS, not a wrapping block (PO 2026-09-07, and the drawing's own
                `overflow-x-auto no-scrollbar`). `horizontal` on a ScrollView scrolls ONLY this row —
                the page keeps its own vertical scroll, which is what the instruction asked for.
                `alwaysBounceHorizontal={false}` so a row that already fits does not rubber-band and
                make the page look like it moved. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              alwaysBounceHorizontal={false}
              contentContainerStyle={styles.chipRow}
            >
              {FILTERS.map((key) => {
                const active = filter === key;
                const tone = key === 'all' ? p.primary : bandTone(key, p);
                return (
                  <Pressable
                    key={key}
                    testID={`portfolio-filter-${key}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t(`exec.portfolio.filter.${key}`)}
                    onPress={() => setFilter(key)}
                    style={[
                      styles.chip,
                      { borderColor: active ? tone : p.border },
                      active && { backgroundColor: `${tone}22` },
                    ]}
                  >
                    {key === 'all' ? null : (
                      <View style={[styles.dot, { backgroundColor: tone }]} />
                    )}
                    <Text style={[styles.chipText, active && { color: tone }]}>
                      {`${t(`exec.portfolio.filter.${key}`)} (${counts[key]})`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.sortRow}>
              <Pressable
                testID="portfolio-sort"
                accessibilityRole="button"
                accessibilityLabel={t('exec.portfolio.sortAction')}
                onPress={() => setSort((s) => (s === 'risk' ? 'name' : 'risk'))}
                style={styles.sortButton}
              >
                <Text style={styles.sortText}>
                  {t('exec.portfolio.sortBy', { value: t(`exec.portfolio.sort.${sort}`) })}
                </Text>
                <MaterialIcons name="expand-more" size={18} color={p.muted} />
              </Pressable>
              <Text testID="portfolio-count" style={styles.showing}>
                {t('exec.portfolio.showing', { shown: shown.length, total: all.length })}
              </Text>
            </View>

            {/* Summary strip — value and urgent are real, health is drawn. */}
            <View style={styles.strip}>
              <View style={[styles.stripCell, styles.stripDivider]}>
                <Text style={styles.eyebrow}>{t('exec.portfolio.totalValue')}</Text>
                <Text style={styles.stripValue}>{compact(totalValue)}</Text>
                {/* THE DRAWING SAYS "14 สัญญา" — contracts. This says PROJECTS, because that is what
                    is counted: no mobile endpoint reads `finance.contracts`, and the two numbers are
                    only equal while every project has exactly one contract. */}
                <Text style={[styles.stripNote, { color: p.accent }]}>
                  {t('exec.portfolio.projectCount', { count: all.length })}
                </Text>
              </View>
              <View style={[styles.stripCell, styles.stripDivider]}>
                <Text style={styles.eyebrow}>{t('exec.portfolio.health')}</Text>
                <Text style={[styles.stripValue, { color: p.success }]}>
                  {t('exec.portfolio.percent', { value: PORTFOLIO_HEALTH.value })}
                </Text>
                <Text style={[styles.stripNote, { color: p.success }]}>
                  {t('exec.portfolio.healthStable')}
                </Text>
              </View>
              <View style={styles.stripCell}>
                <Text style={styles.eyebrow}>{t('exec.portfolio.urgent')}</Text>
                <Text style={[styles.stripValue, { color: p.danger }]}>
                  {String(counts.critical + counts.atRisk)}
                </Text>
                <Text style={[styles.stripNote, { color: p.danger }]}>
                  {t('exec.portfolio.urgentSplit', {
                    critical: counts.critical,
                    atRisk: counts.atRisk,
                  })}
                </Text>
              </View>
            </View>
          </View>
        }
      />
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: p.bg, padding: spacing.md },
    listContent: { gap: spacing.sm, paddingBottom: spacing.xl },
    header: { gap: spacing.sm, paddingBottom: spacing.xs },

    heading: {
      fontSize: typography.title.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.text,
      marginBottom: spacing.sm,
    },

    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      height: touchTarget.formInput,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    searchInput: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      // No default vertical padding on Android, which otherwise makes the row taller than the box.
      paddingVertical: 0,
    },

    // `flexWrap` is gone with the wrapping block: inside a horizontal ScrollView the row must be
    // allowed to run past the viewport, which is the whole point of scrolling it.
    chipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      minHeight: 36,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      backgroundColor: p.surface,
    },
    dot: { width: 8, height: 8, borderRadius: 999 },
    chipText: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },

    sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sortButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      minHeight: touchTarget.iconButton,
      paddingHorizontal: spacing.xs,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    sortText: {
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    showing: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    strip: {
      flexDirection: 'row',
      backgroundColor: p.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.sm,
    },
    stripCell: { flex: 1, gap: 2, paddingHorizontal: spacing.xs / 2 },
    stripDivider: { borderRightWidth: 1, borderRightColor: p.border },
    stripValue: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.caption.fontSize,
    },
    stripNote: { fontFamily: fontFamily.medium, fontSize: 10 },

    eyebrow: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },

    card: {
      backgroundColor: p.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      padding: spacing.md,
      gap: spacing.sm,
    },
    // `center`, not `flex-start`: the tag and the chevron now share this row with a two-line text
    // block, and top-aligning them would leave both floating above the meta line.
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    cardHeadText: { flex: 1, gap: spacing.xs / 2 },
    cardTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },
    bandPill: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    bandPillText: {
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    cardMeta: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    cardMetaAccent: { color: p.accent, fontFamily: fontFamily.medium },

    progressBlock: { gap: spacing.xs },
    progressLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    progressText: {
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    variancePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    varianceText: { fontFamily: fontFamily.semibold, fontSize: 10 },
    track: { height: 6, borderRadius: radius.sm, backgroundColor: p.elevated, overflow: 'hidden' },
    fill: { height: '100%' },

    advice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      padding: spacing.xs,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    adviceText: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    adviceLead: { fontFamily: fontFamily.semibold },

    matrix: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    matrixTile: {
      // Two per row: half the width minus half the gap.
      flexBasis: '48%',
      flexGrow: 1,
      gap: 2,
      padding: spacing.xs,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceBright,
    },
    matrixHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    matrixLabel: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 11 },
    matrixValue: { color: p.text, fontFamily: fontFamily.semibold, fontSize: 12 },

    cardFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: p.border,
    },
    footText: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 11 },
    footLink: { color: p.accent, fontFamily: fontFamily.semibold, fontSize: 11 },

    kvRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: spacing.xs / 2,
    },
    kvKey: { color: p.muted, fontFamily: fontFamily.regular, fontSize: typography.label.fontSize },
    kvValue: { color: p.text, fontFamily: fontFamily.medium, fontSize: typography.label.fontSize },
    atRisk: {
      color: p.danger,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },
    empty: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      paddingVertical: spacing.md,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      minHeight: touchTarget.iconButton,
      marginTop: spacing.sm,
    },
    back: { color: p.accent, fontFamily: fontFamily.medium },
  });
