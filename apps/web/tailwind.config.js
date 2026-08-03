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
          },
        },
      },
      fontFamily: {
        // Brand font: Inter Tight (§32.7). `Inter Tight Variable` is the family name that
        // @fontsource-variable/inter-tight registers, and it must come first: with only
        // `"Inter Tight"` here the variable font was declared but never matched, so the browser
        // issued zero font requests and the page silently rendered in a system font.
        sans: [
          '"Inter Tight Variable"',
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
