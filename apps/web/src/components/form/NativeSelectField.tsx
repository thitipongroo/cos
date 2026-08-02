'use client';

/**
 * Native `<select>` with a properly associated `<label>` — the default select for this app.
 *
 * Accessibility-wise this is not a compromise. A native select with a real label is fully WCAG 2.2
 * AA conformant: the browser supplies the role, the keyboard contract, the type-ahead and the
 * announced option count, and it does so better than any custom widget on mobile, where it opens
 * the platform picker a site engineer already knows. What it was missing here was the label, and
 * `htmlFor` appeared **zero** times across `apps/web` — that is the actual defect, and it costs
 * nothing to fix.
 *
 * `SelectField` (React Aria) costs **+45,639 B gzipped** over this one and buys exactly one thing:
 * control over how the open dropdown looks. Per the 2026-08-03 product-owner decision, React Aria
 * is used per-route where it earns its weight, so reach for `SelectField` only when a specific
 * screen's dropdown styling genuinely matters — the budget is 256,000 B per route and the shared
 * baseline already measures 194,995 B.
 */

import { forwardRef, useId } from 'react';
import type { SelectOption } from './SelectField';

export interface NativeSelectFieldProps {
  label: string;
  description?: string;
  /** Resolved message. Callers pass `t(error.message)` — schemas emit i18n keys, not copy (QM-3). */
  errorMessage?: string;
  options: readonly SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  /** Leading empty option, e.g. "Select a project". Omit for a select that is always populated. */
  placeholder?: string;
}

const CONTROL = 'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm';
const LABEL = 'block text-sm font-medium text-gray-700';
const DESCRIPTION = 'text-xs text-gray-500';
const ERROR = 'text-xs text-red-700';

export const NativeSelectField = forwardRef<HTMLSelectElement, NativeSelectFieldProps>(
  function NativeSelectField(
    {
      label,
      description,
      errorMessage,
      options,
      value,
      onChange,
      onBlur,
      name,
      required,
      disabled,
      placeholder,
    },
    ref,
  ) {
    // useId keeps label/description/error association correct even with several of these on a
    // page — the thing hand-written markup gets wrong as soon as a form is duplicated.
    const id = useId();
    const descriptionId = `${id}-description`;
    const errorId = `${id}-error`;
    const describedBy =
      [description ? descriptionId : null, errorMessage ? errorId : null]
        .filter(Boolean)
        .join(' ') || undefined;

    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className={LABEL}>
          {label}
        </label>
        <select
          id={id}
          ref={ref}
          name={name}
          value={value}
          required={required}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.value)}
          onBlur={onBlur}
          aria-invalid={errorMessage != null || undefined}
          aria-describedby={describedBy}
          className={CONTROL}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {description ? (
          <span id={descriptionId} className={DESCRIPTION}>
            {description}
          </span>
        ) : null}
        {/* role="alert" so the message is announced when it appears, not on the next focus. */}
        {errorMessage ? (
          <span id={errorId} role="alert" className={ERROR}>
            {errorMessage}
          </span>
        ) : null}
      </div>
    );
  },
);
