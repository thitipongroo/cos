// QuickActionCard (§32.7; G-M9) — 60px min-height tap target with an icon + label + optional count
// badge, single tap. Used on the field Home for one-tap access to daily actions.
//
// `variant` selects the palette: 'light' is the default field-app surface (§32.7 Mobile Colour
// Tokens); 'dark' is for the screens §32.7 "Mobile Dark Surfaces" lists, currently the Site
// Engineer Home. `icon` takes either an emoji string or a rendered node (e.g. a MaterialIcons
// glyph) — string callers predate the icon library and still work unchanged.

import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, darkColors, fontFamily, radius, spacing, typography } from '../theme/tokens';

export type QuickActionVariant = 'light' | 'dark';

export function QuickActionCard({
  icon,
  label,
  badge,
  onPress,
  testID,
  variant = 'light',
}: {
  icon?: string | ReactNode;
  label: string;
  badge?: number;
  onPress: () => void;
  testID?: string;
  variant?: QuickActionVariant;
}) {
  const dark = variant === 'dark';
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.card, dark && styles.cardDark]}
      onPress={onPress}
    >
      {typeof icon === 'string' ? <Text style={styles.icon}>{icon}</Text> : (icon ?? null)}
      <Text style={[styles.label, dark && styles.labelDark]} numberOfLines={2}>
        {label}
      </Text>
      {typeof badge === 'number' && badge > 0 ? (
        <View style={[styles.badge, dark && styles.badgeDark]}>
          <Text style={[styles.badgeText, dark && styles.badgeTextDark]}>{badge}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 60,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  cardDark: {
    backgroundColor: darkColors.surface,
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  icon: { fontSize: 22 },
  label: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  labelDark: { color: darkColors.text },
  badge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    minWidth: 18,
    height: 18,
    borderRadius: radius.xl,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeDark: { backgroundColor: darkColors.danger },
  badgeText: {
    color: colors.bg,
    fontSize: 10,
    fontFamily: fontFamily.bold,
  },
  badgeTextDark: { color: darkColors.text },
});
