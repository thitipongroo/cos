// The foot of an AI card, and THE PROJECT'S STANDARD FOR ONE (product-owner decision 2026-09-08).
//
// One line, in this order and no other:
//
//     ⌾ CONF: 94%  |  ⌾ SOURCE: THE SUKHUMVIT 45 RESIDENCES              ›
//
// WHY THE CONFIDENCE MOVED DOWN HERE. It used to sit as a chip in the card's header, opposite the
// title, which is where `09_finance` and `10_proc_officer` both draw it. That put the two halves of
// one claim at opposite ends of the card: how much the model believes itself, at the top, and what
// it read, at the bottom. They are one sentence — "this confident, from this" — and a reader
// checking whether to act on the card wants them together. The header keeps the title and whatever
// state chip the card carries.
//
// WHY "CONF" AND NOT "CONFIDENCE". The row has to hold two labels, two values and a chevron inside a
// phone's width, and the source is the half that must survive: a confidence with no provenance is a
// number about nothing. `CONF` is the abbreviation the FINANCE budget card already used for the same
// reason; the source is what gets the remaining space and the ellipsis.
//
// WHAT GOES IN `source`. The NAME OF SOMETHING THIS REPOSITORY HAS — a project, a set of records —
// never a system it does not. Both drawings foot their cards with integrations that do not exist
// ("Integrated ERP & Market Benchmarks", "e-GP Benchmark", "ERP DB & Central OCR Ledger"), and a
// provenance line is the one piece of drawn text that changes how much of the card a reader
// believes. That is the carve-out ADR-098's second amendment opened and ADR-099 has applied five
// times; this component is where it now lives, so the next AI card inherits it rather than
// re-deciding it.
//
// `percent` MAY BE NULL, and then the CONF half is not drawn at all — no "CONF: —", no zero. A card
// whose figures are deterministic has no confidence to report (the FINANCE cash-flow forecast is the
// case on record), and printing one would claim a model that never ran.

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { fontFamily, spacing } from '../theme/tokens';
import type { Palette } from '../theme/usePalette';

export function AiCardFooter({
  testID,
  percent,
  source,
  confLabel,
  sourceLabel,
  onPress,
  palette,
}: {
  testID?: string;
  /** The model's own confidence, 0–100. `null` where the card's figures are not a model output. */
  percent: number | null;
  /** What produced the figures — a project or a record set this repository actually has. */
  source: string;
  /** Pre-translated "CONF" (QM-3: this component holds no key and no literal). */
  confLabel: string;
  /** Pre-translated "SOURCE". */
  sourceLabel: string;
  onPress?: () => void;
  palette: Palette;
}): React.JSX.Element {
  const styles = makeStyles(palette);
  const row = (
    <View style={styles.foot}>
      {percent === null ? null : (
        <>
          <MaterialIcons name="verified" size={13} color={palette.success} />
          <Text style={styles.conf} numberOfLines={1}>
            {`${confLabel}: ${percent}%`}
          </Text>
          {/* The separator is a drawn rule, not a pipe character: a "|" between two labels reads as
              a table column and wraps badly at a large system font size. */}
          <View style={styles.divider} />
        </>
      )}
      <MaterialIcons name="storage" size={13} color={palette.muted} />
      {/* The half that gives way. `flex: 1` plus tail truncation, so a long project name shortens
          rather than pushing the chevron off the card. */}
      <Text style={styles.source} numberOfLines={1} ellipsizeMode="tail">
        {`${sourceLabel}: ${source}`}
      </Text>
      <MaterialIcons
        name="chevron-right"
        size={18}
        color={palette.accent}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </View>
  );

  if (onPress === undefined) return <View testID={testID}>{row}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${sourceLabel}: ${source}`}
      onPress={onPress}
    >
      {row}
    </Pressable>
  );
}

function makeStyles(p: Palette) {
  return StyleSheet.create({
    foot: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderTopWidth: 1,
      borderTopColor: `${p.accent}33`,
      paddingTop: spacing.xs,
      marginTop: spacing.xs / 2,
    },
    conf: {
      color: p.success,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      textTransform: 'uppercase',
    },
    divider: {
      width: 1,
      height: 10,
      marginHorizontal: 2,
      backgroundColor: p.border,
    },
    source: {
      flex: 1,
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: 10,
      textTransform: 'uppercase',
    },
  });
}
