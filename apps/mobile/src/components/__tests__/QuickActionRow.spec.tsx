// Behaviour of <QuickActionRow /> — the project's quick-action button (PO 2026-08-09).
//
// THE ACCENT IS DATA, NOT DECORATION. It is how a menu says which of its actions are alike (the
// admin menu tints identity blue, integrations cyan, sync amber), so it has to land on all three
// places at once — the left strip, the icon plate and the glyph. A row that took the accent on the
// strip but drew a primary-coloured glyph would silently regroup the menu.
//
// BUSY BLOCKS THE PRESS. The one busy caller is the admin menu's Force Sync, and a second sync
// started on top of the first is not a slower sync — it is two writers on the same queue. So `busy`
// is asserted to stop the press, not merely to change the glyph.
//
// THE SUBTITLE IS A HINT, NOT PART OF THE NAME. A screen reader should say "Report an issue, button"
// and only then explain; folding the subtitle into the label gives one run-on sentence that has to
// be heard to its end before the user knows what the control even is.

import { render, fireEvent } from '@testing-library/react-native';
import { QuickActionRow } from '../QuickActionRow';

/** Every backgroundColor anywhere in a rendered tree — the plate carries no testID of its own. */
function colours(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const n = node as { props?: { style?: unknown }; children?: unknown[] };
  const styles = [n.props?.style].flat(2) as Array<Record<string, unknown> | undefined>;
  const here = styles
    .map((s) => (s && typeof s['backgroundColor'] === 'string' ? s['backgroundColor'] : null))
    .filter((c): c is string => c !== null);
  return [...here, ...(n.children ?? []).flatMap(colours)];
}

function renderRow(props: Record<string, unknown> = {}) {
  const onPress = jest.fn();
  const utils = render(
    <QuickActionRow
      testID="row"
      icon="report-problem"
      accent="#2D6BFF"
      title="Report an issue"
      sub="Tell the site about a hazard"
      onPress={onPress}
      {...props}
    />,
  );
  return { onPress, utils };
}

describe('QuickActionRow', () => {
  it('draws the icon, the title and what the action does', async () => {
    const { utils } = renderRow();
    const { getByTestId, getByText } = await utils;

    expect(getByTestId('row')).toBeTruthy();
    expect(getByText('report-problem')).toBeTruthy();
    expect(getByText('Report an issue')).toBeTruthy();
    expect(getByText('Tell the site about a hazard')).toBeTruthy();
  });

  it('acts when it is pressed', async () => {
    const { onPress, utils } = renderRow();
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('row'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // The subtitle is the hint, not the name.
  it('is named by its title alone and explained by its subtitle', async () => {
    const { utils } = renderRow();
    const { getByTestId } = await utils;
    const row = getByTestId('row');

    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Report an issue');
    expect(row.props.accessibilityHint).toBe('Tell the site about a hazard');
  });

  // Two writers on the same sync queue is not a slower sync.
  it('refuses the press while it is busy', async () => {
    const { onPress, utils } = renderRow({ busy: true });
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('row'));

    expect(onPress).not.toHaveBeenCalled();
    expect(getByTestId('row').props.accessibilityState.disabled).toBe(true);
  });

  // The plate holds the spinner INSTEAD OF the glyph — a spinner beside a still-live-looking icon
  // reads as a row that can still be pressed.
  it('replaces the glyph with the loading state while it is busy', async () => {
    const { utils } = renderRow({ busy: true });
    const { queryByText } = await utils;

    expect(queryByText('report-problem')).toBeNull();
  });

  it('says it is pressable again once it is not', async () => {
    const { utils } = renderRow();
    const { getByTestId, getByText } = await utils;

    expect(getByTestId('row').props.accessibilityState.disabled).toBe(false);
    expect(getByText('report-problem')).toBeTruthy();
  });

  // `chevron-right` is "this opens something here"; a caller says otherwise when it means otherwise.
  it('points onward by default', async () => {
    const { utils } = renderRow();
    const { getByText } = await utils;

    expect(getByText('chevron-right')).toBeTruthy();
  });

  it.each([
    ['open-in-new', 'a link that leaves the app'],
    ['refresh', 'something that acts in place'],
  ])('carries %s for %s', async (trailing) => {
    const { utils } = renderRow({ trailing });
    const { getByText } = await utils;

    expect(getByText(trailing)).toBeTruthy();
  });

  // ONE accent, THREE places. Anything less regroups the menu without saying so.
  it('inks the strip, the plate and the glyph from the one accent', async () => {
    const { utils } = renderRow({ accent: '#00E5FF' });
    const { getByTestId, getByText, toJSON } = await utils;

    const strip = (getByTestId('row').props.style as Array<Record<string, unknown>>).find(
      (s) => s && 'borderLeftColor' in s,
    );
    expect(strip!['borderLeftColor']).toBe('#00E5FF');

    // The plate is a 10% tint OF the accent, so one accent covers any colour without a second token.
    expect(colours(toJSON())).toContain('#00E5FF1A');

    expect(getByText('report-problem')).toBeTruthy();
  });

  // The two hosts differ: the admin menu is a modal that is dark on BOTH themes, the Site Worker's
  // is an ordinary screen. Same idiom as <ProjectPicker /> and <Avatar />.
  it('renders on a dark host without following the theme', async () => {
    const { utils } = renderRow({ variant: 'dark' });
    const { getByTestId } = await utils;

    expect(getByTestId('row')).toBeTruthy();
  });

  it('follows the theme when no host is named', async () => {
    const { utils } = renderRow({ variant: 'themed' });
    const { getByTestId } = await utils;

    expect(getByTestId('row')).toBeTruthy();
  });
});
