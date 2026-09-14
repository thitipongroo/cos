'use client';

/**
 * Single- or multi-line text field with a real, associated `<label>` (WCAG 2.2 AA — spec §20.8).
 *
 * The problem it solves is measurable: before these components, `apps/web` contained 14 `<label>`
 * elements and **zero** `htmlFor` attributes against 33 `placeholder=` props — so most fields had
 * no programmatic label at all, and a placeholder disappears the moment the user types. React Aria
 * generates the id/`aria-labelledby`/`aria-describedby` relationships, which is the part
 * hand-written JSX kept getting wrong.
 *
 * Cost: 11,706 B gzipped, the cheapest of the four fields — see `shell.tsx` for why each field is
 * its own module.
 */

import { forwardRef } from 'react';
import { Input, TextArea, TextField } from 'react-aria-components';
import { CONTROL, DARK, FIELD, Shell, type FieldShellProps } from './shell';

export interface TextInputFieldProps extends FieldShellProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  type?: 'text' | 'email' | 'tel' | 'url';
  placeholder?: string;
  /** Render a multi-line `<textarea>` instead of an `<input>`. */
  multiline?: boolean;
  rows?: number;
  /**
   * Dark tone, single line only: the value passed its own rule. The border takes the valid colour and
   * `validIndicator` is drawn at the right edge (the SYSTEM_ADMIN Create Tenant drawing). Presentation
   * only — the field is not marked valid for assistive technology, which already hears the note beside it.
   */
  isValid?: boolean;
  validIndicator?: React.ReactNode;
  /** Dark tone: whether a valid value also turns the border green (Tenant Name draws only the check). */
  validBorder?: boolean;
  /** Dark tone: the value is drawn in monospace. */
  mono?: boolean;
  /** Dark tone: replaces the value's size classes (the modal's URI input is `text-[12px] font-medium`). */
  inputClassName?: string;
  /** Dark tone: the right padding kept for a visible `validIndicator` (default `pr-10`, room for an icon). */
  indicatorPaddingClassName?: string;
}

/**
 * The ref lands on the `<input>` so react-hook-form's `shouldFocusError` can move focus to the
 * first invalid field on a failed submit — item C3 of docs/evidence/screenreader-checklist.md.
 */
export const TextInputField = forwardRef<HTMLInputElement, TextInputFieldProps>(
  function TextInputField(
    {
      label,
      description,
      errorMessage,
      multiline,
      rows,
      placeholder,
      type,
      tone,
      isValid = false,
      validIndicator,
      validBorder = true,
      mono = false,
      labelAddon,
      descriptionClassName,
      inputClassName,
      indicatorPaddingClassName,
      ...props
    },
    ref,
  ) {
    const dark = tone === 'dark';
    const showValid = dark && !multiline && isValid && errorMessage == null;
    const control = dark
      ? `${DARK.CONTROL} ${multiline ? DARK.TEXTAREA : DARK.INPUT} ${showValid && validBorder ? DARK.CONTROL_VALID : ''} ${showValid && validIndicator ? (indicatorPaddingClassName ?? DARK.WITH_INDICATOR) : ''} ${mono ? DARK.MONO : ''} ${inputClassName ?? DARK.TEXT}`
      : CONTROL;
    const input = (
      <Input ref={ref} type={type ?? 'text'} placeholder={placeholder} className={control} />
    );
    return (
      // `isInvalid` and the message must be set together: setting only `isInvalid` announces an
      // error with no text, and setting only the message leaves aria-invalid unset.
      <TextField {...props} isInvalid={errorMessage != null} className={dark ? DARK.FIELD : FIELD}>
        <Shell
          label={label}
          labelAddon={labelAddon}
          description={description}
          descriptionClassName={descriptionClassName}
          errorMessage={errorMessage}
          tone={tone}
        >
          {multiline ? (
            <TextArea rows={rows ?? 3} placeholder={placeholder} className={control} />
          ) : showValid && validIndicator ? (
            <div className="relative">
              {input}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3"
              >
                {validIndicator}
              </span>
            </div>
          ) : (
            input
          )}
        </Shell>
      </TextField>
    );
  },
);
