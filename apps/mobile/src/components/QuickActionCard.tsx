// QuickActionCard — §32.7: 60px min height, icon + label + badge, single tap.
// A large, outdoor-friendly action tile used on role home screens.

import type { ReactNode } from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { colors, fontFamily, spacing, typography } from '../theme/tokens';

interface QuickActionCardProps {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  badge?: number;
  testID?: string;
}

export function QuickActionCard({ label, onPress, icon, badge, testID }: QuickActionCardProps) {
  return (
    <TouchableOpacity
      testID={testID}
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {typeof badge === 'number' && badge > 0 ? (
        <View testID="quick-action-badge" style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : String(badge)}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  icon: { width: 28, alignItems: 'center' },
  label: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.bg,
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.semibold,
  },
});
