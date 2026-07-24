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
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
  },

  // Filled primary CTA button (44px+ tap target per §32.7 touchTarget.primaryButton).
  primaryButton: {
    minHeight: 48,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Label on a filled primary button (on-primary text = colors.bg).
  primaryButtonText: {
    color: colors.bg,
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
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
