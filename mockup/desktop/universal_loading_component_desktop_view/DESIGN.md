---
name: Construction OS
colors:
  surface: '#031427'
  surface-dim: '#031427'
  surface-bright: '#2a3a4f'
  surface-container-lowest: '#000f21'
  surface-container-low: '#0b1c30'
  surface-container: '#102034'
  surface-container-high: '#1b2b3f'
  surface-container-highest: '#26364a'
  on-surface: '#d3e4fe'
  on-surface-variant: '#c3c6d7'
  inverse-surface: '#d3e4fe'
  inverse-on-surface: '#213145'
  outline: '#8d90a0'
  outline-variant: '#434655'
  surface-tint: '#b4c5ff'
  primary: '#b4c5ff'
  on-primary: '#002a78'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#0053db'
  secondary: '#4cd7f6'
  on-secondary: '#003640'
  secondary-container: '#03b5d3'
  on-secondary-container: '#00424e'
  tertiary: '#c1c5dc'
  on-tertiary: '#2b3041'
  tertiary-container: '#686c80'
  on-tertiary-container: '#eeefff'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#dee1f9'
  tertiary-fixed-dim: '#c1c5dc'
  on-tertiary-fixed: '#161b2b'
  on-tertiary-fixed-variant: '#414658'
  background: '#031427'
  on-background: '#d3e4fe'
  surface-variant: '#26364a'
  cos-navy: '#0B1020'
  cos-blue: '#2563EB'
  cos-cyan: '#06B6D4'
  cos-white: '#F8FAFC'
  dark-bg: '#020617'
  dark-surface: '#0F172A'
  mobile-primary: '#0066FF'
  mobile-success: '#00C853'
  mobile-warning: '#FF9500'
  mobile-danger: '#FF3B30'
  sync-pending: '#94A3B8'
  sync-active: '#FFD60A'
typography:
  web-text-display:
    fontFamily: Inter Tight
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  web-text-h1:
    fontFamily: Inter Tight
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  web-text-h2:
    fontFamily: Inter Tight
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  web-text-body:
    fontFamily: Inter Tight
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  web-text-small:
    fontFamily: Inter Tight
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  web-text-tiny:
    fontFamily: Inter Tight
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 12px
    letterSpacing: 0.05em
  mobile-text-hero:
    fontFamily: Inter Tight
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
  mobile-text-body:
    fontFamily: Inter Tight
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 24px
  mobile-text-label:
    fontFamily: Inter Tight
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  web-base: 4px
  web-space-1: 4px
  web-space-2: 8px
  web-space-3: 12px
  web-space-4: 16px
  web-space-8: 32px
  mobile-edge: 24px
  mobile-touch-target: 52px
---

## Brand & Style

This design system establishes a high-density, mission-critical interface designed for the complexity of large-scale infrastructure management. It positions the platform as a sophisticated "Operating System" rather than a mere utility tool, drawing inspiration from technical leaders like Palantir and Linear.

The aesthetic is **Corporate / Modern** with a lean toward **Minimalism**, characterized by high information density, rigorous geometric alignment, and a total absence of industry clichés (cranes, hard hats, or blueprints). It prioritizes utility and clarity, utilizing a technical, monochromatic foundation punctuated by high-visibility accents for AI insights and status updates. The mood is authoritative, precise, and resilient—built for both the boardroom and the field.

## Colors

The palette is bifurcated to serve two distinct environments: deep-focus desktop analysis and high-glare field operations.

- **Web Core:** Relies on `cos-navy` for structural depth and `cos-blue` for primary interaction. `cos-cyan` is reserved exclusively for AI-native features and data highlights.
- **Dark Mode:** Transitions to a `dark-bg` (#020617) foundation. It utilizes elevated surface tiers to create hierarchy without relying on shadows.
- **Mobile Core:** Optimized for sunlight visibility with higher saturation peaks (`mobile-primary`). It includes specific "Sync" tokens to communicate the platform's offline-first architecture.

## Typography

This design system utilizes **Inter Tight** to maximize legibility in high-density data environments. The scale is intentionally compact for the web (base 14px) to allow for complex dashboard views, while the mobile scale shifts toward larger, more accessible targets (base 17px) for field use. All caps are used sparingly for metadata and labels (`web-text-tiny`) to enhance the "OS" feel.

## Layout & Spacing

The layout is governed by a **Fixed Grid** philosophy for desktop, ensuring that complex data tables and BIM viewers maintain structural integrity. A 4px base unit drives all spatial relationships.

- **Web:** Uses a 12-column grid with 16px gutters. Padding is tight to facilitate enterprise-grade information density.
- **Mobile:** Shifts to a single-column fluid layout with generous 24px side margins. Touch targets are prioritized at 52px to accommodate one-handed use or gloved hands in field conditions.

## Elevation & Depth

Visual hierarchy is achieved through **Tonal Layers** and **Low-contrast outlines** rather than traditional shadows. In Dark Mode, depth is communicated by stepping the background color from `#020617` (base) to `#0F172A` (surface) and `#111827` (elevated). 

Borders are 1px thick, utilizing `--cos-gray` at low opacity to define boundaries. Shadows are strictly limited to temporary overlays (modals/dropdowns) and must be neutral, highly diffused, and subtle.

## Shapes

The shape language is strictly **Soft (0.25rem)**. This geometric rigidity reinforces the industrial and technical nature of the brand. Circles are permitted only for status indicators or user avatars; all other containers—buttons, cards, and inputs—must follow the 4px corner radius standard. "Pill" shapes and large radii are prohibited.

## Components

- **Buttons:** Web buttons are compact (32px height) with 4px radii. Mobile buttons use the 52px touch target. Primary actions use `cos-blue`; AI-triggered actions use `cos-cyan`.
- **Status Chips:** High-contrast backgrounds with white text. Use `mobile-success`, `mobile-warning`, and `mobile-danger` for immediate field recognition.
- **Inputs:** Flat styling with a 1px border. Focus states use a 2px `cos-blue` inset ring. Labels are 12px/13px and positioned above the field.
- **Task Cards:** On mobile, these include a left-hand color bar indicating priority and a right-hand icon slot for sync status (Pending, Syncing, Synced).
- **AI Modules:** Distinguished by a subtle `cos-cyan` left-border and a background tint of 5% cyan opacity to signify machine-generated content.
- **Voice Notes:** A specialized mobile component featuring a `mobile-primary` circular hold-to-record trigger.