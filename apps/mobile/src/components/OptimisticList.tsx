// OptimisticList — §32.7: instant UI update, rollback on failure, retry option.
// Presentational: the parent adds an item optimistically (state 'pending'), flips it to 'synced'
// on success or 'failed' on error (rollback = remove it from `items`); failed rows expose Retry.

import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { useT } from '../i18n';
import { colors, fontFamily, spacing, typography } from '../theme/tokens';

export type OptimisticState = 'pending' | 'synced' | 'failed';

export interface OptimisticItem {
  id: string;
  label: string;
  state: OptimisticState;
}

interface OptimisticListProps {
  items: OptimisticItem[];
  onRetry?: (id: string) => void;
  testID?: string;
}

const DOT_COLOR: Record<OptimisticState, string> = {
  pending: colors.syncing,
  synced: colors.synced,
  failed: colors.danger,
};

export function OptimisticList({ items, onRetry, testID }: OptimisticListProps) {
  const t = useT();
  return (
    <FlatList
      testID={testID}
      data={items}
      keyExtractor={(it) => it.id}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text
            style={[styles.label, item.state === 'pending' ? styles.pending : null]}
            numberOfLines={1}
          >
            {item.label}
          </Text>
          {item.state === 'failed' ? (
            <TouchableOpacity
              testID={`optimistic-retry-${item.id}`}
              onPress={() => onRetry?.(item.id)}
              accessibilityRole="button"
            >
              <Text style={styles.retry}>{t('sync.retry')}</Text>
            </TouchableOpacity>
          ) : (
            <View
              testID={`optimistic-dot-${item.id}`}
              style={[styles.dot, { backgroundColor: DOT_COLOR[item.state] }]}
            />
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  label: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
  },
  pending: { opacity: 0.5 },
  retry: {
    color: colors.primary,
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.semibold,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
