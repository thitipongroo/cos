// Which project the user is on — the bar the mockup sets put at the top of a role's working screens
// (05_site_worker: dashboard title, issue form, safety checklist, task list, quick-action sheet).
//
// THE "ACTIVE PROJECT" BAR IS THE PROJECT STANDARD (PO decision 2026-08-12). The restructured
// SITE_ENGINEER set draws the same bar on all four of its screens — 01_home/01_se_home_dashboard,
// 03_tasks/01_se_tasks and 04_reports/04_se_reports each open with an `apartment` plate, an
// "ACTIVE PROJECT" eyebrow over the project name, and a 44pt switch button (`swap_horiz` /
// `sync_alt`) at the trailing edge. That shape is now this component's, for EVERY role that renders
// it, rather than a second bar existing beside the Site Worker's original location-pin line: two
// roles drawing one answer two ways is how a product stops looking like one product.
//
// The switch button is a BUTTON, not just a hint glyph. The whole bar still opens the picker (it did
// before and that gesture is learned), but the drawings give the action its own 44pt target, and
// §32.7's minimum applies to it like any other control.
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
import { fontFamily, plateRadius, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette, type Palette } from '../theme/usePalette';

/** The drawings' icon-plate side. Named so the plate and its radius cannot drift apart. */
const PLATE = 40;

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
      {/* The drawings' tinted square plate. `plateRadius` is the §32.7 rule for a square icon tile:
          side/4, so the corner scales with the plate rather than becoming a circle. */}
      <View style={styles.plate}>
        <MaterialIcons name="apartment" size={22} color={p.accent} />
      </View>
      <View style={styles.text}>
        <Text style={styles.eyebrow} numberOfLines={1}>
          {t('project.context.eyebrow')}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {active.projectName}
        </Text>
        {/* The building, where the office has recorded one — and NOTHING AT ALL when it has not
            (PO decision 2026-08-12). It used to render an empty <Text>, which still occupies a line
            box: the eyebrow and the name were then pushed above centre on every project without a
            building, which is most of them. Omitting the element is what lets the two lines sit
            centred between the card's edges. */}
        {active.buildingName ? (
          <Text style={styles.sub} numberOfLines={1}>
            {active.buildingName}
          </Text>
        ) : null}
      </View>
      {/* Its own 44pt target, per the drawings. `pointerEvents="none"` so the press falls through to
          the bar — one handler, so the button and the bar can never disagree about what they do. */}
      <View style={styles.switchBtn} pointerEvents="none">
        <MaterialIcons name="swap-horiz" size={20} color={p.muted} />
      </View>
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
      // The drawings' 6px leading accent in the primary blue — the one thing that makes this read as
      // the screen's subject line rather than as the first row of the list under it.
      borderLeftWidth: 6,
      borderLeftColor: p.primary,
      backgroundColor: p.surface,
    },
    plate: {
      width: PLATE,
      height: PLATE,
      // §32.7 square-plate rule via `plateRadius` — a quarter of the side, as a RULE rather than a
      // hand-picked number, so the corner scales with the plate. `radiusRatchet.spec.ts` counts raw
      // radius literals and only lets that count fall; a bare `10` here is exactly what it fails on.
      borderRadius: plateRadius(PLATE),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${p.accent}1A`, // the drawings' primary/10 tint, on the accent hue below
    },
    // Centred between the card's top and bottom edges (PO decision 2026-08-12). The block is one
    // or two lines depending on whether the project has a building, so anchoring it to the top made
    // the bar look differently balanced from one project to the next.
    text: { flex: 1, justifyContent: 'center' },
    // ACCENT, NOT THE DRAWING'S PRIMARY BLUE — accessibility, not preference. The eyebrow and the
    // plate glyph are the case `--cos-dark-accent` was added for (master, 2026-08-06): unfilled text
    // and icons on a dark surface must clear 4.5:1 themselves, and `--mobile-primary` #0066FF is
    // 4.17:1 there, under the AA gate §20.8 enforces. #4CD7F6 is 11.87:1. The 6px strip below KEEPS
    // primary: it is a bar of colour, not something anyone reads.
    eyebrow: {
      color: p.accent,
      fontFamily: fontFamily.bold,
      fontSize: 10,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
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
    switchBtn: {
      minWidth: touchTarget.iconButton,
      minHeight: touchTarget.iconButton,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
    },
  });
