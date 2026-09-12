// Segmented control — a small set of mutually exclusive options, all of them visible at once.
//
// ADDED 2026-09-13 for the Stitch screen `63c6dccafa734761a077835aabd70838`, which draws Language as
// `TH | EN` and Theme as a pill of mode buttons rather than as rows that open a picker or flip a
// switch. It is a component rather than two copies inside <AccountSettings /> because the second
// copy is where a control drifts: the two differ only in what they label their options with.
//
// WHY A SEGMENTED CONTROL AT ALL, when a switch or a row would do:
//   - A SWITCH says "on / off" and neither of these is. "Theme: dark ▮" makes light the absence of
//     a thing rather than the other of two, and the Language row had the same problem in reverse —
//     it showed the CURRENT language and a swap glyph, so a reader had to work out that tapping it
//     meant "become the other one".
//   - A ROW THAT OPENS A PICKER costs a screen to choose between two items.
// With three or more options the calculus changes and a picker wins; this component takes any
// number but is sized for two or three.
//
// TOKENS ONLY (DESIGN.md §2.7): colours from `usePalette()`, radius from `radius.*`, gaps from
// `spacing.*`, weight from `fontFamily.*` — never a hex, never `fontWeight`.
//
// EVERY SEGMENT IS ≥ 44px IN BOTH DIRECTIONS (§32.7, WCAG 2.2 AA target size). The drawing's own
// buttons are `min-h-[32px] min-w-[44px]`, which is under the height this project holds itself to,
// so the height here is `touchTarget.iconButton` and the drawing is followed in shape rather than
// in pixels — a deviation recorded in <AccountSettings />.

import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette, type Palette } from '../theme/usePalette';

export interface SegmentedOption<T extends string> {
  value: T;
  /** Already translated — this component holds no i18n key (QM-3). */
  label: string;
}

export function SegmentedControl<T extends string>({
  testID,
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  testID?: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Names the GROUP for a screen reader — each segment announces its own label and selected state. */
  accessibilityLabel: string;
}): React.JSX.Element {
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);

  return (
    <View
      testID={testID}
      style={styles.track}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={testID ? `${testID}-${option.value}` : undefined}
            onPress={() => onChange(option.value)}
            // `radio`, not `button`: a screen reader then says "selected" or "not selected" for
            // each option, which is the whole information a segmented control carries. A row of
            // buttons announces four presses with no indication of which one is in effect.
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            style={[styles.segment, selected && styles.segmentOn]}
          >
            <Text style={[styles.label, selected && styles.labelOn]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    // The recessed track the segments sit in — `surfaceSunk` is the step INTO a card rather than
    // through it (design-tokens.md: "NEITHER IS EVER --cos-dark-bg on a card"). The drawing uses
    // its own `surface-container` here for the same reason.
    track: {
      flexDirection: 'row',
      backgroundColor: p.surfaceSunk,
      borderRadius: radius.lg,
      padding: 2,
      gap: 2,
    },
    segment: {
      minHeight: touchTarget.iconButton,
      minWidth: touchTarget.iconButton,
      paddingHorizontal: spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
    },
    segmentOn: { backgroundColor: p.primary },
    label: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.medium,
      color: p.muted,
    },
    // On the filled segment the ink is the button's own — `onPrimary`, measured against `primary`
    // rather than against the card, because that is the pair a reader actually sees (§20.8).
    labelOn: { color: p.onPrimary, fontFamily: fontFamily.semibold },
  });
