// A labelled date input — the app's FIRST one, and deliberately a shared component rather than a
// control invented inside the screen that needed it.
//
// WHY IT EXISTS. Until 2026-08-13 this app had no date control at all: §32.7's Mobile Core Component
// Library defines none, and the one screen that needed a date (`material-request.tsx`) collects it
// as a bare `TextInput` with a "YYYY-MM-DD" placeholder — a field a gloved hand in sunlight has to
// type twelve characters into, with no validation until the server answers. The permit request form
// needs TWO of them (valid_from / valid_until), and the product owner chose the native picker
// (decision 2026-08-13) over repeating that placeholder twice more.
//
// THE PICKER IS PLATFORM-NATIVE, so nothing here draws a calendar: `@react-native-community/
// datetimepicker` renders the iOS wheel and the Android dialog. That is the point of taking the
// dependency — a hand-rolled calendar grid would be a new interaction pattern for field users to
// learn, and would have to be maintained against two platforms' accessibility trees.
//
// THE VALUE CROSSING THIS BOUNDARY IS ALWAYS "YYYY-MM-DD" — never a `Date`. That is what
// `CreatePermitDto` validates (`@IsDateString`) and what a Postgres DATE column stores, so the
// conversion happens once, here, using `lib/isoDate.ts` (which reads the LOCAL calendar — see its
// header for why `toISOString()` is wrong for this).
//
// PRESENTATIONAL AND CONTROLLED: the caller owns the value and the label, both already translated.
// No i18n lookup happens here, matching <UnavailableNote /> and <LoadingState />.

import { useState } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { MaterialIcons } from '@expo/vector-icons';
import { parseIsoDate, toIsoDate } from '../lib/isoDate';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette } from '../theme/usePalette';

export interface DateFieldProps {
  /** Already-translated field label, rendered as the drawing's uppercase eyebrow. */
  label: string;
  /** `YYYY-MM-DD`, or `''` when nothing has been chosen yet. */
  value: string;
  onChange: (value: string) => void;
  /** Already-translated stand-in shown while `value` is empty. */
  placeholder: string;
  testID?: string;
}

export function DateField({
  label,
  value,
  onChange,
  placeholder,
  testID,
}: DateFieldProps): React.JSX.Element {
  const p = usePalette();
  const [open, setOpen] = useState(false);

  // An unparseable stored value opens the picker on today rather than throwing — the field can be
  // reached with anything the caller holds, and a picker that refuses to open is worse than one that
  // starts somewhere reasonable.
  const selected = parseIsoDate(value) ?? new Date();

  const onPicked = (event: DateTimePickerEvent, picked?: Date): void => {
    // Android fires this for the dialog's Cancel too (`type: 'dismissed'`), with no date. Only a
    // 'set' carries a choice; anything else must leave the current value alone.
    setOpen(false);
    if (event.type === 'set' && picked !== undefined) onChange(toIsoDate(picked));
  };

  return (
    <View style={styles.root}>
      <Text style={[styles.label, { color: p.muted }]}>{label}</Text>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        // The label alone; the current value is read from the Text inside, which screen readers
        // reach as the button's content.
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        style={[styles.field, { borderColor: p.border, backgroundColor: p.elevated }]}
      >
        <MaterialIcons name="calendar-today" size={18} color={p.muted} />
        <Text style={[styles.value, { color: value === '' ? p.muted : p.text }]} numberOfLines={1}>
          {value === '' ? placeholder : value}
        </Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          testID={testID === undefined ? undefined : `${testID}-picker`}
          value={selected}
          mode="date"
          // iOS keeps the wheel inline under the field; Android has no inline mode and always
          // presents its own dialog, so the prop is only meaningful on one platform.
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onPicked}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: spacing.xs / 2 },
  label: {
    fontSize: 10,
    fontFamily: fontFamily.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    // formInput = 48px (§32.7 touch-target table). The whole row is the target, not the glyph.
    minHeight: touchTarget.formInput,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  value: {
    flex: 1,
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.regular,
  },
});
