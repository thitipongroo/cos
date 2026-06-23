// PostCSS pipeline — Next.js auto-loads this file and runs it for every stylesheet.
// Without it, the @tailwind directives in globals.css are never compiled and no
// utility CSS is emitted (the app renders unstyled).
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
