'use client';

/**
 * Listbox-backed select (WCAG 2.2 AA — spec §20.8).
 *
 * Not a native `<select>`: the app styles its selects, but a styled native select still opens the
 * OS dropdown, whose contrast and type size the page cannot control. React Aria renders the list
 * itself while keeping the native keyboard contract — type-ahead, Home/End, arrow wrapping.
 *
 * **Cost: +46,724 B gzipped on top of TextInputField** (11,706 → 58,430), the single most
 * expensive field of the four, because it pulls React Aria's overlay positioning and collection
 * machinery. A native `<select>` with a properly associated `<label>` is already AA-conformant, so
 * this is a styling upgrade, not an accessibility fix — reach for it only where the dropdown's
 * appearance actually matters.
 */

import { forwardRef } from 'react';
import { Button, ListBox, ListBoxItem, Popover, Select, SelectValue } from 'react-aria-components';
import { CONTROL, FIELD, LIST, OPTION, POPOVER, Shell, type FieldShellProps } from './shell';

export interface SelectOption {
  id: string;
  label: string;
}

export interface SelectFieldProps extends FieldShellProps {
  options: readonly SelectOption[];
  selectedKey?: string | null;
  onSelectionChange?: (key: string) => void;
  onBlur?: () => void;
  placeholder?: string;
}

export const SelectField = forwardRef<HTMLButtonElement, SelectFieldProps>(function SelectField(
  { label, description, errorMessage, options, onSelectionChange, placeholder, ...props },
  ref,
) {
  return (
    <Select
      {...props}
      isInvalid={errorMessage != null}
      onSelectionChange={(key) => onSelectionChange?.(String(key))}
      className={FIELD}
    >
      <Shell label={label} description={description} errorMessage={errorMessage}>
        <Button ref={ref} className={`${CONTROL} flex items-center justify-between text-left`}>
          <SelectValue>
            {({ defaultChildren, isPlaceholder }) =>
              isPlaceholder ? (placeholder ?? defaultChildren) : defaultChildren
            }
          </SelectValue>
          <span aria-hidden="true">▾</span>
        </Button>
      </Shell>
      <Popover className={POPOVER}>
        <ListBox className={LIST}>
          {options.map((o) => (
            <ListBoxItem key={o.id} id={o.id} textValue={o.label} className={OPTION}>
              {o.label}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </Select>
  );
});
