// ESLint flat config (v9+) — root config for monorepo
// Uses @typescript-eslint/eslint-plugin v8 flat/recommended preset
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  // TypeScript recommended rules for all .ts/.tsx files
  ...tsPlugin.configs['flat/recommended'],
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
