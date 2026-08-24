// Behaviour of the severity radio row, extracted from the incident and inspection forms.
//
// It is a RADIO GROUP, not four buttons: exactly one is selected, and a screen reader is told which.
// The two hosts accent it differently — primary blue on the incident form, danger red on the
// inspection form — which is a prop, so this asserts that the selected chip takes the accent it was
// given rather than a colour of the component's own.

import { render, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { paletteFor } from '../../theme/palette';
import { SeverityPicker, SEVERITIES } from '../SeverityPicker';

const PALETTE = paletteFor('dark');
const ACCENT = '#0066FF';

function renderPicker(value: (typeof SEVERITIES)[number] = 'MEDIUM') {
  const onChange = jest.fn();
  const utils = render(
    <I18nProvider>
      <SeverityPicker
        value={value}
        onChange={onChange}
        palette={PALETTE}
        accent={ACCENT}
        restBackground={PALETTE.surface}
      />
    </I18nProvider>,
  );
  return { onChange, utils };
}

function flatten(style: unknown): Record<string, unknown> {
  return Object.assign({}, ...(Array.isArray(style) ? style : [style])) as Record<string, unknown>;
}

describe('SeverityPicker', () => {
  it('offers every step of the scale', async () => {
    const { utils } = renderPicker();
    const { getByTestId } = await utils;

    for (const level of SEVERITIES) expect(getByTestId(`severity-${level}`)).toBeTruthy();
  });

  it('marks exactly the chosen step as selected', async () => {
    const { utils } = renderPicker('HIGH');
    const { getByTestId } = await utils;

    const selected = SEVERITIES.filter(
      (level) => getByTestId(`severity-${level}`).props.accessibilityState.selected === true,
    );

    expect(selected).toEqual(['HIGH']);
  });

  it('reports the step that was pressed', async () => {
    const { onChange, utils } = renderPicker('LOW');
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('severity-CRITICAL'));

    expect(onChange).toHaveBeenCalledWith('CRITICAL');
  });

  // The accent is the host's, not the component's — the incident form is blue and the inspection
  // form is red, and neither may leak into the other.
  it('fills the chosen chip with the accent it was given', async () => {
    const { utils } = renderPicker('MEDIUM');
    const { getByTestId } = await utils;

    expect(flatten(getByTestId('severity-MEDIUM').props.style).backgroundColor).toBe(ACCENT);
    expect(flatten(getByTestId('severity-LOW').props.style).backgroundColor).toBe(PALETTE.surface);
  });
});
