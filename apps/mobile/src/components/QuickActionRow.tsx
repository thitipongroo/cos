// <QuickActionRow /> — THE PROJECT'S QUICK-ACTION BUTTON (product-owner decision 2026-08-09).
//
// One anatomy, everywhere a quick-action menu offers something to do:
//
//   ┃ [icon plate]  Title                              ›
//   ┃               SUBTITLE IN CAPS
//
// a coloured left accent strip, a tinted rounded-square icon plate, a title, an uppercase subtitle
// that says what the action does, and a trailing glyph. It began as the Tenant Admin quick-command
// menu's private `ActionCard` (mockup 04_tenant_admin/01_home/02_quick_action_button) and was lifted
// out here when the Site Worker's own menu was told to match it — two menus drawing the same button
// two ways is what made it worth a component rather than a copy.
//
// THE ACCENT IS PER-ACTION, not decoration: it is the caller's way of saying which of its actions
// are alike (the admin menu tints identity blue, integrations cyan, sync amber). Callers pass a
// palette colour, never a hex — §32.7 forbids one at the call site.
//
// `variant` exists because the two hosts differ: the admin menu is a full-screen MODAL that is dark
// on both themes, while the Site Worker's menu is an ordinary screen that follows the user's theme.
// Same idiom as <ProjectPicker />, <Avatar /> and <LoadingBoundary />.

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingState } from './LoadingState';
import { darkColors, fontFamily, plateRadius, radius, spacing, typography } from '../theme/tokens';
import { usePalette, useIsDark } from '../theme/usePalette';

type IconName = keyof typeof MaterialIcons.glyphMap;

const PLATE = 48;

export interface QuickActionRowProps {
  testID: string;
  icon: IconName;
  /** Accent for the left strip, the plate tint and the glyph. A palette colour, never a hex. */
  accent: string;
  title: string;
  /** What the action does. Rendered in caps — write it in sentence case. */
  sub: string;
  onPress: () => void;
  /** Swaps the trailing glyph for a spinner and blocks the press (the admin menu's Force Sync). */
  busy?: boolean;
  /** `open-in-new` for a link out, `refresh` for something that acts in place, etc. */
  trailing?: IconName;
  /** 'dark' for the always-dark modal hosts; omit to follow the user's theme. */
  variant?: 'dark' | 'themed';
}

export function QuickActionRow({
  testID,
  icon,
  accent,
  title,
  sub,
  onPress,
  busy,
  trailing = 'chevron-right',
  variant = 'themed',
}: QuickActionRowProps) {
  const palette = usePalette();
  const isDark = useIsDark();
  const p = variant === 'dark' ? darkColors : palette;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={title}
      // The subtitle is the hint, not part of the name: a screen reader should say "Report an issue,
      // button" and only then explain, rather than reading one run-on sentence.
      accessibilityHint={sub}
      accessibilityState={{ disabled: Boolean(busy) }}
      style={[
        styles.card,
        { backgroundColor: p.surface, borderColor: p.border, borderLeftColor: accent },
      ]}
    >
      {/* `1A` is 10% alpha — the plate is a tint OF the accent, so it stays legible against any of
          them without a second token per colour. */}
      <View style={[styles.plate, { backgroundColor: `${accent}1A` }]}>
        {busy ? (
          // The §32.7 loading component (ADR-055), inked with the SAME accent the glyph it replaces
          // uses — the accent is the caller's grouping signal, so a `primary` ring would erase it.
          <LoadingState
            variant="micro"
            theme={variant === 'dark' || isDark ? 'dark' : 'light'}
            color={accent}
          />
        ) : (
          <MaterialIcons name={icon} size={28} color={accent} />
        )}
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: p.text }]}>{title}</Text>
        <Text style={[styles.sub, { color: p.muted }]}>{sub}</Text>
      </View>
      <MaterialIcons name={trailing} size={22} color={p.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: spacing.md,
  },
  plate: {
    width: PLATE,
    height: PLATE,
    borderRadius: plateRadius(PLATE),
    alignItems: 'center',
    justifyContent: 'center',
  },
  // minWidth 0 so a long title truncates inside the row instead of pushing the chevron off it.
  text: { flex: 1, minWidth: 0 },
  title: { fontFamily: fontFamily.semibold, fontSize: typography.body.fontSize },
  sub: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
});
