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
import { CONTROL, FIELD, Shell, type FieldShellProps } from './shell';

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
}

/**
 * The ref lands on the `<input>` so react-hook-form's `shouldFocusError` can move focus to the
 * first invalid field on a failed submit — item C3 of docs/a11y/screenreader-checklist.md.
 */
export const TextInputField = forwardRef<HTMLInputElement, TextInputFieldProps>(
  function TextInputField(
    { label, description, errorMessage, multiline, rows, placeholder, type, ...props },
    ref,
  ) {
    return (
      // `isInvalid` and the message must be set together: setting only `isInvalid` announces an
      // error with no text, and setting only the message leaves aria-invalid unset.
      <TextField {...props} isInvalid={errorMessage != null} className={FIELD}>
        <Shell label={label} description={description} errorMessage={errorMessage}>
          {multiline ? (
            <TextArea rows={rows ?? 3} placeholder={placeholder} className={CONTROL} />
          ) : (
            <Input ref={ref} type={type ?? 'text'} placeholder={placeholder} className={CONTROL} />
          )}
        </Shell>
      </TextField>
    );
  },
);
