// Vendors — the supplier directory.
//
// DRAWING: mockup/mobile/11_proc_manager/03_orders/01_pom_order, whose <title> is "Vendor Directory"
// rather than an order list. It supersedes role_proc_manager/03_vendors/03_vendor_directory as the
// style source for this screen.
//
// REBUILT 2026-09-09 TO MATCH THAT DRAWING, after the product owner rejected the previous version for
// not looking like it. Plan: .claude/impl-pending.md PART 1.
//
// TWO RECORDED DEVIATIONS, both product-owner decisions of 2026-09-09 (ADR-085 gives composition to
// the implementation, and both of these are composition):
//
//   1. THE DRAWING PUTS THIS SCREEN ON THE ORDERS TAB — its bottom nav highlights Orders. In this app
//      the Orders tab is the purchase-order list and the directory is reached from the drawer. Asked
//      directly, the product owner said not to move it: the tab keeps the orders, the drawer keeps
//      the directory, and only the STYLE of this screen changes.
//   2. THE DRAWING PUTS THE CONFIDENCE CHIP IN THE INSIGHT CARD'S HEADER. The project standard of
//      2026-09-08 (spec §32.7, <AiCardFooter />) puts confidence in the FOOT, beside the source,
//      because "this confident" and "from this" are one sentence. Asked which wins, the product owner
//      said the standard. So the header here carries the plate and the title only, and the drawing's
//      chip is deliberately absent.
//
// A tab for PROJECT_MANAGER and PROC_MANAGER (PO decision 2026-08-10). Both read the same list;
// the "manage" action is PROC_MANAGER's alone — §6.4 gives PROJECT_MANAGER `R` on vendor management
// while §6.8 gives PROC_MANAGER `RWD`, so drawing the control for both would offer an action the
// server refuses.
//
// ONE DIRECTORY REQUEST, NOT ONE PER CHIP (changed 2026-09-09). The drawing puts a count on every
// category chip, and a count is a claim. The endpoint returns the whole directory unpaginated, so the
// screen fetches it once and both the counts and the filtering are computed over what the server
// actually sent — real numbers rather than a figure that would have had to be registered as drawn. It
// also removes a refetch on every chip press.
//
// THE TRUST SCORE IS STILL A SECOND WAVE. It is a per-vendor computation over delivery, dispute and
// quotation history, so the screen paints the names first and fills each score in as it lands. A
// vendor with no history scores null, which renders as "no score yet" rather than as a zero — zero
// would read as a terrible supplier instead of a new one.
//
// SEARCH IS CLIENT-SIDE over the directory, the same way the Site Worker directory works. It searches
// vendor NAME and CODE — the drawing's placeholder says "vendors, materials, or services", but
// materials live in their own table and are not joined here, so the placeholder says what the field
// actually does. THE MIC AND FILTER BUTTONS ARE DRAWN: no speech pipeline exists on this platform and
// the chips already are the filter, so both say so when pressed rather than being dropped from a
// screen the drawing shows them on (PO convention 2026-09-04).
//
// TOP RATED is not a stored badge — see lib/vendorBadge.ts for why it is derived from the score.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { LoadingState } from '../../components/LoadingState';
import { SearchField, SearchFieldButton } from '../../components/SearchField';
import { MaterialIcons } from '@expo/vector-icons';
import { AiCardFooter } from '../../components/AiCardFooter';
import { ProjectContextBar } from '../../components/ProjectContextBar';
import { useComingSoon } from '../../components/useComingSoon';
import { VENDOR_INSIGHT_CONFIDENCE, VENDOR_PERFORMANCE } from '../../lib/mockupFigures';
import { CosRole } from '@cos/types';
import {
  fetchVendorDirectory,
  fetchVendorScore,
  type VendorCategory,
  type VendorDirectoryEntry,
} from '../../api/procurement';
import { vendorBadge, type ScoreGrade, type VendorBadge } from '../../lib/vendorBadge';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';
import {
  fontFamily,
  plateRadius,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';
import { usePalette, type Palette, useIsDark } from '../../theme/usePalette';

/** The chip row, in the drawing's order, each with the glyph the drawing gives it. */
const CATEGORIES: readonly {
  id: VendorCategory | 'ALL';
  labelKey: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
}[] = [
  { id: 'ALL', labelKey: 'vendors.filterAll', icon: 'check' },
  { id: 'MATERIALS', labelKey: 'vendors.categoryMaterials', icon: 'category' },
  { id: 'LOGISTICS', labelKey: 'vendors.categoryLogistics', icon: 'local-shipping' },
  { id: 'SERVICES', labelKey: 'vendors.categoryServices', icon: 'handyman' },
  { id: 'EQUIPMENT', labelKey: 'vendors.categoryEquipment', icon: 'precision-manufacturing' },
];

const CATEGORY_LABEL: Record<VendorCategory, string> = {
  MATERIALS: 'vendors.categoryMaterials',
  LOGISTICS: 'vendors.categoryLogistics',
  SERVICES: 'vendors.categoryServices',
  EQUIPMENT: 'vendors.categoryEquipment',
};

const BADGE_LABEL: Record<Exclude<VendorBadge, null>, string> = {
  TOP_RATED: 'vendors.badgeTopRated',
  VERIFIED: 'vendors.badgeVerified',
  UNDER_REVIEW: 'vendors.badgeUnderReview',
  REJECTED: 'vendors.badgeRejected',
};

/** The glyph the drawing puts inside each badge chip. */
const BADGE_ICON: Record<
  Exclude<VendorBadge, null>,
  React.ComponentProps<typeof MaterialIcons>['name']
> = {
  TOP_RATED: 'star',
  VERIFIED: 'verified',
  UNDER_REVIEW: 'pending-actions',
  REJECTED: 'block',
};

/** What each score fetch resolves to. `undefined` = still loading, so the row shows nothing yet. */
type Scores = Record<string, { total: number | null; grade: ScoreGrade } | undefined>;

/** The insight card's glyph plate. Named so the plate and its radius cannot drift apart. */
const PLATE = 28;

export default function VendorsScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(p), [p]);
  const role = useAuthStore((s) => s.role);
  const canManage = role === CosRole.PROC_MANAGER;
  const comingSoon = useComingSoon();

  const [entries, setEntries] = useState<VendorDirectoryEntry[]>([]);
  const [scores, setScores] = useState<Scores>({});
  const [category, setCategory] = useState<VendorCategory | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    void (async () => {
      try {
        const list = await fetchVendorDirectory();
        if (cancelled) return;
        setEntries(list);
        // Scores are filled in per vendor afterwards. A failure on one is swallowed on purpose: a
        // vendor whose scorecard errors still belongs in the directory, just without a number.
        for (const entry of list) {
          void fetchVendorScore(entry.vendor_id)
            .then((score) => {
              if (cancelled) return;
              setScores((current) => ({
                ...current,
                [entry.vendor_id]: { total: score.totalScore, grade: score.grade },
              }));
            })
            .catch(() => {
              if (cancelled) return;
              setScores((current) => ({
                ...current,
                [entry.vendor_id]: { total: null, grade: null },
              }));
            });
        }
      } catch {
        if (cancelled) return;
        setEntries([]);
        setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The drawing's chip counts, over the directory the server returned — not a per-chip request and
  // not a drawn figure.
  const counts = useMemo(() => {
    const by: Record<string, number> = { ALL: entries.length };
    for (const e of entries) {
      if (e.category === null) continue;
      by[e.category] = (by[e.category] ?? 0) + 1;
    }
    return by;
  }, [entries]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (category !== 'ALL' && e.category !== category) return false;
      if (q === '') return true;
      return e.vendor_name.toLowerCase().includes(q) || e.vendor_code.toLowerCase().includes(q);
    });
  }, [entries, query, category]);

  // Drawn for the role that holds the right (§6.8 vendor management RWD), but there is no vendor
  // editor in the app yet — no route, no form — so it says so, the treatment the Directory's chat
  // button and the Support Center's search already use.
  const manage = useCallback(() => {
    Alert.alert(t('vendors.manage'), t('common.comingSoon'));
  }, [t]);

  return (
    <ScrollView
      testID="vendors-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      {/* The drawing's second header row. Renders nothing until a project is chosen. */}
      <ProjectContextBar />

      {/* SEARCH — the drawing carries both trailing controls INSIDE the field. */}
      <SearchField
        testID="vendors-search"
        value={query}
        onChangeText={setQuery}
        placeholder={t('vendors.searchPlaceholder')}
      >
        <SearchFieldButton
          testID="vendors-voice"
          icon="mic"
          label={t('vendors.voiceSearch')}
          onPress={() => comingSoon('vendors.voiceSearch')}
          tone={p.muted}
        />
        {/* `active` fills the plate — this drawing shows the filter button as the one that is on. */}
        <SearchFieldButton
          testID="vendors-tune"
          icon="tune"
          label={t('vendors.moreFilters')}
          onPress={() => comingSoon('vendors.moreFilters')}
          active
        />
      </SearchField>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {CATEGORIES.map(({ id, labelKey, icon }) => {
          const on = category === id;
          const n = counts[id] ?? 0;
          return (
            <Pressable
              key={id}
              testID={`vendors-filter-${id.toLowerCase()}`}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${t(labelKey)} — ${n}`}
              onPress={() => setCategory(id)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <MaterialIcons name={icon} size={16} color={on ? p.onPrimary : p.muted} />
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{t(labelKey)}</Text>
              <View style={[styles.chipCount, on && styles.chipCountOn]}>
                <Text style={[styles.chipCountText, on && styles.chipCountTextOn]}>{n}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* INSIGHT — DRAWN: nothing on this platform ranks suppliers against a negotiating
          opportunity. The source names the records this screen read rather than the drawing's absent
          integrations (ADR-098 amendment 2). The confidence is in the FOOT, not the drawing's header
          chip — deviation 2 in this file's header. */}
      <View testID="vendor-insight" style={styles.insight}>
        <View style={styles.insightHead}>
          <View style={styles.insightPlate}>
            <MaterialIcons name="auto-awesome" size={18} color={p.accent} />
          </View>
          <Text style={styles.insightTitle} numberOfLines={1}>
            {t('vendors.insight')}
          </Text>
        </View>

        <Text style={styles.insightBody}>{t('vendors.insightBody')}</Text>

        <View style={styles.insightActions}>
          <Pressable
            testID="vendor-insight-dismiss"
            accessibilityRole="button"
            accessibilityLabel={t('vendors.dismiss')}
            onPress={() => comingSoon('vendors.dismiss')}
            style={styles.dismiss}
          >
            <Text style={styles.dismissText}>{t('vendors.dismiss')}</Text>
          </Pressable>
          <Pressable
            testID="vendor-insight-act"
            accessibilityRole="button"
            accessibilityLabel={t('vendors.negotiate')}
            onPress={() => comingSoon('vendors.negotiate')}
            style={styles.insightAction}
          >
            <MaterialIcons name="handshake" size={18} color={p.bg} />
            <Text style={styles.insightActionText}>{t('vendors.negotiate')}</Text>
          </Pressable>
        </View>

        <AiCardFooter
          testID="vendor-insight-foot"
          percent={VENDOR_INSIGHT_CONFIDENCE.value}
          source={t('vendors.insightSource')}
          confLabel={t('insight.confShort')}
          sourceLabel={t('insight.sourceShort')}
          // The body already offers an action, so the foot ends at the source (PO 2026-09-09).
          bodyHasAction
          palette={p}
        />
      </View>

      {loading ? (
        <LoadingState testID="vendors-loading" variant="list" theme={isDark ? 'dark' : 'light'} />
      ) : null}

      {!loading && failed ? <Text style={styles.notice}>{t('vendors.failed')}</Text> : null}

      {!loading && !failed && visible.length === 0 ? (
        <Text testID="vendors-empty" style={styles.notice}>
          {t('vendors.empty')}
        </Text>
      ) : null}

      {visible.map((entry) => {
        const score = scores[entry.vendor_id];
        const badge = vendorBadge(entry.verification_status, score?.grade ?? null);
        // THE LEFT ACCENT IS THE STATE, the way the drawing colours its three cards: green for a
        // verified supplier, amber for one under review, cyan for the top-rated. A vendor carrying no
        // badge takes the ordinary border rather than a colour that would mean something it has not
        // earned.
        const tone =
          badge === 'TOP_RATED'
            ? p.accent
            : badge === 'VERIFIED'
              ? p.success
              : badge === 'UNDER_REVIEW'
                ? p.warning
                : badge === 'REJECTED'
                  ? p.danger
                  : p.border;
        return (
          <View key={entry.vendor_id} testID={`vendor-${entry.vendor_id}`} style={styles.card}>
            <View style={[styles.accent, { backgroundColor: tone }]} />

            <View style={styles.cardMain}>
              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  <View style={styles.nameBlock}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {entry.vendor_name}
                      </Text>
                      {badge === null ? null : (
                        <View
                          testID={`vendor-badge-${entry.vendor_id}`}
                          style={[
                            styles.badge,
                            { borderColor: `${tone}55`, backgroundColor: `${tone}1A` },
                          ]}
                        >
                          <MaterialIcons name={BADGE_ICON[badge]} size={12} color={tone} />
                          <Text style={[styles.badgeText, { color: tone }]}>
                            {t(BADGE_LABEL[badge])}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.sub} numberOfLines={1}>
                      {entry.category === null
                        ? entry.vendor_code
                        : `${t(CATEGORY_LABEL[entry.category])} • ${entry.vendor_code}`}
                    </Text>
                  </View>

                  {/* The drawing's score panel: its own box at the trailing edge, the number large
                      and in the state's colour, the words small beneath it. */}
                  <View style={styles.scoreBox}>
                    {score === undefined ? (
                      <Text style={styles.noScore}>—</Text>
                    ) : score.total === null ? (
                      <Text style={styles.noScore}>{t('vendors.noScore')}</Text>
                    ) : (
                      <>
                        <Text style={[styles.score, { color: tone }]}>
                          {Math.round(score.total)}
                        </Text>
                        <Text style={[styles.scoreLabel, { color: tone }]}>
                          {t('vendors.trustScore')}
                        </Text>
                      </>
                    )}
                  </View>
                </View>

                {/* The drawing's inset two-column panel. ACTIVE JOBS is REAL — the directory endpoint
                    counts distinct projects with an open purchase order. THE RIGHT COLUMN IS DRAWN:
                    the scorecard folds delivery, dispute and quotation history into ONE number and
                    never reports the parts, so an on-time percentage is not a figure this platform
                    holds. See VENDOR_PERFORMANCE. */}
                <View style={styles.factPanel}>
                  <View style={styles.factCol}>
                    <MaterialIcons name="engineering" size={18} color={p.muted} />
                    <View style={styles.factText}>
                      <Text style={styles.factLabel}>{t('vendors.activeJobs')}</Text>
                      <Text style={styles.factValue} numberOfLines={1}>
                        {t('vendors.activeProjects', { count: String(entry.active_project_count) })}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.factCol}>
                    <MaterialIcons name="timer" size={18} color={p.muted} />
                    <View style={styles.factText}>
                      <Text style={styles.factLabel}>{t('vendors.onTimeRate')}</Text>
                      <Text style={[styles.factValue, styles.factValueOk]} numberOfLines={1}>
                        {VENDOR_PERFORMANCE.value.onTimeRate}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* The drawing's footer bar — a separated strip on a brighter surface holding three
                  controls. Neither a vendor profile screen nor an RFQ composer exists, so both say so
                  (PO convention 2026-09-04). The overflow is PROC_MANAGER's alone (§6.8 RWD). */}
              <View style={styles.cardFoot}>
                <Pressable
                  testID={`vendor-view-${entry.vendor_id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('vendors.viewProfile')} — ${entry.vendor_name}`}
                  onPress={() => comingSoon('vendors.viewProfile')}
                  style={[styles.footBtn, styles.footBtnGhost]}
                >
                  <MaterialIcons name="visibility" size={18} color={p.accent} />
                  <Text style={styles.footBtnGhostText} numberOfLines={1}>
                    {t('vendors.viewProfile')}
                  </Text>
                </Pressable>
                <Pressable
                  testID={`vendor-rfq-${entry.vendor_id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('vendors.rfq')} — ${entry.vendor_name}`}
                  onPress={() => comingSoon('vendors.rfq')}
                  style={[styles.footBtn, styles.footBtnPrimary]}
                >
                  <MaterialIcons name="request-quote" size={18} color={p.onPrimary} />
                  <Text style={styles.footBtnPrimaryText} numberOfLines={1}>
                    {t('vendors.rfq')}
                  </Text>
                </Pressable>
                {canManage ? (
                  <Pressable
                    testID={`vendor-manage-${entry.vendor_id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('vendors.manage')} — ${entry.vendor_name}`}
                    onPress={manage}
                    style={styles.manage}
                  >
                    <MaterialIcons name="more-vert" size={20} color={p.text} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.md },

    chipRow: { gap: spacing.xs, paddingRight: spacing.md, alignItems: 'center' },
    chip: {
      minHeight: touchTarget.secondaryButton,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
    },
    chipOn: { backgroundColor: p.primary, borderColor: p.primary },
    chipText: { color: p.text, fontFamily: fontFamily.medium, fontSize: typography.label.fontSize },
    chipTextOn: { color: p.onPrimary },
    chipCount: {
      minWidth: 22,
      paddingHorizontal: spacing.xs / 2,
      paddingVertical: 1,
      borderRadius: radius.xl,
      backgroundColor: p.surfaceBright,
      alignItems: 'center',
    },
    chipCountOn: { backgroundColor: `${p.onPrimary}33` },
    chipCountText: { color: p.muted, fontFamily: fontFamily.semibold, fontSize: 10 },
    chipCountTextOn: { color: p.onPrimary },

    notice: {
      marginTop: spacing.lg,
      textAlign: 'center',
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },

    // ── The insight card ───────────────────────────────────────────────────────────────────────
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
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    insightBody: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    insightActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: spacing.xs,
    },
    dismiss: {
      minHeight: touchTarget.secondaryButton,
      paddingHorizontal: spacing.sm,
      justifyContent: 'center',
    },
    dismissText: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    insightAction: {
      minHeight: touchTarget.secondaryButton,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: p.accent,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
    },
    insightActionText: {
      color: p.bg,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },

    // ── The vendor card ────────────────────────────────────────────────────────────────────────
    card: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      flexDirection: 'row',
      overflow: 'hidden',
    },
    accent: { width: 6 },
    cardMain: { flex: 1 },
    cardBody: { padding: spacing.md, gap: spacing.sm },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    nameBlock: { flex: 1, gap: 2 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
    name: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
      lineHeight: typography.title.lineHeight,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: spacing.xs / 2,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    badgeText: {
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    sub: { color: p.muted, fontFamily: fontFamily.regular, fontSize: typography.label.fontSize },

    scoreBox: {
      minWidth: 72,
      alignItems: 'flex-end',
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xs / 2,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceBright,
    },
    score: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.hero.fontSize,
      lineHeight: typography.hero.lineHeight,
    },
    scoreLabel: {
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    noScore: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      textAlign: 'right',
    },

    factPanel: {
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.bg,
    },
    factCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    factText: { flex: 1, gap: 1 },
    factLabel: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    factValue: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    factValueOk: { color: p.success },

    cardFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: p.border,
      backgroundColor: p.surfaceBright,
    },
    footBtn: {
      flex: 1,
      minHeight: touchTarget.iconButton,
      borderRadius: radius.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs / 2,
      paddingHorizontal: spacing.xs,
    },
    footBtnGhost: { borderWidth: 1, borderColor: p.border, backgroundColor: p.surface },
    footBtnGhostText: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    footBtnPrimary: { backgroundColor: p.primary },
    footBtnPrimaryText: {
      color: p.onPrimary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    manage: {
      width: touchTarget.iconButton,
      height: touchTarget.iconButton,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
