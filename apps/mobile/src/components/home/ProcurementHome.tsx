// ── PROCUREMENT_OFFICER — the four queues, the vendor analysis, and what just happened ──────────
//
// Implements mockup/mobile/10_proc_officer/01_home/01_po_dashboard.
//
// REBUILT 2026-09-08 for that drawing. What was here was five stacked KPI tiles — committed spend,
// open RFQs, RFQs closing within 24h, POs awaiting acknowledgment, deliveries — and the drawing is a
// 2x2 bento of the four QUEUES this role works: requests to approve, RFQs running, awards waiting on
// a purchase order, deliveries arriving today. Each tile is a stage of the same pipeline, in order.
//
// WHAT IS REAL, AND WHERE FROM.
//   PR awaiting approval   `GET /procurement/purchase-requests?status=SUBMITTED`, the server's own
//                          `total`. SUBMITTED is the one state that means waiting on a person —
//                          DRAFT is a request nobody has sent. The set is declared in
//                          `backend/src/modules/procurement/procurement.rows.ts`.
//   RFQs in progress       PUBLISHED + EVALUATED, two counts from the same endpoint.
//   Awaiting PO            AWARDED or EVALUATED RFQs whose `rfq_id` appears on no purchase order.
//                          Computed here from two lists this screen already fetches, because that
//                          is what "the award is decided, the order is not open yet" is.
//   Deliveries today       `delivered_at` on today's date, over `GET /procurement/deliveries`.
//   The analysis module    `<ProcurementInsight />` — genuine model output from
//                          `/ai/reports/procurement-summary`, with its own confidence and the
//                          project it read. It is not dressed up here and not faked when idle.
//
// THE SOURCE LINE NAMES THE PROJECT, NOT THE DRAWING'S SYSTEMS. `01_po_dashboard` foots its analysis
// card "แหล่งข้อมูล: Integrated ERP & Market Benchmarks". Neither exists in this repository. Every
// other card in the app names the project its figures came from instead — the carve-out ADR-098's
// second amendment opened, applied here for the fifth time.
//
// WHAT IS DRAWN: the activity feed, entire (`PROC_ACTIVITY_FEED` in the register). There is no
// activity endpoint for this role; `platform.audit_logs` records field changes for TENANT_ADMIN and
// nothing aggregates procurement events into a feed.
//
// THE FAB DRAWS AND SAYS SO. `POST /procurement/rfqs` and `POST /procurement/purchase-orders` both
// exist, but a create FORM is a screen this drawing does not contain, so the button opens the
// "coming soon" dialog rather than a half-built sheet (the `more.tsx` convention, PO 2026-09-04).

import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useT } from '../../i18n';
import { useComingSoon } from '../useComingSoon';
import {
  listPurchaseRequests,
  listRfqs,
  listPurchaseOrders,
  listDeliveries,
} from '../../api/procurement';
import { PROC_ACTIVITY_FEED } from '../../lib/mockupFigures';
import { ProcurementInsight } from '../ProcurementInsight';
import { listProjects, type TenantProject } from '../../api/projects';
import { usePalette, type Palette } from '../../theme/usePalette';
import { fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { Screen, KpiRegion } from './HomeKit';

/** The four queues, in the order the drawing lays them out and the work happens in. */
type TileKey = 'requests' | 'rfqs' | 'awaitingPo' | 'deliveries';

interface Counts {
  requests: number | null;
  rfqs: number | null;
  awaitingPo: number | null;
  deliveries: number | null;
}

const EMPTY: Counts = { requests: null, rfqs: null, awaitingPo: null, deliveries: null };

const TILES: Array<{
  key: TileKey;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  tone: keyof Pick<Palette, 'warning' | 'accent' | 'muted' | 'success'>;
}> = [
  { key: 'requests', icon: 'assignment-late', tone: 'warning' },
  { key: 'rfqs', icon: 'request-quote', tone: 'accent' },
  { key: 'awaitingPo', icon: 'pending-actions', tone: 'muted' },
  { key: 'deliveries', icon: 'local-shipping', tone: 'success' },
];

/** Same day in the device's own timezone — a delivery "today" is today where the reader is. */
function isToday(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function ProcurementHome() {
  const palette = usePalette();
  const styles = makeStyles(palette);
  const t = useT();
  const [counts, setCounts] = useState<Counts>(EMPTY);
  const [projects, setProjects] = useState<TenantProject[]>([]);
  const [insightProject, setInsightProject] = useState('');
  const [loading, setLoading] = useState(true);
  // Honest load progress: four independent fetches, counted as each settles (Rule 40).
  const [settled, setSettled] = useState(0);
  const LOAD_STEPS = 4;

  useEffect(() => {
    const now = new Date();
    // `then(ok, fail)` rather than `finally`, and the difference is not style: `finally` returns a
    // NEW promise that rejects when its subject does, and discarding it with `void` leaves an
    // unhandled rejection on every offline fetch. The two-argument form settles either way.
    const step = <T,>(p: Promise<T>): Promise<T> => {
      const bump = (): void => setSettled((n) => n + 1);
      p.then(bump, bump);
      return p;
    };
    const requests = step(listPurchaseRequests('SUBMITTED'))
      .then((r) => setCounts((c) => ({ ...c, requests: r.total })))
      .catch(() => {
        /* offline — the tile keeps its dash rather than claiming a zero */
      });
    // Both RFQ counts and the awaiting-PO answer come from these two lists, so they are fetched once
    // and read three ways rather than asked for three times.
    const pipeline = step(Promise.all([listRfqs(), listPurchaseOrders()]))
      .then(([rfqRes, poRes]) => {
        const running = rfqRes.items.filter(
          (r) => r.status === 'PUBLISHED' || r.status === 'EVALUATED',
        ).length;
        const ordered = new Set(
          poRes.items.map((p) => (p as { rfq_id?: string }).rfq_id).filter(Boolean),
        );
        const awaitingPo = rfqRes.items.filter(
          (r) => (r.status === 'AWARDED' || r.status === 'EVALUATED') && !ordered.has(r.rfq_id),
        ).length;
        setCounts((c) => ({ ...c, rfqs: running, awaitingPo }));
      })
      .catch(() => {
        /* offline */
      });
    const deliveries = step(listDeliveries())
      .then((r) =>
        setCounts((c) => ({
          ...c,
          deliveries: r.items.filter((d) => isToday(d.delivered_at, now)).length,
        })),
      )
      .catch(() => {
        /* offline */
      });
    // `GET /projects`, not `/projects/mine`: this role is a member of no project — it buys for the
    // whole tenant — so "which are mine" answers nothing. The first is what the analysis reads.
    const mine = step(listProjects())
      .then((rows) => {
        setProjects(rows);
        if (rows[0] !== undefined) setInsightProject(rows[0].project_id);
      })
      .catch(() => {
        /* offline — the panel stays idle rather than naming a project it could not fetch */
      });
    void Promise.allSettled([requests, pipeline, deliveries, mine]).then(() => setLoading(false));
  }, []);

  const soon = useComingSoon();

  const projectName = projects.find((p) => p.project_id === insightProject)?.project_name;

  return (
    // THE PAGE SCROLLS AND THE BUTTON DOES NOT. `<Screen />` without `scroll` is a plain flex View,
    // so the feed and the button below it were clipped by the bottom nav — the first capture caught
    // the FAB cut in half. The button is a sibling of the scroller, pinned, which is also what the
    // drawing shows.
    <View style={styles.root}>
      <Screen testID="home-screen" scroll>
        <KpiRegion loading={loading} settled={settled} steps={LOAD_STEPS}>
          {/* The drawing's 2x2 bento. Two per row, each with its own accent strip, glyph, count and
              the chevron that says the tile opens something. */}
          <View style={styles.bento}>
            {TILES.map((tile) => {
              const value = counts[tile.key];
              const tone = palette[tile.tone];
              return (
                <Pressable
                  key={tile.key}
                  testID={`kpi-${tile.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={t(`home.procurement.tiles.${tile.key}`)}
                  onPress={() => soon(`home.procurement.tiles.${tile.key}`)}
                  style={[styles.tile, { borderLeftColor: tone }]}
                >
                  <View style={styles.tileHead}>
                    {/* ONE LINE (PO 2026-09-08). At two, "PRs awaiting approval" wrapped and that
                        tile stood a row taller than the three beside it, breaking the bento grid.
                        Two things hold it: the English label was shortened to say the same thing in
                        fewer words, and `adjustsFontSizeToFit` shrinks whatever a translation makes
                        longer rather than wrapping or clipping it. Thai is already short enough. */}
                    <Text
                      style={styles.tileLabel}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {t(`home.procurement.tiles.${tile.key}`)}
                    </Text>
                    <MaterialIcons name={tile.icon} size={20} color={tone} />
                  </View>
                  <View style={styles.tileFoot}>
                    {/* An em dash, never a 0, until the request settles: "not loaded" and "none" are
                        different answers and a queue tile stating the second one is a lie. */}
                    <Text style={[styles.tileValue, { color: tone }]}>
                      {value === null ? '—' : String(value)}
                    </Text>
                    <MaterialIcons name="chevron-right" size={18} color={tone} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </KpiRegion>

        {/* NO PROJECT PICKER ROW (PO decision 2026-09-08). The drawing has none, and the four tiles
            above count the whole tenant — a row of project chips under them invited the reading that
            they did not. The analysis below IS per project, because
            `/ai/reports/procurement-summary` is, so it takes the tenant's first project and NAMES IT
            in its own footer, which is where a reader finds out which one. Same shape as the FINANCE
            cash-flow card: advice has to be about somewhere. */}
        <ProcurementInsight projectId={insightProject} projectLabel={projectName} />

        {/* DRAWN, entire — see PROC_ACTIVITY_FEED in the register. Kept because the drawing's shape is
            the point of the screen's lower half, and marked here rather than on screen. */}
        <View style={styles.feed}>
          <View style={styles.feedHead}>
            <View style={styles.feedTitleRow}>
              <MaterialIcons name="history" size={18} color={palette.accent} />
              <Text style={styles.feedTitle}>{t('home.procurement.activity')}</Text>
            </View>
            <Pressable
              testID="activity-view-all"
              accessibilityRole="button"
              accessibilityLabel={t('home.procurement.viewAll')}
              onPress={() => soon('home.procurement.activity')}
              style={styles.feedAll}
            >
              <Text style={styles.feedAllText}>{t('home.procurement.viewAll')}</Text>
              <MaterialIcons name="chevron-right" size={14} color={palette.accent} />
            </Pressable>
          </View>
          {PROC_ACTIVITY_FEED.value.map((row) => (
            <View key={row.title} testID={`activity-${row.icon}`} style={styles.row}>
              <View style={styles.rowPlate}>
                <MaterialIcons name={row.icon} size={20} color={palette.accent} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {row.title}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {row.meta}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={palette.muted} />
            </View>
          ))}
        </View>
      </Screen>

      {/* The drawing's create button. It draws and says so — see the header note. */}
      <Pressable
        testID="procurement-fab"
        accessibilityRole="button"
        accessibilityLabel={t('home.procurement.create')}
        onPress={() => soon('home.procurement.create')}
        style={styles.fab}
      >
        <MaterialIcons name="add" size={28} color={palette.onPrimary} />
      </Pressable>
    </View>
  );
}

function makeStyles(p: Palette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: p.bg },
    bento: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    tile: {
      // Two per row: half the width, less half the gap.
      flexBasis: '48%',
      flexGrow: 1,
      minHeight: 108,
      justifyContent: 'space-between',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      backgroundColor: p.surface,
    },
    tileHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
    tileLabel: {
      flex: 1,
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    tileFoot: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    tileValue: { fontFamily: fontFamily.bold, fontSize: 32, lineHeight: 34 },
    feed: { gap: spacing.sm },
    feedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    feedTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
    feedTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
    },
    feedAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    feedAllText: { color: p.accent, fontFamily: fontFamily.medium, fontSize: 11 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 64,
      padding: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    rowPlate: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      // A circle, not a plate on the radius scale — the drawing rounds it fully.
      borderRadius: 999,
      backgroundColor: `${p.accent}22`,
    },
    rowBody: { flex: 1 },
    rowTitle: {
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    rowMeta: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 11, marginTop: 2 },
    fab: {
      position: 'absolute',
      right: spacing.md,
      bottom: spacing.md,
      width: 56,
      height: 56,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      backgroundColor: p.primary,
    },
  });
}
