// ESLint flat config (v9+) — root config for monorepo
// Uses @typescript-eslint/eslint-plugin v8 flat/recommended preset
import tsPlugin from '@typescript-eslint/eslint-plugin';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  // TypeScript recommended rules for all .ts/.tsx files
  ...tsPlugin.configs['flat/recommended'],
  // Accessibility lint for the web app's JSX (WCAG 2.1 AA — QM-6/§30.10). Scoped to apps/web:
  // these rules are DOM-shaped (alt text, label association, ARIA roles) and do not apply to
  // apps/mobile's React Native elements, which are checked by scripts/a11y/check-rn-a11y.sh.
  //
  // eslint-plugin-jsx-a11y@6.10.2 declares a peer range of eslint ^3–^9 while this repo runs
  // eslint 10; 6.10.2 is the latest published version, so there is no eslint-10 release to move
  // to. It is installed over the peer warning because it does run correctly here — the plugin
  // uses only stable rule APIs. `npx eslint 'apps/web/src/**/*.tsx'` is the check that this
  // remains true after an eslint upgrade.
  {
    files: ['apps/web/src/**/*.tsx'],
    ...jsxA11y.flatConfigs.recommended,
    languageOptions: {
      ...jsxA11y.flatConfigs.recommended.languageOptions,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Override: allow _-prefixed parameters (TypeScript unused-param convention)
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Ignores — build outputs, deps, generated files
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/build/**',
    ],
  },
];
