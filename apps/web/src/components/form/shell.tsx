'use client';

/**
 * Shared styling and the label/description/error shell for the React Aria field components.
 *
 * Kept in its own module — with each field in its own module too, and no barrel re-export — for a
 * measured reason. Bundling all four fields in one file cost **99,666 B gzipped** no matter which
 * one a page imported, because esbuild cannot prove a top-level `forwardRef(...)` call is
 * side-effect-free and so keeps every field in the chunk. Split, a text-only form pays
 * **11,706 B**. Import from `./TextInputField` directly; do not add an `index.ts` barrel.
 */

import { FieldError, Label, Text } from 'react-aria-components';

/** Matches the markup these components replace, so migration is not also a visual change. */
export const CONTROL = 'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm';
export const LABEL = 'block text-sm font-medium text-gray-700';
export const DESCRIPTION = 'text-xs text-gray-500';
// `text-red-700` on white measures 6.48:1 — above the 4.5:1 AA floor (docs/evidence/contrast-report.md).
export const ERROR = 'text-xs text-red-700';
export const OPTION =
  'cursor-pointer rounded px-2 py-1 outline-none data-[focused]:bg-blue-600 data-[focused]:text-white';
export const LIST = 'max-h-60 overflow-auto p-1 text-sm';
export const POPOVER = 'rounded-md border border-gray-300 bg-white shadow-lg';
export const FIELD = 'flex flex-col gap-1';

export interface FieldShellProps {
  label: string;
  description?: string;
  /** Resolved message. Callers pass `t(error.message)` — schemas emit i18n keys, not copy (QM-3). */
  errorMessage?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  name?: string;
}

/**
 * Label + optional description + error, in the order React Aria expects.
 *
 * The error goes through `<FieldError>` rather than a plain `<span>` so React Aria owns the
 * `aria-describedby` wiring. A hand-rolled span next to the input is announced either twice or not
 * at all depending on the reader — the failure mode item A7 of the screen-reader checklist looks
 * for.
 */
export function Shell({
  label,
  description,
  errorMessage,
  children,
}: {
  label: string;
  description?: string;
  errorMessage?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Label className={LABEL}>{label}</Label>
      {children}
      {description ? (
        <Text slot="description" className={DESCRIPTION}>
          {description}
        </Text>
      ) : null}
      <FieldError className={ERROR}>{errorMessage}</FieldError>
    </>
  );
}
