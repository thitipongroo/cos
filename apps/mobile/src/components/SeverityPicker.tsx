// <SeverityPicker /> — the four-step severity radio row.
//
// Filing an incident and failing an inspection both ask the same question, and both drew the same
// control: four chips, one selected, announced as a radio group. Extracted 2026-08-20 on the second
// copy. What differs between the two screens is only the accent — the incident form fills the
// chosen chip with the primary blue, the inspection form with the danger red — and what an
// unselected chip sits on, so both are props and neither screen's appearance changed.
//
// The labels come from `status.<LEVEL>`, the app-wide keys, rather than from either screen's own
// namespace (QM-3): the words are the same words.

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useT } from '../i18n';
import type { Palette } from '../theme/palette';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';

/** The scale, in order. Shared by every screen that asks how bad something is. */
export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];

interface Props<T extends string> {
  value: T;
  onChange: (level: T) => void;
  palette: Palette;
  /** Fill and border of the chosen chip. */
  accent: string;
  /** What an unchosen chip sits on — the page surface, or nothing. */
  restBackground: string;
  levels?: readonly T[];
  testID?: string;
}

export function SeverityPicker<T extends string>({
  value,
  onChange,
  palette: p,
  accent,
  restBackground,
  levels = SEVERITIES as unknown as readonly T[],
  testID = 'severity-picker',
}: Props<T>): React.JSX.Element {
  const t = useT();

  return (
    <View testID={testID} style={styles.row}>
      {levels.map((level) => {
        const on = value === level;
        return (
          <TouchableOpacity
            key={level}
            testID={`severity-${level}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(level)}
            style={[
              styles.chip,
              {
                borderColor: on ? accent : p.border,
                backgroundColor: on ? accent : restBackground,
              },
            ]}
          >
            <Text style={[styles.text, { color: on ? p.onPrimary : p.muted }]}>
              {t(`status.${level}`)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    minHeight: touchTarget.secondaryButton,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  text: { fontSize: typography.label.fontSize, fontFamily: fontFamily.medium },
});
