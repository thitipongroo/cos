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
  mobile-primary: '#0066FF'
  mobile-danger: '#FF3B30'
  mobile-warning: '#FF9500'
  mobile-success: '#00C853'
  sync-active: '#FFD60A'
  sync-pending: '#94A3B8'
  dark-surface: '#0F172A'
  dark-bg: '#020617'
typography:
  hero-mobile:
    fontFamily: Inter Tight
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
  h1-web:
    fontFamily: Inter Tight
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  h2-web:
    fontFamily: Inter Tight
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-mobile:
    fontFamily: Inter Tight
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 24px
  body-web:
    fontFamily: Inter Tight
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-mobile:
    fontFamily: Inter Tight
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
  display-web:
    fontFamily: Inter Tight
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  tiny-web:
    fontFamily: Inter Tight
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 12px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  space-1: 4px
  space-2: 8px
  space-3: 12px
  space-4: 16px
  edge-mobile: 24px
  touch-target: 52px
  web-margin: 32px
---

## Brand & Style
Construction OS is a high-utility, industrial-grade SaaS platform designed for project managers and field engineers. The brand personality is **Precise, Mission-Critical, and Systematic**. It avoids unnecessary decoration in favor of high-information density and functional clarity.

The visual style is **Corporate Modern with Industrial Accents**. It utilizes a "Dark Mode First" approach to reduce eye strain in high-glare field environments. The interface employs subtle "shimmer" animations for loading states and high-contrast status indicators (warning oranges, success greens) to communicate urgency and system health at a glance.

## Colors
The palette is rooted in a deep "Navy-to-Slate" spectrum to maintain professional gravitas. 

- **Primary Blue (#2563EB):** Used for primary actions, branding, and active indicators.
- **Secondary Cyan (#06B6D4):** Reserved for AI insights and technical status updates (e.g., MFA).
- **Status Semantic Colors:** A strict set of high-visibility colors (Success Green, Warning Orange, Danger Red) used for border-accents on cards to indicate priority and urgency.
- **Surface Strategy:** Backgrounds use a tiered dark approach (`#020617` for base, `#0F172A` for containers) to create depth without relying on heavy shadows.

## Typography
The system relies exclusively on **Inter Tight**. This variant of Inter offers tighter apertures and more verticality, which lends a technical, condensed feel suitable for data-heavy construction logs.

- **Headlines:** Use Bold (700) or Semi-Bold (600) weights to anchor page sections.
- **Micro-labels:** Small caps and increased letter spacing (0.05em) are used for metadata like "PROJECT ID" or "VENDOR" to distinguish them from dynamic data.
- **Functional Icons:** Integrated via Material Symbols Outlined, always weighted at 400 to match the stroke width of the typography.

## Layout & Spacing
The layout follows a **Contextual Fluid Grid** model. On mobile, it utilizes a standard 24px edge margin (`mobile-edge`) to ensure thumb-friendly navigation. 

- **Vertical Rhythm:** A 4px baseline grid ensures consistent alignment of text and icons.
- **Bento Grid Logic:** List items and modules are organized into single-column stacks on mobile, expanding to multi-column bento grids on larger viewports.
- **Safe Areas:** The bottom navigation bar accounts for device safe-areas with a 72px height + `pb-safe` padding.

## Elevation & Depth
Depth is communicated through **Tonal Layering** rather than traditional drop shadows.

- **Level 0 (Base):** `#031427` or `#020617` (Deepest layer).
- **Level 1 (Cards):** `#102034` (Surface-container).
- **Level 2 (Active/Floating):** Use a subtle `shadow-lg` (low opacity) and a slight scale-down transition (95%) to simulate physical tactility when pressed.
- **Overlays:** Full-screen detail views use a vertical translation (bottom-sheet style) to signify temporary focus, maintaining the background color to keep the user grounded in the app's dark environment.

## Shapes
The shape language is **Rounded and Modern**. 

- **Primary Containers:** 1rem (16px) corner radius for cards and main action areas.
- **Buttons/Inputs:** 0.75rem (12px) for a slightly softer touch on interaction points.
- **Badges/Chips:** Full pill-shaping (9999px) for status indicators to contrast against the more rigid rectangular cards.
- **Interactive States:** Use 4px vertical border accents on the left edge of cards to denote status or selection.

## Components
- **Buttons:** Primary buttons use a 52px touch target with bold, uppercase text and 0.05em tracking. Dispute/Danger buttons use an outlined style.
- **Cards (Bento):** Feature-rich containers with a left-edge status color strip. Includes a top section for metadata and a bottom section for sub-actions/links, separated by a 10% opacity border.
- **Bottom Navigation:** Uses active states with a filled-background pill shape around the icon and label to clearly indicate the current view.
- **AI Module:** Distinguished by a subtle 5% secondary color (cyan) background tint and a bolded left-border accent.
- **FAB (Floating Action Button):** A 56x56 circular button in primary blue, reserved for the core creation action (e.g., "Add Payout").