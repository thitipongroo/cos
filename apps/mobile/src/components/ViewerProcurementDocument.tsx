// Procurement — what the VIEWER is allowed to watch, and nothing it can touch.
//
// DRAWING: mockup/mobile/role_viewer/06_procurement/01_procurement (Stitch screen
// "การจัดซื้อและพัสดุ - Viewer (Procurement Mobile)"), created 2026-09-11 and downloaded the same
// day; the repo copy is sha256-identical to what Stitch serves.
//
// ── WHY THIS SCREEN EXISTS SEPARATELY FROM `(app)/procurement.tsx`'s OTHER HALF ─────────────────
//
// `/procurement` has been VIEWER's third tab since 2026-08-04 and PROJECT_MANAGER's second since
// 2026-08-10, and until today both roles got the manager's dashboard — including its APPROVE
// button, wired to `approvePurchaseOrder(po.po_id, 'PM')`, with no role gate anywhere in the file.
// §20.7.9 says of this role: "No create/edit/approve actions are rendered." §32.7 justified the tab
// set by saying the three screens chosen "were each verified to contain no `onPress`/`Pressable` at
// all" — true on 2026-08-04, and untrue from the day the screen was rebuilt six days later.
//
// The route now branches on role, which is the pattern `home.tsx` has always used and `tasks`,
// `more` and `reports` adopted since (product-owner decision F1 = A, 2026-09-11). The manager keeps
// its dashboard unchanged; this role gets the screen its own drawing describes, and the approve
// button is not in it.
//
// ── READ-ONLY IS NOT UNTAPPABLE ─────────────────────────────────────────────────────────────────
//
// The first version of this file carried NO `onPress` anywhere and said so as if that were the
// point. It is not. §20.7.9 forbids create, edit and approve; opening a detail is a read, and this
// role is here to read. What that version actually shipped was two chips — `TRACK LIVE →` and
// `DISPLAYING ALL` — drawn to look like controls and answering nothing, which is the drawn dead
// control the convention of 2026-09-04 exists to prevent. The first Android capture is what showed
// it: on screen they are indistinguishable from Home's KPI tiles and Insights' `DETAILED METRICS ›`,
// both of which respond. Both now raise `useComingSoon()`, and `ViewerProcurementDocument.spec.tsx`
// counts the handlers so a third one cannot appear unnoticed.
//
// ── EVERY FIGURE HERE IS DRAWN, AND THAT IS MISSING AUTHORITY RATHER THAN MISSING DATA ──────────
//
// The queries exist. This role cannot run them. Measured 2026-09-11 with a real VIEWER token:
// `GET /procurement/purchase-orders`, `/deliveries`, `/rfqs` and `/vendors` all answer **403**,
// while §6.8 grants "Procurement (all) R". None of the 23 GET routes across the procurement and
// finance controllers lists VIEWER. Six of them are being opened in this same round (F3 = C); until
// this screen is rewired onto them, VIEWER_PROCUREMENT_KPIS, VIEWER_DELIVERY_PREDICTOR,
// VIEWER_PREDICTOR_FEEDS, VIEWER_ROUTE_INSPECTION, VIEWER_PROCUREMENT_LINES and
// VIEWER_PROCUREMENT_CONTEXT stand in, and each names the query that deletes it.
//
// THE AI CARD'S CONFIDENCE SITS IN THE FOOT, not the header where the drawing puts it. That is the
// standard set on 2026-09-08 (§32.7, `<AiCardFooter />`): "this confident" and "from this" are one
// sentence, and the product owner chose the standard the last three times the same conflict came
// up. The foot's SOURCE names a record set this repository has — the viewer's assigned projects —
// never a system it does not (ADR-098 amendment 2).

import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { AiCardFooter } from './AiCardFooter';
import { useComingSoon } from './useComingSoon';
import { compactMoneyLabel } from '../lib/compactMoney';
import {
  VIEWER_DELIVERY_PREDICTOR,
  VIEWER_PREDICTOR_FEEDS,
  VIEWER_PROCUREMENT_CONTEXT,
  VIEWER_PROCUREMENT_KPIS,
  VIEWER_PROCUREMENT_LINES,
  VIEWER_ROUTE_INSPECTION,
} from '../lib/mockupFigures';
import { useT } from '../i18n';
import { fontFamily, plateRadius, radius, spacing, typography } from '../theme/tokens';
import { usePalette, type Palette } from '../theme/usePalette';

/** The glyph plate on the context row and the step circles. */
const PLATE = 28;

/** Each monitored line's state chip: which tone it takes and which glyph goes in front of it. */
const LINE_STATE = {
  partial: { tone: 'accent', icon: null },
  delivered: { tone: 'success', icon: 'check-circle' },
  transit: { tone: 'accent', icon: null },
  pendingApproval: { tone: 'warning', icon: 'schedule' },
} as const;

export function ViewerProcurementDocument(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const soon = useComingSoon();

  const kpis = VIEWER_PROCUREMENT_KPIS.value;
  const tone = (name: 'accent' | 'success' | 'warning'): string =>
    name === 'success' ? p.success : name === 'warning' ? p.warning : p.accent;

  return (
    <ScrollView testID="viewer-procurement" style={styles.root} contentContainerStyle={styles.page}>
      {/* ── ACCESS PROFILE ────────────────────────────────────────────────────────────────────── */}
      <View testID="procurement-access" style={styles.accessCard}>
        <View style={styles.accessHead}>
          <View style={styles.accessTitleRow}>
            <MaterialIcons name="visibility" size={20} color={p.accent} />
            <Text style={styles.accessTitle}>{t('procurement.viewer.accessProfile')}</Text>
          </View>
          <View style={styles.rolePill}>
            <View style={styles.roleDot} />
            <Text style={styles.roleText}>{t('procurement.viewer.readOnlyRole')}</Text>
          </View>
        </View>

        <View style={styles.contextRow}>
          <View style={styles.contextLeft}>
            <View style={styles.contextPlate}>
              <MaterialIcons name="apartment" size={18} color={p.primary} />
            </View>
            <Text style={styles.contextName} numberOfLines={1} ellipsizeMode="tail">
              {VIEWER_PROCUREMENT_CONTEXT.value.project}
            </Text>
          </View>
          <View style={styles.contextTrail}>
            <View style={styles.lockedChip}>
              <MaterialIcons name="lock" size={14} color={p.muted} />
              <Text style={styles.lockedText}>{t('procurement.viewer.locked')}</Text>
            </View>
            <MaterialIcons name="info" size={18} color={p.muted} />
          </View>
        </View>
      </View>

      {/* ── FOUR KPI TILES ────────────────────────────────────────────────────────────────────── */}
      <View style={styles.kpiGrid}>
        <Pressable
          testID="procurement-kpi-pos"
          accessibilityRole="button"
          accessibilityLabel={t('procurement.viewer.totalPos')}
          onPress={() => soon('procurement.viewer.totalPos')}
          style={styles.kpiTile}
        >
          <View style={styles.kpiHead}>
            <View style={styles.kpiHeadLeft}>
              <Text style={styles.kpiLabel} numberOfLines={1}>
                {t('procurement.viewer.totalPos')}
              </Text>
              <MaterialIcons name="receipt" size={16} color={p.primary} />
            </View>
            <MaterialIcons name="chevron-right" size={16} color={p.muted} />
          </View>
          <View style={styles.kpiValueRow}>
            <Text style={styles.kpiValue}>{kpis.totalPos.count}</Text>
            <Text style={styles.kpiValueAside}>
              {compactMoneyLabel(kpis.totalPos.value, kpis.totalPos.currency, t, {
                maxScale: 'million',
              })}
            </Text>
          </View>
          <Text style={styles.kpiMeta}>
            {t('procurement.viewer.acrossPackages', { count: kpis.totalPos.packages })}
          </Text>
        </Pressable>

        <Pressable
          testID="procurement-kpi-delivery"
          accessibilityRole="button"
          accessibilityLabel={t('procurement.viewer.inDelivery')}
          onPress={() => soon('procurement.viewer.inDelivery')}
          style={styles.kpiTile}
        >
          <View style={styles.kpiHead}>
            <View style={styles.kpiHeadLeft}>
              <Text style={styles.kpiLabel} numberOfLines={1}>
                {t('procurement.viewer.inDelivery')}
              </Text>
              <MaterialIcons name="local-shipping" size={16} color={p.accent} />
            </View>
            <MaterialIcons name="chevron-right" size={16} color={p.muted} />
          </View>
          <View style={styles.kpiValueRow}>
            <Text style={[styles.kpiValue, { color: p.accent }]}>{kpis.inDelivery.orders}</Text>
            <Text style={styles.kpiUnit}>{t('procurement.viewer.orders')}</Text>
          </View>
          <Text style={[styles.kpiMeta, { color: p.success }]}>
            {t('procurement.viewer.arrivingToday', { count: kpis.inDelivery.arrivingToday })}
          </Text>
        </Pressable>

        <Pressable
          testID="procurement-kpi-pending"
          accessibilityRole="button"
          accessibilityLabel={t('procurement.viewer.pendingPm')}
          onPress={() => soon('procurement.viewer.pendingPm')}
          style={styles.kpiTile}
        >
          <View style={styles.kpiHead}>
            <View style={styles.kpiHeadLeft}>
              <Text style={styles.kpiLabel} numberOfLines={1}>
                {t('procurement.viewer.pendingPm')}
              </Text>
              <MaterialIcons name="hourglass-top" size={16} color={p.warning} />
            </View>
            <MaterialIcons name="chevron-right" size={16} color={p.muted} />
          </View>
          <View style={styles.kpiValueRow}>
            <Text style={[styles.kpiValue, { color: p.warning }]}>{kpis.pendingPm.items}</Text>
            <Text style={styles.kpiUnit}>{t('procurement.viewer.items')}</Text>
          </View>
          <Text style={styles.kpiMeta}>{t('procurement.viewer.awaitingSignOff')}</Text>
        </Pressable>

        <Pressable
          testID="procurement-kpi-fulfillment"
          accessibilityRole="button"
          accessibilityLabel={t('procurement.viewer.fulfillment')}
          onPress={() => soon('procurement.viewer.fulfillment')}
          style={styles.kpiTile}
        >
          <View style={styles.kpiHead}>
            <View style={styles.kpiHeadLeft}>
              <Text style={styles.kpiLabel} numberOfLines={1}>
                {t('procurement.viewer.fulfillment')}
              </Text>
              <MaterialIcons name="verified" size={16} color={p.success} />
            </View>
            <MaterialIcons name="chevron-right" size={16} color={p.muted} />
          </View>
          <View style={styles.kpiValueRow}>
            <Text style={[styles.kpiValue, { color: p.success }]}>{`${kpis.fulfillmentPct}%`}</Text>
          </View>
          <View style={styles.kpiTrack}>
            <View
              style={[
                styles.kpiFill,
                { width: `${kpis.fulfillmentPct}%`, backgroundColor: p.success },
              ]}
            />
          </View>
        </Pressable>
      </View>

      {/* ── DELIVERY PREDICTOR ────────────────────────────────────────────────────────────────── */}
      <View testID="procurement-predictor" style={styles.aiCard}>
        <View style={styles.aiHead}>
          <MaterialIcons name="auto-awesome" size={20} color={p.accent} />
          <Text style={styles.aiTitle}>{t('procurement.viewer.deliveryPredictor')}</Text>
        </View>
        <Text style={styles.aiBody}>{VIEWER_DELIVERY_PREDICTOR.value.body}</Text>

        {/* The drawing's two state chips. Registered separately from the card — they are claims
            about INFRASTRUCTURE, not about a project. See VIEWER_PREDICTOR_FEEDS. */}
        <View style={styles.feedRow}>
          {VIEWER_PREDICTOR_FEEDS.value.map((feed) => (
            <View key={feed} style={styles.feedChip}>
              <MaterialIcons
                name={feed === 'sensorFeeds' ? 'sensors' : 'query-stats'}
                size={14}
                color={p.muted}
              />
              <Text style={styles.feedText}>{t(`procurement.viewer.feed.${feed}`)}</Text>
            </View>
          ))}
        </View>

        <AiCardFooter
          testID="procurement-predictor-foot"
          percent={VIEWER_DELIVERY_PREDICTOR.value.confidence}
          source={t('insight.sourcePortfolio')}
          confLabel={t('insight.confShort')}
          sourceLabel={t('insight.sourceShort')}
          palette={p}
        />
      </View>

      {/* ── ACTIVE ROUTE INSPECTION ───────────────────────────────────────────────────────────── */}
      <View testID="procurement-route" style={styles.card}>
        <View style={styles.routeHead}>
          <View style={styles.routeTitleBlock}>
            <Text style={styles.routeTitle}>{t('procurement.viewer.activeRoute')}</Text>
            <Text style={styles.routeMeta} numberOfLines={1}>
              {t('procurement.viewer.routeRef', {
                po: VIEWER_ROUTE_INSPECTION.value.poNumber,
                vendor: VIEWER_ROUTE_INSPECTION.value.vendor,
              })}
            </Text>
          </View>
          {/* DRAWN, AND IT SAYS SO ON THE PRESS. "Track Live" needs the leg-by-leg feed the
              register entry names. An earlier version of this file carried no press at all and
              called that the safe choice; the first capture showed why it is not — a chip that
              reads TRACK LIVE → and answers nothing IS the drawn dead control, and the convention
              since 2026-09-04 is to draw it and say so when pressed. */}
          <Pressable
            testID="procurement-track-live"
            accessibilityRole="button"
            accessibilityLabel={t('procurement.viewer.trackLive')}
            onPress={() => soon('procurement.viewer.trackLive')}
            style={styles.trackChip}
          >
            <Text style={styles.trackText}>{t('procurement.viewer.trackLive')}</Text>
            <MaterialIcons name="arrow-forward" size={14} color={p.accent} />
          </Pressable>
        </View>

        <View style={styles.stepRow}>
          {VIEWER_ROUTE_INSPECTION.value.steps.map((step, index) => {
            const done = step.state === 'done';
            const current = step.state === 'current';
            const fill = done ? p.accent : current ? p.surfaceBright : p.surfaceSunk;
            const ink = done ? p.onPrimary : current ? p.accent : p.muted;
            return (
              <View key={step.key} testID={`procurement-step-${step.key}`} style={styles.step}>
                {/* The rail runs BEHIND the circles and is filled only as far as the current
                    step — the drawing's own half-filled line. */}
                {index === 0 ? null : (
                  <View
                    style={[
                      styles.stepRail,
                      { backgroundColor: done || current ? p.accent : p.border },
                    ]}
                  />
                )}
                <View
                  style={[
                    styles.stepCircle,
                    { backgroundColor: fill },
                    current && { borderWidth: 2, borderColor: p.accent },
                  ]}
                >
                  <MaterialIcons
                    name={
                      done
                        ? 'done'
                        : step.key === 'transit'
                          ? 'local-shipping'
                          : step.key === 'weighIn'
                            ? 'domain-verification'
                            : 'warehouse'
                    }
                    size={16}
                    color={ink}
                  />
                </View>
                <Text style={[styles.stepLabel, current && { color: p.accent }]} numberOfLines={1}>
                  {t(`procurement.viewer.step.${step.key}`)}
                </Text>
                <Text style={[styles.stepAt, current && { color: p.accent }]} numberOfLines={1}>
                  {step.at ?? t('procurement.viewer.stepPending')}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* ── MONITORED LINE ────────────────────────────────────────────────────────────────────── */}
      <View style={styles.sectionHead}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>{t('procurement.viewer.monitoredLine')}</Text>
          <View style={styles.countChip}>
            <Text style={styles.countText}>
              {t('procurement.viewer.entries', {
                count: VIEWER_PROCUREMENT_LINES.value.length,
              })}
            </Text>
          </View>
        </View>
        <Pressable
          testID="procurement-filter"
          accessibilityRole="button"
          accessibilityLabel={t('procurement.viewer.displayingAll')}
          onPress={() => soon('procurement.viewer.displayingAll')}
          style={styles.filterRow}
        >
          <MaterialIcons name="filter-list" size={16} color={p.muted} />
          <Text style={styles.filterText}>{t('procurement.viewer.displayingAll')}</Text>
        </Pressable>
      </View>

      {VIEWER_PROCUREMENT_LINES.value.map((line) => {
        const state = LINE_STATE[line.state];
        const color = tone(state.tone);
        return (
          <Pressable
            key={line.po}
            testID={`procurement-line-${line.po}`}
            accessibilityRole="button"
            accessibilityLabel={line.title}
            onPress={() => soon('procurement.viewer.lineDetail')}
            style={styles.lineCard}
          >
            <View style={styles.lineHead}>
              <View style={styles.lineTitleBlock}>
                <Text style={styles.linePo}>{line.po}</Text>
                <Text style={styles.lineTitle} numberOfLines={1} ellipsizeMode="tail">
                  {line.title}
                </Text>
                <Text style={styles.lineVendor} numberOfLines={1} ellipsizeMode="tail">
                  {t('procurement.viewer.vendor', { name: line.vendor })}
                </Text>
              </View>
              <View style={styles.lineTrail}>
                <View style={[styles.stateChip, { borderColor: color }]}>
                  {state.icon === null ? null : (
                    <MaterialIcons name={state.icon} size={12} color={color} />
                  )}
                  <Text style={[styles.stateText, { color }]}>
                    {line.statePct === null
                      ? t(`procurement.viewer.lineState.${line.state}`)
                      : t('procurement.viewer.lineStatePct', {
                          state: t(`procurement.viewer.lineState.${line.state}`),
                          pct: line.statePct,
                        })}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={18} color={p.muted} />
              </View>
            </View>

            <View style={styles.lineFoot}>
              <View style={styles.lineFootItem}>
                <MaterialIcons name={line.icon} size={14} color={p.muted} />
                <Text style={styles.lineFootText} numberOfLines={1}>
                  {line.metric}
                </Text>
              </View>
              <Text style={styles.lineFootText} numberOfLines={1}>
                {line.note}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: p.bg },
    page: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 3 },

    // ── access profile ────────────────────────────────────────────────────────────────────────
    accessCard: {
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    accessHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    accessTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    accessTitle: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    rolePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      backgroundColor: p.surfaceBright,
    },
    roleDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: p.muted },
    roleText: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    // RECESSED, not the page colour: a panel inside a card steps INTO it (design-tokens.md).
    contextRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      padding: spacing.xs,
      borderRadius: radius.lg,
      backgroundColor: p.surfaceSunk,
    },
    contextLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    contextPlate: {
      width: PLATE,
      height: PLATE,
      borderRadius: plateRadius(PLATE),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.surfaceBright,
    },
    contextName: {
      flexShrink: 1,
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    contextTrail: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    lockedChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: spacing.xs / 2,
      paddingVertical: 2,
      // §32.7's platform ruling: every status pill, badge and chip takes radius.xl — one token,
      // no exceptions. `badgeRadius.spec.ts` reads the stylesheet and refuses anything else.
      borderRadius: radius.xl,
      backgroundColor: p.surface,
    },
    lockedText: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },

    // ── KPI tiles ─────────────────────────────────────────────────────────────────────────────
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    kpiTile: {
      flexBasis: '48%',
      flexGrow: 0,
      gap: spacing.xs / 2,
      padding: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    // THE DRAWING'S OWN GROUPING: the label and its glyph travel together on the left and the
    // chevron sits at the trailing edge. Before this the glyph WAS the trailing element and the
    // chevron was missing entirely, which read as a tile rather than as the control the drawing
    // marks `cursor-pointer`.
    kpiHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs / 2,
    },
    kpiHeadLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      minWidth: 0,
    },
    kpiLabel: {
      flexShrink: 1,
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    kpiValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs / 2 },
    kpiValue: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.title.fontSize,
      lineHeight: typography.title.lineHeight,
    },
    kpiValueAside: {
      color: p.primary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    kpiUnit: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    kpiMeta: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    kpiTrack: {
      height: 4,
      marginTop: spacing.xs / 2,
      borderRadius: 999,
      backgroundColor: p.surfaceSunk,
      overflow: 'hidden',
    },
    kpiFill: { height: '100%', borderRadius: 999 },

    // ── cards ─────────────────────────────────────────────────────────────────────────────────
    card: {
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    aiCard: {
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 6,
      borderLeftColor: p.accent,
      backgroundColor: p.surface,
    },
    aiHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    aiTitle: {
      color: p.accent,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    aiBody: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    feedRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingTop: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: p.border,
    },
    feedChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    feedText: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    // ── route inspection ──────────────────────────────────────────────────────────────────────
    routeHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    routeTitleBlock: { flex: 1, gap: spacing.xs / 4 },
    routeTitle: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
    },
    routeMeta: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    trackChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      backgroundColor: p.surfaceBright,
    },
    trackText: {
      color: p.accent,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    stepRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.xs },
    step: { flex: 1, alignItems: 'center', gap: spacing.xs / 2 },
    // Half of a circle's width, drawn behind it and reaching back to the previous step.
    stepRail: { position: 'absolute', top: PLATE / 2, right: '50%', left: '-50%', height: 2 },
    stepCircle: {
      width: PLATE,
      height: PLATE,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepLabel: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    stepAt: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    // ── monitored line ────────────────────────────────────────────────────────────────────────
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    sectionTitle: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    countChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      backgroundColor: p.surfaceBright,
    },
    countText: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    filterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    filterText: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },

    lineCard: {
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    lineHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    lineTrail: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2, flexShrink: 0 },
    lineTitleBlock: { flex: 1, gap: spacing.xs / 4 },
    linePo: {
      color: p.primary,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
    },
    lineTitle: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
    },
    lineVendor: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    stateChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    stateText: {
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
    },
    lineFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingTop: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: p.border,
    },
    lineFootItem: {
      flexShrink: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
    },
    lineFootText: {
      flexShrink: 1,
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
  });
