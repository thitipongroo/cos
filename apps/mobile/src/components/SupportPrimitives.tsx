// The two blocks BOTH Support drawings carry, extracted 2026-09-11.
//
// WHY THIS FILE EXISTS. The Support Centre stopped being one screen rendered twice on 2026-09-11
// (product-owner decision): `mockup/mobile/01_authen/05_get_help/01_home_support` is the PRE-AUTH
// screen and the redrawn `mockup/mobile/support_center/01_dashboard` is the POST-AUTH one, and they
// do different jobs — one helps a person who cannot get IN, the other helps a person already
// WORKING. `SupportCenterDocument` and `SupportHubDocument` are those two screens.
//
// Both drawings still draw a system-status card and a search row, and both mean the same thing by
// them. Copying the two blocks into two documents would be about forty duplicated lines, which is
// what the 0.70% jscpd ratchet exists to catch — it sat at 0.68% the day this was written. So the
// overlap lives here and the two screens stay genuinely separate above it.
//
// PALETTE IS A PROP, not read from the store, for the same reason it is on both documents: the
// pre-auth surface is pinned dark (§32.7) while the post-auth one follows the user's theme.

import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useT } from '../i18n';
import { checkBackendHealth } from '../api/health';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import type { Palette } from '../theme/palette';

/** Backend liveness, as a Support screen knows it. `null` while the first probe is in flight. */
export type Health = boolean | null;

/**
 * Backend liveness plus how stale the answer is.
 *
 * OWNED BY THE SCREEN, NOT BY A DOCUMENT, and passed back in as props. Both Support screens need
 * the same answer twice over — the status card, and each screen's own footer (the pre-auth FIELD
 * ASSISTANT line, the post-auth diagnostics block) — so holding it inside a document would make a
 * screen run a SECOND probe for its footer and ping /health/live twice per open.
 */
export function useBackendHealth(): { health: Health; minutesAgo: number } {
  const [health, setHealth] = useState<Health>(null);
  // Minutes since the probe answered. The drawing prints "Last checked: 2m ago", so the number has
  // to age — a stamp that never moves would claim the check is always fresh.
  const [minutesAgo, setMinutesAgo] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void checkBackendHealth().then((ok) => {
      if (cancelled) return;
      setHealth(ok);
      setMinutesAgo(0);
    });
    const tick = setInterval(() => setMinutesAgo((m) => m + 1), 60_000);
    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, []);

  return { health, minutesAgo };
}

/**
 * The system-status card — a REAL `GET /health/live` probe, never a decorative "operational".
 *
 * The 2026-09-11 redraw gives it a 4px left rail in the state's own colour and a trailing chevron.
 * THE DOT DOES NOT PULSE: the drawing animates it with a spreading box-shadow ring, which is the
 * glow §32.7 forbids on this screen, and capture builds freeze animation anyway. The chevron has no
 * status page behind it, so it says so on a press.
 */
export function SupportStatusCard({
  palette,
  health,
  minutesAgo,
  onPress,
}: {
  palette: Palette;
  health: Health;
  minutesAgo: number;
  onPress: () => void;
}): React.JSX.Element {
  const t = useT();
  const styles = makeStyles(palette);

  const label =
    health === null
      ? t('support.status.checking')
      : health
        ? t('support.status.operational')
        : t('support.status.unreachable');
  const color = health === null ? palette.muted : health ? palette.success : palette.danger;

  return (
    <Pressable
      testID="support-status"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.statusCard, { borderColor: palette.border, borderLeftColor: color }]}
    >
      <View style={styles.statusLeft}>
        <View style={[styles.statusDot, { backgroundColor: color }]} />
        <View style={styles.statusTextBlock}>
          <Text style={[styles.statusLabel, { color }]}>{label}</Text>
          {health !== null ? (
            <Text style={styles.statusTime}>
              {t('support.status.lastChecked', {
                when:
                  minutesAgo === 0
                    ? t('support.status.justNow')
                    : t('support.status.minutesAgo', { minutes: minutesAgo }),
              })}
            </Text>
          ) : null}
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={20} color={palette.muted} />
    </Pressable>
  );
}

/**
 * The search row — DRAWN, and deliberately not an input.
 *
 * The product owner has ruled search disabled four times: 2026-08-09, re-affirmed 2026-08-17, again
 * 2026-08-18 when ADR-093 gave it no endpoint, and again 2026-09-11 when the redrawn
 * `support_center/01_dashboard` asked for an active box. Measured that last day: no `help_article`,
 * `faq` or `article` model, no `backend/src/modules/support/`, no controller prefix for any of them.
 *
 * It carried a `COMING SOON` chip until 2026-09-10; neither drawing has one, and a standing note
 * about what is unbuilt is what the product owner ruled out. It says so on the press instead.
 *
 * THE PLACEHOLDER IS THE CALLER'S, already translated. The two drawings word it differently —
 * `01_home_support` writes "Search help articles..." and `support_center/01_dashboard` writes
 * "Search guides, tutorials, or system status..." — and once the screens split on 2026-09-11 each
 * owns its own wording. A single string here would have quietly put the post-auth drawing's words
 * on the pre-auth screen, which is what happened for one build.
 */
export function SupportSearchRow({
  palette,
  placeholder,
  onPress,
}: {
  palette: Palette;
  /** Pre-translated, the way <LoadingState />'s `label` is (QM-3 — no key lives in here). */
  placeholder: string;
  onPress: () => void;
}): React.JSX.Element {
  const styles = makeStyles(palette);

  return (
    <Pressable
      testID="support-search"
      accessibilityRole="search"
      accessibilityLabel={placeholder}
      onPress={onPress}
      style={styles.searchRow}
    >
      <MaterialIcons name="search" size={22} color={palette.muted} />
      <Text style={styles.searchPlaceholder}>{placeholder}</Text>
    </Pressable>
  );
}

function makeStyles(palette: Palette) {
  return StyleSheet.create({
    statusCard: {
      borderWidth: 1,
      borderLeftWidth: 4,
      borderRadius: radius.lg,
      backgroundColor: palette.surface,
      padding: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    statusLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    statusTextBlock: { flex: 1, gap: 2 },
    // 999 — a documented circle, not a radius on the scale (§32.7).
    statusDot: { width: 10, height: 10, borderRadius: 999 },
    statusLabel: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    statusTime: {
      color: palette.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: touchTarget.formInput,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
    },
    searchPlaceholder: {
      flex: 1,
      color: palette.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.body.fontSize,
    },
  });
}
