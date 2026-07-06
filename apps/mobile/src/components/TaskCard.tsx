// TaskCard — §32.7: swipeable (swipe-right = done), status badge, photo count.
// Swipe is handled with React Native's built-in PanResponder (no extra gesture dependency).

import { useRef } from 'react';
import { View, Text, StyleSheet, PanResponder, Animated } from 'react-native';
import { StatusChip } from './StatusChip';
import { colors, fontFamily, spacing, typography } from '../theme/tokens';

const SWIPE_THRESHOLD = 96; // px to the right to mark done

interface TaskCardProps {
  title: string;
  status: string;
  photoCount?: number;
  onComplete?: () => void;
  testID?: string;
}

export function TaskCard({ title, status, photoCount, onComplete, testID }: TaskCardProps) {
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dx > 8 && Math.abs(g.dy) < Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        if (g.dx > 0) translateX.setValue(g.dx);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dx >= SWIPE_THRESHOLD) {
          onComplete?.();
        }
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  return (
    <Animated.View
      testID={testID}
      style={[styles.card, { transform: [{ translateX }] }]}
      {...panResponder.panHandlers}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <StatusChip label={status} testID="task-card-status" />
      </View>
      {typeof photoCount === 'number' && photoCount > 0 ? (
        <Text testID="task-card-photos" style={styles.photos}>
          {`📷 ${photoCount}`}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 60,
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
  },
  photos: {
    color: colors.textSecondary,
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.medium,
  },
});
