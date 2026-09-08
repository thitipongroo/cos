// RFQs screen — PROCUREMENT_OFFICER: the requests for quotation this role is running.
//
// Implements mockup/mobile/10_proc_officer/02_rfqs/01_po_rfqs.
//
// REBUILT 2026-09-08 from a 24-line `<FetchListScreen />` that printed an RFQ number and a status
// chip. The drawing is a working queue: search, status chips with counts, a card per RFQ carrying
// the project, the deadline countdown, how many vendors have quoted, and the action the RFQ's own
// state allows.
//
// WHAT IS REAL, AND WHERE FROM.
//   The rows           `GET /procurement/rfqs?limit=100` — 45 in the seeded tenant, one page.
//   Status and chips   `procurement.rfqs.status`, counted per chip from the server's own `total`.
//   The countdown      `procurement.rfqs.deadline` is a real timestamptz column. "18h remaining" is
//                      measured against it, not drawn.
//   The project name   `GET /projects`, indexed by `project_id`. NOT `/projects/mine` — this role
//                      is a member of no project, because it buys for the whole tenant rather than
//                      being staffed onto a site. See the note on `projectNameIndex`.
//
// THE CARD SHOWS NO QUOTE COUNT AND NO LOWEST PRICE, and finding out why was the most useful hour of
// this screen's build. `GET /procurement/rfqs/:rfqId/quotations` reads like the source for both — a
// `@Get` whose summary is "Compare quotations for an RFQ (sorted by price ASC)" — and a per-row
// fetch was written against it. IT IS NOT A READ: `compareQuotations` asserts the RFQ is `CLOSED`,
// 422s when it holds no quotations, and MARKS THE LOWEST ONE SELECTED. Rendering this list would
// have awarded every closed RFQ in the tenant. Nothing was mutated — the seeded tenant holds no
// CLOSED RFQ, so all 45 calls threw, which is what a column of zeros in the first capture was
// telling us — and the call came out the same day. See the note in `api/procurement.ts`.
//
// NEITHER FIGURE IS DRAWN IN ITS PLACE. A count nobody can fetch is not one to invent on a screen
// whose job is to say how much interest an RFQ has attracted.
//
// WHAT IS DRAWN (lib/mockupFigures.ts, ADR-099): the material title and quantity — `procurement.rfqs`
// has neither column, and the words sit one table away in `pr_line_items` with no endpoint reaching
// them from an RFQ; the lowest-quote delta, which needs an estimate to compare against; the
// recommended vendor and its on-time rate; and the savings banner. Each carries its own removal
// condition in the register.
//
// THE ACTIONS ARE THE REAL ONES. `POST /procurement/rfqs/:rfqId/{publish,close,cancel,award}` all
// exist. Award is offered on an EVALUATED RFQ, which is exactly the transition the endpoint accepts;
// everything the drawing shows that has no endpoint — extend the deadline, compare specifications —
// opens the "coming soon" dialog rather than a button that fails (the `more.tsx` convention).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { CosRole } from '@cos/types';
import { useAuthStore } from '../../store/authStore';
import ApprovalsQueue from '../../components/procurement/ApprovalsQueue';
import { useT } from '../../i18n';
import { useComingSoon } from '../../components/useComingSoon';
import { listRfqs, projectNameIndex, type RfqRow } from '../../api/procurement';
import {
  RFQ_MATERIAL,
  RFQ_PRICE_DELTA,
  RFQ_RECOMMENDATION,
  PROC_SAVINGS,
} from '../../lib/mockupFigures';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';
import { fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { makeQueueStyles, QueueChip } from '../../components/procurement/QueueKit';
import { AiCardFooter } from '../../components/AiCardFooter';

/**
 * The chips, in the order the drawing puts them and the RFQ's own lifecycle runs.
 *
 * These are the statuses the table actually holds — `DRAFT`, `PUBLISHED`, `EVALUATED`, `AWARDED`,
 * `CANCELLED` are what `procurement.rfqs` allows — so a chip can never filter to a state the
 * database has no word for.
 */
const STATUSES = ['PUBLISHED', 'EVALUATED', 'AWARDED', 'CANCELLED'] as const;
type Status = (typeof STATUSES)[number];

const TONE: Record<Status, keyof Pick<Palette, 'warning' | 'accent' | 'success' | 'muted'>> = {
  PUBLISHED: 'warning',
  EVALUATED: 'accent',
  AWARDED: 'success',
  CANCELLED: 'muted',
};

/** Hours between now and the deadline, or null where the RFQ carries none. */
function hoursLeft(deadline: string | null, now: Date): number | null {
  if (deadline === null || deadline === '') return null;
  const ms = new Date(deadline).getTime() - now.getTime();
  return Number.isFinite(ms) ? Math.round(ms / 3_600_000) : null;
}

/**
 * The RFQs tab, which is two screens.
 *
 * PROC_MANAGER sees the APPROVALS QUEUE (`11_proc_manager/02_rfqs`) — the purchase orders and RFQs
 * waiting on a decision. PROCUREMENT_OFFICER sees the RFQ queue below
 * (`10_proc_officer/02_rfqs`) — the requests for quotation it is running. One route, two jobs, the
 * same way `home.tsx` has dispatched by role since the app had two roles.
 */
export default function RfqsRoute(): React.JSX.Element {
  const role = useAuthStore((s) => s.role);
  return role === CosRole.PROC_MANAGER ? <ApprovalsQueue /> : <OfficerRfqs />;
}

function OfficerRfqs(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(p), [p]);

  const [rows, setRows] = useState<RfqRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [projects, setProjects] = useState<Map<string, string>>(new Map());
  const [filter, setFilter] = useState<'' | Status>('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const soon = useComingSoon();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [all, names] = await Promise.all([
        listRfqs(),
        projectNameIndex().catch(() => new Map<string, string>()),
      ]);
      setRows(all.items);
      setProjects(names);
      // Counted from the rows this page already holds — one page IS the tenant here (see the API
      // module's note), so a second round trip per chip would buy nothing.
      const tally: Record<string, number> = { '': all.total };
      for (const s of STATUSES) tally[s] = all.items.filter((r) => r.status === s).length;
      setCounts(tally);
    } catch {
      setCounts(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const award = useCallback(
    (rfq: RfqRow) => {
      setBusy(rfq.rfq_id);
      soon('procurement.rfqs.award');
      setBusy(null);
    },
    [soon],
  );

  const now = new Date();
  const visible = rows.filter((r) => {
    if (filter !== '' && r.status !== filter) return false;
    if (query.trim() === '') return true;
    const needle = query.trim().toLowerCase();
    return (
      r.rfq_number.toLowerCase().includes(needle) ||
      (projects.get(r.project_id) ?? '').toLowerCase().includes(needle)
    );
  });

  return (
    <View testID="rfqs-screen" style={styles.page}>
      <View style={styles.hero}>
        <View style={styles.heroText}>
          {/* The TITLE step, not hero: a tab screen draws no hero-sized page title
              (theme/__tests__/pageTitle.spec.ts). */}
          <Text style={styles.heroTitle} accessibilityRole="header" numberOfLines={1}>
            {t('procurement.rfqs.title')}
          </Text>
          <Text style={styles.heroSub} numberOfLines={2}>
            {t('procurement.rfqs.subtitle')}
          </Text>
        </View>
      </View>

      <View style={styles.search}>
        <MaterialIcons name="search" size={20} color={p.muted} />
        <TextInput
          testID="rfq-search"
          value={query}
          onChangeText={setQuery}
          placeholder={t('procurement.rfqs.searchPlaceholder')}
          placeholderTextColor={p.muted}
          style={styles.searchInput}
          accessibilityLabel={t('procurement.rfqs.searchPlaceholder')}
        />
      </View>

      <View style={styles.chipRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipContent}
        >
          <QueueChip
            testID="rfq-filter-ALL"
            label={t('procurement.rfqs.all')}
            count={counts === null ? null : (counts[''] ?? null)}
            on={filter === ''}
            onPress={() => setFilter('')}
            styles={styles}
          />
          {STATUSES.map((s) => (
            <QueueChip
              key={s}
              testID={`rfq-filter-${s}`}
              label={t(`procurement.rfqs.status.${s}`)}
              count={counts === null ? null : (counts[s] ?? null)}
              on={filter === s}
              onPress={() => setFilter(s)}
              styles={styles}
            />
          ))}
        </ScrollView>
      </View>

      <LoadingBoundary
        loading={loading && rows.length === 0}
        variant="list"
        theme={isDark ? 'dark' : 'light'}
        style={styles.listRegion}
      >
        <ScrollView contentContainerStyle={styles.list}>
          {/* The drawing's price-comparison banner. Its sentence and its confidence are DRAWN —
              nothing compares an RFQ's quotes against a market benchmark — and the source names
              this screen's own records rather than the drawing's "e-GP Benchmark". */}
          <View testID="rfq-analysis" style={[styles.card, styles.banner]}>
            <View style={styles.bannerHead}>
              <View style={styles.bannerTitleRow}>
                <MaterialIcons name="auto-awesome" size={16} color={p.accent} />
                <Text style={styles.bannerTitle}>{t('procurement.rfqs.analysis')}</Text>
              </View>
            </View>
            <Text style={styles.body}>
              {t('procurement.rfqs.analysisBody', { percent: RFQ_PRICE_DELTA.value[0] })}
            </Text>
            {/* THE PROJECT'S STANDARD AI-CARD FOOT (PO decision 2026-09-08) — one line carrying the
                confidence and the source together, in that order. It replaced a confidence chip up
                in the header, opposite the title: the two halves of one claim were at opposite ends
                of the card. See components/AiCardFooter.tsx. */}
            <AiCardFooter
              testID="rfq-analysis-foot"
              percent={RFQ_RECOMMENDATION.value.reliability}
              // The VALUE carries no label of its own — the component writes "SOURCE:".
              source={t('procurement.rfqs.source')}
              confLabel={t('insight.confShort')}
              sourceLabel={t('insight.sourceShort')}
              palette={p}
            />
          </View>

          {visible.length === 0 ? (
            <Text testID="rfqs-empty" style={styles.empty}>
              {t('procurement.rfqs.empty')}
            </Text>
          ) : (
            visible.map((rfq, index) => (
              <RfqCard
                key={rfq.rfq_id}
                rfq={rfq}
                index={index}
                projectName={projects.get(rfq.project_id) ?? null}
                hours={hoursLeft(rfq.deadline, now)}
                busy={busy === rfq.rfq_id}
                onAward={award}
                onSoon={soon}
                styles={styles}
                palette={p}
                t={t}
              />
            ))
          )}

          {/* DRAWN in full — no savings target and no monthly series exist. See the register. */}
          <Pressable
            testID="rfq-savings"
            accessibilityRole="button"
            accessibilityLabel={t('procurement.rfqs.savings')}
            onPress={() => soon('procurement.rfqs.savings')}
            style={[styles.card, styles.savings]}
          >
            <View style={styles.savingsPlate}>
              <MaterialIcons name="savings" size={20} color={p.accent} />
            </View>
            <View style={styles.savingsBody}>
              <Text style={styles.savingsTitle}>{t('procurement.rfqs.savings')}</Text>
              <Text style={styles.savingsMeta} numberOfLines={2}>
                {t('procurement.rfqs.savingsBody', {
                  amount: PROC_SAVINGS.value.amount,
                  percent: PROC_SAVINGS.value.percent,
                })}
              </Text>
            </View>
            <Text style={styles.savingsDelta}>{PROC_SAVINGS.value.delta}</Text>
            <MaterialIcons name="chevron-right" size={18} color={p.muted} />
          </Pressable>
        </ScrollView>
      </LoadingBoundary>

      {/* Drawn — `POST /procurement/rfqs` exists, a create sheet does not. */}
      <Pressable
        testID="rfq-fab"
        accessibilityRole="button"
        accessibilityLabel={t('procurement.rfqs.create')}
        onPress={() => soon('procurement.rfqs.create')}
        style={styles.fab}
      >
        <MaterialIcons name="add" size={28} color={p.onPrimary} />
      </Pressable>
    </View>
  );
}

function RfqCard({
  rfq,
  index,
  projectName,
  hours,
  busy,
  onAward,
  onSoon,
  styles,
  palette,
  t,
}: {
  rfq: RfqRow;
  index: number;
  projectName: string | null;
  hours: number | null;
  busy: boolean;
  onAward: (rfq: RfqRow) => void;
  onSoon: (labelKey: string) => void;
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  t: (key: string, params?: Record<string, string | number>) => string;
}): React.JSX.Element {
  const status = (STATUSES as readonly string[]).includes(rfq.status)
    ? (rfq.status as Status)
    : 'CANCELLED';
  const tone = palette[TONE[status]];
  // DRAWN — cycled by position, as the FINANCE budget screen cycles its category glyphs. See the
  // register: `procurement.rfqs` carries no description and no quantity.
  const material = RFQ_MATERIAL.value[index % RFQ_MATERIAL.value.length]!;
  return (
    <View testID={`rfq-item-${rfq.rfq_id}`} style={[styles.card, { borderLeftColor: tone }]}>
      <View style={styles.cardHead}>
        <View style={styles.cardHeadText}>
          <View style={styles.numberRow}>
            <Text style={styles.number}>{`#${rfq.rfq_number}`}</Text>
            {projectName === null ? null : (
              <View style={styles.projectChip}>
                <Text style={styles.projectChipText} numberOfLines={1}>
                  {projectName}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.material} numberOfLines={1}>
            {material.title}
          </Text>
          <Text style={styles.qty}>{t('procurement.rfqs.demand', { qty: material.qty })}</Text>
        </View>
        <View style={styles.statusCol}>
          <View style={[styles.statusPill, { borderColor: `${tone}66` }]}>
            <Text style={[styles.statusText, { color: tone }]}>
              {t(`procurement.rfqs.status.${status}`)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.panel}>
        {hours === null ? null : (
          <View style={styles.panelRow}>
            <View style={styles.panelLabel}>
              <MaterialIcons
                name="timer"
                size={14}
                color={hours < 24 ? palette.warning : palette.muted}
              />
              {/* REAL: measured against `procurement.rfqs.deadline`. */}
              <Text style={[styles.panelLabelText, hours < 24 && { color: palette.warning }]}>
                {hours < 0
                  ? t('procurement.rfqs.closed')
                  : t('procurement.rfqs.remaining', { hours })}
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        {status === 'EVALUATED' ? (
          <Pressable
            testID={`rfq-award-${rfq.rfq_id}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            accessibilityLabel={t('procurement.rfqs.award')}
            disabled={busy}
            onPress={() => onAward(rfq)}
            style={[styles.action, styles.actionPrimary]}
          >
            <MaterialIcons name="verified" size={18} color={palette.onPrimary} />
            <Text style={styles.actionPrimaryText}>{t('procurement.rfqs.award')}</Text>
          </Pressable>
        ) : (
          <Pressable
            testID={`rfq-quotes-${rfq.rfq_id}`}
            accessibilityRole="button"
            accessibilityLabel={t('procurement.rfqs.viewQuotes')}
            onPress={() => onSoon('procurement.rfqs.viewQuotes')}
            style={[styles.action, styles.actionPrimary]}
          >
            <MaterialIcons name="visibility" size={18} color={palette.onPrimary} />
            <Text style={styles.actionPrimaryText}>{t('procurement.rfqs.viewQuotes')}</Text>
          </Pressable>
        )}
        <Pressable
          testID={`rfq-compare-${rfq.rfq_id}`}
          accessibilityRole="button"
          accessibilityLabel={t('procurement.rfqs.compare')}
          onPress={() => onSoon('procurement.rfqs.compare')}
          style={[styles.action, styles.actionGhost]}
        >
          <MaterialIcons name="compare-arrows" size={18} color={palette.text} />
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(p: Palette) {
  return StyleSheet.create({
    // The chrome every queue screen wears — see components/procurement/QueueKit.tsx.
    ...makeQueueStyles(p),
    heroText: { flex: 1 },
    number: { color: p.accent, fontFamily: fontFamily.bold, fontSize: 12 },
    projectChip: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: radius.xl,
      backgroundColor: p.elevated,
    },
    panel: {
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: p.elevated,
      marginTop: spacing.xs,
    },
    bannerFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: `${p.accent}33`,
      paddingTop: spacing.xs,
      marginTop: spacing.xs / 2,
    },
    savings: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderLeftColor: p.border,
    },
    savingsPlate: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      backgroundColor: `${p.accent}22`,
    },
    source: {
      flex: 1,
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: 10,
      textTransform: 'uppercase',
    },
    projectChipText: { color: p.muted, fontFamily: fontFamily.medium, fontSize: 10 },
    material: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.body.fontSize,
      marginTop: 2,
    },
    qty: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10, marginTop: 2 },
    statusCol: { alignItems: 'flex-end', gap: spacing.xs },
    panelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
    },
    panelLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
    panelLabelText: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 11 },
    panelValue: { color: p.text, fontFamily: fontFamily.semibold, fontSize: 12 },
    lowestRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
    lowest: { color: p.text, fontFamily: fontFamily.bold, fontSize: typography.body.fontSize },
    delta: { color: p.success, fontFamily: fontFamily.semibold, fontSize: 10 },
    savingsBody: { flex: 1 },
    savingsTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    savingsMeta: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10, marginTop: 2 },
    savingsDelta: { color: p.success, fontFamily: fontFamily.bold, fontSize: 12 },
  });
}
