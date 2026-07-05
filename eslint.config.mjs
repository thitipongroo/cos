// ESLint flat config (v9+) — root config for monorepo
// Uses @typescript-eslint/eslint-plugin v8 flat/recommended preset
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  // TypeScript recommended rules for all .ts/.tsx files
  ...tsPlugin.configs['flat/recommended'],
  // Override: allow _-prefixed parameters (TypeScript unused-param convention)
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
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
      // Figma-to-React export — design reference/prototype for building apps/web + apps/mobile,
      // not a workspace member (never built/tested/shipped, not in turbo/CI lint). Generated code
      // carries `any` + unused imports by nature; excluded from the code-quality gate like other
      // reference material (cf. docs/specifications excluded from markdownlint).
      'figma/**',
    ],
  },
];
