// One palette shape, two modes — the bridge between the §32.7 token sets and a themeable UI.
//
// `colors` (light, outdoor-visibility field palette) and `darkColors` (the shared --cos-dark-* set)
// were never key-compatible: light has textPrimary/textSecondary and no elevated/border/onPrimary;
// dark has text/muted/elevated/border/cyan and no textPrimary. A screen therefore had to commit to
// one set at author time, which is exactly why the dark list in §32.7 had to be enumerated.
//
// `Palette` below is the union both can satisfy, so a screen reads `p.text` and renders correctly in
// either mode. Nothing here invents a colour: every value is one of the existing §32.7 tokens, and
// the few places the light set has no counterpart reuse the token light screens already use for that
// role (cards sit on `bg` over a `surface` page; hairlines are `surface`; a primary-filled button
// takes `bg` as its on-colour, which is what the existing light buttons do).

import { colors, darkColors } from './tokens';
import type { ThemeMode } from '../store/themeStore';

export interface Palette {
  /** Page background. */
  bg: string;
  /** Card / panel surface sitting on `bg`. */
  surface: string;
  /** Inner panel raised above `surface` (code blocks, quote blocks, chips). */
  elevated: string;
  /**
   * A surface that must READ as raised above `surface` — a chip, a glyph plate, a tag.
   *
   * Distinct from `elevated`, which §32.7 defines as the modal/dropdown surface: in DARK mode
   * `--cos-dark-elevated` (#111827) is a shade darker than the #0F172A card, which is correct over a
   * dimmed page and invisible on a card. Three surfaces hit that in one week — the More tile's glyph
   * plate, the critical-path plate and the task ID chip — before the set gained a token for it.
   *
   * In LIGHT mode there is nothing brighter than a white card, so the raised surface is the grey
   * page colour, which is what `elevated` already resolves to there. The two coincide in light and
   * separate in dark, the same shape as `primary`/`accent` above.
   */
  surfaceBright: string;
  /**
   * A raised surface for a PANEL that fills part of a card — a fact panel, a forecast cell, a
   * counted circle. One step below `surfaceBright` on the mockups' scale.
   *
   * The two are not interchangeable and the difference is not subtle at card size. `surfaceBright`
   * is right for a chip or a glyph plate, which is small and wants to be seen; a panel that spans
   * half a card at the same value competes with the card's own content. The drawings split them
   * the same way — `12_crm_manager`'s inner panels are `surface-container-high`, its brightest
   * chips are `surface-bright`.
   *
   * LIGHT MODE: the same value as `surfaceBright` and for the same reason — nothing is brighter
   * than a white card, so both resolve to the grey page colour there.
   */
  surfaceSoft: string;
  /**
   * A RECESSED surface — a panel that should read as sunk into its card rather than resting on it.
   *
   * The drawings sink the panels that hold a card's own facts and raise the ones that label it:
   * the customers card is `surface-container`, its two-column fact panel and its relationship
   * cells are `surface-container-low`, its avatar plate is `surface-container-high` and its
   * contact circle is `surface-bright`. Panels sink, chips rise.
   *
   * NOT the page colour. `bg` on a card is darker than the card and reads as a hole; this sits
   * between the two, which is what makes it a step down INTO the card.
   *
   * LIGHT MODE: the grey page colour, like the two raised tokens. On a white card the only
   * available step is toward grey, so recessed and raised coincide there.
   */
  surfaceSunk: string;
  /** Primary body text. */
  text: string;
  /** Secondary / caption text. */
  muted: string;
  /** Brand action colour — the same field blue in both modes (§32.7 keeps tap targets constant). */
  primary: string;
  /**
   * Accent for marks drawn ON the background: icons, eyebrows, card titles, inline tags.
   *
   * Separate from `primary` because the two are read differently. `primary` is the fill behind a
   * button, so its own contrast against the page never matters — the label sits on top of it. An
   * accent has nothing behind it, so it must clear the text threshold itself, and
   * `--mobile-primary` #0066FF does not on a dark background: 4.17:1, under the 4.5:1 AA gate
   * (§20.8, DESIGN.md §13). In light mode the two coincide; in dark they must not.
   */
  accent: string;
  /** Label/icon colour on a primary-filled surface. */
  onPrimary: string;
  success: string;
  warning: string;
  danger: string;
  /** Hairline / card border. */
  border: string;
}

const LIGHT: Palette = {
  bg: colors.surface, // page = the grey field surface, so white cards read as raised
  surface: colors.bg, // cards
  elevated: colors.surface,
  // White cards have nothing above them; a raised chip in light mode is the grey page colour, and
  // so is a raised panel — the two steps that separate them in dark have no counterpart here.
  surfaceBright: colors.surface,
  surfaceSoft: colors.surface,
  surfaceSunk: colors.surface,
  text: colors.textPrimary,
  muted: colors.textSecondary,
  primary: colors.primary,
  // Light mode: the field blue is 4.6:1 on the #F5F5F5 page, so accent and primary coincide here.
  accent: colors.primary,
  onPrimary: colors.bg,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  border: colors.surface,
};

const DARK: Palette = {
  bg: darkColors.bg,
  surface: darkColors.surface,
  elevated: darkColors.elevated,
  surfaceBright: darkColors.surfaceBright,
  surfaceSoft: darkColors.surfaceSoft,
  surfaceSunk: darkColors.surfaceSunk,
  text: darkColors.text,
  muted: darkColors.muted,
  primary: darkColors.primary,
  accent: darkColors.accent,
  onPrimary: darkColors.onPrimary,
  success: darkColors.success,
  warning: darkColors.warning,
  danger: darkColors.danger,
  border: darkColors.border,
};

/** Non-hook accessor — for StyleSheet factories and tests. */
export function paletteFor(mode: ThemeMode): Palette {
  return mode === 'dark' ? DARK : LIGHT;
}
