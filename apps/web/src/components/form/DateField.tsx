'use client';

/**
 * Date field with segmented keyboard entry (WCAG 2.2 AA — spec §20.8; Buddhist Era — QM-3).
 *
 * Buddhist Era comes from the locale and must not be hardcoded: ICU resolves `th-TH` to the
 * `buddhist` calendar, so under Thai the year segment reads 2569 for 2026 while `onChange` still
 * emits Gregorian ISO. Verified in `src/lib/__tests__/locale.spec.ts`. The locale reaches this
 * component through React Aria's `I18nProvider` in `src/app/providers.tsx`.
 *
 * `<input type="date">` was the alternative and is worse on both counts: its picker is the OS
 * widget — unstyleable, and always Gregorian even under a Thai locale. That is the reason to pay
 * the **+32,786 B gzipped** this adds on top of ComboBox (66,880 → 99,666): it is the only way to
 * meet the Buddhist Era requirement, not a styling preference.
 */

import { CalendarDate, parseDate } from '@internationalized/date';
import { forwardRef } from 'react';
import { DateInput, DatePicker, DateSegment, Group } from 'react-aria-components';
import { CONTROL, FIELD, Shell, type FieldShellProps } from './shell';

/**
 * Parse an ISO `YYYY-MM-DD` string into a CalendarDate, or null if absent or malformed.
 *
 * `parseDate` throws on anything it cannot read. A stored value that fails to parse must render as
 * an empty field, not crash the page — the input is API data, and a form is exactly where a bad
 * date shows up first.
 */
export function parseIsoDate(value: string | undefined): CalendarDate | null {
  if (!value) {
    return null;
  }
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

export interface DateFieldProps extends FieldShellProps {
  /** ISO `YYYY-MM-DD`, always Gregorian — the wire format the API uses, regardless of display. */
  value?: string;
  onChange?: (isoDate: string) => void;
  onBlur?: () => void;
}

export const DateField = forwardRef<HTMLDivElement, DateFieldProps>(function DateField(
  { label, description, errorMessage, value, onChange, ...props },
  ref,
) {
  return (
    <DatePicker
      {...props}
      value={parseIsoDate(value)}
      isInvalid={errorMessage != null}
      // A CalendarDate carries its own calendar system, but `toString()` is always the ISO
      // (Gregorian) form — so a Buddhist Era display never leaks into what gets POSTed.
      onChange={(date) => onChange?.(date ? date.toString() : '')}
      className={FIELD}
    >
      <Shell label={label} description={description} errorMessage={errorMessage}>
        <Group ref={ref} className={`${CONTROL} flex items-center justify-between`}>
          <DateInput className="flex">
            {(segment) => (
              <DateSegment
                segment={segment}
                className="px-0.5 tabular-nums outline-none data-[focused]:bg-blue-600 data-[focused]:text-white"
              />
            )}
          </DateInput>
        </Group>
      </Shell>
    </DatePicker>
  );
});
