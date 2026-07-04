// StatusChip — small status pill using §32.7 mobile tokens.
// Covers task/issue/report/sync statuses; unknown labels fall back to a neutral chip.

import { View, Text, StyleSheet } from 'react-native';
import { useI18n } from '../i18n';
import { colors, fontFamily, typography } from '../theme/tokens';

const STATUS_COLOR: Record<string, string> = {
  // success-ish
  DONE: colors.success,
  RESOLVED: colors.success,
  CLOSED: colors.success,
  APPROVED: colors.success,
  SYNCED: colors.synced,
  // in-progress / pending
  IN_PROGRESS: colors.warning,
  SUBMITTED: colors.warning,
  PENDING: colors.syncing,
  OPEN: colors.warning,
  // blocked / error
  BLOCKED: colors.danger,
  CRITICAL: colors.danger,
  CONFLICT: colors.danger,
  HIGH: colors.danger,
  // neutral
  NOT_STARTED: colors.textSecondary,
  DRAFT: colors.textSecondary,
  LOW: colors.textSecondary,
  MEDIUM: colors.warning,
};

export function StatusChip({ label, testID }: { label: string; testID?: string }) {
  const { statusLabel } = useI18n();
  const bg = STATUS_COLOR[label] ?? colors.textSecondary;
  return (
    <View testID={testID} style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={styles.text}>{statusLabel(label)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  text: { color: colors.bg, fontSize: typography.label.fontSize, fontFamily: fontFamily.medium },
});
