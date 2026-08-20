// OptimisticList (§32.7; G-M10) — a FlatList wrapper for offline-first lists: renders items instantly,
// dims those still syncing (isPending), and shows a Retry affordance for items whose sync failed
// (isFailed + onRetry). Generic/reusable — a screen supplies the per-item state predicates. Intended
// for offline create/update flows where a row appears immediately and reconciles on sync.

import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { colors, fontFamily, radius, spacing, typography } from '../theme/tokens';

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

/**
 * One row, memoized.
 *
 * The row is given the ITEM and the caller's `renderItem`, not a rendered element — an element is a
 * new object on every render and would defeat the comparison outright. A caller whose `renderItem`
 * and predicates are stable (useCallback) therefore gets rows that skip; a caller whose are not is
 * no worse off than before.
 */
interface OptimisticRowProps<T> {
  item: T;
  pending: boolean;
  failed: boolean;
  renderItem: (item: T) => ReactNode;
  onRetry?: (item: T) => void;
  retryLabel: string;
}

const OptimisticRow = memo(function OptimisticRow<T>({
  item,
  pending,
  failed,
  renderItem,
  onRetry,
  retryLabel,
}: OptimisticRowProps<T>) {
  return (
    <View style={[styles.row, pending && styles.pending]}>
      <View style={styles.content}>{renderItem(item)}</View>
      {failed && onRetry ? (
        <TouchableOpacity
          style={styles.retry}
          onPress={() => onRetry(item)}
          accessibilityRole="button"
          // The caller supplies the word; it is already an i18n string on its side (QM-3).
          accessibilityLabel={retryLabel}
        >
          <Text style={styles.retryText}>{retryLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
  // memo() erases the generic — React types it as a component over `unknown` props. The cast puts
  // the parameter back so a caller's `renderItem: (item: T) => ReactNode` still type-checks; the
  // runtime value is unchanged.
}) as <T>(props: OptimisticRowProps<T>) => React.JSX.Element;

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
  const renderRow = useCallback(
    ({ item }: { item: T }) => (
      <OptimisticRow
        item={item}
        pending={isPending?.(item) ?? false}
        failed={isFailed?.(item) ?? false}
        renderItem={renderItem}
        onRetry={onRetry}
        retryLabel={retryLabel}
      />
    ),
    [isPending, isFailed, renderItem, onRetry, retryLabel],
  );

  return (
    <FlatList
      testID={testID}
      data={data}
      keyExtractor={keyExtractor}
      ListEmptyComponent={emptyText ? <Text style={styles.empty}>{emptyText}</Text> : null}
      renderItem={renderRow}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  content: { flex: 1 },
  pending: { opacity: 0.5 },
  retry: {
    borderRadius: radius.lg,
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
