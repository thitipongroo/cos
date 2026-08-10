// Vendors — the supplier directory (mockup 06_project_manager/03_vendors/01_vendor_directory).
//
// A tab for PROJECT_MANAGER and PROC_MANAGER (PO decision 2026-08-10). Both read the same list;
// the "manage" action is PROC_MANAGER's alone — §6.4 gives PROJECT_MANAGER `R` on vendor management
// while §6.8 gives PROC_MANAGER `RWD`, so drawing the control for both would offer an action the
// server refuses.
//
// TWO REQUESTS, DELIBERATELY. The directory endpoint returns the vendors and their open-project
// count; the trust score is a separate per-vendor computation over delivery, dispute and quotation
// history, so the screen paints the names first and fills each score in as it lands. A vendor with no
// history scores null, which renders as "no score yet" rather than as a zero — zero would read as a
// terrible supplier instead of a new one.
//
// SEARCH IS CLIENT-SIDE over the page the server returned, the same way the Site Worker directory
// works. It searches vendor NAME and CODE — the mockup's placeholder says "vendors, materials, or
// services", but materials live in their own table and are not joined here, so the placeholder says
// what the field actually does.
//
// TOP RATED is not a stored badge — see lib/vendorBadge.ts for why it is derived from the score.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
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
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, type Palette } from '../../theme/usePalette';

const CATEGORIES: readonly { id: VendorCategory | 'ALL'; labelKey: string }[] = [
  { id: 'ALL', labelKey: 'vendors.filterAll' },
  { id: 'MATERIALS', labelKey: 'vendors.categoryMaterials' },
  { id: 'LOGISTICS', labelKey: 'vendors.categoryLogistics' },
  { id: 'SERVICES', labelKey: 'vendors.categoryServices' },
  { id: 'EQUIPMENT', labelKey: 'vendors.categoryEquipment' },
];

const BADGE_LABEL: Record<Exclude<VendorBadge, null>, string> = {
  TOP_RATED: 'vendors.badgeTopRated',
  VERIFIED: 'vendors.badgeVerified',
  UNDER_REVIEW: 'vendors.badgeUnderReview',
  REJECTED: 'vendors.badgeRejected',
};

/** What each score fetch resolves to. `undefined` = still loading, so the row shows nothing yet. */
type Scores = Record<string, { total: number | null; grade: ScoreGrade } | undefined>;

export default function VendorsScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const role = useAuthStore((s) => s.role);
  const canManage = role === CosRole.PROC_MANAGER;

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
        const list = await fetchVendorDirectory(category === 'ALL' ? undefined : category);
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
  }, [category]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return entries;
    return entries.filter(
      (e) => e.vendor_name.toLowerCase().includes(q) || e.vendor_code.toLowerCase().includes(q),
    );
  }, [entries, query]);

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
      <View style={styles.search}>
        <MaterialIcons name="search" size={22} color={p.muted} />
        <TextInput
          testID="vendors-search"
          value={query}
          onChangeText={setQuery}
          placeholder={t('vendors.searchPlaceholder')}
          placeholderTextColor={p.muted}
          accessibilityLabel={t('vendors.searchPlaceholder')}
          style={styles.searchInput}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {CATEGORIES.map(({ id, labelKey }) => {
          const on = category === id;
          return (
            <Pressable
              key={id}
              testID={`vendors-filter-${id.toLowerCase()}`}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t(labelKey)}
              onPress={() => setCategory(id)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{t(labelKey)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator testID="vendors-loading" color={p.primary} style={styles.spinner} />
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
        return (
          <View key={entry.vendor_id} testID={`vendor-${entry.vendor_id}`} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.nameBlock}>
                <Text style={styles.name}>{entry.vendor_name}</Text>
                <Text style={styles.code}>{entry.vendor_code}</Text>
              </View>
              <View style={styles.scoreBlock}>
                {score === undefined ? null : score.total === null ? (
                  <Text style={styles.noScore}>{t('vendors.noScore')}</Text>
                ) : (
                  <>
                    <Text style={styles.score}>{Math.round(score.total)}</Text>
                    <Text style={styles.scoreLabel}>{t('vendors.trustScore')}</Text>
                  </>
                )}
              </View>
            </View>

            <View style={styles.factRow}>
              <View style={styles.fact}>
                <MaterialIcons name="engineering" size={18} color={p.muted} />
                <Text style={styles.factText}>
                  {t('vendors.activeProjects', { count: String(entry.active_project_count) })}
                </Text>
              </View>
              {badge !== null ? (
                <View testID={`vendor-badge-${entry.vendor_id}`} style={styles.badge}>
                  <Text style={styles.badgeText}>{t(BADGE_LABEL[badge])}</Text>
                </View>
              ) : null}
            </View>

            {canManage ? (
              <Pressable
                testID={`vendor-manage-${entry.vendor_id}`}
                accessibilityRole="button"
                accessibilityLabel={`${t('vendors.manage')} — ${entry.vendor_name}`}
                onPress={manage}
                style={styles.manage}
              >
                <MaterialIcons name="more-horiz" size={20} color={p.text} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.md },

    search: {
      minHeight: touchTarget.formInput,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      paddingHorizontal: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    searchInput: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      paddingVertical: 0,
    },

    chipRow: { gap: spacing.xs, paddingRight: spacing.md },
    chip: {
      minHeight: touchTarget.secondaryButton,
      paddingHorizontal: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      justifyContent: 'center',
    },
    chipOn: { backgroundColor: p.primary, borderColor: p.primary },
    chipText: { color: p.text, fontFamily: fontFamily.medium, fontSize: typography.label.fontSize },
    chipTextOn: { color: p.onPrimary },

    spinner: { marginTop: spacing.xl },
    notice: {
      marginTop: spacing.lg,
      textAlign: 'center',
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },

    card: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      padding: spacing.md,
      gap: spacing.sm,
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    nameBlock: { flex: 1, gap: spacing.xs / 2 },
    name: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
      lineHeight: typography.title.lineHeight,
    },
    code: { color: p.muted, fontFamily: fontFamily.regular, fontSize: typography.label.fontSize },
    scoreBlock: { alignItems: 'flex-end' },
    score: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: typography.hero.fontSize,
      lineHeight: typography.hero.lineHeight,
    },
    scoreLabel: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    noScore: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    factRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    fact: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    factText: {
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    badge: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.bg,
    },
    badgeText: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },

    manage: {
      alignSelf: 'flex-end',
      width: touchTarget.iconButton,
      height: touchTarget.iconButton,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: p.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
