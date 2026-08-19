// Shared screen style primitives — the token-derived StyleSheet objects that were previously
// re-declared byte-for-byte in nearly every (app)/* screen (jscpd clone cluster, 2026-07). Each
// primitive below is the EXACT value that was duplicated across ≥2 screens; screen-specific
// variants (severity chips, filter chips, PO chips, badges, diff cells, …) intentionally stay
// local to their screen so this module never changes any screen's appearance.
//
// Usage: reference `screen.container` etc. for the shared object and keep a local
// `StyleSheet.create({ … })` for the screen's own variants. Values mirror the §32.7 mobile tokens.

import { StyleSheet } from 'react-native';
import { colors, darkColors, fontFamily, spacing, touchTarget, typography } from './tokens';
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

// ── Pinned-dark screen chrome ────────────────────────────────────────────────
//
// The pre-auth / success screens are pinned to the dark palette regardless of theme (§32.7), and
// each of them had re-declared the same chrome: the page root, the scroll body, the back button,
// the sticky header, the primary CTA and its label, the footer bar, the success ring, the AI
// footnote. jscpd counted 29 clone blocks across that cluster.
//
// Every entry below is a value that was byte-identical in at least THREE of those screens — nothing
// here was normalised into agreement. Keys that genuinely differ per screen (each screen's own
// `content` padding, `card`, `row`, chips, …) stay local, so adopting this object cannot change a
// screen's appearance. `cardBody` was written as `DARK.muted` in the screens that use
// `paletteFor('dark')`; that accessor returns `darkColors.muted` verbatim (see palette.ts), so the
// value is the same one, reached by a different name.
export const darkScreen = StyleSheet.create({
  // Page root of a pinned-dark screen.
  root: { flex: 1, backgroundColor: darkColors.bg },

  // Fills the remaining space — the scroll body (`scroll`) and the keyboard-avoiding wrapper
  // (`flex`) were both this exact value.
  fill: { flex: 1 },

  // Sticky top bar with a hairline under it.
  header: {
    height: touchTarget.listItem,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
    backgroundColor: darkColors.surface,
  },
  // Uppercased title inside `header`, taking the space left by the back button.
  headerTitle: {
    flex: 1,
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.title.fontSize,
    lineHeight: typography.title.lineHeight,
    textTransform: 'uppercase',
  },
  // 44×44 tap target for the header's leading icon (WCAG AAA).
  backButton: {
    width: touchTarget.iconButton,
    height: touchTarget.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Body padding of a centred success / consent screen.
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  // Same body, but with NO bottom padding: the screens that use it are the ones whose footer sits on
  // the safe area, so they add `paddingBottom: insets.bottom + …` at the call site.
  contentSafeBottom: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: spacing.md },

  // Centred hero line of a confirmation screen (the "…was sent", "…was downloaded" page). NOT
  // uppercased — unlike `heading`, which is the success screens' shouted hero.
  headline: {
    textAlign: 'center',
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.hero.fontSize,
    lineHeight: typography.hero.lineHeight,
  },
  // The explanatory line under `headline`, held to a readable measure.
  lede: {
    textAlign: 'center',
    alignSelf: 'center',
    maxWidth: 300,
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
  },

  // Hairline between rows of a card or list.
  divider: { height: 1, backgroundColor: darkColors.border },

  // Placeholder shown in place of a list that has no rows.
  empty: { textAlign: 'center', color: darkColors.muted, fontSize: 14, marginTop: spacing.md },

  // The text field inside a search box (the box itself differs per screen).
  searchInput: {
    flex: 1,
    color: darkColors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
  },

  // Label of an unselected filter chip; the selected one takes the screen's own accent.
  chipText: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    color: darkColors.muted,
  },

  // Centred hero heading of a success screen.
  heading: {
    fontFamily: fontFamily.bold,
    fontSize: typography.hero.fontSize,
    textTransform: 'uppercase',
    color: darkColors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  // Long-form body copy inside a card.
  cardBody: {
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight * 1.15,
  },

  // The tinted ring the success tick sits in.
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${darkColors.success}1A`,
    borderWidth: 1,
    borderColor: `${darkColors.success}4D`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },

  // Bottom action bar, separated by a hairline.
  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: darkColors.surface,
    borderTopWidth: 1,
    borderTopColor: darkColors.border,
  },
  // Filled CTA in `footer` (52px = touchTarget.primaryButton + 8, the recommended height).
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: touchTarget.primaryButton + 8,
    borderRadius: radius.md,
    backgroundColor: darkColors.primary,
  },
  // Label on the filled CTA.
  primaryText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: darkColors.onPrimary,
  },
  // Label on the outlined companion action next to it.
  secondaryText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: darkColors.text,
  },

  // An icon and its caption on one line — the head of the AI footnote, of the audit-log note, and
  // of the receipt's note card. It was `aiHead` until 2026-08-20, when the other two turned out to
  // be the same three properties under different names.
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // Caption of the AI footnote. NB the two success screens draw a smaller, wider-tracked variant of
  // this and keep it local — same role, different value, so it is not the same style.
  aiTitle: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 0.8,
    color: darkColors.cyan,
  },
  aiBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: darkColors.muted,
  },
  // The success screens draw a smaller, wider-tracked caption than `aiTitle`.
  aiTitleCompact: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: darkColors.cyan,
  },
  // The tinted panel the AI footnote sits in, marked by a cyan rule down its left edge.
  aiPanel: {
    backgroundColor: `${darkColors.cyan}0D`,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.cyan,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.xs,
  },

  // ── The screens with no back control ──────────────────────────────────────
  //
  // A confirmation screen replaced what came before it, so there is nothing behind it to go back to.
  // Its bar has no leading button and centres the title, which is why these are separate values
  // rather than `header`/`headerTitle` with a prop.
  headerCentered: {
    height: touchTarget.listItem,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
    backgroundColor: darkColors.surface,
  },
  headerTitleCentered: {
    flex: 1,
    textAlign: 'center',
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.title.fontSize,
    lineHeight: typography.title.lineHeight,
    textTransform: 'uppercase',
  },

  // ── Cards ─────────────────────────────────────────────────────────────────

  // A bordered panel on the page surface.
  card: {
    borderWidth: 1,
    borderColor: darkColors.border,
    borderRadius: radius.lg,
    backgroundColor: darkColors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  // Caption-sized heading inside a card, and the variant that takes the free space in a row.
  cardCaption: {
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
  },
  cardCaptionRow: {
    flex: 1,
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
  },
  // Opening paragraph of a long-form document.
  intro: {
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
  },
  // Hairline WITH breathing room, for a divider between rows inside a card.
  dividerSpaced: { height: 1, backgroundColor: darkColors.border, marginVertical: spacing.xs },

  // ── Success screens ───────────────────────────────────────────────────────

  // The centred block the success tick and heading sit in.
  hero: { alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.md },
  // The short green rule under the heading.
  accentLine: {
    width: 48,
    height: 4,
    borderRadius: radius.sm,
    backgroundColor: `${darkColors.success}80`,
    marginBottom: spacing.md,
  },
  // Centred explanatory copy under `heading`.
  bodyCentered: {
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.fontSize * 1.5,
    color: darkColors.muted,
    textAlign: 'center',
  },
  // Body padding when the screen's footer is flush against the content.
  contentTight: { padding: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
  // Footer with no gap: it carries a single action, so there is nothing to space.
  footerFlush: {
    padding: spacing.lg,
    backgroundColor: darkColors.surface,
    borderTopWidth: 1,
    borderTopColor: darkColors.border,
  },
  // The audit-log footnote: what the system recorded, in the system's own voice.
  logTitle: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1,
    color: darkColors.cyan,
  },
  logBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: darkColors.muted,
    fontStyle: 'italic',
  },
  // Floating action button on a pinned-dark screen.
  //
  // `borderRadius: 28` is half of 56 — the circle rule, which is why the radius ratchet allows it.
  // NOTE for the PO: `screenChrome.fab`, the themed one, writes the same 56px circle as the `999`
  // capsule marker and sits `spacing.md`/`spacing.xl` from the corner rather than `spacing.lg`. The
  // two are left as they are because reconciling them would move a button; it is recorded here so
  // the difference is a decision rather than an accident.
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: darkColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },

  // Label on a compact filled action — smaller than `primaryText`, used where two buttons share a row.
  primaryTextCompact: {
    color: darkColors.onPrimary,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

// ── Shared primitives for a screen's OWN themed sheet ────────────────────────
//
// The screens that build their own sheet (`useMemo(() => makeStyles(p), [p])`) had each written
// these eight out identically — jscpd's largest remaining mobile cluster once the pinned-dark
// chrome went. They are returned as a PLAIN object rather than a StyleSheet so a screen can spread
// them into its own `StyleSheet.create({ ...screenChrome(p), … })`: the call sites stay `styles.fab`
// and a screen that needs a different `root` simply declares one after the spread, where it wins.
//
// Same rule as `darkScreen`: a screen adopted a key only where its own value already matched
// byte-for-byte, so nothing here changed what any screen draws.
export const screenChrome = (p: Palette) => ({
  // Page root WITHOUT padding — for screens that pad the scroll body instead (`content`/`page`).
  root: { flex: 1, backgroundColor: p.bg },
  // Scroll body of an ordinary screen.
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  // Scroll body of a screen with a floating action button: the tail clears the FAB.
  page: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl * 3 },

  // The floating action button itself. `999` is the documented capsule marker (§32.7), not a step
  // on the radius scale — which is why the radius ratchet skips it.
  fab: {
    position: 'absolute' as const,
    right: spacing.md,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },

  // Secondary caption inside a card — the label-size muted line.
  muted: { color: p.muted, fontSize: typography.label.fontSize, fontFamily: fontFamily.regular },
  // Takes the free space in a row.
  grow: { flex: 1 },
  // Dimmed affordance for a control that cannot be used yet.
  disabled: { opacity: 0.5 },
  // The themed AI note: a card with a thicker rule down its leading edge, an icon-and-caption head,
  // and the caption itself. The pinned-dark screens draw their own (`darkScreen.aiPanel`); these are
  // the palette-resolved ones the ordinary screens use.
  aiCard: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: p.border,
    borderLeftWidth: 4,
    backgroundColor: p.surface,
  },
  aiHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
  aiTitle: {
    fontSize: 11,
    fontFamily: fontFamily.bold,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },

  // Label on a filled action, when the action is not the screen's `primaryButton`.
  actionText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.body.fontSize,
    color: p.onPrimary,
  },
});
