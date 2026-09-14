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

/**
 * The classes for a field on a DARK surface — the SYSTEM_ADMIN panel's dialogs, in the Stitch "Create Tenant - Modal
 * Overlay - SYSTEM_ADMIN" drawing's values (R13, `cos-op-*` tokens): label 12 px semibold #d3e4fe; input 8 px radius on
 * #071322 with a #26364a border, 14 px white text, `px-3.5 py-2.5`, a blue focus ring; helper 11 px #94a3b8. A field
 * picks its set with `tone`; the light set stays the default, so no other form changes.
 */
export const DARK = {
  CONTROL:
    'w-full rounded-md border border-cos-op-container-highest bg-cos-op-modal-field px-3.5 py-2.5 text-white transition-all placeholder:text-cos-op-pending focus:border-cos-op-primary-container focus:outline-none focus:ring-1 focus:ring-cos-op-primary-container disabled:cursor-not-allowed disabled:opacity-60 data-[invalid]:border-cos-op-error',
  /** The drawing's valid state: a 2 px emerald-500/70 border. */
  CONTROL_VALID: 'border-2 border-cos-op-ok-line/70',
  /** The value's size — 14 px; a field may replace it (the modal's URI is 12 px). */
  TEXT: 'text-[14px]',
  /** Room for the trailing check; a field with a wider indicator names its own. */
  WITH_INDICATOR: 'pr-10',
  MONO: 'font-mono',
  INPUT: '',
  TEXTAREA: '',
  LABEL: 'flex items-center gap-2 text-[12px] font-semibold text-cos-op-on-surface',
  DESCRIPTION: 'text-[11px] text-cos-op-pending',
  ERROR: 'text-[11px] text-cos-op-error',
  FIELD: 'flex flex-col gap-1.5',
} as const;

export type FieldTone = 'light' | 'dark';

export interface FieldShellProps {
  label: string;
  /** Drawn after the label text inside the label row, hidden from assistive technology (a decorative badge). */
  labelAddon?: React.ReactNode;
  /** Replaces the tone's description classes (the modal's URI format line is 10 px mono). */
  descriptionClassName?: string;
  description?: string;
  /** Resolved message. Callers pass `t(error.message)` — schemas emit i18n keys, not copy (QM-3). */
  errorMessage?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  name?: string;
  /** `dark` for a field on a dark surface. Defaults to `light`. */
  tone?: FieldTone;
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
  labelAddon,
  description,
  descriptionClassName,
  errorMessage,
  children,
  tone = 'light',
}: {
  label: string;
  labelAddon?: React.ReactNode;
  descriptionClassName?: string;
  description?: string;
  errorMessage?: string;
  children: React.ReactNode;
  tone?: FieldTone;
}) {
  const dark = tone === 'dark';
  return (
    <>
      <Label className={dark ? DARK.LABEL : LABEL}>
        {label}
        {labelAddon ? <span aria-hidden="true">{labelAddon}</span> : null}
      </Label>
      {children}
      {description ? (
        <Text
          slot="description"
          className={descriptionClassName ?? (dark ? DARK.DESCRIPTION : DESCRIPTION)}
        >
          {description}
        </Text>
      ) : null}
      <FieldError className={dark ? DARK.ERROR : ERROR}>{errorMessage}</FieldError>
    </>
  );
}
