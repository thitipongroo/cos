// CreateSheet — the bottom sheet a list screen raises from its `+`.
//
// A dimmed backdrop, a rounded sheet at the foot of the screen, a title with a close button, the
// caller's fields, and one primary save button that carries its own saving state. §32.7 forbids a
// modal over a modal and says to use a bottom sheet; this is that sheet for the "capture one new
// row" case.
//
// Two screens drew it identically — `leads.tsx` and `opportunities.tsx`, written a day apart in the
// same round — and the jscpd gate caught the pair on 2026-09-10 across four separate clones. The
// SHEET is what they share; the FIELDS are entirely their own, so those are children.
//
// THE SAVE BUTTON IS PART OF THE SHEET, not a child, because its three states are the same
// wherever this shape appears: disabled while the form is short of its minimum, disabled and
// relabelled while the write is in flight, and enabled otherwise. Leaving it to the caller is how
// two screens end up disagreeing about whether a sheet can be submitted twice.
//
// Not <SelectProjectSheet />, which is a centred card on a dimmed backdrop for CHOOSING one of a
// list, always closeable and never a route. This one is a form.

import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette, type Palette } from '../theme/usePalette';

export function CreateSheet({
  testID,
  visible,
  onClose,
  title,
  closeLabel,
  closeTestID,
  saveTestID,
  saveLabel,
  savingLabel,
  canSave,
  saving,
  onSave,
  children,
}: {
  testID?: string;
  visible: boolean;
  onClose: () => void;
  /** Pre-translated (QM-3). */
  title: string;
  closeLabel: string;
  closeTestID?: string;
  saveTestID?: string;
  saveLabel: string;
  /** Shown on the button while the write is in flight. */
  savingLabel: string;
  /** The form has reached its minimum. */
  canSave: boolean;
  saving: boolean;
  onSave: () => void;
  /** The fields, which are the caller's alone. */
  children: React.ReactNode;
}): React.JSX.Element {
  const p = usePalette();
  const styles = makeStyles(p);
  const blocked = !canSave || saving;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View testID={testID} style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>{title}</Text>
            <Pressable
              testID={closeTestID}
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              onPress={onClose}
              style={styles.close}
            >
              <MaterialIcons name="close" size={22} color={p.text} />
            </Pressable>
          </View>
          {children}
          <Pressable
            testID={saveTestID}
            accessibilityRole="button"
            accessibilityState={{ disabled: blocked }}
            accessibilityLabel={saveLabel}
            disabled={blocked}
            onPress={onSave}
            style={[styles.save, blocked && styles.saveOff]}
          >
            <Text style={styles.saveText}>{saving ? savingLabel : saveLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * The text input a <CreateSheet /> field uses.
 *
 * Exported here so the two screens' fields cannot drift on height, radius or placeholder ink while
 * the sheet around them stays identical.
 */
export function sheetInputStyle(p: Palette) {
  return makeStyles(p).input;
}

function makeStyles(p: Palette) {
  return StyleSheet.create({
    // A literal, not a token: this is a scrim over the whole screen rather than a surface, and the
    // token set has no colour for one. The same value every other overlay in this app uses.
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000099' },
    sheet: {
      backgroundColor: p.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.md,
      gap: spacing.sm,
    },
    head: { flexDirection: 'row', alignItems: 'center' },
    title: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
    },
    close: {
      width: touchTarget.iconButton,
      height: touchTarget.iconButton,
      alignItems: 'center',
      justifyContent: 'center',
    },
    input: {
      minHeight: touchTarget.formInput,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.bg,
      paddingHorizontal: spacing.md,
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },
    save: {
      minHeight: touchTarget.primaryButton,
      borderRadius: radius.md,
      backgroundColor: p.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveOff: { opacity: 0.5 },
    saveText: {
      color: p.onPrimary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
  });
}
