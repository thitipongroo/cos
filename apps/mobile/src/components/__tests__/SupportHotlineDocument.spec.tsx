// Behaviour of the IT Support Hotline document (mockup 01_authen/05_get_help/02_hotline_details).
//
// The screen is DRAWN COMPLETE — every value the mockup shows is rendered (product-owner decision
// 2026-09-10). What these tests hold is the part of that which is a CLAIM rather than a layout:
//
//   - the number obeys a fallback ORDER — a deployment's `EXPO_PUBLIC_SUPPORT_IT_HOTLINE` wins, and
//     the drawn number stands in only when nothing is configured;
//   - `tel:` strips the display formatting, so the dial reaches the right number rather than a
//     string with brackets in it;
//   - all three call buttons dial, and each dials ITS OWN number — the failure a copy-pasted
//     handler produces is a regional button that calls head office.
//
// The drawn figures themselves are deliberately NOT pinned by value: they live in
// `lib/mockupFigures.ts` (ADR-099) and change when the drawing does.

import { Linking } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { HOTLINE_HOURS, HOTLINE_NUMBER, HOTLINE_REGIONS } from '../../lib/mockupFigures';
import { paletteFor } from '../../theme/palette';
import { SupportHotlineDocument } from '../SupportHotlineDocument';

const DARK = paletteFor('dark');

function renderDoc() {
  return render(
    <I18nProvider>
      <SupportHotlineDocument palette={DARK} paddingBottom={0} />
    </I18nProvider>,
  );
}

describe('SupportHotlineDocument', () => {
  let open: jest.SpyInstance;

  beforeEach(() => {
    open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  afterEach(() => {
    open.mockRestore();
  });

  it('draws the four blocks the mockup draws', async () => {
    const { getByTestId } = await renderDoc();

    expect(getByTestId('hotline-call-card')).toBeTruthy();
    expect(getByTestId('hotline-hours')).toBeTruthy();
    expect(getByTestId('hotline-prepare')).toBeTruthy();
    expect(getByTestId('hotline-regions')).toBeTruthy();
  });

  // `EXPO_PUBLIC_SUPPORT_IT_HOTLINE` is inlined by Metro at bundle time, so it is whatever the test
  // environment has — which is nothing. That IS the case worth pinning: with no deployment number,
  // the screen shows the drawn one rather than an empty plate.
  it('falls back to the drawn number when no deployment number is set', async () => {
    const { getByTestId } = await renderDoc();

    expect(getByTestId('hotline-number')).toHaveTextContent(
      new RegExp(HOTLINE_NUMBER.value.replace(/[()+]/g, '\\$&')),
    );
  });

  it('renders both operating-hour rows', async () => {
    const { getByText } = await renderDoc();

    expect(getByText(HOTLINE_HOURS.value.critical)).toBeTruthy();
    expect(getByText(HOTLINE_HOURS.value.general)).toBeTruthy();
  });

  it('lists every regional desk the register holds', async () => {
    const { getByText } = await renderDoc();

    for (const region of HOTLINE_REGIONS.value) {
      expect(getByText(region.name)).toBeTruthy();
      expect(getByText(region.number)).toBeTruthy();
    }
  });

  // The number is DISPLAYED with brackets, spaces and dashes; `tel:` must receive none of them.
  it('strips the display formatting before dialling', async () => {
    const { getByTestId } = await renderDoc();

    await fireEvent.press(getByTestId('hotline-call-now'));

    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const url = String(open.mock.calls[0]?.[0]);
    expect(url.startsWith('tel:')).toBe(true);
    expect(url).not.toMatch(/[()\s-]/);
  });

  // A copy-pasted handler makes every regional button call head office. Each must carry its own.
  it('dials each regional desk on its own number', async () => {
    const { getByTestId } = await renderDoc();

    for (const region of HOTLINE_REGIONS.value) {
      open.mockClear();
      await fireEvent.press(getByTestId(`hotline-region-call-${region.name}`));
      await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
      expect(String(open.mock.calls[0]?.[0])).toBe(`tel:${region.number.replace(/[^\d+]/g, '')}`);
    }
  });

  // A device with no telephony rejects the intent. It must not take the screen down with it.
  it('survives a device that cannot place a call', async () => {
    open.mockRejectedValue(new Error('no telephony'));

    const { getByTestId } = await renderDoc();
    await fireEvent.press(getByTestId('hotline-call-now'));

    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(getByTestId('hotline-call-card')).toBeTruthy();
  });
});
