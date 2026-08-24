// Behaviour of <DateField /> — the app's one date control.
//
// Two rules, and both are about the value that crosses this boundary. It is ALWAYS `YYYY-MM-DD`,
// never a `Date`: that is what `CreatePermitDto` validates and what a Postgres DATE column stores,
// so the conversion happens once, here, through lib/isoDate (which reads the LOCAL calendar —
// `toISOString()` would hand a site in Bangkok the previous day for any morning before 07:00).
//
// And ANDROID'S CANCEL MUST NOT CHANGE ANYTHING. The platform fires the same handler for the
// dialog's Cancel as for a choice, with `type: 'dismissed'` and no date. Reading that as a pick
// would silently clear or move a permit's validity date because someone backed out of a dialog.
//
// The native picker is stubbed: it renders the iOS wheel and the Android dialog, neither of which
// exists here, and what this file is about is what the component does with the event either sends.

import { render, fireEvent } from '@testing-library/react-native';
import { DateField } from '../DateField';

jest.mock('@react-native-community/datetimepicker', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');
  // Renders an inert node carrying the props, so a test can read the date the picker opened ON and
  // fire the platform's own event shapes at it.
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => <View {...props} />,
  };
});

function renderField(props: Record<string, unknown> = {}) {
  const onChange = jest.fn();
  const utils = render(
    <DateField
      label="Valid from"
      value="2026-08-19"
      onChange={onChange}
      placeholder="Choose a date"
      testID="valid-from"
      {...props}
    />,
  );
  return { onChange, utils };
}

describe('DateField', () => {
  it('shows the date it was given', async () => {
    const { utils } = renderField();
    const { getByText } = await utils;

    expect(getByText('2026-08-19')).toBeTruthy();
  });

  it('shows the placeholder while nothing has been chosen', async () => {
    const { utils } = renderField({ value: '' });
    const { getByText } = await utils;

    expect(getByText('Choose a date')).toBeTruthy();
  });

  it('keeps the picker closed until the field is pressed', async () => {
    const { utils } = renderField();
    const { queryByTestId } = await utils;

    expect(queryByTestId('valid-from-picker')).toBeNull();
  });

  it('opens the picker on the field', async () => {
    const { utils } = renderField();
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('valid-from'));

    expect(getByTestId('valid-from-picker')).toBeTruthy();
  });

  it('opens it on the date already held', async () => {
    const { utils } = renderField();
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('valid-from'));

    const opened = getByTestId('valid-from-picker').props.value as Date;
    expect(opened.getFullYear()).toBe(2026);
    expect(opened.getMonth()).toBe(7); // August, zero-based
    expect(opened.getDate()).toBe(19);
  });

  // The field can be reached with anything the caller holds; a picker that refuses to open is worse
  // than one that starts somewhere reasonable.
  it('opens on today when the stored value cannot be read', async () => {
    const { utils } = renderField({ value: 'not-a-date' });
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('valid-from'));

    expect(getByTestId('valid-from-picker').props.value).toBeInstanceOf(Date);
  });

  // YYYY-MM-DD, from the LOCAL calendar — never a Date, and never a UTC-shifted day.
  it('reports a chosen date as YYYY-MM-DD', async () => {
    const { onChange, utils } = renderField();
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('valid-from'));
    await fireEvent(
      getByTestId('valid-from-picker'),
      'change',
      { type: 'set' },
      new Date(2026, 8, 3),
    );

    expect(onChange).toHaveBeenCalledWith('2026-09-03');
  });

  it('closes the picker once a date is chosen', async () => {
    const { utils } = renderField();
    const { getByTestId, queryByTestId } = await utils;

    await fireEvent.press(getByTestId('valid-from'));
    await fireEvent(
      getByTestId('valid-from-picker'),
      'change',
      { type: 'set' },
      new Date(2026, 8, 3),
    );

    expect(queryByTestId('valid-from-picker')).toBeNull();
  });

  // ANDROID'S CANCEL. Same handler, no date — and the current value must survive it untouched.
  it('changes nothing when the dialog is dismissed', async () => {
    const { onChange, utils } = renderField();
    const { getByTestId, getByText } = await utils;

    await fireEvent.press(getByTestId('valid-from'));
    await fireEvent(getByTestId('valid-from-picker'), 'change', { type: 'dismissed' }, undefined);

    expect(onChange).not.toHaveBeenCalled();
    expect(getByText('2026-08-19')).toBeTruthy();
  });

  it('changes nothing when a set event arrives with no date', async () => {
    const { onChange, utils } = renderField();
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('valid-from'));
    await fireEvent(getByTestId('valid-from-picker'), 'change', { type: 'set' }, undefined);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('announces itself by its label', async () => {
    const { utils } = renderField();
    const { getByTestId } = await utils;

    expect(getByTestId('valid-from').props.accessibilityLabel).toBe('Valid from');
    expect(getByTestId('valid-from').props.accessibilityRole).toBe('button');
  });
});
