// OptimisticList (§32.7; G-M10) — a FlatList wrapper for offline-first lists: renders items instantly,
// dims those still syncing (isPending), and shows a Retry affordance for items whose sync failed
// (isFailed + onRetry). Generic/reusable — a screen supplies the per-item state predicates. Intended
// for offline create/update flows where a row appears immediately and reconciles on sync.

import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { colors, fontFamily, spacing, typography } from '../theme/tokens';

export interface OptimisticListProps<T> {
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** true while the item's write is still pending sync → shown dimmed. */
  isPending?: (item: T) => boolean;
  /** true when the item's sync failed → shows a Retry action. */
  isFailed?: (item: T) => boolean;
  /** invoked when the user taps Retry on a failed item. */
  onRetry?: (item: T) => void;
  emptyText?: string;
  retryLabel?: string;
  testID?: string;
}

export function OptimisticList<T>({
  data,
  keyExtractor,
  renderItem,
  isPending,
  isFailed,
  onRetry,
  emptyText,
  retryLabel = 'Retry',
  testID,
}: OptimisticListProps<T>) {
  return (
    <FlatList
      testID={testID}
      data={data}
      keyExtractor={keyExtractor}
      ListEmptyComponent={emptyText ? <Text style={styles.empty}>{emptyText}</Text> : null}
      renderItem={({ item }) => {
        const pending = isPending?.(item) ?? false;
        const failed = isFailed?.(item) ?? false;
        return (
          <View style={[styles.row, pending && styles.pending]}>
            <View style={styles.content}>{renderItem(item)}</View>
            {failed && onRetry ? (
              <TouchableOpacity style={styles.retry} onPress={() => onRetry(item)}>
                <Text style={styles.retryText}>{retryLabel}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  content: { flex: 1 },
  pending: { opacity: 0.5 },
  retry: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  retryText: {
    color: colors.danger,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
  empty: { color: colors.textSecondary, fontFamily: fontFamily.regular, padding: spacing.md },
});
