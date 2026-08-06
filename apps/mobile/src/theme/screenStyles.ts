// Shared screen style primitives — the token-derived StyleSheet objects that were previously
// re-declared byte-for-byte in nearly every (app)/* screen (jscpd clone cluster, 2026-07). Each
// primitive below is the EXACT value that was duplicated across ≥2 screens; screen-specific
// variants (severity chips, filter chips, PO chips, badges, diff cells, …) intentionally stay
// local to their screen so this module never changes any screen's appearance.
//
// Usage: reference `screen.container` etc. for the shared object and keep a local
// `StyleSheet.create({ … })` for the screen's own variants. Values mirror the §32.7 mobile tokens.

import { StyleSheet } from 'react-native';
import { colors, fontFamily, spacing, typography } from './tokens';
import type { Palette } from './palette';
import { radius } from '../theme/tokens';

export const screen = StyleSheet.create({
  // Root view of a list/form screen: 16px section padding, 12px gap between children.
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, gap: spacing.sm },

  // Page/card title (typography.title @ 600).
  heading: {
    fontSize: typography.title.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
  },

  // A single list row separated by a bottom hairline.
  item: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
    gap: spacing.xs,
  },

  // Primary label inside a list row (typography.body @ 500).
  itemTitle: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
  },

  // Empty-state / placeholder text shown when a list has no rows.
  empty: { color: colors.textSecondary, fontFamily: fontFamily.regular, padding: spacing.md },

  // Single-line text input (48px min height = touchTarget.formInput).
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
  },

  // Filled primary CTA button (44px+ tap target per §32.7 touchTarget.primaryButton).
  primaryButton: {
    minHeight: 48,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Label on a filled primary button (on-primary text = colors.bg). Action-button labels are
  // uppercased app-wide (PO 2026-08-01) — the transform stays in the style so the i18n strings keep
  // their natural case (QM-3) and dynamic labels (e.g. "Generating…") uppercase automatically.
  primaryButtonText: {
    color: colors.bg,
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
    textTransform: 'uppercase',
  },

  // Disabled affordance for buttons.
  buttonDisabled: { opacity: 0.5 },

  // Key/value detail row (label left, value right) separated by a hairline.
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  // Muted label in a kvRow.
  kvKey: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  // Emphasised value in a kvRow.
  kvValue: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
  },
});

// ── Themed variant ───────────────────────────────────────────────────────────
//
// `screen` above is the LIGHT set, frozen at module load, and is what the not-yet-migrated screens
// still import. `makeScreenStyles(palette)` is the same primitives resolved against whichever mode
// the user is in — new screens take this one, existing screens move over as they are migrated
// (staged rollout, PO decision 2026-08-04). Keeping both avoids a repo-wide rewrite in the same
// change that introduces theming, and keeps this module's promise: it never alters a screen's
// appearance until that screen opts in.
//
// The shapes are IDENTICAL to `screen` — only the colours are resolved from the palette — so a
// migration is a one-line import swap, not a re-layout.
export const makeScreenStyles = (p: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: p.bg, padding: spacing.md, gap: spacing.sm },

    heading: {
      fontSize: typography.title.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.text,
    },

    item: {
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: p.border,
      gap: spacing.xs,
    },
    itemTitle: {
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.medium,
      color: p.text,
    },
    empty: { color: p.muted, fontFamily: fontFamily.regular, padding: spacing.md },

    input: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.regular,
      color: p.text,
      backgroundColor: p.surface,
    },

    primaryButton: {
      minHeight: 48,
      backgroundColor: p.primary,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      color: p.onPrimary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.body.fontSize,
      textTransform: 'uppercase',
    },
    buttonDisabled: { opacity: 0.5 },

    kvRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: p.border,
    },
    kvKey: {
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },
    kvValue: {
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.text,
    },
  });
