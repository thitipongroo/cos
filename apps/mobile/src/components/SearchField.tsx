// SearchField — the search box the CRM and vendor drawings all put at the head of a list.
//
// One shape, drawn three times before this existed: a `search` glyph, a flush borderless input, and
// one or two 32pt icon buttons INSIDE the field rather than beside it. `leads.tsx`, `customers.tsx`
// and `vendors.tsx` each carried their own copy of the container, the input and the button style —
// 38 duplicated lines between the first two alone, which is what the jscpd gate caught on
// 2026-09-10 and what this component answers.
//
// THE BUTTONS ARE THE CALLER'S, not this component's. Leads and Customers carry one (`tune`);
// Vendors carries two (`mic`, then `tune`) and gives the second a filled plate to say a filter is
// applied. A `filters?: boolean` prop would have to grow a case per screen; a slot does not. What
// this file owns is the SHAPE of such a button — <SearchFieldButton /> — so the three screens
// cannot drift on its size, radius or plate.
//
// Not <MobileInput />: §32.7's component set does not define one, and this is a search box rather
// than a form field. It sets no label, no error state and no validation — a list's filter has none
// of those.

import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette, type Palette } from '../theme/usePalette';

export function SearchField({
  testID,
  value,
  onChangeText,
  placeholder,
  children,
}: {
  /** Goes on the INPUT, not the container — it is the thing a test types into. */
  testID?: string;
  value: string;
  onChangeText: (next: string) => void;
  /**
   * Pre-translated (QM-3). Doubles as the input's accessibility label: the field has no visible
   * label of its own, so the placeholder is the only name a screen reader could announce.
   */
  placeholder: string;
  /** The trailing controls, drawn inside the field. Use <SearchFieldButton />. */
  children?: React.ReactNode;
}): React.JSX.Element {
  const p = usePalette();
  const styles = makeStyles(p);
  return (
    <View style={styles.field}>
      <MaterialIcons name="search" size={20} color={p.muted} />
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={p.muted}
        accessibilityLabel={placeholder}
        style={styles.input}
      />
      {children}
    </View>
  );
}

/**
 * One trailing control inside a <SearchField />.
 *
 * `active` fills the plate — Vendors uses it to say a filter is applied. Off, the button is a bare
 * glyph, which is what the Leads and Customers drawings show.
 */
export function SearchFieldButton({
  testID,
  icon,
  label,
  onPress,
  active = false,
  tone,
}: {
  testID?: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  /** Pre-translated (QM-3). */
  label: string;
  onPress: () => void;
  active?: boolean;
  /** Glyph colour. Defaults to the accent — pass the muted token for a secondary control. */
  tone?: string;
}): React.JSX.Element {
  const p = usePalette();
  const styles = makeStyles(p);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.button, active && styles.buttonActive]}
    >
      <MaterialIcons name={icon} size={18} color={tone ?? p.accent} />
    </Pressable>
  );
}

/**
 * The count chip a list draws under its search field: a leading glyph, a label and a number, filled
 * in the primary colour.
 *
 * Here rather than in a screen because it is the same chip wherever a list says how many rows it
 * holds, and its fill is the same "this is the filter that is on" signal every chip row uses.
 */
export function SearchCountChip({
  testID,
  icon,
  label,
  count,
}: {
  testID?: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  /** Pre-translated (QM-3). */
  label: string;
  count: number;
}): React.JSX.Element {
  const p = usePalette();
  const styles = makeStyles(p);
  return (
    <View testID={testID} style={styles.chip}>
      <MaterialIcons name={icon} size={14} color={p.onPrimary} />
      <Text style={styles.chipText}>{label}</Text>
      <Text style={styles.chipText}>{count}</Text>
    </View>
  );
}

function makeStyles(p: Palette) {
  return StyleSheet.create({
    field: {
      minHeight: touchTarget.formInput,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      paddingLeft: spacing.md,
      paddingRight: spacing.xs / 2,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    input: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      // Android gives a TextInput its own vertical padding, which would push the field past the
      // 48pt it is already sized to and put the leading glyph off centre.
      paddingVertical: 0,
    },
    button: {
      width: 32,
      height: 32,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonActive: { backgroundColor: p.surfaceBright, borderWidth: 1, borderColor: p.border },
    chip: {
      minHeight: touchTarget.secondaryButton,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.xl,
      backgroundColor: p.primary,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    chipText: { color: p.onPrimary, fontFamily: fontFamily.semibold, fontSize: 11 },
  });
}
