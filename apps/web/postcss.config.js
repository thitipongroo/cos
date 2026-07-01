// PostCSS pipeline — Next.js auto-loads this file and runs it for every stylesheet.
// Tailwind v4 ships its own PostCSS plugin (@tailwindcss/postcss) which also handles
// @import inlining and vendor prefixing, so postcss-import + autoprefixer are no longer
// needed. Without this plugin the @import "tailwindcss" in globals.css is never compiled
// and no utility CSS is emitted (the app renders unstyled).
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
