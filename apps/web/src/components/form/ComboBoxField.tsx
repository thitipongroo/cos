'use client';

/**
 * Searchable select, for lists long enough that scrolling is not a real option — the project
 * picker being the case that drove it, since a tenant's project list is unbounded.
 *
 * Cost: +8,450 B gzipped **on top of SelectField** (58,430 → 66,880). Cheap once a route already
 * pays for Select's overlay machinery; expensive on a route that does not.
 */

import { forwardRef } from 'react';
import {
  Button,
  ComboBox,
  Group,
  Input,
  ListBox,
  ListBoxItem,
  Popover,
} from 'react-aria-components';
import { CONTROL, FIELD, LIST, OPTION, POPOVER, Shell } from './shell';
import type { SelectFieldProps } from './SelectField';

export type ComboBoxFieldProps = SelectFieldProps;

export const ComboBoxField = forwardRef<HTMLInputElement, ComboBoxFieldProps>(
  function ComboBoxField(
    { label, description, errorMessage, options, onSelectionChange, placeholder, ...props },
    ref,
  ) {
    return (
      <ComboBox
        {...props}
        isInvalid={errorMessage != null}
        // Clearing the input yields a null key; the form still wants a string, and '' is what the
        // "nothing selected" branch of every schema in @cos/schemas rejects.
        onSelectionChange={(key) => onSelectionChange?.(key == null ? '' : String(key))}
        className={FIELD}
      >
        <Shell label={label} description={description} errorMessage={errorMessage}>
          <Group className="flex items-center">
            <Input ref={ref} placeholder={placeholder} className={CONTROL} />
            <Button className="-ml-7 px-1" excludeFromTabOrder aria-hidden="true">
              ▾
            </Button>
          </Group>
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
      </ComboBox>
    );
  },
);
