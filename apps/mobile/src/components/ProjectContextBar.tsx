// Which project the site worker is on — the line the corrected mockup set puts at the top of every
// one of that role's screens (05_site_worker: the dashboard's title, the issue form, the safety
// checklist, the task list, the quick-action sheet).
//
// IT IS THE WAY BACK TO THE PICKER (PO decision 2026-08-11). The drawings add
// `00_sw_project_selection` in front of the dashboard but draw no route out of the app once a
// project is chosen. Rather than add a menu entry the drawings do not have, the bar that already
// answers "which project am I on" is also what changes it — the control sits on the answer it
// changes, and nothing new appears on screen.
//
// It renders NOTHING when no project is chosen. That state is not a blank bar to fill: it means the
// worker has not been through the picker yet — and the picker is already over them, held open by
// <SelectProjectSheet /> until they answer.

import { Pressable, Text, View, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useProjectStore } from '../store/projectStore';
import { useT } from '../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette, type Palette } from '../theme/usePalette';

export function ProjectContextBar(): React.JSX.Element | null {
  const active = useProjectStore((s) => s.active);
  const openPicker = useProjectStore((s) => s.openPicker);
  const p = usePalette();
  const t = useT();
  const styles = makeStyles(p);

  if (active === null) return null;

  return (
    <Pressable
      testID="project-context-bar"
      accessibilityRole="button"
      accessibilityLabel={t('project.context.change', { project: active.projectName })}
      // Opens the picker OVERLAY (PO decision 2026-08-11). It used to push a route, which took the
      // worker off whatever screen they were on to answer a one-line question and then dropped them
      // on Home; the sheet answers it in place and leaves them where they were.
      onPress={openPicker}
      style={styles.bar}
    >
      <MaterialIcons name="location-on" size={18} color={p.accent} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {active.projectName}
        </Text>
        {/* The building, where the office has recorded one. No placeholder when it has not: an empty
            location line reads like a place. */}
        <Text style={styles.sub} numberOfLines={1}>
          {active.buildingName ?? active.projectCode}
        </Text>
      </View>
      <MaterialIcons name="unfold-more" size={18} color={p.muted} />
    </Pressable>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: touchTarget.listItem,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    text: { flex: 1 },
    name: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },
    sub: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
  });
