// FilterChips — the counted chip row a CRM list draws under its search field.
//
// One chip per state plus an "all" chip, each carrying the number of rows behind it, the selected
// one filled in that state's own tone. `leads.tsx` and `opportunities.tsx` drew it identically —
// same markup, same accessibility contract, same styles — and the jscpd gate caught the pair on
// 2026-09-10.
//
// EVERY CHIP CARRIES ITS COUNT, "all" included. A chip row where only some entries are counted
// makes the uncounted ones look like they have none; and the count is what turns the row from a
// filter into a summary of the list. The number comes from `countByStatus`, which counts the WHOLE
// fetched list rather than the filtered view — a chip that changed when you pressed it would be
// reporting its own effect.
//
// THE LEADING MARK IS PER CHIP. The "all" chip takes a `check-circle`; a state chip takes a dot in
// its own tone, because the tone is the state's identity everywhere else on the screen (the card's
// left accent, its status pill). Opportunities draws no marks at all — its three states are
// OPEN/WON/LOST and the drawing gives them none — so `mark` is optional and absent means text only.

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { fontFamily, radius, spacing, touchTarget } from '../theme/tokens';
import { usePalette, type Palette } from '../theme/usePalette';

export interface FilterChip {
  /** The status this chip selects, or `ALL`. Also the tail of its testID. */
  id: string;
  /** Already translated (QM-3). */
  label: string;
  /** The chip's fill when selected. */
  tone: string;
  /** `check` for the all-chip, `dot` for a state chip in its own tone, absent for text only. */
  mark?: 'check' | 'dot';
}

export function FilterChips({
  testIDPrefix,
  chips,
  selected,
  counts,
  onSelect,
}: {
  /** `leads` gives `leads-filter-NEW`. */
  testIDPrefix: string;
  chips: readonly FilterChip[];
  selected: string;
  /** Row counts by chip id — see `countByStatus`. A missing id counts zero. */
  counts: Readonly<Record<string, number>>;
  onSelect: (id: string) => void;
}): React.JSX.Element {
  const p = usePalette();
  const styles = makeStyles(p);
  return (
    <View style={styles.row}>
      {chips.map((chip) => {
        const on = selected === chip.id;
        const count = counts[chip.id] ?? 0;
        return (
          <Pressable
            key={chip.id}
            testID={`${testIDPrefix}-filter-${chip.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            // The count is IN the label: a screen reader hearing only "Qualified" cannot tell a
            // chip with forty rows behind it from one with none.
            accessibilityLabel={`${chip.label} — ${count}`}
            onPress={() => onSelect(chip.id)}
            style={[styles.chip, on && { backgroundColor: chip.tone, borderColor: chip.tone }]}
          >
            {chip.mark === 'check' ? (
              <MaterialIcons name="check-circle" size={14} color={on ? p.onPrimary : p.muted} />
            ) : chip.mark === 'dot' ? (
              <View style={[styles.dot, { backgroundColor: on ? p.onPrimary : chip.tone }]} />
            ) : null}
            <Text style={[styles.label, on && { color: p.onPrimary }]}>{chip.label}</Text>
            <Text style={[styles.count, on && { color: p.onPrimary }]}>{count}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function makeStyles(p: Palette) {
  return StyleSheet.create({
    row: { flexDirection: 'row', gap: spacing.xs / 2, flexWrap: 'wrap' },
    chip: {
      minHeight: touchTarget.secondaryButton,
      paddingHorizontal: spacing.xs,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    // `999` is the documented "make this a circle" marker (§32.7), not a scale value — a status dot
    // is one of the shapes that rule names. A literal half-of-6 would be one more hardcoded radius
    // for `radiusRatchet.spec.ts` to carry, and it is the same shape either way.
    dot: { width: 6, height: 6, borderRadius: 999 },
    label: { color: p.text, fontFamily: fontFamily.medium, fontSize: 11 },
    count: { color: p.muted, fontFamily: fontFamily.bold, fontSize: 11 },
  });
}
