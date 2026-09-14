/**
 * Tailwind config — implements the design tokens from
 * docs/specifications/32-implementation-specifications.md §32.7 (web/PWA tier).
 *
 * Colours and border-radius map to CSS variables declared in src/app/globals.css
 * (single source of truth, so dark-theme overrides work). Typography is the §32.7
 * web scale. Spacing is intentionally NOT overridden: Tailwind's default 4px scale
 * (p-1=4px, p-2=8px, p-4=16px, p-6=24px, p-8=32px, p-12=48px) already equals the
 * §32.7 `--web-space-*` tokens. Mobile (`--mobile-*`) tokens are React Native only
 * and are excluded here per §32.7 ("use --cos-blue for all web/PWA surfaces").
 *
 * `extend` is used everywhere so the default palette (gray/white/etc.) that existing
 * components already rely on keeps working.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./src/**/*.{ts,tsx,js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cos: {
          navy: 'var(--cos-navy)',
          blue: 'var(--cos-blue)',
          cyan: 'var(--cos-cyan)',
          gray: 'var(--cos-gray)',
          white: 'var(--cos-white)',
          // §32.7 Dark Theme Tokens. These already existed as CSS vars in globals.css but were
          // unreachable from a utility class, so `dark:` variants had no token to name. Mapped here
          // so dark-surface components (e.g. <LoadingState />, ADR-055) stay on tokens rather than
          // reaching for arbitrary values.
          dark: {
            bg: 'var(--cos-dark-bg)',
            surface: 'var(--cos-dark-surface)',
            elevated: 'var(--cos-dark-elevated)',
            text: 'var(--cos-dark-text)',
            muted: 'var(--cos-dark-muted)',
            blue: 'var(--cos-dark-blue)',
            cyan: 'var(--cos-dark-cyan)',
            success: 'var(--cos-dark-success)',
            warning: 'var(--cos-dark-warning)',
            danger: 'var(--cos-dark-danger)',
            // Panels sink, chips rise (design-tokens.md): -low is a recess in a card, -high a raised
            // panel on one, bright a chip or plate. outline is every dark hairline.
            outline: 'var(--cos-dark-outline)',
            container: 'var(--cos-dark-surface-container)',
            'container-low': 'var(--cos-dark-surface-container-low)',
            'container-high': 'var(--cos-dark-surface-container-high)',
            bright: 'var(--cos-dark-surface-bright)',
          },
          // SYSTEM_ADMIN operator panel — the Stitch drawings' own values (revision R10; globals.css).
          op: {
            surface: 'var(--cos-op-surface)',
            'container-lowest': 'var(--cos-op-container-lowest)',
            'container-low': 'var(--cos-op-container-low)',
            container: 'var(--cos-op-container)',
            'container-high': 'var(--cos-op-container-high)',
            'container-highest': 'var(--cos-op-container-highest)',
            outline: 'var(--cos-op-outline)',
            'outline-variant': 'var(--cos-op-outline-variant)',
            'field-border': 'var(--cos-op-field-border)',
            pending: 'var(--cos-op-pending)',
            'modal-header': 'var(--cos-op-modal-header)',
            'modal-footer': 'var(--cos-op-modal-footer)',
            'modal-field': 'var(--cos-op-modal-field)',
            'modal-notice': 'var(--cos-op-modal-notice)',
            'modal-hover': 'var(--cos-op-modal-hover)',
            ok: 'var(--cos-op-ok)',
            'ok-line': 'var(--cos-op-ok-line)',
            tier: 'var(--cos-op-tier)',
            enterprise: 'var(--cos-op-enterprise)',
            cyan: 'var(--cos-op-cyan)',
            vpc: 'var(--cos-op-vpc)',
            'vpc-ink': 'var(--cos-op-vpc-ink)',
            'vpc-line': 'var(--cos-op-vpc-line)',
            port: 'var(--cos-op-port)',
            'port-line': 'var(--cos-op-port-line)',
            'cta-shadow': 'var(--cos-op-cta-shadow)',
            'on-surface': 'var(--cos-op-on-surface)',
            'on-surface-variant': 'var(--cos-op-on-surface-variant)',
            primary: 'var(--cos-op-primary)',
            'on-primary': 'var(--cos-op-on-primary)',
            'primary-container': 'var(--cos-op-primary-container)',
            'on-primary-container': 'var(--cos-op-on-primary-container)',
            secondary: 'var(--cos-op-secondary)',
            'secondary-container': 'var(--cos-op-secondary-container)',
            'on-secondary-container': 'var(--cos-op-on-secondary-container)',
            success: 'var(--cos-op-success)',
            gate: 'var(--cos-op-gate)',
            'on-gate': 'var(--cos-op-on-gate)',
            error: 'var(--cos-op-error)',
            'error-container': 'var(--cos-op-error-container)',
            'on-error-container': 'var(--cos-op-on-error-container)',
          },
        },
      },
      fontFamily: {
        // Brand font: Inter Tight (§32.7). `Inter Tight Variable` is the family name that
        // @fontsource-variable/inter-tight registers, and it must come first: with only
        // `"Inter Tight"` here the variable font was declared but never matched, so the browser
        // issued zero font requests and the page silently rendered in a system font.
        sans: [
          // Set by next/font/local in layout.tsx — it hashes the family name, so the variable is
          // the only stable way to reference it. The literals stay as a fallback chain.
          'var(--font-inter-tight)',
          '"Inter Tight"',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
      },
      fontSize: {
        // §32.7 Web/Desktop typography scale (base unit 14px) — [size, { lineHeight, fontWeight }]
        display: ['32px', { lineHeight: '1.15', fontWeight: '700' }],
        h1: ['24px', { lineHeight: '1.25', fontWeight: '600' }],
        h2: ['20px', { lineHeight: '1.3', fontWeight: '600' }],
        h3: ['16px', { lineHeight: '1.4', fontWeight: '500' }],
        body: ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        small: ['12px', { lineHeight: '1.5', fontWeight: '400' }],
        tiny: ['11px', { lineHeight: '1.45', fontWeight: '400' }],
        // SYSTEM_ADMIN operator panel — the Tenant List drawing's own type tokens (revision R10):
        // label-mobile, tiny-web, body-web, h1-web, display-web.
        'op-label': ['13px', { lineHeight: '18px', fontWeight: '600' }],
        'op-tiny': ['11px', { lineHeight: '12px', letterSpacing: '0.05em', fontWeight: '500' }],
        'op-body': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'op-h1': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'op-display': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '700' }],
      },
      borderRadius: {
        // §32.7 web radius tokens
        sm: 'var(--web-radius-sm)',
        DEFAULT: 'var(--web-radius-sm)',
        md: 'var(--web-radius-md)',
        lg: 'var(--web-radius-lg)',
        xl: 'var(--web-radius-xl)',
      },
    },
  },
  plugins: [],
};
