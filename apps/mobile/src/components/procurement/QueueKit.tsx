// The chrome every PROCUREMENT_OFFICER queue screen wears.
//
// EXTRACTED 2026-09-08, and by the duplication ratchet rather than by taste. `mockup/mobile/
// 10_proc_officer/` draws the same frame three times — a title over a one-line subtitle, a search
// field, a horizontally scrolling row of counted status chips, cards with a coloured left edge, and
// a pinned create button — and writing it three times took `.jscpd.json`'s total from 0.63% to
// 0.82% against a 0.7% threshold. The threshold is a ratchet, not an aspiration.
//
// WHAT LIVES HERE is what all three screens share EXACTLY. What does not: the card bodies, which
// are three different things — an RFQ card carries a countdown, an order card a delivery stepper, a
// delivery card a receipt reference — and pulling those into one component with three shapes of
// prop would trade duplication for a switch statement, which is the worse of the two.

import { View, Text, Pressable, TextInput, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { fontFamily, radius, spacing, typography } from '../../theme/tokens';
import type { Palette } from '../../theme/usePalette';

export function QueueHeader({
  title,
  subtitle,
  testID,
  styles,
}: {
  title: string;
  subtitle: string;
  testID?: string;
  styles: QueueStyles;
}): React.JSX.Element {
  return (
    <View style={styles.hero}>
      {/* THE TITLE STEP, NOT HERO. A tab screen draws no hero-sized translated page title —
          `theme/__tests__/pageTitle.spec.ts` holds it, and the FINANCE payments header is where
          that was learned. */}
      <Text style={styles.heroTitle} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      <Text testID={testID} style={styles.heroSub} numberOfLines={2}>
        {subtitle}
      </Text>
    </View>
  );
}

export function QueueSearch({
  testID,
  value,
  onChangeText,
  placeholder,
  palette,
  styles,
}: {
  testID: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  palette: Palette;
  styles: QueueStyles;
}): React.JSX.Element {
  return (
    <View style={styles.search}>
      <MaterialIcons name="search" size={20} color={palette.muted} />
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        style={styles.searchInput}
        accessibilityLabel={placeholder}
      />
    </View>
  );
}

/**
 * One status chip.
 *
 * THE COUNT IS BRACKETED, as the drawings bracket them, and a null count renders NOTHING — never a
 * zero the server did not send. That distinction is the same one every count on these screens
 * makes: "none" and "not known" are different answers.
 */
export function QueueChip({
  testID,
  label,
  count,
  on,
  onPress,
  styles,
}: {
  testID: string;
  label: string;
  count: number | null;
  on: boolean;
  onPress: () => void;
  styles: QueueStyles;
}): React.JSX.Element {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
      {count === null ? null : (
        <Text style={[styles.chipCount, on && styles.chipTextOn]}>{`(${count})`}</Text>
      )}
    </Pressable>
  );
}

/** The scrolling chip row. The chips must not wrap and must not scroll the page with them. */
export function QueueChipRow({
  children,
  styles,
}: {
  children: React.ReactNode;
  styles: QueueStyles;
}): React.JSX.Element {
  return (
    <View style={styles.chipRow}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipContent}
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** The pinned create button. A sibling of the scroller, never its last row — see ProcurementHome. */
export function QueueFab({
  testID,
  label,
  onPress,
  palette,
  styles,
}: {
  testID: string;
  label: string;
  onPress: () => void;
  palette: Palette;
  styles: QueueStyles;
}): React.JSX.Element {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.fab}
    >
      <MaterialIcons name="add" size={28} color={palette.onPrimary} />
    </Pressable>
  );
}

export type QueueStyles = ReturnType<typeof makeQueueStyles>;

export function makeQueueStyles(p: Palette) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: p.bg, padding: spacing.md, gap: spacing.sm },
    hero: { gap: 2 },
    heroTitle: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.title.fontSize,
      textTransform: 'uppercase',
    },
    heroSub: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 12 },
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: 48,
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
      padding: 0,
    },
    chipRow: { flexGrow: 0 },
    chipContent: { gap: spacing.xs, paddingRight: spacing.md },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    chipOn: { backgroundColor: p.primary, borderColor: p.primary },
    chipText: { color: p.muted, fontFamily: fontFamily.medium, fontSize: 12 },
    chipCount: { color: p.muted, fontFamily: fontFamily.semibold, fontSize: 12 },
    chipTextOn: { color: p.onPrimary },
    listRegion: { flex: 1 },
    list: { gap: spacing.sm, paddingBottom: spacing.xl },
    card: {
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      borderLeftColor: p.border,
      backgroundColor: p.surface,
    },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    cardHeadText: { flex: 1 },
    numberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
    statusPill: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    statusText: { fontFamily: fontFamily.semibold, fontSize: 10, textTransform: 'uppercase' },
    banner: { borderLeftColor: p.accent, borderColor: p.accent },
    bannerHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
    },
    bannerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
    bannerTitle: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    body: { color: p.text, fontFamily: fontFamily.regular, fontSize: typography.caption.fontSize },
    confChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${p.accent}66`,
    },
    confText: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      textTransform: 'uppercase',
    },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      minHeight: 44,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
    },
    actionPrimary: { flex: 1, backgroundColor: p.primary },
    actionPrimaryText: {
      color: p.onPrimary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },
    actionGhost: { borderWidth: 1, borderColor: p.border, backgroundColor: p.elevated },
    actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
    empty: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      textAlign: 'center',
      paddingVertical: spacing.xl,
    },
    backPlate: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    fab: {
      position: 'absolute',
      right: spacing.md,
      bottom: spacing.md,
      width: 56,
      height: 56,
      alignItems: 'center',
      justifyContent: 'center',
      // A circle: 999 is the documented capsule marker for a shape whose radius is half its width.
      borderRadius: 999,
      backgroundColor: p.primary,
    },
  });
}
