// ── CRM_SALES_MANAGER — the pipeline, what is waiting, and where the deals sit ───────────────────
//
// DRAWING: mockup/mobile/12_crm_manager/01_home/01_dashboard (Stitch screen
// "CRM Manager Home Dashboard - Mobile"). Pulled from Stitch on 2026-09-09, when the copy in the
// repo was 18,322 bytes against that day's 22,687 and had drifted since August; pulled again on
// 2026-09-10 at 22,691 bytes after the product owner edited the drawing's HEADER BAR in Stitch to
// match `<TopBar />` — the drawing had led with the `construction` glyph, which the brand guide
// prohibits (design-tokens.md: no hard hat, crane, building, blueprint or gear icons), beside a
// tenant-switcher chevron this app does not have. The repo copy is byte-identical to Stitch, which
// is what the drift scan checks.
//
// WHY THIS SCREEN EXISTS AT ALL, given the specification said not yet. §20.7.10 read "Advanced CRM
// UI (pipeline kanban, dashboards, proposal generation) remains post-MVP", and this is a dashboard.
// Put to the product owner on 2026-09-09 as an escalation with three answers; the answer was (c) —
// build it AND amend the specification, because the role already had a Home tab and it rendered
// `<MinimalHome />`, a 22-line placeholder showing one pending-sync count. The amendment is in the
// same commit as this file.
//
// WHAT IS REAL, AND IT IS MOST OF THE SCREEN.
//   Total pipeline   sum of `Opportunity.value` where status is OPEN, in decimal.js. `value` is a
//                    DECIMAL string and §14 forbids reading it as a JS number.
//   Leads            `listLeads()` counted where status is NEW or QUALIFIED. DISQUALIFIED is not
//                    active, so it is not counted.
//   Win rate         WON / (WON + LOST). OPEN IS EXCLUDED FROM THE DENOMINATOR — a deal still being
//                    worked is not a loss, and counting it as one drags the rate down every time a
//                    salesperson opens an opportunity, which is the opposite of what the number is
//                    for. With no closed deals at all the card says so rather than printing 0%.
//   Snapshot         the three circles are three real counts: leads, opportunities, customers.
//
// WHAT IS DRAWN (lib/mockupFigures.ts, ADR-099), and each says what would delete it:
//   CRM_TREND             "+12.5% vs last month" and the win rate's "↑3%" — no historical series.
//   CRM_INTELLIGENCE      the whole card. There is NO CRM or sales report in backend/src/modules/ai/
//                         — grep returned nothing on 2026-09-09.
//   CRM_ACTION_REQUIRED   both rows. "Stalled" cannot be measured: `Opportunity` has `created_at`
//                         and `expected_close_date` and no last-activity date, so nothing knows when
//                         a deal last moved.
//
// THE CONFIDENCE IS IN THE FOOT. The drawing puts "92% / High Confidence" at the top of the
// intelligence card; the standard of 2026-09-08 (spec §32.7, `<AiCardFooter />`) puts confidence
// beside the source at the foot, and the product owner chose the standard when the same conflict
// came up on the procurement screens the same day.
//
// NO `<ProjectContextBar />`. This role is not staffed onto a project — it sells them — so the bar
// would render nothing even if it were mounted. The drawing shows none either.
//
// TWO THINGS THE DRAWING ASKS FOR THAT ARE DELIBERATELY NOT HERE:
//   1. Its bottom nav reads Home | Leads | Pipeline | Insights. The app's is
//      Home | Leads | Opportunities | Customers, which `MobileNav.tsx` takes from §20.7.10's route
//      table. Following the drawing would drop Customers — a page the specification grants — to add
//      two it defers. ADR-085 gives composition to the implementation; the bar is untouched.
//   2. The kanban behind "ดู Kanban". Deferred by the same §20.7.10 sentence as the dashboard, and
//      the amendment does not lift it. The button draws and says so.

import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Decimal from 'decimal.js';
import { useT } from '../../i18n';
import { useComingSoon } from '../useComingSoon';
import { AiCardFooter } from '../AiCardFooter';
import { listLeads, listOpportunities, listCustomers } from '../../api/crm';
import { compactMoneyLabel } from '../../lib/compactMoney';
import { CRM_ACTION_REQUIRED, CRM_INTELLIGENCE, CRM_TREND } from '../../lib/mockupFigures';
import { usePalette, type Palette } from '../../theme/usePalette';
import {
  fontFamily,
  plateRadius,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';
import { Screen, KpiRegion } from './HomeKit';

/** A lead still worth working. DISQUALIFIED is neither. */
const ACTIVE_LEAD = new Set(['NEW', 'QUALIFIED']);

/** The drawing's glyph and colour role per action row. */
const ACTION_KIND = {
  HIGH_PRIORITY: { icon: 'error', labelKey: 'home.crm.highPriority', tone: 'danger' },
  FOLLOW_UP: { icon: 'schedule', labelKey: 'home.crm.followUp', tone: 'warning' },
} as const;

/** The intelligence card's glyph plate. Named so the plate and its radius cannot drift apart. */
const PLATE = 32;

export default function CrmHome(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const styles = makeStyles(p);
  const router = useRouter();
  const soon = useComingSoon();

  const [pipeline, setPipeline] = useState<string | null>(null);
  const [activeLeads, setActiveLeads] = useState<number | null>(null);
  const [leadCount, setLeadCount] = useState<number | null>(null);
  const [opptyCount, setOpptyCount] = useState<number | null>(null);
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  /** `null` = not loaded OR no closed deal to compute from; the two render differently below. */
  const [winRate, setWinRate] = useState<number | null>(null);
  const [decided, setDecided] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  // Honest load progress: three independent fetches, counted as each settles (Rule 40).
  const [settled, setSettled] = useState(0);
  const LOAD_STEPS = 3;

  useEffect(() => {
    // `then(ok, fail)` rather than `finally`: `finally` returns a NEW promise that rejects when its
    // subject does, and discarding it leaves an unhandled rejection on every offline fetch.
    const step = <T,>(promise: Promise<T>): Promise<T> => {
      const bump = (): void => setSettled((n) => n + 1);
      promise.then(bump, bump);
      return promise;
    };

    const leads = step(listLeads())
      .then((rows) => {
        setLeadCount(rows.length);
        setActiveLeads(rows.filter((l) => ACTIVE_LEAD.has(l.status)).length);
      })
      .catch(() => {
        /* offline — the tiles keep their dash rather than claiming a count */
      });

    const oppties = step(listOpportunities())
      .then((rows) => {
        setOpptyCount(rows.length);
        // decimal.js over the OPEN rows. A null `value` contributes nothing — an opportunity
        // nobody has priced is not worth zero, it is worth an unknown amount.
        const open = rows.filter((o) => o.status === 'OPEN');
        const total = open.reduce(
          (sum, o) => (o.value === null ? sum : sum.plus(new Decimal(o.value))),
          new Decimal(0),
        );
        // COMPACT FROM A MILLION UP, exact below it (PO 2026-09-09, and the drawing's own
        // "฿ 128.4 M"). `compactMoney` already draws that line: under a million it returns
        // `formatMoney`'s exact output — the invoice format, which an amount someone acts on must
        // keep — and at or above it scales and appends the M/B suffix from the message file.
        // `maxScale: 'million'` stops a large pipeline promoting to "฿ 1.2 B" and losing the
        // resolution a sales figure is read at.
        setPipeline(compactMoneyLabel(total, 'THB', t, { maxScale: 'million' }));

        const won = rows.filter((o) => o.status === 'WON').length;
        const lost = rows.filter((o) => o.status === 'LOST').length;
        setDecided(won + lost);
        setWinRate(won + lost === 0 ? null : Math.round((won / (won + lost)) * 100));
      })
      .catch(() => {
        /* offline */
      });

    const customers = step(listCustomers())
      .then((rows) => setCustomerCount(rows.length))
      .catch(() => {
        /* offline */
      });

    void Promise.allSettled([leads, oppties, customers]).then(() => setLoading(false));
    // `t` is a dependency because the money label is assembled with it — the suffix is "M" in
    // English and "ล้าน" in Thai, so a language change has to re-run this.
  }, [t]);

  const num = (n: number | null): string => (n === null ? '—' : String(n));

  return (
    <View style={styles.root}>
      <Screen testID="home-screen" scroll>
        <KpiRegion loading={loading} settled={settled} steps={LOAD_STEPS}>
          {/* THE PIPELINE TILE — full width, with the drawing's action at its trailing edge. */}
          <View testID="kpi-pipeline" style={styles.wideTile}>
            <View style={styles.wideBody}>
              <View style={styles.tileHead}>
                <MaterialIcons name="account-balance-wallet" size={18} color={p.accent} />
                <Text style={[styles.tileLabel, styles.wideLabel]} numberOfLines={1}>
                  {t('home.crm.totalPipeline')}
                </Text>
              </View>
              {/* An em dash until the request settles — never a zero, which on a pipeline tile
                  reads as "no deals" rather than "not loaded". */}
              <Text style={styles.wideValue} numberOfLines={1} adjustsFontSizeToFit>
                {pipeline ?? '—'}
              </Text>
              {/* DRAWN — nothing records last month's pipeline. See CRM_TREND. */}
              <View style={styles.trendRow}>
                <MaterialIcons name="trending-up" size={14} color={p.success} />
                <Text style={styles.trendText}>
                  {t('home.crm.vsLastMonth', { delta: CRM_TREND.value.pipeline })}
                </Text>
              </View>
            </View>
            <Pressable
              testID="crm-view-pipeline"
              accessibilityRole="button"
              accessibilityLabel={t('home.crm.viewAll')}
              onPress={() => router.push('/opportunities')}
              style={styles.wideAction}
            >
              <Text style={styles.wideActionText}>{t('home.crm.viewAll')}</Text>
              <MaterialIcons name="chevron-right" size={16} color={p.onPrimary} />
            </Pressable>
          </View>

          <View style={styles.pairRow}>
            <Pressable
              testID="kpi-leads"
              accessibilityRole="button"
              accessibilityLabel={t('home.crm.leads')}
              onPress={() => router.push('/leads')}
              style={styles.tile}
            >
              <View style={styles.tileHead}>
                <Text style={styles.tileLabel} numberOfLines={1}>
                  {t('home.crm.leads')}
                </Text>
                <View style={styles.tilePlate}>
                  <MaterialIcons name="groups" size={16} color={p.accent} />
                </View>
              </View>
              <Text style={styles.tileValue}>{num(activeLeads)}</Text>
              <View style={styles.tileFoot}>
                <Text style={styles.tileMeta} numberOfLines={1}>
                  {t('home.crm.leadsActive')}
                </Text>
                <MaterialIcons name="chevron-right" size={16} color={p.muted} />
              </View>
            </Pressable>

            <Pressable
              testID="kpi-win-rate"
              accessibilityRole="button"
              accessibilityLabel={t('home.crm.winRate')}
              onPress={() => router.push('/opportunities')}
              style={styles.tile}
            >
              <View style={styles.tileHead}>
                <Text style={styles.tileLabel} numberOfLines={1}>
                  {t('home.crm.winRate')}
                </Text>
                <View style={styles.tilePlate}>
                  <MaterialIcons name="emoji-events" size={16} color={p.warning} />
                </View>
              </View>
              {/* THREE STATES, NOT TWO. `—` while loading; the sentence when the request came back
                  and nothing has been won or lost yet; the figure otherwise. A 0% would be a claim
                  about performance that no closed deal supports. */}
              {winRate === null && decided === 0 ? (
                <Text style={styles.noRate}>{t('home.crm.noWinRate')}</Text>
              ) : (
                <Text style={styles.tileValue}>{winRate === null ? '—' : `${winRate}%`}</Text>
              )}
              <View style={styles.tileFoot}>
                {/* DRAWN — the same missing series as the pipeline delta above. */}
                <MaterialIcons name="arrow-upward" size={13} color={p.success} />
                <Text style={[styles.tileMeta, { color: p.success }]} numberOfLines={1}>
                  {CRM_TREND.value.winRate}
                </Text>
                <MaterialIcons name="chevron-right" size={16} color={p.muted} />
              </View>
            </Pressable>
          </View>
        </KpiRegion>

        {/* ── CRM intelligence ─────────────────────────────────────────────────────────────── */}
        <View testID="crm-intelligence" style={styles.insight}>
          <View style={styles.insightHead}>
            <View style={styles.insightPlate}>
              <MaterialIcons name="smart-toy" size={18} color={p.accent} />
            </View>
            <Text style={styles.insightTitle} numberOfLines={1}>
              {t('home.crm.intelligence')}
            </Text>
          </View>

          <Text style={styles.insightBody}>{CRM_INTELLIGENCE.value.body}</Text>

          <Pressable
            testID="crm-intelligence-act"
            accessibilityRole="button"
            accessibilityLabel={CRM_INTELLIGENCE.value.action}
            onPress={() => soon('home.crm.intelligence')}
            style={styles.insightAction}
          >
            {/* GLYPH AND LABEL AS ONE GROUP, centred (PO 2026-09-09). The drawing puts a second
                arrow at the button's trailing edge; it was removed because the button already says
                where it goes, and with it gone the `send` glyph had to stop floating at the far
                left — it reads as part of the label, not as a separate control. */}
            <MaterialIcons name="send" size={16} color={p.bg} />
            <Text style={styles.insightActionText} numberOfLines={1}>
              {CRM_INTELLIGENCE.value.action}
            </Text>
          </Pressable>

          {/* The source names records THIS REPO HAS — leads, opportunities, customers — not the
              drawing's "Historical Lead Velocity & Email Sentiment", which is an integration this
              platform does not have (ADR-098 amendment 2). */}
          <AiCardFooter
            testID="crm-intelligence-foot"
            percent={CRM_INTELLIGENCE.value.confidence}
            source={t('home.crm.intelSource')}
            confLabel={t('insight.confShort')}
            sourceLabel={t('insight.sourceShort')}
            // The body already offers an action, so the foot ends at the source (PO 2026-09-09).
            bodyHasAction
            palette={p}
          />
        </View>

        {/* ── Action required ──────────────────────────────────────────────────────────────── */}
        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionLabel} accessibilityRole="header">
              {t('home.crm.actionRequired')}
            </Text>
            <View style={styles.dot} />
          </View>
          <View style={styles.pendingChip}>
            <Text style={styles.pendingText}>
              {t('home.crm.pending', { count: CRM_ACTION_REQUIRED.value.length })}
            </Text>
          </View>
        </View>

        {CRM_ACTION_REQUIRED.value.map((row) => {
          const kind = ACTION_KIND[row.kind];
          const tone = kind.tone === 'danger' ? p.danger : p.warning;
          return (
            <Pressable
              key={row.title}
              testID={`crm-action-${row.kind}`}
              accessibilityRole="button"
              accessibilityLabel={row.title}
              onPress={() => soon('home.crm.actionRequired')}
              style={styles.actionRow}
            >
              <View style={[styles.actionPlate, { backgroundColor: `${tone}26` }]}>
                <MaterialIcons name={kind.icon} size={18} color={tone} />
              </View>
              <View style={styles.actionBody}>
                <View style={styles.actionMeta}>
                  <View style={[styles.kindChip, { backgroundColor: `${tone}26` }]}>
                    <Text style={[styles.kindText, { color: tone }]}>{t(kind.labelKey)}</Text>
                  </View>
                  <Text style={styles.when}>{row.when}</Text>
                </View>
                <Text style={styles.actionTitle} numberOfLines={1}>
                  {row.title}
                </Text>
              </View>
              <View style={[styles.chevPlate, { backgroundColor: `${tone}26` }]}>
                <MaterialIcons name="chevron-right" size={18} color={tone} />
              </View>
            </Pressable>
          );
        })}

        {/* ── Pipeline snapshot ────────────────────────────────────────────────────────────── */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel} accessibilityRole="header">
            {t('home.crm.snapshot')}
          </Text>
          {/* §20.7.10 defers the kanban in the same sentence the amendment lifted for the
              dashboard. The button draws; there is no kanban behind it. */}
          <Pressable
            testID="crm-kanban"
            accessibilityRole="button"
            accessibilityLabel={t('home.crm.kanban')}
            onPress={() => soon('home.crm.kanban')}
            style={styles.viewAll}
          >
            <Text style={styles.viewAllText}>{t('home.crm.kanban')}</Text>
            <MaterialIcons name="chevron-right" size={14} color={p.accent} />
          </Pressable>
        </View>

        {/* All three counts are REAL, each from its own endpoint. */}
        <View testID="crm-snapshot" style={styles.stageCard}>
          <View style={styles.stageLine} />
          <Stage
            testID="stage-lead"
            value={num(leadCount)}
            label={t('home.crm.stageLead')}
            onPress={() => router.push('/leads')}
            styles={styles}
          />
          <Stage
            testID="stage-oppty"
            value={num(opptyCount)}
            label={t('home.crm.stageOppty')}
            onPress={() => router.push('/opportunities')}
            focus
            styles={styles}
          />
          <Stage
            testID="stage-contract"
            value={num(customerCount)}
            label={t('home.crm.stageContract')}
            onPress={() => router.push('/customers')}
            styles={styles}
          />
        </View>
      </Screen>
    </View>
  );
}

/** One circle in the snapshot row. `focus` is the drawing's ringed middle stage. */
function Stage({
  testID,
  value,
  label,
  onPress,
  focus = false,
  styles,
}: {
  testID: string;
  value: string;
  label: string;
  onPress: () => void;
  focus?: boolean;
  styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${label} — ${value}`}
      onPress={onPress}
      style={styles.stage}
    >
      <View style={[styles.stageCircle, focus && styles.stageCircleOn]}>
        <Text style={[styles.stageValue, focus && styles.stageValueOn]}>{value}</Text>
      </View>
      <Text style={styles.stageLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function makeStyles(p: Palette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: p.bg },

    // ── KPI tiles ─────────────────────────────────────────────────────────────────────────
    wideTile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    wideBody: { flex: 1, gap: 2 },
    tileHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    tileLabel: {
      flex: 1,
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    // The pipeline tile's heading is uppercase (PO 2026-09-09) — it is the screen's one hero
    // figure, and the caps set its label apart from the two ordinary tiles beneath it.
    wideLabel: { letterSpacing: 0.5, textTransform: 'uppercase' },
    wideValue: { color: p.text, fontFamily: fontFamily.bold, fontSize: 30 },
    trendRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    trendText: { color: p.success, fontFamily: fontFamily.semibold, fontSize: 11 },
    wideAction: {
      minHeight: touchTarget.secondaryButton,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: p.primary,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    wideActionText: {
      color: p.onPrimary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },

    pairRow: { flexDirection: 'row', gap: spacing.sm },
    tile: {
      flex: 1,
      gap: spacing.xs,
      minHeight: 104,
      justifyContent: 'space-between',
      padding: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    tilePlate: {
      width: 28,
      height: 28,
      borderRadius: plateRadius(28),
      backgroundColor: p.surfaceBright,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileValue: { color: p.text, fontFamily: fontFamily.bold, fontSize: 26 },
    noRate: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    tileFoot: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    tileMeta: { flex: 1, color: p.muted, fontFamily: fontFamily.regular, fontSize: 11 },

    // ── Intelligence ──────────────────────────────────────────────────────────────────────
    insight: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${p.accent}4D`,
      borderLeftWidth: 4,
      borderLeftColor: p.accent,
      backgroundColor: p.surface,
      padding: spacing.md,
      gap: spacing.sm,
    },
    insightHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    insightPlate: {
      width: PLATE,
      height: PLATE,
      borderRadius: plateRadius(PLATE),
      backgroundColor: `${p.accent}26`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    insightTitle: {
      flex: 1,
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    insightBody: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    insightAction: {
      minHeight: touchTarget.primaryButton,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: p.accent,
      flexDirection: 'row',
      alignItems: 'center',
      // The GROUP is centred, which is what keeps the glyph beside the label. Centring the label
      // instead — `flex: 1` on the text — is what pushed the glyph to the far edge while the words
      // sat in the middle, and that is the shape this replaced.
      justifyContent: 'center',
      gap: spacing.xs,
    },
    insightActionText: {
      // NO `flex: 1`. The label is sized by its own text so the glyph stays against it; the row's
      // `justifyContent: 'center'` above is what centres the pair. `flexShrink` lets a long
      // translation give way rather than pushing the glyph out of the button.
      flexShrink: 1,
      color: p.bg,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },

    // ── Sections ──────────────────────────────────────────────────────────────────────────
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
    sectionLabel: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
    },
    // A circle: 999 marks a shape whose radius is half its width.
    dot: { width: 8, height: 8, borderRadius: 999, backgroundColor: p.danger },
    pendingChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    pendingText: { color: p.muted, fontFamily: fontFamily.semibold, fontSize: 10 },
    viewAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    viewAllText: { color: p.accent, fontFamily: fontFamily.medium, fontSize: 11 },

    // ── Action rows ───────────────────────────────────────────────────────────────────────
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    actionPlate: {
      width: 40,
      height: 40,
      borderRadius: plateRadius(40),
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionBody: { flex: 1, gap: 2 },
    actionMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    kindChip: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.xl },
    kindText: {
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    when: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10 },
    actionTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    chevPlate: {
      width: 32,
      height: 32,
      borderRadius: plateRadius(32),
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── Snapshot ──────────────────────────────────────────────────────────────────────────
    stageCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    // The drawing's connecting line, behind the circles.
    stageLine: {
      position: 'absolute',
      left: spacing.xl,
      right: spacing.xl,
      top: spacing.md + 28,
      height: 1,
      backgroundColor: p.border,
    },
    stage: { alignItems: 'center', gap: spacing.xs },
    stageCircle: {
      width: 56,
      height: 56,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stageCircleOn: { borderWidth: 2, borderColor: p.primary },
    stageValue: { color: p.text, fontFamily: fontFamily.bold, fontSize: typography.body.fontSize },
    stageValueOn: { color: p.accent },
    stageLabel: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
  });
}
