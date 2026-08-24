'use client';

/**
 * The one place a form is wired to client-side validation (QM-15 / ADR-049).
 *
 * Client validation ships behind `s1.web.client-validation` and every form must go through this
 * hook rather than calling `useForm` directly. Two reasons:
 *
 *  1. **The kill switch has to reach every form.** A flag is only a kill switch if flipping it off
 *     actually disables the feature everywhere within 60s. Eighteen `useForm({ resolver })` calls
 *     would each need their own flag read, and the one that got missed is the one that breaks
 *     production.
 *  2. **Off must mean the old behaviour, exactly.** With the flag off the resolver is `undefined`,
 *     so the form submits whatever the user typed and the API's `class-validator` DTOs reject bad
 *     input (QM-4) — which is what shipped before this existed.
 */

import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { type FieldValues, type UseFormProps, type UseFormReturn, useForm } from 'react-hook-form';
import { useFlag } from './api/flags';
import { FLAG_WEB_CLIENT_VALIDATION } from './flags';

// `@standard-schema/spec` is a devDependency and contributes nothing to the bundle: its
// dist/index.js is a 0-byte file — the package is the Standard Schema type contract and nothing
// else. It is imported here rather than inferred from `standardSchemaResolver`, because
// `Parameters<typeof …>` on an overloaded generic collapses to `FieldValues` and loses the link
// between the schema and the form's field types.

export interface ValidatedFormOptions<TInput extends FieldValues, TOutput> extends Omit<
  UseFormProps<TInput, unknown, TOutput>,
  'resolver'
> {
  /** A schema from `@cos/schemas`. */
  schema: StandardSchemaV1<TInput, TOutput>;
}

/**
 * `useForm` with the shared schema attached, gated by the rollout flag.
 *
 * `mode: 'onTouched'` is deliberate. Validating on every keystroke (`onChange`) makes a screen
 * reader announce an error while the user is still typing the first character; validating only on
 * submit means a site engineer fills a long form before learning the first field was wrong.
 * Touched-then-blur is the compromise WCAG 3.3.1 practice settles on.
 *
 * `shouldFocusError` is react-hook-form's default, restated here because it is load-bearing: it
 * moves focus to the first invalid field on a failed submit, and works only because every field in
 * `components/form/` forwards its ref to the focusable element — item C3 of
 * docs/a11y/screenreader-checklist.md.
 */
export function useValidatedForm<TInput extends FieldValues, TOutput>({
  schema,
  ...options
}: ValidatedFormOptions<TInput, TOutput>): UseFormReturn<TInput, unknown, TOutput> {
  const clientValidation = useFlag(FLAG_WEB_CLIENT_VALIDATION);
  return useForm<TInput, unknown, TOutput>({
    mode: 'onTouched',
    shouldFocusError: true,
    ...options,
    resolver: clientValidation
      ? standardSchemaResolver<TInput, unknown, TOutput>(schema)
      : undefined,
  });
}
