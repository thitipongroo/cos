// "This is drawn, and it is not ready" — the standard way a mockup zone the platform has no data
// for is rendered (product-owner decision 2026-08-13).
//
// THE RULE IT IMPLEMENTS. Every screen built from `mockup/mobile/07_safety_officer/` carries panels
// the drawings show and this product cannot fill: a compliance percentage, safe-hours-since-last-LTI,
// an AI-predicted risk on an incident, a wind forecast from "weather telemetry". The product owner's
// call was to DRAW them with the mockup's own copy and say plainly that they are not available yet,
// rather than delete the zone or invent a figure. This is that sentence, in one place, so the four
// screens cannot phrase it four ways.
//
// It follows the precedent already in the app: the Site Worker's AI Safety Scan button opens an
// honest "not available yet" notice instead of pretending to scan, and the Project Manager's More
// tiles carry a COMING SOON chip said BEFORE the tap rather than in an alert after it.
//
// PRESENTATIONAL ONLY — the caller passes an already-translated sentence, so nothing here decides
// what is missing or why.

import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { fontFamily, radius, spacing, typography } from '../theme/tokens';
import { usePalette } from '../theme/usePalette';

export interface UnavailableNoteProps {
  /** The already-translated explanation. One sentence: what is missing, not an apology. */
  reason: string;
  testID?: string;
  /**
   * `inline` drops the tinted ground and the glyph plate — for a note that stands in for a FIGURE
   * inside a KPI tile, where a bordered box inside a bordered box reads as two cards.
   */
  variant?: 'panel' | 'inline';
}

export function UnavailableNote({
  reason,
  testID,
  variant = 'panel',
}: UnavailableNoteProps): React.JSX.Element {
  const p = usePalette();
  if (variant === 'inline') {
    return (
      <Text testID={testID} style={[styles.inline, { color: p.muted }]}>
        {reason}
      </Text>
    );
  }
  return (
    <View
      testID={testID}
      style={[styles.panel, { backgroundColor: p.elevated, borderColor: p.border }]}
    >
      <MaterialIcons name="info-outline" size={16} color={p.muted} />
      <Text style={[styles.text, { color: p.muted }]}>{reason}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    fontFamily: fontFamily.regular,
  },
  inline: {
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    fontFamily: fontFamily.medium,
  },
});
