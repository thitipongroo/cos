---
name: Tectonic Core
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
  secondary: '#89ceff'
  on-secondary: '#00344d'
  secondary-container: '#00a2e6'
  on-secondary-container: '#00344e'
  tertiary: '#ffb596'
  on-tertiary: '#581e00'
  tertiary-container: '#bc4800'
  on-tertiary-container: '#ffede6'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#c9e6ff'
  secondary-fixed-dim: '#89ceff'
  on-secondary-fixed: '#001e2f'
  on-secondary-fixed-variant: '#004c6e'
  tertiary-fixed: '#ffdbcd'
  tertiary-fixed-dim: '#ffb596'
  on-tertiary-fixed: '#360f00'
  on-tertiary-fixed-variant: '#7d2d00'
  background: '#031427'
  on-background: '#d3e4fe'
  surface-variant: '#26364a'
typography:
  display-lg:
    fontFamily: Inter Tight
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter Tight
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter Tight
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
  title-lg:
    fontFamily: Inter Tight
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
  mono-data:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style

The design system is engineered for mission-critical construction management, prioritizing high-density data visualization and rapid cognitive processing. The aesthetic is "Modern Industrial"—a fusion of high-performance software engineering and heavy-duty structural reliability. It avoids superficial industry clichés in favor of a precision-tool aesthetic that feels authoritative and dependable.

The target audience consists of project managers, site engineers, and stakeholders who require a "heads-up display" experience. The UI evokes a sense of controlled power and structural integrity through:
- **High-Density Layouts:** Maximizing information density without sacrificing clarity.
- **Instrumental Precision:** Utilizing subtle borders and monochromatic scales to define space rather than excessive decoration.
- **Technical Professionalism:** A dark-mode first approach that reduces eye strain during long shifts in varied lighting conditions.

## Colors

The color strategy is anchored in **Infrastructure Navy** (#031427), providing a deep, stable foundation that recedes into the background. **System Blue** (#2563EB) serves as the primary action color, selected for its high visibility and association with technical precision.

- **Primary:** Used for main actions, active states, and critical progress indicators.
- **Secondary (Data):** A lighter Cyan-Blue used for secondary data points and interactive highlights.
- **Neutrals:** A range of cool grays designed to sit perfectly on the navy background without losing legibility.
- **Semantic Colors:** Critical alerts use a high-chroma Red (#EF4444), while "On-Site" or "Safe" statuses use a crisp Emerald (#10B981), both optimized for contrast against the dark background.

## Typography

This design system utilizes **Inter Tight** for headlines to achieve a condensed, modern industrial feel that saves horizontal space. Standard **Inter** is used for body text to maintain exceptional legibility in data-heavy tables and forms.

- **Scale:** The hierarchy is tight. We favor smaller, high-contrast labels over large, airy headers to support the high-density requirements.
- **Data Display:** For coordinates, budget figures, and measurements, use the `mono-data` style to ensure numeric alignment and a technical "readout" feel.
- **Mobile Adaptation:** Headlines scale down by 20% on mobile devices, while body text remains constant at 16px/14px for touch accessibility.

## Layout & Spacing

The layout follows a **4px baseline grid** to ensure mathematical precision in element alignment. The grid is a 12-column fluid system on desktop, collapsing to a single column on mobile.

- **Information Density:** Use `sm` (8px) for internal component padding and `md` (16px) for gaps between related cards.
- **Container Strategy:** Content is housed in "Modules." On desktop, these modules should use tight gutters (16px) to maximize the "Command Center" feel.
- **Safe Areas:** Maintain a minimum 32px outer margin on desktop to prevent the dense UI from feeling claustrophobic against the screen edge.

## Elevation & Depth

This design system avoids traditional shadows in favor of **Tonal Layering** and **Low-Contrast Outlines**. Depth is communicated through color luminosity rather than blur.

- **Level 0 (Background):** #031427. The base canvas.
- **Level 1 (Cards/Containers):** #0B2139. Subtle lift, clearly defined by a 1px border (#1E3A5F).
- **Level 2 (Overlays/Modals):** #162E4A. Higher luminosity to pull the element forward.
- **Interaction Depth:** When an element is hovered, use a subtle inner glow or a primary-colored 2px left-border "accent" rather than a drop shadow. This maintains the rigid, industrial structure.

## Shapes

The shape language is disciplined and geometric. While the system uses "Soft" roundedness (4px), the intent is to soften the "bite" of the dark interface without appearing "bubbly" or consumer-grade.

- **Corner Radius:** Standard components (Buttons, Inputs, Cards) use 4px (`rounded-md`). Small chips use 2px. 
- **Consistency:** Avoid pill-shaped buttons; use the standard 4px radius to maintain a structural, architectural alignment across all UI elements.

## Components

- **Buttons:** Primary buttons are solid System Blue with white text. Secondary buttons are outlined (#1E3A5F) with no background. Use high-contrast hover states (Primary Blue shifts to #3B82F6).
- **Inputs:** Inputs use a darker fill (#05192D) and a 1px border. Focus states must feature a 2px primary blue border and a subtle outer glow of the same color (0.2 opacity).
- **Cards:** Cards should have a "Header" section with a 1px bottom border to separate titles from the body data. 
- **Data Grids:** Rows should have a subtle hover highlight (#162E4A) and use "JetBrains Mono" for all numerical values.
- **Status Chips:** Use a "Small Label" style (uppercase, 12px) with a small colored dot indicator on the left rather than a fully colored background to maintain a professional, clean aesthetic.
- **Progress Bars:** Use a flat, square-ended bar. The "track" should be #1E3A5F and the "fill" should be the Primary Blue, with no rounded ends or gradients.