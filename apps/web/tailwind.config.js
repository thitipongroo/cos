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
          // Tailwind v3 palette shades used by the SYSTEM_ADMIN drawings (R17; globals.css `--cos-v3-*`).
          v3: {
            slate: {
              100: 'var(--cos-v3-slate-100)',
              200: 'var(--cos-v3-slate-200)',
              300: 'var(--cos-v3-slate-300)',
              400: 'var(--cos-v3-slate-400)',
              500: 'var(--cos-v3-slate-500)',
              600: 'var(--cos-v3-slate-600)',
              700: 'var(--cos-v3-slate-700)',
              800: 'var(--cos-v3-slate-800)',
              900: 'var(--cos-v3-slate-900)',
              950: 'var(--cos-v3-slate-950)',
            },
            red: {
              200: 'var(--cos-v3-red-200)',
              400: 'var(--cos-v3-red-400)',
              500: 'var(--cos-v3-red-500)',
              600: 'var(--cos-v3-red-600)',
              700: 'var(--cos-v3-red-700)',
              800: 'var(--cos-v3-red-800)',
              900: 'var(--cos-v3-red-900)',
              950: 'var(--cos-v3-red-950)',
            },
            rose: {
              300: 'var(--cos-v3-rose-300)',
              400: 'var(--cos-v3-rose-400)',
              800: 'var(--cos-v3-rose-800)',
              950: 'var(--cos-v3-rose-950)',
            },
            amber: {
              200: 'var(--cos-v3-amber-200)',
              300: 'var(--cos-v3-amber-300)',
              400: 'var(--cos-v3-amber-400)',
              500: 'var(--cos-v3-amber-500)',
              700: 'var(--cos-v3-amber-700)',
              800: 'var(--cos-v3-amber-800)',
              950: 'var(--cos-v3-amber-950)',
            },
            blue: {
              300: 'var(--cos-v3-blue-300)',
              400: 'var(--cos-v3-blue-400)',
              500: 'var(--cos-v3-blue-500)',
              600: 'var(--cos-v3-blue-600)',
              800: 'var(--cos-v3-blue-800)',
              900: 'var(--cos-v3-blue-900)',
            },
            cyan: {
              300: 'var(--cos-v3-cyan-300)',
              400: 'var(--cos-v3-cyan-400)',
              500: 'var(--cos-v3-cyan-500)',
              700: 'var(--cos-v3-cyan-700)',
              800: 'var(--cos-v3-cyan-800)',
              950: 'var(--cos-v3-cyan-950)',
            },
            green: {
              600: 'var(--cos-v3-green-600)',
            },
            emerald: {
              300: 'var(--cos-v3-emerald-300)',
              400: 'var(--cos-v3-emerald-400)',
              500: 'var(--cos-v3-emerald-500)',
              600: 'var(--cos-v3-emerald-600)',
              800: 'var(--cos-v3-emerald-800)',
              950: 'var(--cos-v3-emerald-950)',
            },
            purple: {
              300: 'var(--cos-v3-purple-300)',
              400: 'var(--cos-v3-purple-400)',
              500: 'var(--cos-v3-purple-500)',
            },
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
            'dialog-edge': 'var(--cos-op-dialog-edge)',
            'assign-edge': 'var(--cos-op-assign-edge)',
            'assign-head': 'var(--cos-op-assign-head)',
            'assign-head-line': 'var(--cos-op-assign-head-line)',
            'assign-code': 'var(--cos-op-assign-code)',
            'assign-code-line': 'var(--cos-op-assign-code-line)',
            'assign-close-hover': 'var(--cos-op-assign-close-hover)',
            'assign-gates-line': 'var(--cos-op-assign-gates-line)',
            'assign-gate': 'var(--cos-op-assign-gate)',
            'assign-gate-line': 'var(--cos-op-assign-gate-line)',
            'assign-field': 'var(--cos-op-assign-field)',
            'assign-field-line': 'var(--cos-op-assign-field-line)',
            'assign-pill': 'var(--cos-op-assign-pill)',
            'assign-pill-line': 'var(--cos-op-assign-pill-line)',
            'assign-foot': 'var(--cos-op-assign-foot)',
            'assign-foot-line': 'var(--cos-op-assign-foot-line)',
            'assign-cancel': 'var(--cos-op-assign-cancel)',
            'assign-cancel-hover': 'var(--cos-op-assign-cancel-hover)',
            'assign-cancel-line': 'var(--cos-op-assign-cancel-line)',
            'deact-close-hover': 'var(--cos-op-deact-close-hover)',
            'deact-cancel': 'var(--cos-op-deact-cancel)',
            'deact-cancel-hover': 'var(--cos-op-deact-cancel-hover)',
            'mark-confirm-hover': 'var(--cos-op-mark-confirm-hover)',
            'high-privilege': 'var(--cos-op-high-privilege)',
            'detail-panel': 'var(--cos-op-detail-panel)',
            'detail-head': 'var(--cos-op-detail-head)',
            'detail-head-line': 'var(--cos-op-detail-head-line)',
            'detail-chip': 'var(--cos-op-detail-chip)',
            'detail-chip-line': 'var(--cos-op-detail-chip-line)',
            'detail-well': 'var(--cos-op-detail-well)',
            'detail-well-line': 'var(--cos-op-detail-well-line)',
            'detail-close-hover': 'var(--cos-op-detail-close-hover)',
            'detail-close-line': 'var(--cos-op-detail-close-line)',
            'detail-kpi-band': 'var(--cos-op-detail-kpi-band)',
            'detail-kpi-band-line': 'var(--cos-op-detail-kpi-band-line)',
            'detail-kpi': 'var(--cos-op-detail-kpi)',
            'detail-kpi-line': 'var(--cos-op-detail-kpi-line)',
            'detail-tabs': 'var(--cos-op-detail-tabs)',
            'detail-tabs-line': 'var(--cos-op-detail-tabs-line)',
            'detail-body': 'var(--cos-op-detail-body)',
            'detail-card-line': 'var(--cos-op-detail-card-line)',
            'detail-uri-line': 'var(--cos-op-detail-uri-line)',
            'detail-copy-hover': 'var(--cos-op-detail-copy-hover)',
            'detail-well-edge': 'var(--cos-op-detail-well-edge)',
            'detail-ops': 'var(--cos-op-detail-ops)',
            'detail-op': 'var(--cos-op-detail-op)',
            'detail-op-hover': 'var(--cos-op-detail-op-hover)',
            'detail-op-line': 'var(--cos-op-detail-op-line)',
            'detail-foot-line': 'var(--cos-op-detail-foot-line)',
            'detail-close2-hover': 'var(--cos-op-detail-close2-hover)',
            'detail-close2-line': 'var(--cos-op-detail-close2-line)',
            'mig-band': 'var(--cos-op-mig-band)',
            warning: 'var(--cos-op-warning)',
            'set-head': 'var(--cos-op-set-head)',
            'set-thead': 'var(--cos-op-set-thead)',
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
